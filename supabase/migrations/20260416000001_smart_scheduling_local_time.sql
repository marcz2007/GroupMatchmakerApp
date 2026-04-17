-- ============================================
-- Drop the hard-coded UTC time from the "best time found" system chat.
-- The event starts_at is already surfaced in the event header / details
-- panel in both clients, which render it in the viewer's local time.
-- Embedding a UTC time in the message body was misleading for anyone
-- not on UTC — e.g. "Mon Apr 20 at 07:00 PM" that was actually 8pm BST
-- to the reader.
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
    IF NOT EXISTS (
        SELECT 1 FROM event_rooms
        WHERE id = p_event_room_id
        AND scheduling_mode = 'smart'
        AND scheduling_status = 'collecting'
    ) THEN
        RAISE EXCEPTION 'Event is not in collecting state';
    END IF;

    SELECT COUNT(*) INTO v_total_synced
    FROM scheduling_calendar_syncs
    WHERE event_room_id = p_event_room_id;

    IF v_total_synced = 0 THEN
        UPDATE scheduling_candidate_times
        SET available_count = 0, conflict_count = 0
        WHERE event_room_id = p_event_room_id;
    ELSE
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

    SELECT * INTO v_selected
    FROM scheduling_candidate_times
    WHERE event_room_id = p_event_room_id
    AND is_selected = true;

    IF v_selected IS NULL THEN
        UPDATE event_rooms
        SET scheduling_status = 'failed'
        WHERE id = p_event_room_id;
        RETURN json_build_object('success', false, 'reason', 'No candidate times available');
    END IF;

    UPDATE event_rooms
    SET starts_at = v_selected.candidate_start,
        ends_at = v_selected.candidate_end,
        selected_slot_id = v_selected.id,
        scheduling_status = 'scheduled',
        chat_expires_at = v_selected.candidate_end + INTERVAL '48 hours'
    WHERE id = p_event_room_id;

    -- Keep the message timezone-agnostic. The event header shows the
    -- picked slot in the viewer's local time already.
    INSERT INTO event_messages (event_room_id, user_id, content)
    VALUES (
        p_event_room_id,
        auth.uid(),
        '📅 The best time has been found — ' ||
        v_selected.available_count || ' of ' || v_total_synced ||
        ' synced participants are free.'
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

-- Same treatment for the poll-mode finalize: drop the forced-UTC time
-- from the system message. Clients render the winning slot locally in
-- the event header; the chat message only needs to say "poll closed".
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

    IF v_caller IS NOT NULL AND v_caller <> v_creator THEN
        RAISE EXCEPTION 'Only the event creator can finalize this poll';
    END IF;

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
        '🗳️ Poll closed — winning slot picked (' ||
          v_winning_yes || ' yes vote' ||
          CASE WHEN v_winning_yes = 1 THEN '' ELSE 's' END || ').',
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

GRANT EXECUTE ON FUNCTION finalize_poll_event(UUID) TO authenticated;
