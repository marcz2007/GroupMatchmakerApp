-- ============================================
-- DIRECT EVENTS (no proposal/group required)
-- ============================================

-- Make proposal_id and group_id nullable so events can exist without groups
ALTER TABLE event_rooms ALTER COLUMN proposal_id DROP NOT NULL;
ALTER TABLE event_rooms ALTER COLUMN group_id DROP NOT NULL;

-- Add created_by column to track who created the event
ALTER TABLE event_rooms ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id);

-- Backfill created_by from proposals for existing event rooms
UPDATE event_rooms
SET created_by = p.created_by
FROM proposals p
WHERE event_rooms.proposal_id = p.id
AND event_rooms.created_by IS NULL;

-- Drop the existing UNIQUE constraint on proposal_id (it disallows multiple NULLs in some DBs)
ALTER TABLE event_rooms DROP CONSTRAINT IF EXISTS event_rooms_proposal_id_key;

-- Replace with a partial unique index (only enforces uniqueness for non-NULL values)
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_rooms_proposal_id_unique
ON event_rooms (proposal_id) WHERE proposal_id IS NOT NULL;

-- ============================================
-- RPC: create_direct_event
-- Creates an event room without a proposal/group
-- ============================================
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
    -- Create event room with NULL proposal_id and group_id
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
        COALESCE(p_ends_at + INTERVAL '48 hours', NOW() + INTERVAL '72 hours'),
        auth.uid()
    )
    RETURNING id INTO v_event_room_id;

    -- Add creator as participant
    INSERT INTO event_room_participants (event_room_id, user_id)
    VALUES (v_event_room_id, auth.uid());

    -- Return the event room as JSON
    SELECT row_to_json(er) INTO v_result
    FROM event_rooms er
    WHERE er.id = v_event_room_id;

    RETURN v_result;
END;
$$;

