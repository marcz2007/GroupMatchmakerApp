-- ============================================
-- SMART SCHEDULING AUTOMATION
-- 1. pg_cron job to process overdue events every 5 min
-- 2. Trigger to auto-run scheduling when all participants sync
-- ============================================

-- Enable extensions (no-op if already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Helper to get the Supabase URL for edge function calls
-- Uses the standard GUC settings available on Supabase hosted projects.
-- Falls back to the project URL if the setting doesn't exist.
CREATE OR REPLACE FUNCTION get_supabase_url()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN coalesce(
        current_setting('app.settings.supabase_url', true),
        'https://nqtycfrgzjiehatokmfn.supabase.co'
    );
END;
$$;

CREATE OR REPLACE FUNCTION get_service_role_key()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN current_setting('app.settings.service_role_key', true);
END;
$$;

-- ============================================
-- 1. Cron job: call run-smart-scheduling edge function every 5 minutes
-- Processes any smart events past their scheduling_deadline that are
-- still in 'collecting' status.
-- ============================================
SELECT cron.schedule(
    'run-smart-scheduling',
    '*/5 * * * *',
    $$
    SELECT net.http_post(
        url := get_supabase_url() || '/functions/v1/run-smart-scheduling',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || get_service_role_key()
        ),
        body := '{}'::jsonb
    );
    $$
);

-- ============================================
-- 2. Trigger: auto-schedule when all participants have synced
-- When a calendar sync is recorded, check if all participants
-- for this event have now synced. If so, run scheduling immediately
-- (no need to wait for the deadline/cron).
-- ============================================
CREATE OR REPLACE FUNCTION check_all_synced_and_schedule()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_participants INTEGER;
    v_total_synced INTEGER;
    v_scheduling_status TEXT;
    v_scheduling_mode TEXT;
BEGIN
    -- Get event scheduling info
    SELECT scheduling_mode, scheduling_status
    INTO v_scheduling_mode, v_scheduling_status
    FROM event_rooms
    WHERE id = NEW.event_room_id;

    -- Only proceed if smart and still collecting
    IF v_scheduling_mode != 'smart' OR v_scheduling_status != 'collecting' THEN
        RETURN NEW;
    END IF;

    -- Count participants and syncs
    SELECT COUNT(*) INTO v_total_participants
    FROM event_room_participants
    WHERE event_room_id = NEW.event_room_id;

    SELECT COUNT(*) INTO v_total_synced
    FROM scheduling_calendar_syncs
    WHERE event_room_id = NEW.event_room_id;

    -- If all participants have synced, trigger scheduling immediately
    IF v_total_synced >= v_total_participants AND v_total_participants > 0 THEN
        -- Call the edge function via pg_net (async, non-blocking)
        PERFORM net.http_post(
            url := get_supabase_url() || '/functions/v1/run-smart-scheduling',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || get_service_role_key()
            ),
            body := jsonb_build_object('eventRoomId', NEW.event_room_id)
        );
    END IF;

    RETURN NEW;
END;
$$;

-- Create the trigger on scheduling_calendar_syncs
DROP TRIGGER IF EXISTS trg_check_all_synced ON scheduling_calendar_syncs;
CREATE TRIGGER trg_check_all_synced
    AFTER INSERT OR UPDATE ON scheduling_calendar_syncs
    FOR EACH ROW
    EXECUTE FUNCTION check_all_synced_and_schedule();
