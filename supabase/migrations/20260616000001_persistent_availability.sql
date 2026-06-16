-- ============================================
-- PERSISTENT AVAILABILITY STORE
-- Make calendar availability a durable, auto-maintained per-user store so
-- users sync once and never need to re-sync:
--   1. Track per-user refresh state on profiles.
--   2. Auto-enroll already-connected participants into smart events (no
--      re-consent / extra tap) so a returning synced user's availability
--      counts automatically.
--   3. Cron to keep every connected user's busy-times fresh over a rolling
--      horizon via the refresh-all-calendars edge function.
--
-- Requires the refresh-all-calendars edge function to be deployed, and
-- app.settings.service_role_key to be set (same as the existing automation).
-- ============================================

-- 1. Per-user refresh tracking
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS calendar_last_refreshed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS calendar_synced_through TIMESTAMPTZ;

-- 2. Auto-enroll connected participants into smart events.
-- When someone joins a smart event that is still collecting, if they already
-- have a connected calendar we record a sync for them immediately — so a
-- returning user who synced once is counted automatically, with no extra tap.
-- This reuses scheduling_calendar_syncs, so the existing min-synced /
-- all-synced finalization triggers fire as normal.
CREATE OR REPLACE FUNCTION auto_enroll_connected_participant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_scheduling_mode TEXT;
    v_scheduling_status TEXT;
    v_provider TEXT;
    v_connected BOOLEAN;
BEGIN
    SELECT scheduling_mode, scheduling_status
    INTO v_scheduling_mode, v_scheduling_status
    FROM event_rooms
    WHERE id = NEW.event_room_id;

    -- Only for smart events still collecting availability.
    IF v_scheduling_mode IS DISTINCT FROM 'smart'
       OR v_scheduling_status IS DISTINCT FROM 'collecting' THEN
        RETURN NEW;
    END IF;

    SELECT calendar_connected, calendar_provider
    INTO v_connected, v_provider
    FROM profiles
    WHERE id = NEW.user_id;

    IF v_connected IS TRUE THEN
        INSERT INTO scheduling_calendar_syncs (event_room_id, user_id, calendar_provider)
        VALUES (NEW.event_room_id, NEW.user_id, COALESCE(v_provider, 'google'))
        ON CONFLICT (event_room_id, user_id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_enroll_connected ON event_room_participants;
CREATE TRIGGER trg_auto_enroll_connected
    AFTER INSERT ON event_room_participants
    FOR EACH ROW
    EXECUTE FUNCTION auto_enroll_connected_participant();

-- 3. Cron: keep every connected user's availability fresh.
-- Daily at 03:00 UTC. More frequent = fresher but more Google API usage;
-- adjust to taste. Idempotent: drops any prior schedule of the same name.
DO $$
BEGIN
    PERFORM cron.unschedule('refresh-all-calendars');
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

SELECT cron.schedule(
    'refresh-all-calendars',
    '0 3 * * *',
    $$
    SELECT net.http_post(
        url := get_supabase_url() || '/functions/v1/refresh-all-calendars',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || get_service_role_key()
        ),
        body := '{}'::jsonb
    );
    $$
);
