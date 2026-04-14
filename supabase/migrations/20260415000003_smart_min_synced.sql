-- ============================================
-- SMART SCHEDULING: MIN-SYNCED EARLY FINALIZATION
-- Adds an optional min_synced_users threshold to smart events. When
-- set, smart scheduling finalizes as soon as that many participants
-- have synced their calendars (instead of waiting for ALL or the
-- deadline cron).
-- ============================================

-- 1. New column
ALTER TABLE event_rooms ADD COLUMN IF NOT EXISTS min_synced_users INTEGER;

-- 2. Update the on-sync trigger to honour min_synced_users
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
    v_min_synced INTEGER;
    v_should_finalize BOOLEAN := false;
BEGIN
    SELECT scheduling_mode, scheduling_status, min_synced_users
    INTO v_scheduling_mode, v_scheduling_status, v_min_synced
    FROM event_rooms
    WHERE id = NEW.event_room_id;

    IF v_scheduling_mode != 'smart' OR v_scheduling_status != 'collecting' THEN
        RETURN NEW;
    END IF;

    SELECT COUNT(*) INTO v_total_participants
    FROM event_room_participants
    WHERE event_room_id = NEW.event_room_id;

    SELECT COUNT(*) INTO v_total_synced
    FROM scheduling_calendar_syncs
    WHERE event_room_id = NEW.event_room_id;

    -- Finalize when either:
    --   (a) everyone has synced, or
    --   (b) an explicit min_synced_users threshold has been reached
    IF v_total_participants > 0 AND v_total_synced >= v_total_participants THEN
        v_should_finalize := true;
    ELSIF v_min_synced IS NOT NULL AND v_total_synced >= v_min_synced THEN
        v_should_finalize := true;
    END IF;

    IF v_should_finalize THEN
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

-- 3. Extend create_smart_event to accept min_synced_users. We DROP
-- first because changing the parameter list of an existing function
-- with CREATE OR REPLACE is not allowed.
DROP FUNCTION IF EXISTS create_smart_event(
    TEXT, TEXT, DATE, DATE, TIMESTAMPTZ, JSONB
);

CREATE OR REPLACE FUNCTION create_smart_event(
    p_title TEXT,
    p_description TEXT DEFAULT NULL,
    p_date_range_start DATE DEFAULT NULL,
    p_date_range_end DATE DEFAULT NULL,
    p_scheduling_deadline TIMESTAMPTZ DEFAULT NULL,
    p_slots JSONB DEFAULT '[]'::JSONB,
    p_min_synced_users INTEGER DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_event_room_id UUID;
    v_slot JSONB;
    v_slot_id UUID;
    v_day_of_week INTEGER;
    v_start_time TIME;
    v_duration INTEGER;
    v_d DATE;
    v_candidate_start TIMESTAMPTZ;
    v_candidate_end TIMESTAMPTZ;
    v_result JSON;
BEGIN
    IF p_scheduling_deadline IS NULL THEN
        p_scheduling_deadline := NOW() + INTERVAL '7 days';
    END IF;

    INSERT INTO event_rooms (
        proposal_id,
        group_id,
        title,
        description,
        starts_at,
        ends_at,
        chat_expires_at,
        created_by,
        scheduling_mode,
        scheduling_date_range_start,
        scheduling_date_range_end,
        scheduling_deadline,
        scheduling_status,
        min_synced_users
    )
    VALUES (
        NULL,
        NULL,
        p_title,
        p_description,
        NULL,
        NULL,
        p_scheduling_deadline + INTERVAL '48 hours',
        auth.uid(),
        'smart',
        p_date_range_start,
        p_date_range_end,
        p_scheduling_deadline,
        'collecting',
        p_min_synced_users
    )
    RETURNING id INTO v_event_room_id;

    INSERT INTO event_room_participants (event_room_id, user_id)
    VALUES (v_event_room_id, auth.uid());

    FOR v_slot IN SELECT * FROM jsonb_array_elements(p_slots) LOOP
        v_day_of_week := (v_slot->>'day_of_week')::INTEGER;
        v_start_time := (v_slot->>'start_time')::TIME;
        v_duration := COALESCE((v_slot->>'duration_minutes')::INTEGER, 120);

        INSERT INTO scheduling_slots (event_room_id, day_of_week, start_time, duration_minutes)
        VALUES (v_event_room_id, v_day_of_week, v_start_time, v_duration)
        RETURNING id INTO v_slot_id;

        FOR v_d IN
            SELECT d::DATE
            FROM generate_series(p_date_range_start, p_date_range_end, '1 day'::INTERVAL) d
            WHERE EXTRACT(DOW FROM d) = v_day_of_week
        LOOP
            v_candidate_start := (v_d || ' ' || v_start_time)::TIMESTAMPTZ;
            v_candidate_end := v_candidate_start + (v_duration || ' minutes')::INTERVAL;

            IF v_candidate_start > NOW() THEN
                INSERT INTO scheduling_candidate_times (
                    event_room_id, slot_id, candidate_start, candidate_end
                )
                VALUES (v_event_room_id, v_slot_id, v_candidate_start, v_candidate_end);
            END IF;
        END LOOP;
    END LOOP;

    SELECT json_build_object(
        'event_room_id', v_event_room_id,
        'title', p_title,
        'scheduling_mode', 'smart',
        'scheduling_status', 'collecting',
        'scheduling_deadline', p_scheduling_deadline,
        'min_synced_users', p_min_synced_users,
        'candidate_count', (SELECT COUNT(*) FROM scheduling_candidate_times WHERE event_room_id = v_event_room_id)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION create_smart_event TO authenticated;
