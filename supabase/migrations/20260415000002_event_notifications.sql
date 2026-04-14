-- ============================================
-- EVENT NOTIFICATIONS
-- Adds event-context columns to the existing notifications table
-- and wires up DB triggers that fan out a notification to every
-- participant when an event_room transitions to 'scheduled' (whether
-- via smart scheduling or poll finalization).
-- ============================================

-- 1. Extend notifications with event context + delivery tracking
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS event_room_id UUID
    REFERENCES event_rooms(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_notifications_event_room ON notifications(event_room_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_pending_email ON notifications(email_sent_at) WHERE email_sent_at IS NULL;

-- 2. Helper: fan a notification out to every participant in an event
CREATE OR REPLACE FUNCTION notify_event_participants(
    p_event_room_id UUID,
    p_type TEXT,
    p_title TEXT,
    p_message TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO notifications (user_id, type, event_room_id, title, message)
    SELECT erp.user_id, p_type, p_event_room_id, p_title, p_message
    FROM event_room_participants erp
    WHERE erp.event_room_id = p_event_room_id;
END;
$$;

-- 3. Trigger: when scheduling_status flips to 'scheduled', notify
CREATE OR REPLACE FUNCTION handle_event_scheduled()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_when TEXT;
    v_mode_label TEXT;
BEGIN
    -- Only fire on the transition into 'scheduled'
    IF NEW.scheduling_status != 'scheduled' THEN
        RETURN NEW;
    END IF;

    IF OLD.scheduling_status = 'scheduled' THEN
        RETURN NEW;
    END IF;

    IF NEW.starts_at IS NULL THEN
        RETURN NEW;
    END IF;

    v_when := to_char(NEW.starts_at AT TIME ZONE 'UTC', 'Dy DD Mon HH24:MI') || ' UTC';

    v_mode_label := CASE NEW.scheduling_mode
        WHEN 'poll' THEN 'Poll results are in'
        WHEN 'smart' THEN 'Time confirmed'
        ELSE 'Event scheduled'
    END;

    PERFORM notify_event_participants(
        NEW.id,
        'event_scheduled',
        v_mode_label || ': ' || NEW.title,
        'Grapple picked ' || v_when || ' for "' || NEW.title || '".'
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_scheduled_notifications ON event_rooms;
CREATE TRIGGER trg_event_scheduled_notifications
AFTER UPDATE OF scheduling_status ON event_rooms
FOR EACH ROW
WHEN (NEW.scheduling_status = 'scheduled' AND OLD.scheduling_status IS DISTINCT FROM 'scheduled')
EXECUTE FUNCTION handle_event_scheduled();

-- 4. RPC: mark_notifications_read (bulk or single)
CREATE OR REPLACE FUNCTION mark_notifications_read(p_notification_ids UUID[] DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Must be signed in';
    END IF;

    IF p_notification_ids IS NULL THEN
        -- Mark all unread as read for this user
        UPDATE notifications
        SET read = true
        WHERE user_id = auth.uid() AND read = false;
        GET DIAGNOSTICS v_count = ROW_COUNT;
    ELSE
        UPDATE notifications
        SET read = true
        WHERE user_id = auth.uid() AND id = ANY(p_notification_ids);
        GET DIAGNOSTICS v_count = ROW_COUNT;
    END IF;

    RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION mark_notifications_read TO authenticated;

-- 5. RPC: get_unread_notification_count
CREATE OR REPLACE FUNCTION get_unread_notification_count()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN 0;
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM notifications
    WHERE user_id = auth.uid() AND read = false;

    RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION get_unread_notification_count TO authenticated;
