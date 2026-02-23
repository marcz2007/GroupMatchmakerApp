-- ============================================
-- 009: Shared Event Rooms
-- Links all proposals from a single launch to one shared event room.
-- Rewrites cast_vote for cross-proposal threshold logic.
-- Adds get_public_event_details RPC for RSVP landing page.
-- ============================================

-- 1. Add event_room_id to proposals table
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS event_room_id UUID REFERENCES event_rooms(id) ON DELETE SET NULL;

-- ============================================
-- 2. Update create_proposal_rpc — add p_event_room_id parameter
-- ============================================
DROP FUNCTION IF EXISTS create_proposal_rpc(UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, BOOLEAN, TEXT);

CREATE OR REPLACE FUNCTION create_proposal_rpc(
    p_group_id UUID,
    p_title TEXT,
    p_description TEXT DEFAULT NULL,
    p_starts_at TIMESTAMPTZ DEFAULT NULL,
    p_ends_at TIMESTAMPTZ DEFAULT NULL,
    p_vote_window_ends_at TIMESTAMPTZ DEFAULT NULL,
    p_threshold INTEGER DEFAULT NULL,
    p_is_anonymous BOOLEAN DEFAULT TRUE,
    p_estimated_cost TEXT DEFAULT NULL,
    p_event_room_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_proposal proposals%ROWTYPE;
    v_vote_window TIMESTAMPTZ;
    v_member_count INTEGER;
    v_computed_threshold INTEGER;
BEGIN
    -- Get the current user
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Check if user is a member of the group
    IF NOT EXISTS (
        SELECT 1 FROM group_members
        WHERE group_id = p_group_id
        AND user_id = v_user_id
    ) THEN
        RAISE EXCEPTION 'You are not a member of this group';
    END IF;

    -- Calculate default threshold: 33% of group members, minimum 2
    IF p_threshold IS NOT NULL THEN
        v_computed_threshold := GREATEST(p_threshold, 1);
    ELSE
        SELECT COUNT(*)::INTEGER INTO v_member_count
        FROM group_members
        WHERE group_id = p_group_id;

        v_computed_threshold := GREATEST(CEIL(v_member_count * 0.33)::INTEGER, 2);
    END IF;

    -- Set default vote window if not provided (24 hours from now)
    v_vote_window := COALESCE(p_vote_window_ends_at, NOW() + INTERVAL '24 hours');

    -- Create the proposal
    INSERT INTO proposals (
        group_id,
        created_by,
        title,
        description,
        starts_at,
        ends_at,
        vote_window_ends_at,
        threshold,
        is_anonymous,
        estimated_cost,
        event_room_id
    )
    VALUES (
        p_group_id,
        v_user_id,
        p_title,
        p_description,
        p_starts_at,
        p_ends_at,
        v_vote_window,
        v_computed_threshold,
        COALESCE(p_is_anonymous, TRUE),
        p_estimated_cost,
        p_event_room_id
    )
    RETURNING * INTO v_proposal;

    -- Auto-vote YES for the proposal creator
    INSERT INTO votes (proposal_id, user_id, vote)
    VALUES (v_proposal.id, v_user_id, 'YES');

    RETURN row_to_json(v_proposal);
END;
$$;

-- ============================================
-- 3. Rewrite cast_vote for cross-proposal threshold
-- ============================================
CREATE OR REPLACE FUNCTION cast_vote(p_proposal_id UUID, p_vote TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_group_id UUID;
    v_yes_count INTEGER;
    v_maybe_count INTEGER;
    v_threshold INTEGER;
    v_event_room_id UUID;
    v_proposal_event_room_id UUID;
    v_shared_yes_count INTEGER;
    v_shared_threshold INTEGER;
    v_proposal_status TEXT;
BEGIN
    -- Validate vote value
    IF p_vote NOT IN ('YES', 'MAYBE', 'NO') THEN
        RAISE EXCEPTION 'Invalid vote value';
    END IF;

    -- Get proposal details and check membership
    SELECT p.group_id, p.threshold, p.event_room_id, p.status
    INTO v_group_id, v_threshold, v_proposal_event_room_id, v_proposal_status
    FROM proposals p
    JOIN group_members gm ON gm.group_id = p.group_id
    WHERE p.id = p_proposal_id
    AND gm.user_id = auth.uid()
    AND p.status = 'open'
    AND p.vote_window_ends_at > NOW();

    IF v_group_id IS NULL THEN
        RAISE EXCEPTION 'Cannot vote: proposal not found, not a member, or voting closed';
    END IF;

    -- Upsert vote
    INSERT INTO votes (proposal_id, user_id, vote)
    VALUES (p_proposal_id, auth.uid(), p_vote)
    ON CONFLICT (proposal_id, user_id)
    DO UPDATE SET vote = p_vote, updated_at = NOW();

    -- Record interaction (behavioural data layer)
    INSERT INTO user_interactions (user_id, proposal_id, group_id, vote, voted_at, vote_speed_ms)
    VALUES (
        auth.uid(), p_proposal_id, v_group_id, p_vote, NOW(),
        (EXTRACT(EPOCH FROM (NOW() - (SELECT created_at FROM proposals WHERE id = p_proposal_id))) * 1000)::INTEGER
    )
    ON CONFLICT (user_id, proposal_id)
    DO UPDATE SET vote = p_vote, voted_at = NOW(), vote_speed_ms = EXCLUDED.vote_speed_ms, updated_at = NOW();

    -- ============================================
    -- SHARED EVENT ROOM FLOW (event_room_id IS NOT NULL)
    -- ============================================
    IF v_proposal_event_room_id IS NOT NULL THEN
        v_event_room_id := v_proposal_event_room_id;

        -- Count distinct YES votes across ALL sibling proposals sharing the same event_room_id
        SELECT COUNT(DISTINCT v.user_id)
        INTO v_shared_yes_count
        FROM votes v
        JOIN proposals p ON p.id = v.proposal_id
        WHERE p.event_room_id = v_proposal_event_room_id
        AND v.vote = 'YES';

        -- Use MIN threshold across sibling proposals as the shared threshold
        SELECT MIN(p.threshold)
        INTO v_shared_threshold
        FROM proposals p
        WHERE p.event_room_id = v_proposal_event_room_id;

        -- Also get this proposal's YES/MAYBE counts for the response
        SELECT
            COUNT(*) FILTER (WHERE vote = 'YES'),
            COUNT(*) FILTER (WHERE vote = 'MAYBE')
        INTO v_yes_count, v_maybe_count
        FROM votes
        WHERE proposal_id = p_proposal_id;

        -- Check if any sibling proposal is already triggered
        IF EXISTS (
            SELECT 1 FROM proposals
            WHERE event_room_id = v_proposal_event_room_id
            AND status = 'triggered'
        ) THEN
            -- Threshold already met previously — just add this voter if YES/MAYBE
            IF p_vote IN ('YES', 'MAYBE') THEN
                INSERT INTO event_room_participants (event_room_id, user_id)
                VALUES (v_event_room_id, auth.uid())
                ON CONFLICT (event_room_id, user_id) DO NOTHING;
            END IF;
        ELSIF v_shared_yes_count >= v_shared_threshold THEN
            -- Threshold just met! Add ALL YES/MAYBE voters from ALL sibling proposals
            INSERT INTO event_room_participants (event_room_id, user_id)
            SELECT v_event_room_id, v.user_id
            FROM votes v
            JOIN proposals p ON p.id = v.proposal_id
            WHERE p.event_room_id = v_proposal_event_room_id
            AND v.vote IN ('YES', 'MAYBE')
            ON CONFLICT (event_room_id, user_id) DO NOTHING;

            -- Update ALL sibling proposals to triggered
            UPDATE proposals
            SET status = 'triggered', updated_at = NOW()
            WHERE event_room_id = v_proposal_event_room_id
            AND status = 'open';
        END IF;

        RETURN json_build_object(
            'success', true,
            'vote', p_vote,
            'yes_count', v_yes_count,
            'maybe_count', v_maybe_count,
            'threshold_met', v_shared_yes_count >= v_shared_threshold,
            'event_room_id', v_event_room_id
        );
    END IF;

    -- ============================================
    -- OLD FLOW (event_room_id IS NULL) — per-proposal behavior
    -- ============================================
    SELECT
        COUNT(*) FILTER (WHERE vote = 'YES'),
        COUNT(*) FILTER (WHERE vote = 'MAYBE')
    INTO v_yes_count, v_maybe_count
    FROM votes
    WHERE proposal_id = p_proposal_id;

    IF v_yes_count >= v_threshold THEN
        -- Check if event room already exists
        SELECT id INTO v_event_room_id
        FROM event_rooms
        WHERE proposal_id = p_proposal_id;

        IF v_event_room_id IS NULL THEN
            -- Create event room
            INSERT INTO event_rooms (proposal_id, group_id, title, description, starts_at, ends_at, chat_expires_at)
            SELECT p_proposal_id, group_id, title, description, starts_at, ends_at,
                   COALESCE(ends_at + INTERVAL '48 hours', starts_at + INTERVAL '48 hours', NOW() + INTERVAL '72 hours')
            FROM proposals
            WHERE id = p_proposal_id
            RETURNING id INTO v_event_room_id;

            -- Add YES and MAYBE voters as participants
            INSERT INTO event_room_participants (event_room_id, user_id)
            SELECT v_event_room_id, user_id
            FROM votes
            WHERE proposal_id = p_proposal_id
            AND vote IN ('YES', 'MAYBE');

            -- Update proposal status
            UPDATE proposals SET status = 'triggered', updated_at = NOW()
            WHERE id = p_proposal_id;
        ELSE
            -- Event room exists, just add this user if they voted YES/MAYBE
            IF p_vote IN ('YES', 'MAYBE') THEN
                INSERT INTO event_room_participants (event_room_id, user_id)
                VALUES (v_event_room_id, auth.uid())
                ON CONFLICT (event_room_id, user_id) DO NOTHING;
            END IF;
        END IF;
    END IF;

    RETURN json_build_object(
        'success', true,
        'vote', p_vote,
        'yes_count', v_yes_count,
        'maybe_count', v_maybe_count,
        'threshold_met', v_yes_count >= v_threshold,
        'event_room_id', v_event_room_id
    );
END;
$$;

-- ============================================
-- 4. New RPC: get_public_event_details
-- Powers the mobile RSVP screen — authenticated users can see event info
-- even if they are not yet participants.
-- ============================================
CREATE OR REPLACE FUNCTION get_public_event_details(p_event_room_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSON;
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT json_build_object(
        'event_room', json_build_object(
            'id', er.id,
            'proposal_id', er.proposal_id,
            'group_id', er.group_id,
            'title', er.title,
            'description', er.description,
            'starts_at', er.starts_at,
            'ends_at', er.ends_at,
            'created_at', er.created_at
        ),
        'group_name', COALESCE(g.name, 'Direct Event'),
        'participant_count', (
            SELECT COUNT(*) FROM event_room_participants
            WHERE event_room_id = er.id
        ),
        'participants', (
            SELECT COALESCE(json_agg(
                json_build_object(
                    'id', pr.id,
                    'display_name', COALESCE(pr.first_name, pr.username, 'Someone'),
                    'avatar_url', pr.avatar_url
                )
            ), '[]'::json)
            FROM event_room_participants erp2
            JOIN profiles pr ON pr.id = erp2.user_id
            WHERE erp2.event_room_id = er.id
        ),
        'creator_name', (
            SELECT COALESCE(cp.first_name, cp.username, 'Someone')
            FROM profiles cp
            WHERE cp.id = er.created_by
        ),
        'is_participant', EXISTS (
            SELECT 1 FROM event_room_participants
            WHERE event_room_id = er.id
            AND user_id = v_user_id
        ),
        'is_expired', (er.chat_expires_at IS NOT NULL AND er.chat_expires_at <= NOW())
    )
    INTO v_result
    FROM event_rooms er
    LEFT JOIN groups g ON g.id = er.group_id
    WHERE er.id = p_event_room_id;

    IF v_result IS NULL THEN
        RAISE EXCEPTION 'Event not found';
    END IF;

    RETURN v_result;
END;
$$;

-- ============================================
-- 5. Grant permissions
-- ============================================
GRANT EXECUTE ON FUNCTION create_proposal_rpc TO authenticated;
GRANT EXECUTE ON FUNCTION cast_vote TO authenticated;
GRANT EXECUTE ON FUNCTION get_public_event_details TO authenticated;
