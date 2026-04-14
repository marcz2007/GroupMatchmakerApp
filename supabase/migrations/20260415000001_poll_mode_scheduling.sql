-- ============================================
-- POLL SCHEDULING MODE
-- Adds a third scheduling mode ('poll') that lets an event creator
-- offer multiple specific datetime options and participants vote on
-- each one. Finalization picks the option with the most YES votes
-- (either at the deadline or once min-votes threshold is met).
-- Reuses scheduling_candidate_times for the options themselves.
-- ============================================

-- 1. Widen scheduling_mode check constraint to include 'poll'
ALTER TABLE event_rooms DROP CONSTRAINT IF EXISTS event_rooms_scheduling_mode_check;
ALTER TABLE event_rooms ADD CONSTRAINT event_rooms_scheduling_mode_check
    CHECK (scheduling_mode IN ('fixed', 'smart', 'poll'));

-- 2. Minimum votes threshold: once reached, poll can finalize early
ALTER TABLE event_rooms ADD COLUMN IF NOT EXISTS poll_min_votes INTEGER;

-- 3. poll_votes: one row per (event, user, candidate). A user can
--    vote YES or NO on each option independently.
CREATE TABLE IF NOT EXISTS poll_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_room_id UUID NOT NULL REFERENCES event_rooms(id) ON DELETE CASCADE,
    candidate_time_id UUID NOT NULL REFERENCES scheduling_candidate_times(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    vote TEXT NOT NULL CHECK (vote IN ('YES', 'NO')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(candidate_time_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_poll_votes_event ON poll_votes(event_room_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_candidate ON poll_votes(candidate_time_id);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE poll_votes ENABLE ROW LEVEL SECURITY;

-- Participants (including guests) can view votes for events they're in
CREATE POLICY "Participants can view poll votes"
ON poll_votes FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM event_room_participants
        WHERE event_room_id = poll_votes.event_room_id
        AND user_id = auth.uid()
    )
);

-- Participants can cast their own votes
CREATE POLICY "Participants can insert their own poll votes"
ON poll_votes FOR INSERT
WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
        SELECT 1 FROM event_room_participants
        WHERE event_room_id = poll_votes.event_room_id
        AND user_id = auth.uid()
    )
);

-- Participants can change their mind
CREATE POLICY "Participants can update their own poll votes"
ON poll_votes FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Participants can delete their own poll votes"
ON poll_votes FOR DELETE
USING (user_id = auth.uid());

