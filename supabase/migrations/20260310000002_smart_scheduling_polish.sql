-- ============================================
-- SMART SCHEDULING POLISH
-- 1. Add scheduling fields to get_public_event_details RPC
-- 2. Add is_system_message column to event_messages
-- ============================================

-- 1. Add is_system_message column for visual distinction
ALTER TABLE event_messages ADD COLUMN IF NOT EXISTS is_system_message BOOLEAN NOT NULL DEFAULT false;

-- Mark existing system messages (from scheduling RPCs) as system messages.
-- These are messages posted by the run_smart_scheduling and request_reschedule functions.
UPDATE event_messages
SET is_system_message = true
WHERE content LIKE '%The best time has been found!%'
   OR content LIKE '%The event has been rescheduled%';

-- 2. Update run_smart_scheduling to set is_system_message = true
-- We need to replace the function to include the new column in its INSERT.
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
        -- No candidates at all — mark as failed
        UPDATE event_rooms
        SET scheduling_status = 'failed'
        WHERE id = p_event_room_id;

        RETURN json_build_object('success', false, 'reason', 'No candidate times available');
    END IF;

    -- Update event room with the selected time
    UPDATE event_rooms
    SET scheduling_status = 'scheduled',
        starts_at = v_selected.candidate_start,
        ends_at = v_selected.candidate_end,
        selected_slot_id = v_selected.id,
        chat_expires_at = v_selected.candidate_end + INTERVAL '48 hours'
    WHERE id = p_event_room_id;

    -- Post system message with is_system_message flag
    INSERT INTO event_messages (event_room_id, user_id, content, is_system_message)
    VALUES (
        p_event_room_id,
        COALESCE(auth.uid(), (SELECT created_by FROM event_rooms WHERE id = p_event_room_id)),
        '📅 The best time has been found! ' ||
        TO_CHAR(v_selected.candidate_start AT TIME ZONE 'UTC', 'Day, Mon DD') ||
        ' at ' ||
        TO_CHAR(v_selected.candidate_start AT TIME ZONE 'UTC', 'HH12:MI AM') ||
        '. ' || v_selected.available_count || ' of ' || v_total_synced || ' available.',
        true
    );

    RETURN json_build_object(
        'success', true,
        'selected_start', v_selected.candidate_start,
        'selected_end', v_selected.candidate_end,
        'available_count', v_selected.available_count,
        'conflict_count', v_selected.conflict_count
    );
END;
$$;

GRANT EXECUTE ON FUNCTION run_smart_scheduling TO authenticated;
GRANT EXECUTE ON FUNCTION run_smart_scheduling TO service_role;

-- 3. Update request_reschedule to set is_system_message = true
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

    -- Post system message with is_system_message flag
    INSERT INTO event_messages (event_room_id, user_id, content, is_system_message)
    VALUES (
        p_event_room_id,
        auth.uid(),
        '🔄 The event has been rescheduled to ' ||
        TO_CHAR(v_new_slot.candidate_start AT TIME ZONE 'UTC', 'Day, Mon DD') ||
        ' at ' ||
        TO_CHAR(v_new_slot.candidate_start AT TIME ZONE 'UTC', 'HH12:MI AM') || '.',
        true
    );

    RETURN json_build_object(
        'success', true,
        'new_start', v_new_slot.candidate_start,
        'new_end', v_new_slot.candidate_end
    );
END;
$$;

GRANT EXECUTE ON FUNCTION request_reschedule TO authenticated;

-- 4. Update get_public_event_details to include scheduling fields
CREATE OR REPLACE FUNCTION get_public_event_details(p_event_room_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSON;
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT json_build_object(
        'event_room', json_build_object(
            'id', er.id,
            'proposal_id', er.proposal_id,
            'group_id', er.group_id,
            'title', er.title,
            'description', er.description,
            'starts_at', er.starts_at,
            'ends_at', er.ends_at,
            'created_at', er.created_at,
            'scheduling_mode', er.scheduling_mode,
            'scheduling_status', er.scheduling_status,
            'scheduling_deadline', er.scheduling_deadline
        ),
        'group_name', COALESCE(g.name, 'Direct Event'),
        'participant_count', (
            SELECT COUNT(*) FROM event_room_participants
            WHERE event_room_id = er.id
        ),
        'participants', (
            SELECT COALESCE(json_agg(
                json_build_object(
                    'id', pr.id,
                    'display_name', COALESCE(pr.first_name, pr.username, 'Someone'),
                    'avatar_url', pr.avatar_url
                )
            ), '[]'::json)
            FROM event_room_participants erp2
            JOIN profiles pr ON pr.id = erp2.user_id
            WHERE erp2.event_room_id = er.id
        ),
        'creator_name', (
            SELECT COALESCE(cp.first_name, cp.username, 'Someone')
            FROM profiles cp
            WHERE cp.id = er.created_by
        ),
        'is_participant', EXISTS (
            SELECT 1 FROM event_room_participants
            WHERE event_room_id = er.id
            AND user_id = v_user_id
        ),
        'is_expired', (er.chat_expires_at IS NOT NULL AND er.chat_expires_at <= NOW())
    )
    INTO v_result
    FROM event_rooms er
    LEFT JOIN groups g ON g.id = er.group_id
    WHERE er.id = p_event_room_id;

    IF v_result IS NULL THEN
        RAISE EXCEPTION 'Event not found';
    END IF;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_public_event_details TO authenticated;

-- 5. Update get_event_room_messages to include is_system_message
CREATE OR REPLACE FUNCTION get_event_room_messages(
    p_event_room_id UUID,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSON;
    v_is_expired BOOLEAN;
BEGIN
    -- Check if user is a participant
    IF NOT EXISTS (
        SELECT 1 FROM event_room_participants
        WHERE event_room_id = p_event_room_id
        AND user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Not a participant in this event room';
    END IF;

    -- Check if room is expired
    SELECT
        (er.chat_expires_at IS NOT NULL AND er.chat_expires_at <= NOW())
    INTO v_is_expired
    FROM event_rooms er
    WHERE er.id = p_event_room_id;

    SELECT json_build_object(
        'messages', COALESCE((
            SELECT json_agg(
                json_build_object(
                    'id', em.id,
                    'content', em.content,
                    'created_at', em.created_at,
                    'is_system_message', COALESCE(em.is_system_message, false),
                    'user', json_build_object(
                        'id', pr.id,
                        'display_name', COALESCE(pr.first_name, pr.username, 'Someone'),
                        'avatar_url', pr.avatar_url
                    )
                )
                ORDER BY em.created_at ASC
            )
            FROM (
                SELECT * FROM event_messages
                WHERE event_room_id = p_event_room_id
                ORDER BY created_at ASC
                LIMIT p_limit OFFSET p_offset
            ) em
            JOIN profiles pr ON pr.id = em.user_id
        ), '[]'::json),
        'is_expired', COALESCE(v_is_expired, false)
    ) INTO result;

    RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_event_room_messages TO authenticated;
