-- ============================================
-- SMART SCHEDULING
-- Allows events to auto-pick the best time by
-- analyzing participant calendar availability.
-- ============================================

-- 1. New columns on event_rooms
ALTER TABLE event_rooms ADD COLUMN IF NOT EXISTS scheduling_mode TEXT NOT NULL DEFAULT 'fixed'
    CHECK (scheduling_mode IN ('fixed', 'smart'));
ALTER TABLE event_rooms ADD COLUMN IF NOT EXISTS scheduling_date_range_start DATE;
ALTER TABLE event_rooms ADD COLUMN IF NOT EXISTS scheduling_date_range_end DATE;
ALTER TABLE event_rooms ADD COLUMN IF NOT EXISTS scheduling_deadline TIMESTAMPTZ;
ALTER TABLE event_rooms ADD COLUMN IF NOT EXISTS scheduling_status TEXT NOT NULL DEFAULT 'none'
    CHECK (scheduling_status IN ('none', 'collecting', 'scheduled', 'failed'));

-- 2. Scheduling slots: the weekly time templates the creator defines
CREATE TABLE IF NOT EXISTS scheduling_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_room_id UUID NOT NULL REFERENCES event_rooms(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday
    start_time TIME NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 120,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scheduling_slots_event ON scheduling_slots(event_room_id);

-- 3. Candidate times: concrete date/times generated from slots within the range
CREATE TABLE IF NOT EXISTS scheduling_candidate_times (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_room_id UUID NOT NULL REFERENCES event_rooms(id) ON DELETE CASCADE,
    slot_id UUID NOT NULL REFERENCES scheduling_slots(id) ON DELETE CASCADE,
    candidate_start TIMESTAMPTZ NOT NULL,
    candidate_end TIMESTAMPTZ NOT NULL,
    available_count INTEGER NOT NULL DEFAULT 0,
    conflict_count INTEGER NOT NULL DEFAULT 0,
    rank INTEGER,
    is_selected BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scheduling_candidates_event ON scheduling_candidate_times(event_room_id);
CREATE INDEX idx_scheduling_candidates_rank ON scheduling_candidate_times(event_room_id, rank);

-- 4. Calendar syncs: tracks who has synced for a smart event
CREATE TABLE IF NOT EXISTS scheduling_calendar_syncs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_room_id UUID NOT NULL REFERENCES event_rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    calendar_provider TEXT NOT NULL, -- 'google', 'apple', 'ios_local'
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(event_room_id, user_id)
);

CREATE INDEX idx_scheduling_syncs_event ON scheduling_calendar_syncs(event_room_id);

-- FK from event_rooms to the selected candidate
ALTER TABLE event_rooms ADD COLUMN IF NOT EXISTS selected_slot_id UUID
    REFERENCES scheduling_candidate_times(id);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE scheduling_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduling_candidate_times ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduling_calendar_syncs ENABLE ROW LEVEL SECURITY;

-- Slots: participants can view
CREATE POLICY "Participants can view scheduling slots"
ON scheduling_slots FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM event_room_participants
        WHERE event_room_id = scheduling_slots.event_room_id
        AND user_id = auth.uid()
    )
);

-- Candidates: participants can view
CREATE POLICY "Participants can view candidate times"
ON scheduling_candidate_times FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM event_room_participants
        WHERE event_room_id = scheduling_candidate_times.event_room_id
        AND user_id = auth.uid()
    )
);

-- Calendar syncs: participants can view all syncs for their events
CREATE POLICY "Participants can view calendar syncs"
ON scheduling_calendar_syncs FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM event_room_participants
        WHERE event_room_id = scheduling_calendar_syncs.event_room_id
        AND user_id = auth.uid()
    )
);

