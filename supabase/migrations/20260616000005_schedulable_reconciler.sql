-- ============================================
-- FINALIZATION RELIABILITY: reconciler query
-- The check_all_synced_and_schedule trigger fires run-smart-scheduling via
-- fire-and-forget pg_net when min_synced_users (or all participants) sync. If
-- that HTTP call fails (e.g. service_role_key unset, transient error), the
-- 5-minute cron previously only rescued events PAST their deadline — so a
-- min-synced-reached event could wait until its deadline (days away).
--
-- find_ready_smart_events() returns every collecting smart event that SHOULD
-- be finalized now: deadline passed, OR min_synced reached, OR all participants
-- synced. The cron calls run-smart-scheduling, which now uses this — making the
-- cron a true reconciler that closes the trigger's fire-and-forget gap.
-- ============================================

CREATE OR REPLACE FUNCTION find_ready_smart_events()
RETURNS TABLE(event_room_id UUID)
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT er.id
    FROM event_rooms er
    WHERE er.scheduling_mode = 'smart'
      AND er.scheduling_status = 'collecting'
      AND (
        -- deadline reached
        er.scheduling_deadline <= NOW()
        -- min_synced_users threshold reached
        OR (
          er.min_synced_users IS NOT NULL
          AND (
            SELECT COUNT(*) FROM scheduling_calendar_syncs s
            WHERE s.event_room_id = er.id
          ) >= er.min_synced_users
        )
        -- every participant has synced
        OR (
          (SELECT COUNT(*) FROM event_room_participants p WHERE p.event_room_id = er.id) > 0
          AND (
            SELECT COUNT(*) FROM scheduling_calendar_syncs s WHERE s.event_room_id = er.id
          ) >= (
            SELECT COUNT(*) FROM event_room_participants p WHERE p.event_room_id = er.id
          )
        )
      );
$$;

GRANT EXECUTE ON FUNCTION find_ready_smart_events() TO service_role;
