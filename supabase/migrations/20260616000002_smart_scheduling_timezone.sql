-- ============================================
-- SMART SCHEDULING: timezone-correct candidate times
--
-- Slots capture a wall-clock time (e.g. "Tue 18:00") in the CREATOR's local
-- timezone. Previously create_smart_event built each candidate with
--   (date || ' ' || time)::TIMESTAMPTZ
-- which the Postgres session interprets in UTC — so a slot the user meant as
-- 6pm local was stored as 6pm UTC. For any non-UTC user this scheduled the
-- event (and ran the free/busy check) at the wrong absolute time — e.g. a UK
-- user in BST got events an hour late; US users hours off.
--
-- Fix: store the creator's IANA timezone on the event and convert each
-- candidate with `(...)::TIMESTAMP AT TIME ZONE <tz>`, which interprets the
-- wall-clock time in that zone (DST-aware) and yields the correct instant.
-- ============================================

ALTER TABLE event_rooms
  ADD COLUMN IF NOT EXISTS scheduling_timezone TEXT;

-- Drop prior overloads (6-arg original, 7-arg min-synced) so we end up with a
-- single definitive function rather than ambiguous overloads.
DROP FUNCTION IF EXISTS create_smart_event(TEXT, TEXT, DATE, DATE, TIMESTAMPTZ, JSONB);
DROP FUNCTION IF EXISTS create_smart_event(TEXT, TEXT, DATE, DATE, TIMESTAMPTZ, JSONB, INTEGER);

CREATE OR REPLACE FUNCTION create_smart_event(
    p_title TEXT,
    p_description TEXT DEFAULT NULL,
    p_date_range_start DATE DEFAULT NULL,
    p_date_range_end DATE DEFAULT NULL,
    p_scheduling_deadline TIMESTAMPTZ DEFAULT NULL,
    p_slots JSONB DEFAULT '[]'::JSONB,
    p_min_synced_users INTEGER DEFAULT NULL,
    p_timezone TEXT DEFAULT 'UTC'
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
    v_tz TEXT := COALESCE(NULLIF(trim(p_timezone), ''), 'UTC');
    v_result JSON;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Must be signed in to create a smart event';
    END IF;

    IF p_title IS NULL OR length(trim(p_title)) = 0 THEN
        RAISE EXCEPTION 'Title is required';
    END IF;
    IF length(p_title) > 200 THEN
        RAISE EXCEPTION 'Title too long';
    END IF;

    IF p_date_range_start IS NULL OR p_date_range_end IS NULL THEN
        RAISE EXCEPTION 'Date range is required';
    END IF;
    IF p_date_range_end < p_date_range_start THEN
        RAISE EXCEPTION 'Date range end must be >= start';
    END IF;
    IF (p_date_range_end - p_date_range_start) > 90 THEN
        RAISE EXCEPTION 'Date range too wide (max 90 days)';
    END IF;

    IF p_min_synced_users IS NOT NULL AND p_min_synced_users < 1 THEN
        RAISE EXCEPTION 'min_synced_users must be >= 1';
    END IF;

    IF p_scheduling_deadline IS NULL THEN
        p_scheduling_deadline := NOW() + INTERVAL '7 days';
    END IF;
    IF p_scheduling_deadline < NOW() THEN
        RAISE EXCEPTION 'Deadline must be in the future';
    END IF;

    -- Validate the timezone name; fall back to UTC if Postgres doesn't know it.
    BEGIN
        PERFORM now() AT TIME ZONE v_tz;
    EXCEPTION WHEN OTHERS THEN
        v_tz := 'UTC';
    END;

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
        min_synced_users,
        scheduling_timezone
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
        p_min_synced_users,
        v_tz
    )
    RETURNING id INTO v_event_room_id;

    INSERT INTO event_room_participants (event_room_id, user_id)
    VALUES (v_event_room_id, auth.uid());

    FOR v_slot IN SELECT * FROM jsonb_array_elements(p_slots) LOOP
        v_day_of_week := (v_slot->>'day_of_week')::INTEGER;
        v_start_time := (v_slot->>'start_time')::TIME;
        v_duration := COALESCE((v_slot->>'duration_minutes')::INTEGER, 120);

        IF v_day_of_week IS NULL OR v_day_of_week < 0 OR v_day_of_week > 6 THEN
            RAISE EXCEPTION 'Invalid day_of_week (must be 0-6)';
        END IF;
        IF v_duration < 15 OR v_duration > 24 * 60 THEN
            RAISE EXCEPTION 'Invalid slot duration (must be 15-1440 minutes)';
        END IF;

        INSERT INTO scheduling_slots (event_room_id, day_of_week, start_time, duration_minutes)
        VALUES (v_event_room_id, v_day_of_week, v_start_time, v_duration)
        RETURNING id INTO v_slot_id;

        FOR v_d IN
            SELECT d::DATE
            FROM generate_series(p_date_range_start, p_date_range_end, '1 day'::INTERVAL) d
            WHERE EXTRACT(DOW FROM d) = v_day_of_week
        LOOP
            -- Interpret the wall-clock slot time in the creator's timezone
            -- (DST-aware) to get the correct absolute instant. `::TIMESTAMP`
            -- binds tighter than `AT TIME ZONE`, so this casts to a naive
            -- timestamp first, then reads it as local time in v_tz.
            v_candidate_start := (v_d || ' ' || v_start_time)::TIMESTAMP AT TIME ZONE v_tz;
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
