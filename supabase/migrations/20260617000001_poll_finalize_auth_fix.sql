-- ============================================
-- FIX: a non-creator's deciding poll vote fails.
-- The min-votes trigger ran `finalize_poll_event()` in the VOTER's auth
-- context, and that function rejects callers who aren't the event creator —
-- so when a non-creator cast the YES vote that crossed min_votes, the
-- finalize raised "Only the event creator can finalize this poll" and the
-- whole vote transaction aborted. (Found by the integration test.)
--
-- Fix: extract the finalize LOGIC into finalize_poll_event_internal (no auth
-- check) for the trigger/cron to call, and keep the creator-only guard on the
-- public finalize_poll_event for direct user "finalize now" calls.
-- ============================================

-- Internal: the actual finalize, no caller check. For trigger/cron use.
CREATE OR REPLACE FUNCTION finalize_poll_event_internal(p_event_room_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_winning_id UUID;
    v_winning_start TIMESTAMPTZ;
    v_winning_end TIMESTAMPTZ;
    v_winning_yes INTEGER;
    v_creator UUID;
    v_rows INTEGER;
BEGIN
    SELECT created_by INTO v_creator
    FROM event_rooms WHERE id = p_event_room_id;

    IF v_creator IS NULL THEN
        RETURN json_build_object('success', false, 'reason', 'event_not_found');
    END IF;

    UPDATE event_rooms
    SET scheduling_status = 'scheduled'
    WHERE id = p_event_room_id
      AND scheduling_status = 'collecting';
    GET DIAGNOSTICS v_rows = ROW_COUNT;

    IF v_rows = 0 THEN
        RETURN json_build_object('already_finalized', true);
    END IF;

    WITH counts AS (
        SELECT ct.id, ct.candidate_start, ct.candidate_end,
               COUNT(pv.*) FILTER (WHERE pv.vote = 'YES') AS yes_count
        FROM scheduling_candidate_times ct
        LEFT JOIN poll_votes pv ON pv.candidate_time_id = ct.id
        WHERE ct.event_room_id = p_event_room_id
        GROUP BY ct.id, ct.candidate_start, ct.candidate_end
    )
    SELECT id, candidate_start, candidate_end, yes_count
    INTO v_winning_id, v_winning_start, v_winning_end, v_winning_yes
    FROM counts
    ORDER BY yes_count DESC, candidate_start ASC
    LIMIT 1;

    IF v_winning_id IS NULL THEN
        UPDATE event_rooms
        SET scheduling_status = 'collecting'
        WHERE id = p_event_room_id;
        RETURN json_build_object('success', false, 'reason', 'no_candidates');
    END IF;

    UPDATE scheduling_candidate_times
    SET is_selected = (id = v_winning_id)
    WHERE event_room_id = p_event_room_id;

    UPDATE event_rooms
    SET starts_at = v_winning_start,
        ends_at = v_winning_end
    WHERE id = p_event_room_id;

    INSERT INTO event_messages (event_room_id, user_id, content, is_system_message)
    VALUES (
        p_event_room_id,
        v_creator,
        '🗳️ Poll closed — winning slot picked (' ||
          v_winning_yes || ' yes vote' ||
          CASE WHEN v_winning_yes = 1 THEN '' ELSE 's' END || ').',
        TRUE
    );

    RETURN json_build_object(
        'success', true,
        'selected_id', v_winning_id,
        'starts_at', v_winning_start,
        'yes_count', v_winning_yes
    );
END;
$$;

-- Public: creator-only guard for direct user calls, then delegate.
CREATE OR REPLACE FUNCTION finalize_poll_event(p_event_room_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_creator UUID;
    v_caller UUID := auth.uid();
BEGIN
    SELECT created_by INTO v_creator
    FROM event_rooms WHERE id = p_event_room_id;

    IF v_creator IS NULL THEN
        RETURN json_build_object('success', false, 'reason', 'event_not_found');
    END IF;

    IF v_caller IS NOT NULL AND v_caller <> v_creator THEN
        RAISE EXCEPTION 'Only the event creator can finalize this poll';
    END IF;

    RETURN finalize_poll_event_internal(p_event_room_id);
END;
$$;

-- Trigger now auto-finalizes via the internal function (regardless of who
-- cast the deciding vote). Body otherwise unchanged from 20260415000004.
CREATE OR REPLACE FUNCTION check_poll_min_votes_reached()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_event_room_id UUID;
    v_min_votes INTEGER;
    v_scheduling_mode TEXT;
    v_scheduling_status TEXT;
    v_candidate_yes_count INTEGER;
BEGIN
    IF NEW.vote <> 'YES' THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.vote = NEW.vote THEN
        RETURN NEW;
    END IF;

    v_event_room_id := NEW.event_room_id;

    SELECT scheduling_mode, scheduling_status, poll_min_votes
    INTO v_scheduling_mode, v_scheduling_status, v_min_votes
    FROM event_rooms
    WHERE id = v_event_room_id;

    IF v_scheduling_mode <> 'poll'
       OR v_scheduling_status <> 'collecting'
       OR v_min_votes IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT COUNT(*) INTO v_candidate_yes_count
    FROM poll_votes
    WHERE candidate_time_id = NEW.candidate_time_id
      AND vote = 'YES';

    IF v_candidate_yes_count >= v_min_votes THEN
        PERFORM finalize_poll_event_internal(v_event_room_id);
    END IF;

    RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION finalize_poll_event(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION finalize_poll_event_internal(UUID) TO service_role;
