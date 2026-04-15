-- ============================================
-- SECURITY FIXES
-- 1. REVOKE EXECUTE on get_service_role_key / get_supabase_url from
--    PUBLIC so authenticated/anon clients can't exfiltrate the
--    service role key via PostgREST RPC.
-- 2. finalize_poll_event: creator-only authorization + idempotent
--    atomic status transition (prevents repeated trigger firings
--    from doing redundant work or re-announcing the winner).
-- 3. get_poll_status: require caller to be a participant.
-- 4. create_smart_event / create_poll_event: input bounds-checking.
-- ============================================

-- 1. Lock down the credential-leaking helpers. Postgres grants
-- EXECUTE to PUBLIC by default on new functions; we revoke from every
-- role that could reach them via PostgREST.
REVOKE EXECUTE ON FUNCTION get_service_role_key() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_service_role_key() FROM anon;
REVOKE EXECUTE ON FUNCTION get_service_role_key() FROM authenticated;

REVOKE EXECUTE ON FUNCTION get_supabase_url() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_supabase_url() FROM anon;
REVOKE EXECUTE ON FUNCTION get_supabase_url() FROM authenticated;

-- 2. finalize_poll_event: authorize + idempotent finalize. The
-- atomic collecting->scheduled transition means that if multiple
-- concurrent callers race (e.g. the min-votes trigger fires twice),
-- only the first one actually picks a winner / posts the system
-- message, and the rest cheaply short-circuit.
CREATE OR REPLACE FUNCTION finalize_poll_event(p_event_room_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_winning_id UUID;
    v_winning_start TIMESTAMPTZ;
    v_winning_end TIMESTAMPTZ;
    v_winning_yes INTEGER;
    v_title TEXT;
    v_creator UUID;
    v_caller UUID := auth.uid();
    v_rows INTEGER;
BEGIN
    SELECT title, created_by
    INTO v_title, v_creator
    FROM event_rooms
    WHERE id = p_event_room_id;

    IF v_creator IS NULL THEN
        RETURN json_build_object('success', false, 'reason', 'event_not_found');
    END IF;

    -- Authorization: the caller must either be the creator, or the
    -- call must come from a SECURITY DEFINER context without an
    -- auth.uid() (i.e. from inside check_poll_min_votes_reached or
    -- from the service role / scheduler).
    IF v_caller IS NOT NULL AND v_caller <> v_creator THEN
        RAISE EXCEPTION 'Only the event creator can finalize this poll';
    END IF;

    -- Idempotency: atomically transition collecting -> scheduled.
    -- If the event wasn't collecting (already scheduled, or doesn't
    -- exist), short-circuit without re-running the winner logic or
    -- re-posting the system message.
    UPDATE event_rooms
    SET scheduling_status = 'scheduled'
    WHERE id = p_event_room_id
      AND scheduling_status = 'collecting';
    GET DIAGNOSTICS v_rows = ROW_COUNT;

    IF v_rows = 0 THEN
        RETURN json_build_object('already_finalized', true);
    END IF;

    WITH counts AS (
        SELECT ct.id, ct.candidate_start, ct.candidate_end,
               COUNT(pv.*) FILTER (WHERE pv.vote = 'YES') AS yes_count
        FROM scheduling_candidate_times ct
        LEFT JOIN poll_votes pv ON pv.candidate_time_id = ct.id
        WHERE ct.event_room_id = p_event_room_id
        GROUP BY ct.id, ct.candidate_start, ct.candidate_end
    )
    SELECT id, candidate_start, candidate_end, yes_count
    INTO v_winning_id, v_winning_start, v_winning_end, v_winning_yes
    FROM counts
    ORDER BY yes_count DESC, candidate_start ASC
    LIMIT 1;

    IF v_winning_id IS NULL THEN
        -- No candidates — roll back the status change so a future
        -- call can retry.
        UPDATE event_rooms
        SET scheduling_status = 'collecting'
        WHERE id = p_event_room_id;
        RETURN json_build_object('success', false, 'reason', 'no_candidates');
    END IF;

    UPDATE scheduling_candidate_times
    SET is_selected = (id = v_winning_id)
    WHERE event_room_id = p_event_room_id;

    UPDATE event_rooms
    SET starts_at = v_winning_start,
        ends_at = v_winning_end
    WHERE id = p_event_room_id;

    INSERT INTO event_messages (event_room_id, user_id, content, is_system_message)
    VALUES (
        p_event_room_id,
        v_creator,
        '🗳️ Poll closed — the winning time is ' ||
          to_char(v_winning_start AT TIME ZONE 'UTC', 'Dy, Mon DD HH24:MI UTC') ||
          ' (' || v_winning_yes || ' yes votes)',
        TRUE
    );

    RETURN json_build_object(
        'success', true,
        'selected_id', v_winning_id,
        'starts_at', v_winning_start,
        'yes_count', v_winning_yes
    );