-- ============================================
-- RPC: create_smart_event
-- ============================================
CREATE OR REPLACE FUNCTION create_smart_event(
    p_title TEXT,
    p_description TEXT DEFAULT NULL,
    p_date_range_start DATE DEFAULT NULL,
    p_date_range_end DATE DEFAULT NULL,
    p_scheduling_deadline TIMESTAMPTZ DEFAULT NULL,
    p_slots JSONB DEFAULT '[]'::JSONB
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
    -- Default deadline to 7 days from now
    IF p_scheduling_deadline IS NULL THEN
        p_scheduling_deadline := NOW() + INTERVAL '7 days';
    END IF;

    -- Create event room with smart scheduling mode
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
        scheduling_status
    )
    VALUES (
        NULL,
        NULL,
        p_title,
        p_description,
        NULL,  -- starts_at determined later
        NULL,  -- ends_at determined later
        p_scheduling_deadline + INTERVAL '48 hours', -- chat expires after deadline + buffer
        auth.uid(),
        'smart',
        p_date_range_start,
        p_date_range_end,
        p_scheduling_deadline,
        'collecting'
    )
    RETURNING id INTO v_event_room_id;

    -- Add creator as participant
    INSERT INTO event_room_participants (event_room_id, user_id)
    VALUES (v_event_room_id, auth.uid());

    -- Insert scheduling slots and generate candidate times
    FOR v_slot IN SELECT * FROM jsonb_array_elements(p_slots) LOOP
        v_day_of_week := (v_slot->>'day_of_week')::INTEGER;
        v_start_time := (v_slot->>'start_time')::TIME;
        v_duration := COALESCE((v_slot->>'duration_minutes')::INTEGER, 120);

        INSERT INTO scheduling_slots (event_room_id, day_of_week, start_time, duration_minutes)
        VALUES (v_event_room_id, v_day_of_week, v_start_time, v_duration)
        RETURNING id INTO v_slot_id;

        -- Generate candidate times for every matching day in the date range
        FOR v_d IN
            SELECT d::DATE
            FROM generate_series(p_date_range_start, p_date_range_end, '1 day'::INTERVAL) d
            WHERE EXTRACT(DOW FROM d) = v_day_of_week
        LOOP
            v_candidate_start := (v_d || ' ' || v_start_time)::TIMESTAMPTZ;
            v_candidate_end := v_candidate_start + (v_duration || ' minutes')::INTERVAL;

            -- Only include future candidates
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
        'candidate_count', (SELECT COUNT(*) FROM scheduling_candidate_times WHERE event_room_id = v_event_room_id)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION create_smart_event TO authenticated;

