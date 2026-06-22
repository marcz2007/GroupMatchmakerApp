-- Daily cleanup of stale unverified accounts (created > 30 days ago, never
-- verified, not an active event participant). The edge function does the
-- deletion via the auth admin API; this just schedules it. Mirrors the
-- refresh-all-calendars cron. Idempotent: drops any prior schedule of the name.
DO $$
BEGIN
    PERFORM cron.unschedule('cleanup-unverified-accounts');
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

SELECT cron.schedule(
    'cleanup-unverified-accounts',
    '0 2 * * *',
    $$
    SELECT net.http_post(
        url := get_supabase_url() || '/functions/v1/cleanup-unverified-accounts',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || get_service_role_key()
        ),
        body := '{}'::jsonb
    );
    $$
);
