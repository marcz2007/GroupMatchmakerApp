-- Grapple Lite MVP Schema
-- Proposals, Voting, Event Rooms

-- ============================================
-- PROPOSALS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    vote_window_ends_at TIMESTAMPTZ NOT NULL,
    threshold INTEGER NOT NULL DEFAULT 3,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'triggered')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_proposals_group_id ON proposals(group_id);
CREATE INDEX idx_proposals_status ON proposals(status);
CREATE INDEX idx_proposals_vote_window ON proposals(vote_window_ends_at);

-- ============================================
-- VOTES TABLE (Anonymous to other members)
-- ============================================
CREATE TABLE IF NOT EXISTS votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    vote TEXT NOT NULL CHECK (vote IN ('YES', 'MAYBE', 'NO')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(proposal_id, user_id)
);

CREATE INDEX idx_votes_proposal_id ON votes(proposal_id);
CREATE INDEX idx_votes_user_id ON votes(user_id);

-- ============================================
-- EVENT ROOMS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS event_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE UNIQUE,
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_event_rooms_group_id ON event_rooms(group_id);
CREATE INDEX idx_event_rooms_proposal_id ON event_rooms(proposal_id);

-- ============================================
-- EVENT ROOM PARTICIPANTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS event_room_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_room_id UUID NOT NULL REFERENCES event_rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(event_room_id, user_id)
);

CREATE INDEX idx_event_room_participants_room_id ON event_room_participants(event_room_id);
CREATE INDEX idx_event_room_participants_user_id ON event_room_participants(user_id);

-- ============================================
-- EVENT MESSAGES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS event_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_room_id UUID NOT NULL REFERENCES event_rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_event_messages_room_id ON event_messages(event_room_id);
CREATE INDEX idx_event_messages_created_at ON event_messages(created_at);

-- ============================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_room_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_messages ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PROPOSALS RLS
-- ============================================

-- View proposals: Must be a member of the group
CREATE POLICY "Group members can view proposals"
ON proposals FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM group_members
        WHERE group_members.group_id = proposals.group_id
        AND group_members.user_id = auth.uid()
    )
);

-- Create proposals: Must be a member of the group
CREATE POLICY "Group members can create proposals"
ON proposals FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM group_members
        WHERE group_members.group_id = proposals.group_id
        AND group_members.user_id = auth.uid()
    )
    AND created_by = auth.uid()
);

-- Update proposals: Only creator can update (before vote window ends)
CREATE POLICY "Proposal creator can update"
ON proposals FOR UPDATE
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

-- Delete proposals: Only creator can delete
CREATE POLICY "Proposal creator can delete"
ON proposals FOR DELETE
USING (created_by = auth.uid());

-- ============================================
-- VOTES RLS (Anonymous - users only see their own votes)
-- ============================================

-- View votes: Users can only see their own votes
CREATE POLICY "Users can view their own votes"
ON votes FOR SELECT
USING (user_id = auth.uid());

-- Create votes: Must be group member and proposal must be open
CREATE POLICY "Group members can vote on open proposals"
ON votes FOR INSERT
WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
        SELECT 1 FROM proposals p
        JOIN group_members gm ON gm.group_id = p.group_id
        WHERE p.id = votes.proposal_id
        AND gm.user_id = auth.uid()
        AND p.status = 'open'
        AND p.vote_window_ends_at > NOW()
    )
);

-- Update votes: User can change their own vote while proposal is open
CREATE POLICY "Users can update their own votes"
ON votes FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
        SELECT 1 FROM proposals p
        WHERE p.id = votes.proposal_id
        AND p.status = 'open'
        AND p.vote_window_ends_at > NOW()
    )
);

-- Delete votes: User can remove their vote
CREATE POLICY "Users can delete their own votes"
ON votes FOR DELETE
USING (user_id = auth.uid());

-- ============================================
-- EVENT ROOMS RLS
-- ============================================

-- View event rooms: Must be a participant
CREATE POLICY "Participants can view event rooms"
ON event_rooms FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM event_room_participants
        WHERE event_room_participants.event_room_id = event_rooms.id
        AND event_room_participants.user_id = auth.uid()
    )
);

-- Event rooms are created by triggers/functions only (no direct insert)

-- ============================================
-- EVENT ROOM PARTICIPANTS RLS
-- ============================================

