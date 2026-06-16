-- ============================================
-- Drop the hard-coded UTC time from the request_reschedule system message.
-- Like the smart/poll finalize messages (20260416000001), embedding a UTC
-- time in the chat body was misleading for non-UTC readers — e.g. "at 07:00
-- PM" that was really 8pm BST. The event header already renders the new time
-- in the viewer's local zone, so the message just needs to announce the change.
-- Everything else is unchanged from 20260310000002_smart_scheduling_polish.sql.
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

    -- Timezone-agnostic message; the event header shows the new time locally.
    INSERT INTO event_messages (event_room_id, user_id, content, is_system_message)
    VALUES (
        p_event_room_id,
        auth.uid(),
        '🔄 The event has been rescheduled — check the event details for the new time.',
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
