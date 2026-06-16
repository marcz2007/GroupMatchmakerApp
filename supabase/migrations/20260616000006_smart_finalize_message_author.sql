-- ============================================
-- FIX: smart finalization fails when run by cron/trigger
-- run_smart_scheduling inserted its "best time found" system message with
-- user_id = auth.uid(). When the function is invoked by the deadline cron or
-- the min-synced trigger (service role, no auth context), auth.uid() is NULL,
-- which violates event_messages.user_id NOT NULL — so the whole RPC fails and
-- the event never leaves 'collecting'. (Only a logged-in user manually
-- triggering it ever succeeded.)
--
-- Fix: attribute the system message to the event's created_by, exactly as
-- finalize_poll_event already does. Otherwise identical to
-- 20260416000001_smart_scheduling_local_time.sql.
-- ============================================
CREATE OR REPLACE FUNCTION run_smart_scheduling(p_event_room_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_synced INTEGER;
    v_selected RECORD;
    v_creator UUID;
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

    SELECT created_by INTO v_creator
    FROM event_rooms WHERE id = p_event_room_id;

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

    -- Attribute to the creator (non-null) so cron/trigger runs don't hit the
    -- user_id NOT NULL constraint. Timezone-agnostic; the event header shows
    -- the picked slot in the viewer's local time.
    INSERT INTO event_messages (event_room_id, user_id, content)
    VALUES (
        p_event_room_id,
        v_creator,
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
