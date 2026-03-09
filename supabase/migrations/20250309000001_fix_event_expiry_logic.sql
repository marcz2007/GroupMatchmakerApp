-- Fix event expiry logic: consider starts_at before falling back to created_at.
-- Previously, events with ends_at=NULL expired based on created_at+72h,
-- causing future events to show as expired before they even happen.

-- 1. Fix chat_expires_at for all existing events
UPDATE event_rooms
SET chat_expires_at = COALESCE(
    ends_at + INTERVAL '48 hours',
    starts_at + INTERVAL '48 hours',
    created_at + INTERVAL '72 hours'
)
WHERE chat_expires_at IS NOT NULL;

-- 2. Fix create_direct_event to include starts_at in the fallback chain
CREATE OR REPLACE FUNCTION create_direct_event(
    p_title TEXT,
    p_description TEXT DEFAULT NULL,
    p_starts_at TIMESTAMPTZ DEFAULT NULL,
    p_ends_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_event_room_id UUID;
    v_result JSON;
BEGIN
    INSERT INTO event_rooms (
        proposal_id,
        group_id,
        title,
        description,
        starts_at,
        ends_at,
        chat_expires_at,
        created_by
    )
    VALUES (
        NULL,
        NULL,
        p_title,
        p_description,
        p_starts_at,
        p_ends_at,
        COALESCE(p_ends_at + INTERVAL '48 hours', p_starts_at + INTERVAL '48 hours', NOW() + INTERVAL '72 hours'),
        auth.uid()
    )
    RETURNING id INTO v_event_room_id;

    INSERT INTO event_room_participants (event_room_id, user_id)
    VALUES (v_event_room_id, auth.uid());

    SELECT json_build_object(
        'event_room_id', v_event_room_id,
        'title', p_title,
        'starts_at', p_starts_at,
        'ends_at', p_ends_at
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- 3. Fix RLS policy for event_messages insert to consider starts_at
DROP POLICY IF EXISTS "Users can insert messages in their active event rooms" ON event_messages;
CREATE POLICY "Users can insert messages in their active event rooms"
ON event_messages FOR INSERT
WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
        SELECT 1 FROM event_room_participants erp
        JOIN event_rooms er ON er.id = erp.event_room_id
        WHERE erp.event_room_id = event_messages.event_room_id
        AND erp.user_id = auth.uid()
        AND (
            (er.ends_at IS NOT NULL AND er.ends_at + INTERVAL '48 hours' > NOW())
            OR (er.ends_at IS NULL AND er.starts_at IS NOT NULL AND er.starts_at + INTERVAL '48 hours' > NOW())
            OR (er.ends_at IS NULL AND er.starts_at IS NULL AND er.created_at + INTERVAL '72 hours' > NOW())
        )
    )
);
