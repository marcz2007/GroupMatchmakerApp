-- ============================================
-- POLL SCHEDULING PERFORMANCE FIXES
-- 1. Candidate-scoped early-finalize trigger (no full re-aggregation)
-- 2. Single-pass get_poll_status (replaces 3M correlated subqueries)
-- 3. Single-pass finalize_poll_event (CTE instead of nested counts)
-- 4. Partial index covering the hot-path yes-count scan
-- ============================================

-- 1. Replace the trigger so it only counts votes for the candidate
-- that actually changed, and short-circuits when min_votes is unset
-- or the vote didn't meaningfully change.
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
    -- Short-circuit: nothing to do if this is a NO vote and we're
    -- only interested in crossing a YES-count threshold, or if the
    -- vote didn't change.
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

    -- Only count votes for the candidate that was just voted on.
    SELECT COUNT(*) INTO v_candidate_yes_count
    FROM poll_votes
    WHERE candidate_time_id = NEW.candidate_time_id
      AND vote = 'YES';

    IF v_candidate_yes_count >= v_min_votes THEN
        PERFORM finalize_poll_event(v_event_room_id);
    END IF;

    RETURN NEW;
END;
$$;

-- 2. Rewrite get_poll_status to aggregate in a single GROUP BY.
CREATE OR REPLACE FUNCTION get_poll_status(p_event_room_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_scheduling_mode TEXT;
    v_scheduling_status TEXT;
    v_scheduling_deadline TIMESTAMPTZ;
    v_poll_min_votes INTEGER;
    v_selected_slot_id UUID;
    v_total_participants INTEGER;
    v_options JSON;
BEGIN
    SELECT scheduling_mode, scheduling_status, scheduling_deadline, poll_min_votes
    INTO v_scheduling_mode, v_scheduling_status, v_scheduling_deadline, v_poll_min_votes
    FROM event_rooms
    WHERE id = p_event_room_id;

    SELECT COUNT(*) INTO v_total_participants
    FROM event_room_participants
    WHERE event_room_id = p_event_room_id;

    SELECT id INTO v_selected_slot_id
    FROM scheduling_candidate_times
    WHERE event_room_id = p_event_room_id AND is_selected = TRUE
    LIMIT 1;

    WITH vote_counts AS (
        SELECT
            candidate_time_id,
            COUNT(*) FILTER (WHERE vote = 'YES') AS yes_count,
            COUNT(*) FILTER (WHERE vote = 'NO') AS no_count,
            MAX(vote) FILTER (WHERE user_id = v_user_id) AS my_vote
        FROM poll_votes
        WHERE event_room_id = p_event_room_id
        GROUP BY candidate_time_id
    )
    SELECT json_agg(
        json_build_object(
            'id', ct.id,
            'starts_at', ct.candidate_start,
            'ends_at', ct.candidate_end,
            'is_selected', ct.is_selected,
            'yes_count', COALESCE(vc.yes_count, 0),
            'no_count', COALESCE(vc.no_count, 0),
            'my_vote', vc.my_vote
        )
        ORDER BY ct.candidate_start
    ) INTO v_options
    FROM scheduling_candidate_times ct
    LEFT JOIN vote_counts vc ON vc.candidate_time_id = ct.id
    WHERE ct.event_room_id = p_event_room_id;

    RETURN json_build_object(
        'scheduling_mode', v_scheduling_mode,
        'scheduling_status', v_scheduling_status,
        'scheduling_deadline', v_scheduling_deadline,
        'poll_min_votes', v_poll_min_votes,
        'selected_slot_id', v_selected_slot_id,
        'total_participants', v_total_participants,
        'options', COALESCE(v_options, '[]'::JSON)
    );
END;
$$;

-- 3. Rewrite finalize_poll_event to use a single CTE. The winner is
-- the candidate with the most YES votes; ties broken by earliest
-- candidate_start.
CREATE OR REPLACE FUNCTION finalize_poll_event(p_event_room_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_status TEXT;
    v_winning_id UUID;
    v_winning_start TIMESTAMPTZ;
    v_winning_end TIMESTAMPTZ;
    v_winning_yes INTEGER;
    v_title TEXT;
    v_creator UUID;
BEGIN
    SELECT scheduling_status, title, created_by
    INTO v_status, v_title, v_creator
    FROM event_rooms
    WHERE id = p_event_room_id;

    IF v_status = 'scheduled' THEN
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
        RETURN json_build_object('success', false, 'reason', 'no_candidates');
    END IF;

    UPDATE scheduling_candidate_times
    SET is_selected = (id = v_winning_id)
    WHERE event_room_id = p_event_room_id;

    UPDATE event_rooms
    SET scheduling_status = 'scheduled',
        starts_at = v_winning_start,
        ends_at = v_winning_end
    WHERE id = p_event_room_id;

    -- Post a system message announcing the winner
    INSERT INTO event_messages (event_room_id, user_id, content, is_system_message)
    VALUES (
        p_event_room_id,
        v_creator,
        '🗳️ Poll closed — the winning time is ' ||
          to_char(v_winning_start AT TIME ZONE 'UTC', 'Dy, Mon DD HH24:MI UTC') ||
          ' (' || v_winning_yes || ' yes votes)',
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

GRANT EXECUTE ON FUNCTION get_poll_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION finalize_poll_event(UUID) TO authenticated;

-- 4. Partial index covering the hot-path yes-count scan.
CREATE INDEX IF NOT EXISTS idx_poll_votes_yes_by_event
    ON poll_votes (event_room_id, candidate_time_id)
    WHERE vote = 'YES';