-- ============================================
-- RPC: sync_calendar_for_event
-- ============================================
CREATE OR REPLACE FUNCTION sync_calendar_for_event(
    p_event_room_id UUID,
    p_calendar_provider TEXT DEFAULT 'google'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_scheduling_mode TEXT;
    v_scheduling_status TEXT;
BEGIN
    -- Verify user is a participant
    IF NOT EXISTS (
        SELECT 1 FROM event_room_participants
        WHERE event_room_id = p_event_room_id
        AND user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Not a participant in this event';
    END IF;

    -- Verify event is smart-scheduled and still collecting
    SELECT scheduling_mode, scheduling_status
    INTO v_scheduling_mode, v_scheduling_status
    FROM event_rooms
    WHERE id = p_event_room_id;

    IF v_scheduling_mode != 'smart' THEN
        RAISE EXCEPTION 'This event does not use smart scheduling';
    END IF;

    IF v_scheduling_status != 'collecting' THEN
        RAISE EXCEPTION 'Calendar sync is no longer accepting responses';
    END IF;

    -- Upsert sync record
    INSERT INTO scheduling_calendar_syncs (event_room_id, user_id, calendar_provider)
    VALUES (p_event_room_id, auth.uid(), p_calendar_provider)
    ON CONFLICT (event_room_id, user_id)
    DO UPDATE SET synced_at = NOW(), calendar_provider = p_calendar_provider;

    RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION sync_calendar_for_event TO authenticated;

-- ============================================
-- RPC: get_smart_scheduling_status
-- ============================================
CREATE OR REPLACE FUNCTION get_smart_scheduling_status(p_event_room_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSON;
BEGIN
    -- Verify user is a participant
    IF NOT EXISTS (
        SELECT 1 FROM event_room_participants
        WHERE event_room_id = p_event_room_id
        AND user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Not a participant in this event';
    END IF;

    SELECT json_build_object(
        'scheduling_mode', er.scheduling_mode,
        'scheduling_status', er.scheduling_status,
        'date_range_start', er.scheduling_date_range_start,
        'date_range_end', er.scheduling_date_range_end,
        'scheduling_deadline', er.scheduling_deadline,
        'selected_slot_id', er.selected_slot_id,
        'total_participants', (
            SELECT COUNT(*) FROM event_room_participants
            WHERE event_room_id = p_event_room_id
        ),
        'synced_count', (
            SELECT COUNT(*) FROM scheduling_calendar_syncs
            WHERE event_room_id = p_event_room_id
        ),
        'synced_users', COALESCE((
            SELECT json_agg(json_build_object(
                'user_id', scs.user_id,
                'display_name', COALESCE(pr.first_name, pr.username, 'Someone'),
                'calendar_provider', scs.calendar_provider,
                'synced_at', scs.synced_at
            ))
            FROM scheduling_calendar_syncs scs
            JOIN profiles pr ON pr.id = scs.user_id
            WHERE scs.event_room_id = p_event_room_id
        ), '[]'::json),
        'user_has_synced', EXISTS(
            SELECT 1 FROM scheduling_calendar_syncs
            WHERE event_room_id = p_event_room_id
            AND user_id = auth.uid()
        ),
        'slots', COALESCE((
            SELECT json_agg(json_build_object(
                'id', ss.id,
                'day_of_week', ss.day_of_week,
                'start_time', ss.start_time,
                'duration_minutes', ss.duration_minutes
            ))
            FROM scheduling_slots ss
            WHERE ss.event_room_id = p_event_room_id
        ), '[]'::json),
        'selected_time', (
            SELECT json_build_object(
                'id', ct.id,
                'candidate_start', ct.candidate_start,
                'candidate_end', ct.candidate_end,
                'available_count', ct.available_count,
                'conflict_count', ct.conflict_count
            )
            FROM scheduling_candidate_times ct
            WHERE ct.event_room_id = p_event_room_id
            AND ct.is_selected = true
            LIMIT 1
        ),
        'alternative_times', COALESCE((
            SELECT json_agg(json_build_object(
                'id', ct.id,
                'candidate_start', ct.candidate_start,
                'candidate_end', ct.candidate_end,
                'available_count', ct.available_count,
                'conflict_count', ct.conflict_count,
                'rank', ct.rank
            ) ORDER BY ct.rank)
            FROM scheduling_candidate_times ct
            WHERE ct.event_room_id = p_event_room_id
            AND ct.is_selected = false
            AND ct.rank IS NOT NULL
            AND ct.rank <= 5
        ), '[]'::json)
    )
    INTO v_result
    FROM event_rooms er
    WHERE er.id = p_event_room_id;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_smart_scheduling_status TO authenticated;

-- ============================================
-- RPC: run_smart_scheduling (SECURITY DEFINER, service role)
-- Analyzes calendars and picks the best time.
-- ============================================
CREATE OR REPLACE FUNCTION run_smart_scheduling(p_event_room_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_synced INTEGER;
    v_selected RECORD;
    v_result JSON;
BEGIN
    -- Verify event is smart and still collecting
    IF NOT EXISTS (
        SELECT 1 FROM event_rooms
        WHERE id = p_event_room_id
        AND scheduling_mode = 'smart'
        AND scheduling_status = 'collecting'
    ) THEN
        RAISE EXCEPTION 'Event is not in collecting state';
    END IF;

    -- Count synced users
    SELECT COUNT(*) INTO v_total_synced
    FROM scheduling_calendar_syncs
    WHERE event_room_id = p_event_room_id;

    -- If nobody synced, pick the earliest candidate
    IF v_total_synced = 0 THEN
        UPDATE scheduling_candidate_times
        SET available_count = 0, conflict_count = 0
        WHERE event_room_id = p_event_room_id;
    ELSE
        -- For each candidate time, count available and conflicting users
        UPDATE scheduling_candidate_times ct
        SET
            available_count = v_total_synced - (
                SELECT COUNT(DISTINCT scs.user_id)
                FROM scheduling_calendar_syncs scs
                WHERE scs.event_room_id = p_event_room_id
                AND EXISTS (
                    SELECT 1 FROM calendar_busy_times cbt
                    WHERE cbt.user_id = scs.user_id
                    AND cbt.start_time < ct.candidate_end
                    AND cbt.end_time > ct.candidate_start
                )
            ),
            conflict_count = (
                SELECT COUNT(DISTINCT scs.user_id)
                FROM scheduling_calendar_syncs scs
                WHERE scs.event_room_id = p_event_room_id
                AND EXISTS (
                    SELECT 1 FROM calendar_busy_times cbt
                    WHERE cbt.user_id = scs.user_id
                    AND cbt.start_time < ct.candidate_end
                    AND cbt.end_time > ct.candidate_start
                )
            )
        WHERE ct.event_room_id = p_event_room_id;
    END IF;

    -- Rank candidates: most available first, then fewest conflicts, then earliest
    WITH ranked AS (
        SELECT id,
            ROW_NUMBER() OVER (
                ORDER BY available_count DESC, conflict_count ASC, candidate_start ASC
            ) AS rk
        FROM scheduling_candidate_times
        WHERE event_room_id = p_event_room_id
    )
    UPDATE scheduling_candidate_times ct
    SET rank = ranked.rk,
        is_selected = (ranked.rk = 1)
    FROM ranked
    WHERE ct.id = ranked.id;

    -- Get the selected candidate
    SELECT * INTO v_selected
    FROM scheduling_candidate_times
    WHERE event_room_id = p_event_room_id
    AND is_selected = true;

    IF v_selected IS NULL THEN
        -- No candidates at all
        UPDATE event_rooms
        SET scheduling_status = 'failed'
        WHERE id = p_event_room_id;

        RETURN json_build_object('success', false, 'reason', 'No candidate times available');
    END IF;

    -- Update event room with selected time
    UPDATE event_rooms
    SET starts_at = v_selected.candidate_start,
        ends_at = v_selected.candidate_end,
        selected_slot_id = v_selected.id,
        scheduling_status = 'scheduled',
        chat_expires_at = v_selected.candidate_end + INTERVAL '48 hours'
    WHERE id = p_event_room_id;

    -- Post system message in the event chat
    INSERT INTO event_messages (event_room_id, user_id, content)
    VALUES (
        p_event_room_id,
        auth.uid(),
        '📅 The best time has been found! ' ||
        TO_CHAR(v_selected.candidate_start AT TIME ZONE 'UTC', 'Day, Mon DD') ||
        ' at ' ||
        TO_CHAR(v_selected.candidate_start AT TIME ZONE 'UTC', 'HH12:MI AM') ||
        '. ' || v_selected.available_count || ' of ' || v_total_synced || ' people are free.'
    );

    SELECT json_build_object(
        'success', true,
        'selected_start', v_selected.candidate_start,
        'selected_end', v_selected.candidate_end,
        'available_count', v_selected.available_count,
        'total_synced', v_total_synced
    ) INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION run_smart_scheduling TO authenticated;
GRANT EXECUTE ON FUNCTION run_smart_scheduling TO service_role;

-- ============================================
-- RPC: request_reschedule
-- Switch to an alternative time slot.
-- ============================================
CREATE OR REPLACE FUNCTION request_reschedule(
    p_event_room_id UUID,
    p_candidate_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_slot RECORD;
BEGIN
    -- Verify user is a participant
    IF NOT EXISTS (
        SELECT 1 FROM event_room_participants
        WHERE event_room_id = p_event_room_id
        AND user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Not a participant in this event';
    END IF;

    -- Verify event is smart and already scheduled
    IF NOT EXISTS (
        SELECT 1 FROM event_rooms
        WHERE id = p_event_room_id
        AND scheduling_mode = 'smart'
        AND scheduling_status = 'scheduled'
    ) THEN
        RAISE EXCEPTION 'Event is not in scheduled state';
    END IF;

    -- Get the new candidate
    SELECT * INTO v_new_slot
    FROM scheduling_candidate_times
    WHERE id = p_candidate_id
    AND event_room_id = p_event_room_id;

    IF v_new_slot IS NULL THEN
        RAISE EXCEPTION 'Candidate time not found';
    END IF;

    -- Deselect current
    UPDATE scheduling_candidate_times
    SET is_selected = false
    WHERE event_room_id = p_event_room_id AND is_selected = true;

    -- Select new
    UPDATE scheduling_candidate_times
    SET is_selected = true
    WHERE id = p_candidate_id;

    -- Update event room
    UPDATE event_rooms
    SET starts_at = v_new_slot.candidate_start,
        ends_at = v_new_slot.candidate_end,
        selected_slot_id = p_candidate_id,
        chat_expires_at = v_new_slot.candidate_end + INTERVAL '48 hours'
    WHERE id = p_event_room_id;

    -- Post system message
    INSERT INTO event_messages (event_room_id, user_id, content)
    VALUES (
        p_event_room_id,
        auth.uid(),
        '🔄 The event has been rescheduled to ' ||
        TO_CHAR(v_new_slot.candidate_start AT TIME ZONE 'UTC', 'Day, Mon DD') ||
        ' at ' ||
        TO_CHAR(v_new_slot.candidate_start AT TIME ZONE 'UTC', 'HH12:MI AM') || '.'
    );

    RETURN json_build_object(
        'success', true,
        'new_start', v_new_slot.candidate_start,
        'new_end', v_new_slot.candidate_end
    );
END;
$$;

GRANT EXECUTE ON FUNCTION request_reschedule TO authenticated;