END;
$$;

-- 3. get_poll_status: require caller to be a participant.
CREATE OR REPLACE FUNCTION get_poll_status(p_event_room_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_scheduling_mode TEXT;
    v_scheduling_status TEXT;
    v_scheduling_deadline TIMESTAMPTZ;
    v_poll_min_votes INTEGER;
    v_selected_slot_id UUID;
    v_total_participants INTEGER;
    v_options JSON;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Must be signed in to read poll status';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM event_room_participants
        WHERE event_room_id = p_event_room_id AND user_id = v_user_id
    ) THEN
        RAISE EXCEPTION 'Not a participant of this event';
    END IF;

    SELECT scheduling_mode, scheduling_status, scheduling_deadline, poll_min_votes
    INTO v_scheduling_mode, v_scheduling_status, v_scheduling_deadline, v_poll_min_votes
    FROM event_rooms
    WHERE id = p_event_room_id;

    SELECT COUNT(*) INTO v_total_participants
    FROM event_room_participants
    WHERE event_room_id = p_event_room_id;

    SELECT id INTO v_selected_slot_id
    FROM scheduling_candidate_times
    WHERE event_room_id = p_event_room_id AND is_selected = TRUE
    LIMIT 1;

    WITH vote_counts AS (
        SELECT
            candidate_time_id,
            COUNT(*) FILTER (WHERE vote = 'YES') AS yes_count,
            COUNT(*) FILTER (WHERE vote = 'NO') AS no_count,
            MAX(vote) FILTER (WHERE user_id = v_user_id) AS my_vote
        FROM poll_votes
        WHERE event_room_id = p_event_room_id
        GROUP BY candidate_time_id
    )
    SELECT json_agg(
        json_build_object(
            'id', ct.id,
            'starts_at', ct.candidate_start,
            'ends_at', ct.candidate_end,
            'is_selected', ct.is_selected,
            'yes_count', COALESCE(vc.yes_count, 0),
            'no_count', COALESCE(vc.no_count, 0),
            'my_vote', vc.my_vote
        )
        ORDER BY ct.candidate_start
    ) INTO v_options
    FROM scheduling_candidate_times ct
    LEFT JOIN vote_counts vc ON vc.candidate_time_id = ct.id
    WHERE ct.event_room_id = p_event_room_id;

    RETURN json_build_object(
        'scheduling_mode', v_scheduling_mode,
        'scheduling_status', v_scheduling_status,
        'scheduling_deadline', v_scheduling_deadline,
        'poll_min_votes', v_poll_min_votes,
        'selected_slot_id', v_selected_slot_id,
        'total_participants', v_total_participants,
        'options', COALESCE(v_options, '[]'::JSON)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_poll_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION finalize_poll_event(UUID) TO authenticated;

-- 4. Bounds-checking for the create-event RPCs. Defence in depth —
-- the UI clamps these but an attacker can call the RPC directly.
CREATE OR REPLACE FUNCTION create_smart_event(
    p_title TEXT,
    p_description TEXT DEFAULT NULL,
    p_date_range_start DATE DEFAULT NULL,
    p_date_range_end DATE DEFAULT NULL,
    p_scheduling_deadline TIMESTAMPTZ DEFAULT NULL,
    p_slots JSONB DEFAULT '[]'::JSONB,
    p_min_synced_users INTEGER DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_event_room_id UUID;
    v_slot JSONB;
    v_slot_id UUID;
    v_day_of_week INTEGER;
    v_start_time TIME;
    v_duration INTEGER;
    v_d DATE;
    v_candidate_start TIMESTAMPTZ;
    v_candidate_end TIMESTAMPTZ;
    v_result JSON;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Must be signed in to create a smart event';
    END IF;

    IF p_title IS NULL OR length(trim(p_title)) = 0 THEN
        RAISE EXCEPTION 'Title is required';
    END IF;
    IF length(p_title) > 200 THEN
        RAISE EXCEPTION 'Title too long';
    END IF;

    IF p_date_range_start IS NULL OR p_date_range_end IS NULL THEN
        RAISE EXCEPTION 'Date range is required';
    END IF;
    IF p_date_range_end < p_date_range_start THEN
        RAISE EXCEPTION 'Date range end must be >= start';
    END IF;
    IF (p_date_range_end - p_date_range_start) > 90 THEN
        RAISE EXCEPTION 'Date range too wide (max 90 days)';
    END IF;

    IF p_min_synced_users IS NOT NULL AND p_min_synced_users < 1 THEN
        RAISE EXCEPTION 'min_synced_users must be >= 1';
    END IF;

    IF p_scheduling_deadline IS NULL THEN
        p_scheduling_deadline := NOW() + INTERVAL '7 days';
    END IF;
    IF p_scheduling_deadline < NOW() THEN
        RAISE EXCEPTION 'Deadline must be in the future';
    END IF;

    INSERT INTO event_rooms (
        proposal_id,
        group_id,
        title,
        description,
        starts_at,
        ends_at,
        chat_expires_at,
        created_by,
        scheduling_mode,
        scheduling_date_range_start,
        scheduling_date_range_end,
        scheduling_deadline,
        scheduling_status,
        min_synced_users
    )
    VALUES (
        NULL,
        NULL,
        p_title,
        p_description,
        NULL,
        NULL,
        p_scheduling_deadline + INTERVAL '48 hours',
        auth.uid(),
        'smart',
        p_date_range_start,
        p_date_range_end,
        p_scheduling_deadline,
        'collecting',
        p_min_synced_users
    )
    RETURNING id INTO v_event_room_id;

    INSERT INTO event_room_participants (event_room_id, user_id)
    VALUES (v_event_room_id, auth.uid());

    FOR v_slot IN SELECT * FROM jsonb_array_elements(p_slots) LOOP
        v_day_of_week := (v_slot->>'day_of_week')::INTEGER;
        v_start_time := (v_slot->>'start_time')::TIME;
        v_duration := COALESCE((v_slot->>'duration_minutes')::INTEGER, 120);

        IF v_day_of_week IS NULL OR v_day_of_week < 0 OR v_day_of_week > 6 THEN
            RAISE EXCEPTION 'Invalid day_of_week (must be 0-6)';
        END IF;
        IF v_duration < 15 OR v_duration > 24 * 60 THEN
            RAISE EXCEPTION 'Invalid slot duration (must be 15-1440 minutes)';
        END IF;

        INSERT INTO scheduling_slots (event_room_id, day_of_week, start_time, duration_minutes)
        VALUES (v_event_room_id, v_day_of_week, v_start_time, v_duration)
        RETURNING id INTO v_slot_id;

        FOR v_d IN
            SELECT d::DATE
            FROM generate_series(p_date_range_start, p_date_range_end, '1 day'::INTERVAL) d
            WHERE EXTRACT(DOW FROM d) = v_day_of_week
        LOOP
            v_candidate_start := (v_d || ' ' || v_start_time)::TIMESTAMPTZ;
            v_candidate_end := v_candidate_start + (v_duration || ' minutes')::INTERVAL;

            IF v_candidate_start > NOW() THEN
                INSERT INTO scheduling_candidate_times (
                    event_room_id, slot_id, candidate_start, candidate_end
                )
                VALUES (v_event_room_id, v_slot_id, v_candidate_start, v_candidate_end);
            END IF;
        END LOOP;
    END LOOP;

    SELECT json_build_object(
        'event_room_id', v_event_room_id,
        'title', p_title,
        'scheduling_mode', 'smart',
        'scheduling_status', 'collecting',
        'scheduling_deadline', p_scheduling_deadline,
        'min_synced_users', p_min_synced_users,
        'candidate_count', (SELECT COUNT(*) FROM scheduling_candidate_times WHERE event_room_id = v_event_room_id)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION create_smart_event TO authenticated;

CREATE OR REPLACE FUNCTION create_poll_event(
    p_title TEXT,
    p_description TEXT DEFAULT NULL,
    p_scheduling_deadline TIMESTAMPTZ DEFAULT NULL,
    p_min_votes INTEGER DEFAULT NULL,
    p_options JSONB DEFAULT '[]'::JSONB
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_event_room_id UUID;
    v_dummy_slot_id UUID;
    v_option JSONB;
    v_candidate_start TIMESTAMPTZ;
    v_candidate_end TIMESTAMPTZ;
    v_min_start TIMESTAMPTZ;
    v_max_end TIMESTAMPTZ;
    v_option_count INTEGER;
    v_result JSON;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Must be signed in to create a poll event';
    END IF;

    IF p_title IS NULL OR length(trim(p_title)) = 0 THEN
        RAISE EXCEPTION 'Title is required';
    END IF;
    IF length(p_title) > 200 THEN
        RAISE EXCEPTION 'Title too long';
    END IF;

    v_option_count := jsonb_array_length(p_options);
    IF v_option_count = 0 THEN
        RAISE EXCEPTION 'At least one datetime option is required';
    END IF;
    IF v_option_count > 20 THEN
        RAISE EXCEPTION 'Too many options (max 20)';
    END IF;

    IF p_min_votes IS NOT NULL AND p_min_votes < 1 THEN
        RAISE EXCEPTION 'min_votes must be >= 1';
    END IF;

    IF p_scheduling_deadline IS NULL THEN
        p_scheduling_deadline := NOW() + INTERVAL '7 days';
    END IF;
    IF p_scheduling_deadline < NOW() THEN
        RAISE EXCEPTION 'Deadline must be in the future';
    END IF;

    -- Validate each option is a future time range with sane bounds.
    FOR v_option IN SELECT * FROM jsonb_array_elements(p_options) LOOP
        v_candidate_start := (v_option->>'starts_at')::TIMESTAMPTZ;
        v_candidate_end := (v_option->>'ends_at')::TIMESTAMPTZ;
        IF v_candidate_start IS NULL OR v_candidate_end IS NULL THEN
            RAISE EXCEPTION 'Each option must have starts_at and ends_at';
        END IF;
        IF v_candidate_end <= v_candidate_start THEN
            RAISE EXCEPTION 'Option end must be after start';
        END IF;
        IF v_candidate_start < NOW() THEN
            RAISE EXCEPTION 'Option start must be in the future';
        END IF;
        IF v_candidate_end - v_candidate_start > INTERVAL '24 hours' THEN
            RAISE EXCEPTION 'Option duration too long (max 24 hours)';
        END IF;
    END LOOP;

    SELECT MIN((o->>'starts_at')::TIMESTAMPTZ), MAX((o->>'ends_at')::TIMESTAMPTZ)
    INTO v_min_start, v_max_end
    FROM jsonb_array_elements(p_options) o;

    INSERT INTO event_rooms (
        proposal_id,
        group_id,
        title,
        description,
        starts_at,
        ends_at,
        chat_expires_at,
        created_by,
        scheduling_mode,
        scheduling_date_range_start,
        scheduling_date_range_end,
        scheduling_deadline,
        scheduling_status,
        poll_min_votes
    )
    VALUES (
        NULL,
        NULL,
        p_title,
        p_description,
        NULL,
        NULL,
        p_scheduling_deadline + INTERVAL '48 hours',
        auth.uid(),
        'poll',
        v_min_start::DATE,
        v_max_end::DATE,
        p_scheduling_deadline,
        'collecting',
        p_min_votes
    )
    RETURNING id INTO v_event_room_id;

    INSERT INTO event_room_participants (event_room_id, user_id)
    VALUES (v_event_room_id, auth.uid());

    -- Placeholder slot to satisfy FK on scheduling_candidate_times.
    INSERT INTO scheduling_slots (event_room_id, day_of_week, start_time, duration_minutes)
    VALUES (v_event_room_id, 0, '00:00'::TIME, 0)
    RETURNING id INTO v_dummy_slot_id;

    FOR v_option IN SELECT * FROM jsonb_array_elements(p_options) LOOP
        v_candidate_start := (v_option->>'starts_at')::TIMESTAMPTZ;
        v_candidate_end := (v_option->>'ends_at')::TIMESTAMPTZ;
        INSERT INTO scheduling_candidate_times (
            event_room_id, slot_id, candidate_start, candidate_end
        )
        VALUES (v_event_room_id, v_dummy_slot_id, v_candidate_start, v_candidate_end);
    END LOOP;

    SELECT json_build_object(
        'event_room_id', v_event_room_id,
        'title', p_title,
        'scheduling_mode', 'poll',
        'scheduling_status', 'collecting',
        'scheduling_deadline', p_scheduling_deadline,
        'poll_min_votes', p_min_votes,
        'option_count', v_option_count
    ) INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION create_poll_event TO authenticated;