-- View participants: Must be a participant in the room
CREATE POLICY "Participants can view other participants"
ON event_room_participants FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM event_room_participants erp
        WHERE erp.event_room_id = event_room_participants.event_room_id
        AND erp.user_id = auth.uid()
    )
);

-- ============================================
-- EVENT MESSAGES RLS
-- ============================================

-- View messages: Must be a participant in the room
CREATE POLICY "Participants can view messages"
ON event_messages FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM event_room_participants
        WHERE event_room_participants.event_room_id = event_messages.event_room_id
        AND event_room_participants.user_id = auth.uid()
    )
);

-- Create messages: Must be a participant and room not expired
CREATE POLICY "Participants can send messages"
ON event_messages FOR INSERT
WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
        SELECT 1 FROM event_room_participants erp
        JOIN event_rooms er ON er.id = erp.event_room_id
        WHERE erp.event_room_id = event_messages.event_room_id
        AND erp.user_id = auth.uid()
        -- Room expiry: ends_at + 12h OR created_at + 72h
        AND (
            (er.ends_at IS NOT NULL AND er.ends_at + INTERVAL '12 hours' > NOW())
            OR (er.ends_at IS NULL AND er.created_at + INTERVAL '72 hours' > NOW())
        )
    )
);

-- ============================================
-- AGGREGATE VIEW FOR VOTE COUNTS (Anonymous)
-- ============================================
CREATE OR REPLACE VIEW proposal_vote_counts AS
SELECT
    proposal_id,
    COUNT(*) FILTER (WHERE vote = 'YES') AS yes_count,
    COUNT(*) FILTER (WHERE vote = 'MAYBE') AS maybe_count,
    COUNT(*) FILTER (WHERE vote = 'NO') AS no_count,
    COUNT(*) AS total_votes
FROM votes
GROUP BY proposal_id;

-- Grant access to authenticated users
GRANT SELECT ON proposal_vote_counts TO authenticated;

