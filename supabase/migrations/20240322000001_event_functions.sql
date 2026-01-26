-- ============================================
-- EVENT FUNCTIONS FOR EVENTS TAB
-- ============================================

-- Get count of active events for user (for tab badge/visibility)
CREATE OR REPLACE FUNCTION get_user_event_count()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*)::INTEGER INTO v_count
    FROM event_room_participants erp
    JOIN event_rooms er ON er.id = erp.event_room_id
    WHERE erp.user_id = auth.uid()
    AND (
        (er.ends_at IS NOT NULL AND er.ends_at + INTERVAL '12 hours' > NOW())
        OR (er.ends_at IS NULL AND er.created_at + INTERVAL '72 hours' > NOW())
    );

    RETURN v_count;
END;
$$;

-- Get all events for user with details (for events list)
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
                'group_name', g.name,
                'participant_count', (
                    SELECT COUNT(*) FROM event_room_participants
                    WHERE event_room_id = er.id
                ),
                'last_message', (
                    SELECT json_build_object(
                        'content', em.content,
                        'created_at', em.created_at,
                        'sender_name', pr.display_name
                    )
                    FROM event_messages em
                    JOIN profiles pr ON pr.id = em.user_id
                    WHERE em.event_room_id = er.id
                    ORDER BY em.created_at DESC
                    LIMIT 1
                ),
                'unread_count', 0,
                'is_expired', (
                    (er.ends_at IS NOT NULL AND er.ends_at + INTERVAL '12 hours' <= NOW())
                    OR (er.ends_at IS NULL AND er.created_at + INTERVAL '72 hours' <= NOW())
                )
            ) as event_data,
            COALESCE(
                (SELECT MAX(created_at) FROM event_messages WHERE event_room_id = er.id),
                er.created_at
            ) as last_activity
        FROM event_rooms er
        JOIN event_room_participants erp ON erp.event_room_id = er.id
        JOIN groups g ON g.id = er.group_id
        WHERE erp.user_id = auth.uid()
        AND (
            (er.ends_at IS NOT NULL AND er.ends_at + INTERVAL '12 hours' > NOW())
            OR (er.ends_at IS NULL AND er.created_at + INTERVAL '72 hours' > NOW())
        )
    ) subquery;

    RETURN v_result;
END;
$$;

-- Get event details by ID
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
        'group_name', g.name,
        'participant_count', (
            SELECT COUNT(*) FROM event_room_participants
            WHERE event_room_id = er.id
        ),
        'participants', (
            SELECT json_agg(
                json_build_object(
                    'id', pr.id,
                    'display_name', pr.display_name,
                    'avatar_url', pr.avatar_url
                )
            )
            FROM event_room_participants erp2
            JOIN profiles pr ON pr.id = erp2.user_id
            WHERE erp2.event_room_id = er.id
        ),
        'last_message', NULL,
        'unread_count', 0,
        'is_expired', (
            (er.ends_at IS NOT NULL AND er.ends_at + INTERVAL '12 hours' <= NOW())
            OR (er.ends_at IS NULL AND er.created_at + INTERVAL '72 hours' <= NOW())
        )
    )
    INTO v_result
    FROM event_rooms er
    JOIN groups g ON g.id = er.group_id
    WHERE er.id = p_event_room_id;

    RETURN v_result;
END;
$$;

-- Get event messages with better structure
CREATE OR REPLACE FUNCTION get_event_room_messages_v2(
    p_event_room_id UUID,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSON;
    v_event_room event_rooms%ROWTYPE;
BEGIN
    -- Verify participation
    IF NOT EXISTS (
        SELECT 1 FROM event_room_participants
        WHERE event_room_id = p_event_room_id
        AND user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Not a participant in this event';
    END IF;

    -- Get event room details for the system message
    SELECT * INTO v_event_room
    FROM event_rooms WHERE id = p_event_room_id;

    SELECT json_build_object(
        'messages', COALESCE((
            SELECT json_agg(msg ORDER BY created_at ASC)
            FROM (
                -- System message (event details) as first message
                SELECT
                    v_event_room.id as id,
                    CONCAT(
                        'Event created! ',
                        CASE WHEN v_event_room.starts_at IS NOT NULL
                            THEN CONCAT(E'\n', '📅 ', to_char(v_event_room.starts_at, 'Dy, Mon DD at HH12:MI AM'))
                            ELSE ''
                        END,
                        CASE WHEN v_event_room.description IS NOT NULL AND v_event_room.description != ''
                            THEN CONCAT(E'\n', v_event_room.description)
                            ELSE ''
                        END
                    ) as content,
                    v_event_room.created_at as created_at,
                    json_build_object(
                        'id', '00000000-0000-0000-0000-000000000000',
                        'display_name', 'Grapple',
                        'avatar_url', NULL
                    ) as user,
                    true as is_system

                UNION ALL

                -- Actual messages
                SELECT
                    em.id,
                    em.content,
                    em.created_at,
                    json_build_object(
                        'id', pr.id,
                        'display_name', pr.display_name,
                        'avatar_url', pr.avatar_url
                    ) as user,
                    false as is_system
                FROM event_messages em
                JOIN profiles pr ON pr.id = em.user_id
                WHERE em.event_room_id = p_event_room_id
                ORDER BY created_at ASC
                LIMIT p_limit
                OFFSET p_offset
            ) msg
        ), '[]'::json),
        'is_expired', (
            (v_event_room.ends_at IS NOT NULL AND v_event_room.ends_at + INTERVAL '12 hours' <= NOW())
            OR (v_event_room.ends_at IS NULL AND v_event_room.created_at + INTERVAL '72 hours' <= NOW())
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_user_event_count TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_events_with_details TO authenticated;
GRANT EXECUTE ON FUNCTION get_event_details TO authenticated;
GRANT EXECUTE ON FUNCTION get_event_room_messages_v2 TO authenticated;
