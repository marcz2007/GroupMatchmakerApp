-- ============================================
-- FIX: SHARE URL IN get_event_room_messages_v2
-- The Vercel deployment was renamed from
--   group-matchmaker-app.vercel.app  (deleted, returns DEPLOYMENT_NOT_FOUND)
-- to
--   group-matchmaker-app-web.vercel.app
-- Breaking every synthesized welcome message that embeds a share link.
--
-- This migration re-creates get_event_room_messages_v2 with the
-- corrected URL. Everything else in the function is unchanged from
-- 20240322000001_event_functions.sql.
-- ============================================

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
                -- Welcome system message
                SELECT
                    v_event_room.id as id,
                    CONCAT(
                        v_event_room.title, ' 🎉',
                        CASE WHEN v_event_room.starts_at IS NOT NULL
                            THEN CONCAT(E'\n', '📅 ', to_char(v_event_room.starts_at, 'Dy, Mon DD at HH12:MI AM'))
                            ELSE ''
                        END,
                        CASE WHEN v_event_room.description IS NOT NULL AND v_event_room.description != ''
                            THEN CONCAT(E'\n', v_event_room.description)
                            ELSE ''
                        END,
                        E'\n\n', 'This chat is temporary — it''ll close 48 hours after the event ends. No endless group chats here, just real plans with real people.',
                        E'\n\n', 'Share this event: https://group-matchmaker-app-web.vercel.app/event/', v_event_room.id,
                        E'\n', 'Tap the link above to copy it!'
                    ) as content,
                    v_event_room.created_at as created_at,
                    json_build_object(
                        'id', '00000000-0000-0000-0000-000000000000',
                        'display_name', 'Grapple',
                        'avatar_url', NULL
                    ) as "user",
                    true as is_system

                UNION ALL

                -- Extension vote system message (appears at midnight the day after the event)
                SELECT
                    ('00000000-0000-0000-0000-000000000001')::UUID as id,
                    '⏳ The event is over!' || E'\n\n' || 'Vote to keep this chat open. Only those who vote to stay will remain. Everyone else gets removed.' as content,
                    DATE_TRUNC('day', COALESCE(v_event_room.ends_at, v_event_room.starts_at)) + INTERVAL '1 day' as created_at,
                    json_build_object(
                        'id', '00000000-0000-0000-0000-000000000000',
                        'display_name', 'Grapple',
                        'avatar_url', NULL
                    ) as "user",
                    true as is_system
                WHERE COALESCE(v_event_room.ends_at, v_event_room.starts_at) IS NOT NULL
                    AND NOW() >= DATE_TRUNC('day', COALESCE(v_event_room.ends_at, v_event_room.starts_at)) + INTERVAL '1 day'
                    AND (v_event_room.chat_expires_at IS NULL OR v_event_room.chat_expires_at > NOW())

                UNION ALL

                -- Actual messages
                SELECT
                    em.id,
                    em.content,
                    em.created_at,
                    json_build_object(
                        'id', pr.id,
                        'display_name', COALESCE(pr.first_name, pr.username, 'Someone'),
                        'avatar_url', pr.avatar_url
                    ) as "user",
                    false as is_system
                FROM event_messages em
                JOIN profiles pr ON pr.id = em.user_id
                WHERE em.event_room_id = p_event_room_id
                ORDER BY created_at ASC
                LIMIT p_limit
                OFFSET p_offset
            ) msg
        ), '[]'::json),
        'is_expired', (v_event_room.chat_expires_at IS NOT NULL AND v_event_room.chat_expires_at <= NOW())
    ) INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_event_room_messages_v2 TO authenticated;