-- ============================================
-- RPC FUNCTION: Get proposal with vote counts
-- ============================================
CREATE OR REPLACE FUNCTION get_proposal_with_votes(p_proposal_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSON;
BEGIN
    -- Check if user is a member of the proposal's group
    IF NOT EXISTS (
        SELECT 1 FROM proposals p
        JOIN group_members gm ON gm.group_id = p.group_id
        WHERE p.id = p_proposal_id
        AND gm.user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Not a member of this group';
    END IF;

    SELECT json_build_object(
        'proposal', row_to_json(p),
        'vote_counts', json_build_object(
            'yes_count', COALESCE(vc.yes_count, 0),
            'maybe_count', COALESCE(vc.maybe_count, 0),
            'no_count', COALESCE(vc.no_count, 0),
            'total_votes', COALESCE(vc.total_votes, 0)
        ),
        'my_vote', (
            SELECT vote FROM votes
            WHERE proposal_id = p_proposal_id
            AND user_id = auth.uid()
        )
    )
    INTO result
    FROM proposals p
    LEFT JOIN proposal_vote_counts vc ON vc.proposal_id = p.id
    WHERE p.id = p_proposal_id;

    RETURN result;
END;
$$;

-- ============================================
-- RPC FUNCTION: Get proposals for a group
-- ============================================
CREATE OR REPLACE FUNCTION get_group_proposals(p_group_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSON;
BEGIN
    -- Check if user is a member of the group
    IF NOT EXISTS (
        SELECT 1 FROM group_members
        WHERE group_id = p_group_id
        AND user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Not a member of this group';
    END IF;

    SELECT json_agg(
        json_build_object(
            'proposal', row_to_json(p),
            'vote_counts', json_build_object(
                'yes_count', COALESCE(vc.yes_count, 0),
                'maybe_count', COALESCE(vc.maybe_count, 0),
                'no_count', COALESCE(vc.no_count, 0),
                'total_votes', COALESCE(vc.total_votes, 0)
            ),
            'my_vote', (
                SELECT vote FROM votes
                WHERE proposal_id = p.id
                AND user_id = auth.uid()
            ),
            'created_by_profile', (
                SELECT json_build_object('id', id, 'display_name', display_name, 'avatar_url', avatar_url)
                FROM profiles WHERE id = p.created_by
            )
        )
        ORDER BY p.created_at DESC
    )
    INTO result
    FROM proposals p
    LEFT JOIN proposal_vote_counts vc ON vc.proposal_id = p.id
    WHERE p.group_id = p_group_id;

    RETURN COALESCE(result, '[]'::json);
END;
$$;

-- ============================================
-- RPC FUNCTION: Cast or update vote
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
BEGIN
    -- Validate vote value
    IF p_vote NOT IN ('YES', 'MAYBE', 'NO') THEN
        RAISE EXCEPTION 'Invalid vote value';
    END IF;

    -- Get proposal and check membership
    SELECT p.group_id, p.threshold INTO v_group_id, v_threshold
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

    -- Check if threshold is met (YES votes >= threshold)
    SELECT
        COUNT(*) FILTER (WHERE vote = 'YES'),
        COUNT(*) FILTER (WHERE vote = 'MAYBE')
    INTO v_yes_count, v_maybe_count
    FROM votes
    WHERE proposal_id = p_proposal_id;

    -- If threshold met and no event room exists, create one
    IF v_yes_count >= v_threshold THEN
        -- Check if event room already exists
        SELECT id INTO v_event_room_id
        FROM event_rooms
        WHERE proposal_id = p_proposal_id;

        IF v_event_room_id IS NULL THEN
            -- Create event room
            INSERT INTO event_rooms (proposal_id, group_id, title, description, starts_at, ends_at)
            SELECT p_proposal_id, group_id, title, description, starts_at, ends_at
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
-- RPC FUNCTION: Get active event rooms for user
-- ============================================
CREATE OR REPLACE FUNCTION get_user_event_rooms()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_agg(
        json_build_object(
            'event_room', row_to_json(er),
            'proposal', row_to_json(p),
            'group', (
                SELECT json_build_object('id', id, 'name', name)
                FROM groups WHERE id = er.group_id
            ),
            'participant_count', (
                SELECT COUNT(*) FROM event_room_participants
                WHERE event_room_id = er.id
            ),
            'is_expired', (
                (er.ends_at IS NOT NULL AND er.ends_at + INTERVAL '12 hours' <= NOW())
                OR (er.ends_at IS NULL AND er.created_at + INTERVAL '72 hours' <= NOW())
            )
        )
        ORDER BY er.created_at DESC
    )
    INTO result
    FROM event_rooms er
    JOIN proposals p ON p.id = er.proposal_id
    JOIN event_room_participants erp ON erp.event_room_id = er.id
    WHERE erp.user_id = auth.uid();

    RETURN COALESCE(result, '[]'::json);
END;
$$;

-- ============================================
-- RPC FUNCTION: Get event room messages
-- ============================================
CREATE OR REPLACE FUNCTION get_event_room_messages(p_event_room_id UUID, p_limit INTEGER DEFAULT 50, p_offset INTEGER DEFAULT 0)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSON;
    v_is_expired BOOLEAN;
BEGIN
    -- Check if user is a participant
    IF NOT EXISTS (
        SELECT 1 FROM event_room_participants
        WHERE event_room_id = p_event_room_id
        AND user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Not a participant in this event room';
    END IF;

    -- Check if room is expired
    SELECT
        (er.ends_at IS NOT NULL AND er.ends_at + INTERVAL '12 hours' <= NOW())
        OR (er.ends_at IS NULL AND er.created_at + INTERVAL '72 hours' <= NOW())
    INTO v_is_expired
    FROM event_rooms er
    WHERE er.id = p_event_room_id;

    SELECT json_build_object(
        'messages', COALESCE((
            SELECT json_agg(
                json_build_object(
                    'id', em.id,
                    'content', em.content,
                    'created_at', em.created_at,
                    'user', json_build_object(
                        'id', pr.id,
                        'display_name', pr.display_name,
                        'avatar_url', pr.avatar_url
                    )
                )
                ORDER BY em.created_at ASC
            )
            FROM event_messages em
            JOIN profiles pr ON pr.id = em.user_id
            WHERE em.event_room_id = p_event_room_id
            ORDER BY em.created_at DESC
            LIMIT p_limit
            OFFSET p_offset
        ), '[]'::json),
        'is_expired', v_is_expired
    )
    INTO result;

    RETURN result;
END;
$$;

-- ============================================
-- TRIGGER: Update proposals.updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER proposals_updated_at
    BEFORE UPDATE ON proposals
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER votes_updated_at
    BEFORE UPDATE ON votes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();