-- ============================================
-- RPC: create_poll_event
-- Creates an event_room in 'poll' mode with explicit datetime options.
-- p_options is a JSONB array: [{"starts_at": "...", "ends_at": "..."}, ...]
-- ============================================
CREATE OR REPLACE FUNCTION create_poll_event(
    p_title TEXT,
    p_description TEXT DEFAULT NULL,
    p_scheduling_deadline TIMESTAMPTZ DEFAULT NULL,
    p_min_votes INTEGER DEFAULT NULL,
    p_options JSONB DEFAULT '[]'::JSONB
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_event_room_id UUID;
    v_dummy_slot_id UUID;
    v_option JSONB;
    v_candidate_start TIMESTAMPTZ;
    v_candidate_end TIMESTAMPTZ;
    v_min_start TIMESTAMPTZ;
    v_max_end TIMESTAMPTZ;
    v_result JSON;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Must be signed in to create a poll event';
    END IF;

    IF jsonb_array_length(p_options) = 0 THEN
        RAISE EXCEPTION 'At least one datetime option is required';
    END IF;

    -- Default deadline to 7 days from now
    IF p_scheduling_deadline IS NULL THEN
        p_scheduling_deadline := NOW() + INTERVAL '7 days';
    END IF;

    -- Compute date range from options for display purposes
    SELECT MIN((o->>'starts_at')::TIMESTAMPTZ), MAX((o->>'ends_at')::TIMESTAMPTZ)
    INTO v_min_start, v_max_end
    FROM jsonb_array_elements(p_options) o;

    -- Create the event room
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
        poll_min_votes
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
        'poll',
        v_min_start::DATE,
        v_max_end::DATE,
        p_scheduling_deadline,
        'collecting',
        p_min_votes
    )
    RETURNING id INTO v_event_room_id;

    -- Add creator as participant
    INSERT INTO event_room_participants (event_room_id, user_id)
    VALUES (v_event_room_id, auth.uid());

    -- scheduling_candidate_times.slot_id is NOT NULL, so we insert a
    -- placeholder slot for bookkeeping. Poll mode doesn't use day-of-week
    -- templates, but the FK needs satisfying.
    INSERT INTO scheduling_slots (event_room_id, day_of_week, start_time, duration_minutes)
    VALUES (v_event_room_id, 0, '00:00:00', 0)
    RETURNING id INTO v_dummy_slot_id;

    -- Insert each option as a candidate_time
    FOR v_option IN SELECT * FROM jsonb_array_elements(p_options) LOOP
        v_candidate_start := (v_option->>'starts_at')::TIMESTAMPTZ;
        v_candidate_end := (v_option->>'ends_at')::TIMESTAMPTZ;

        IF v_candidate_start IS NULL OR v_candidate_end IS NULL THEN
            CONTINUE;
        END IF;

        IF v_candidate_end <= v_candidate_start THEN
            RAISE EXCEPTION 'Option end must be after start';
        END IF;

        INSERT INTO scheduling_candidate_times (
            event_room_id, slot_id, candidate_start, candidate_end
        )
        VALUES (v_event_room_id, v_dummy_slot_id, v_candidate_start, v_candidate_end);
    END LOOP;

    SELECT json_build_object(
        'event_room_id', v_event_room_id,
        'title', p_title,
        'scheduling_mode', 'poll',
        'scheduling_status', 'collecting',
        'scheduling_deadline', p_scheduling_deadline,
        'option_count', (
            SELECT COUNT(*) FROM scheduling_candidate_times
            WHERE event_room_id = v_event_room_id
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION create_poll_event TO authenticated;

-- ============================================
-- RPC: cast_poll_vote
-- Records / updates a single participant's YES/NO vote on one option.
-- ============================================
CREATE OR REPLACE FUNCTION cast_poll_vote(
    p_event_room_id UUID,
    p_candidate_time_id UUID,
    p_vote TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_scheduling_mode TEXT;
    v_scheduling_status TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Must be signed in to vote';
    END IF;

    IF p_vote NOT IN ('YES', 'NO') THEN
        RAISE EXCEPTION 'Vote must be YES or NO';
    END IF;

    -- Must be a participant
    IF NOT EXISTS (
        SELECT 1 FROM event_room_participants
        WHERE event_room_id = p_event_room_id
        AND user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Not a participant in this event';
    END IF;

    -- Must be a poll event still collecting votes
    SELECT scheduling_mode, scheduling_status
    INTO v_scheduling_mode, v_scheduling_status
    FROM event_rooms
    WHERE id = p_event_room_id;

    IF v_scheduling_mode != 'poll' THEN
        RAISE EXCEPTION 'This event does not use poll voting';
    END IF;

    IF v_scheduling_status != 'collecting' THEN
        RAISE EXCEPTION 'Voting is no longer open for this event';
    END IF;

    -- Candidate must belong to this event
    IF NOT EXISTS (
        SELECT 1 FROM scheduling_candidate_times
        WHERE id = p_candidate_time_id
        AND event_room_id = p_event_room_id
    ) THEN
        RAISE EXCEPTION 'Invalid option for this event';
    END IF;

    -- Upsert the vote
    INSERT INTO poll_votes (event_room_id, candidate_time_id, user_id, vote)
    VALUES (p_event_room_id, p_candidate_time_id, auth.uid(), p_vote)
    ON CONFLICT (candidate_time_id, user_id)
    DO UPDATE SET vote = EXCLUDED.vote, created_at = NOW();

    RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION cast_poll_vote TO authenticated;

-- ============================================
-- RPC: get_poll_status
-- Returns all options with vote counts + the caller's own votes.
-- Callable by any participant.
-- ============================================
CREATE OR REPLACE FUNCTION get_poll_status(p_event_room_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSON;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM event_room_participants
        WHERE event_room_id = p_event_room_id
        AND user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Not a participant in this event';
    END IF;

    SELECT json_build_object(
        'scheduling_mode', er.scheduling_mode,
        'scheduling_status', er.scheduling_status,
        'scheduling_deadline', er.scheduling_deadline,
        'poll_min_votes', er.poll_min_votes,
        'selected_slot_id', er.selected_slot_id,
        'total_participants', (
            SELECT COUNT(*) FROM event_room_participants
            WHERE event_room_id = p_event_room_id
        ),
        'options', COALESCE((
            SELECT json_agg(
                json_build_object(
                    'id', ct.id,
                    'starts_at', ct.candidate_start,
                    'ends_at', ct.candidate_end,
                    'is_selected', ct.is_selected,
                    'yes_count', (
                        SELECT COUNT(*) FROM poll_votes
                        WHERE candidate_time_id = ct.id AND vote = 'YES'
                    ),
                    'no_count', (
                        SELECT COUNT(*) FROM poll_votes
                        WHERE candidate_time_id = ct.id AND vote = 'NO'
                    ),
                    'my_vote', (
                        SELECT vote FROM poll_votes
                        WHERE candidate_time_id = ct.id
                        AND user_id = auth.uid()
                        LIMIT 1
                    )
                ) ORDER BY ct.candidate_start
            )
            FROM scheduling_candidate_times ct
            WHERE ct.event_room_id = p_event_room_id
        ), '[]'::json)
    )
    INTO v_result
    FROM event_rooms er
    WHERE er.id = p_event_room_id;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_poll_status TO authenticated;

-- ============================================
-- RPC: finalize_poll_event
-- Picks the option with the most YES votes (ties broken by earliest
-- start) and marks the event scheduled. Called either by the deadline
-- cron job or explicitly once min_votes is reached.
-- ============================================
CREATE OR REPLACE FUNCTION finalize_poll_event(p_event_room_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_scheduling_mode TEXT;
    v_scheduling_status TEXT;
    v_winner_id UUID;
    v_winner_start TIMESTAMPTZ;
    v_winner_end TIMESTAMPTZ;
    v_winner_yes INTEGER;
BEGIN
    SELECT scheduling_mode, scheduling_status
    INTO v_scheduling_mode, v_scheduling_status
    FROM event_rooms
    WHERE id = p_event_room_id;

    IF v_scheduling_mode != 'poll' THEN
        RAISE EXCEPTION 'This event does not use poll voting';
    END IF;

    IF v_scheduling_status != 'collecting' THEN
        -- Idempotent: already finalized
        RETURN json_build_object('already_finalized', true);
    END IF;

    -- Rank options by YES votes (desc), then earliest start (asc)
    UPDATE scheduling_candidate_times ct
    SET rank = sub.rnk
    FROM (
        SELECT
            ct2.id,
            ROW_NUMBER() OVER (
                ORDER BY
                    COALESCE((SELECT COUNT(*) FROM poll_votes
                        WHERE candidate_time_id = ct2.id AND vote = 'YES'), 0) DESC,
                    ct2.candidate_start ASC
            ) AS rnk
        FROM scheduling_candidate_times ct2
        WHERE ct2.event_room_id = p_event_room_id
    ) sub
    WHERE ct.id = sub.id;

    -- Pick the winner
    SELECT ct.id, ct.candidate_start, ct.candidate_end,
           COALESCE((SELECT COUNT(*) FROM poll_votes
               WHERE candidate_time_id = ct.id AND vote = 'YES'), 0)
    INTO v_winner_id, v_winner_start, v_winner_end, v_winner_yes
    FROM scheduling_candidate_times ct
    WHERE ct.event_room_id = p_event_room_id
    AND ct.rank = 1
    LIMIT 1;

    IF v_winner_id IS NULL THEN
        UPDATE event_rooms
        SET scheduling_status = 'failed'
        WHERE id = p_event_room_id;
        RETURN json_build_object('success', false, 'reason', 'no_options');
    END IF;

    -- Mark winner selected
    UPDATE scheduling_candidate_times
    SET is_selected = true
    WHERE id = v_winner_id;

    -- Update event_rooms with final time
    UPDATE event_rooms
    SET
        starts_at = v_winner_start,
        ends_at = v_winner_end,
        scheduling_status = 'scheduled',
        selected_slot_id = v_winner_id
    WHERE id = p_event_room_id;

    -- Post system message to event_messages
    INSERT INTO event_messages (event_room_id, user_id, content, is_system_message)
    VALUES (
        p_event_room_id,
        (SELECT created_by FROM event_rooms WHERE id = p_event_room_id),
        'Grapple picked ' || to_char(v_winner_start AT TIME ZONE 'UTC', 'Dy DD Mon HH24:MI')
            || ' UTC (' || v_winner_yes || ' yes)',
        true
    );

    RETURN json_build_object(
        'success', true,
        'selected_id', v_winner_id,
        'starts_at', v_winner_start,
        'yes_count', v_winner_yes
    );
END;
$$;

GRANT EXECUTE ON FUNCTION finalize_poll_event TO authenticated;

-- ============================================
-- Trigger: auto-finalize when min_votes reached on winning option
-- ============================================
CREATE OR REPLACE FUNCTION check_poll_min_votes_reached()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_min_votes INTEGER;
    v_status TEXT;
    v_top_yes INTEGER;
BEGIN
    SELECT er.poll_min_votes, er.scheduling_status
    INTO v_min_votes, v_status
    FROM event_rooms er
    WHERE er.id = NEW.event_room_id;

    IF v_min_votes IS NULL OR v_status != 'collecting' THEN
        RETURN NEW;
    END IF;

    SELECT MAX(yes_count) INTO v_top_yes
    FROM (
        SELECT COUNT(*) AS yes_count
        FROM poll_votes
        WHERE event_room_id = NEW.event_room_id AND vote = 'YES'
        GROUP BY candidate_time_id
    ) AS per_option;

    IF COALESCE(v_top_yes, 0) >= v_min_votes THEN
        PERFORM finalize_poll_event(NEW.event_room_id);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_poll_min_votes ON poll_votes;
CREATE TRIGGER trg_check_poll_min_votes
AFTER INSERT OR UPDATE ON poll_votes
FOR EACH ROW
EXECUTE FUNCTION check_poll_min_votes_reached();