-- ============================================
-- RPC: join_event_room
-- Allows invite link users to join an event room (bypasses RLS)
-- ============================================
CREATE OR REPLACE FUNCTION join_event_room(p_event_room_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_event_room event_rooms%ROWTYPE;
BEGIN
    -- Verify event room exists
    SELECT * INTO v_event_room
    FROM event_rooms
    WHERE id = p_event_room_id;

    IF v_event_room.id IS NULL THEN
        RAISE EXCEPTION 'Event room not found';
    END IF;

    -- Check if expired
    IF v_event_room.chat_expires_at IS NOT NULL AND v_event_room.chat_expires_at <= NOW() THEN
        RAISE EXCEPTION 'This event has expired';
    END IF;

    -- Upsert into event_room_participants
    INSERT INTO event_room_participants (event_room_id, user_id)
    VALUES (p_event_room_id, auth.uid())
    ON CONFLICT (event_room_id, user_id) DO NOTHING;

    -- Conditionally add to group_members only if event has a group_id
    IF v_event_room.group_id IS NOT NULL THEN
        INSERT INTO group_members (group_id, user_id)
        VALUES (v_event_room.group_id, auth.uid())
        ON CONFLICT (group_id, user_id) DO NOTHING;
    END IF;

    RETURN json_build_object(
        'success', true,
        'event_room_id', p_event_room_id,
        'title', v_event_room.title
    );
END;
$$;

-- ============================================
-- Fix get_user_events_with_details: JOIN groups → LEFT JOIN groups
-- ============================================
CREATE OR REPLACE FUNCTION get_user_events_with_details()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT COALESCE(json_agg(event_data ORDER BY last_activity DESC), '[]'::json)
    INTO v_result
    FROM (
        SELECT
            json_build_object(
                'event_room', json_build_object(
                    'id', er.id,
                    'proposal_id', er.proposal_id,
                    'group_id', er.group_id,
                    'title', er.title,
                    'description', er.description,
                    'starts_at', er.starts_at,
                    'ends_at', er.ends_at,
                    'created_at', er.created_at
                ),
                'group_name', COALESCE(g.name, 'Direct Event'),
                'participant_count', (
                    SELECT COUNT(*) FROM event_room_participants
                    WHERE event_room_id = er.id
                ),
                'last_message', (
                    SELECT json_build_object(
                        'content', em.content,
                        'created_at', em.created_at,
                        'sender_name', COALESCE(pr.first_name, pr.username, 'Someone')
                    )
                    FROM event_messages em
                    JOIN profiles pr ON pr.id = em.user_id
                    WHERE em.event_room_id = er.id
                    ORDER BY em.created_at DESC
                    LIMIT 1
                ),
                'unread_count', 0,
                'is_expired', (er.chat_expires_at IS NOT NULL AND er.chat_expires_at <= NOW())
            ) as event_data,
            COALESCE(
                (SELECT MAX(created_at) FROM event_messages WHERE event_room_id = er.id),
                er.created_at
            ) as last_activity
        FROM event_rooms er
        JOIN event_room_participants erp ON erp.event_room_id = er.id
        LEFT JOIN groups g ON g.id = er.group_id
        WHERE erp.user_id = auth.uid()
        AND (er.chat_expires_at IS NULL OR er.chat_expires_at > NOW())
    ) subquery;

    RETURN v_result;
END;
$$;

-- ============================================
-- Fix get_event_details: JOIN groups → LEFT JOIN groups
-- ============================================
CREATE OR REPLACE FUNCTION get_event_details(p_event_room_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSON;
BEGIN
    -- Verify participation
    IF NOT EXISTS (
        SELECT 1 FROM event_room_participants
        WHERE event_room_id = p_event_room_id
        AND user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Not a participant in this event';
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
            'created_at', er.created_at
        ),
        'group_name', COALESCE(g.name, 'Direct Event'),
        'participant_count', (
            SELECT COUNT(*) FROM event_room_participants
            WHERE event_room_id = er.id
        ),
        'participants', (
            SELECT json_agg(
                json_build_object(
                    'id', pr.id,
                    'display_name', COALESCE(pr.first_name, pr.username, 'Someone'),
                    'avatar_url', pr.avatar_url
                )
            )
            FROM event_room_participants erp2
            JOIN profiles pr ON pr.id = erp2.user_id
            WHERE erp2.event_room_id = er.id
        ),
        'last_message', NULL,
        'unread_count', 0,
        'is_expired', (er.chat_expires_at IS NOT NULL AND er.chat_expires_at <= NOW())
    )
    INTO v_result
    FROM event_rooms er
    LEFT JOIN groups g ON g.id = er.group_id
    WHERE er.id = p_event_room_id;

    RETURN v_result;
END;
$$;

-- ============================================
-- Fix get_user_event_rooms: LEFT JOIN proposals, handle null group
-- ============================================
CREATE OR REPLACE FUNCTION get_user_event_rooms()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_agg(
        json_build_object(
            'event_room', row_to_json(er),
            'proposal', CASE WHEN p.id IS NOT NULL THEN row_to_json(p) ELSE NULL END,
            'group', (
                SELECT json_build_object('id', id, 'name', name)
                FROM groups WHERE id = er.group_id
            ),
            'participant_count', (
                SELECT COUNT(*) FROM event_room_participants
                WHERE event_room_id = er.id
            ),
            'is_expired', (
                (er.ends_at IS NOT NULL AND er.ends_at + INTERVAL '12 hours' <= NOW())
                OR (er.ends_at IS NULL AND er.created_at + INTERVAL '72 hours' <= NOW())
            )
        )
        ORDER BY er.created_at DESC
    )
    INTO result
    FROM event_rooms er
    LEFT JOIN proposals p ON p.id = er.proposal_id
    JOIN event_room_participants erp ON erp.event_room_id = er.id
    WHERE erp.user_id = auth.uid();

    RETURN COALESCE(result, '[]'::json);
END;
$$;

-- Grant permissions for new functions
GRANT EXECUTE ON FUNCTION create_direct_event TO authenticated;
GRANT EXECUTE ON FUNCTION join_event_room TO authenticated;
