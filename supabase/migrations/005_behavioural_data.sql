-- ============================================
-- 005: Behavioural Data Layer (MVP)
-- ============================================
-- Adds event_segments, user_interactions, user_preference_vectors tables.
-- Updates cast_vote and create_proposal_rpc to record interactions.

-- ============================================
-- ENSURE: update_updated_at() trigger function exists
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TABLE: event_segments
-- AI-normalized classification of proposals
-- ============================================
CREATE TABLE IF NOT EXISTS event_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID NOT NULL UNIQUE REFERENCES proposals(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('social', 'arts', 'sport', 'food', 'travel', 'wellness')),
    subcategory TEXT,
    genre TEXT,
    facets JSONB DEFAULT '{}',
    model_version TEXT NOT NULL,
    confidence REAL DEFAULT 0.5,
    source TEXT DEFAULT 'ai' CHECK (source IN ('ai', 'user_override', 'manual')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_event_segments_proposal_id ON event_segments(proposal_id);
CREATE INDEX idx_event_segments_category_sub ON event_segments(category, subcategory);
CREATE INDEX idx_event_segments_facets ON event_segments USING GIN (facets);

CREATE TRIGGER event_segments_updated_at
    BEFORE UPDATE ON event_segments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- ============================================
-- TABLE: user_interactions
-- One row per user × proposal interaction lifecycle
-- ============================================
CREATE TABLE IF NOT EXISTS user_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    vote TEXT CHECK (vote IN ('YES', 'MAYBE', 'NO')),
    vote_speed_ms INTEGER,
    rsvp_status TEXT CHECK (rsvp_status IN ('going', 'not_going')),
    attended BOOLEAN,
    was_proposer BOOLEAN DEFAULT FALSE,
    voted_at TIMESTAMPTZ,
    rsvp_at TIMESTAMPTZ,
    attended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, proposal_id)
);

CREATE INDEX idx_user_interactions_user_created ON user_interactions(user_id, created_at DESC);
CREATE INDEX idx_user_interactions_proposal ON user_interactions(proposal_id);
CREATE INDEX idx_user_interactions_user_vote ON user_interactions(user_id, vote) WHERE vote IS NOT NULL;

CREATE TRIGGER user_interactions_updated_at
    BEFORE UPDATE ON user_interactions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- ============================================
-- TABLE: user_preference_vectors
-- Created now, populated by batch job later
-- ============================================
CREATE TABLE IF NOT EXISTS user_preference_vectors (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    category_scores JSONB DEFAULT '{}',
    subcategory_scores JSONB DEFAULT '{}',
    facet_scores JSONB DEFAULT '{}',
    time_patterns JSONB DEFAULT '{}',
    total_interactions INTEGER DEFAULT 0,
    vector_version INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER user_preference_vectors_updated_at
    BEFORE UPDATE ON user_preference_vectors
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE event_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preference_vectors ENABLE ROW LEVEL SECURITY;

-- event_segments: SELECT for group members of the proposal's group
CREATE POLICY "Group members can view event segments"
    ON event_segments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM proposals p
            JOIN group_members gm ON gm.group_id = p.group_id
            WHERE p.id = event_segments.proposal_id
            AND gm.user_id = auth.uid()
        )
    );

-- user_interactions: SELECT own rows only
CREATE POLICY "Users can view own interactions"
    ON user_interactions FOR SELECT
    USING (user_id = auth.uid());

-- user_preference_vectors: SELECT own row only
CREATE POLICY "Users can view own preference vector"
    ON user_preference_vectors FOR SELECT
    USING (user_id = auth.uid());

-- ============================================
-- UPDATED RPC: cast_vote
-- Adds user_interactions upsert after vote upsert
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

    -- Record interaction (behavioural data layer)
    INSERT INTO user_interactions (user_id, proposal_id, group_id, vote, voted_at, vote_speed_ms)
    VALUES (
        auth.uid(), p_proposal_id, v_group_id, p_vote, NOW(),
        (EXTRACT(EPOCH FROM (NOW() - (SELECT created_at FROM proposals WHERE id = p_proposal_id))) * 1000)::INTEGER
    )
    ON CONFLICT (user_id, proposal_id)
    DO UPDATE SET vote = p_vote, voted_at = NOW(), vote_speed_ms = EXCLUDED.vote_speed_ms, updated_at = NOW();

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
            INSERT INTO event_rooms (proposal_id, group_id, title, description, starts_at, ends_at, chat_expires_at)
            SELECT p_proposal_id, group_id, title, description, starts_at, ends_at,
                   COALESCE(ends_at + INTERVAL '48 hours', NOW() + INTERVAL '72 hours')
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
-- UPDATED RPC: create_proposal_rpc
-- Adds user_interactions insert for proposer after auto-vote
-- ============================================
DROP FUNCTION IF EXISTS create_proposal_rpc(UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER);

CREATE OR REPLACE FUNCTION create_proposal_rpc(
    p_group_id UUID,
    p_title TEXT,
    p_description TEXT DEFAULT NULL,
    p_starts_at TIMESTAMPTZ DEFAULT NULL,
    p_ends_at TIMESTAMPTZ DEFAULT NULL,
    p_vote_window_ends_at TIMESTAMPTZ DEFAULT NULL,
    p_threshold INTEGER DEFAULT 3,
    p_is_anonymous BOOLEAN DEFAULT TRUE,
    p_estimated_cost TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_proposal proposals%ROWTYPE;
    v_vote_window TIMESTAMPTZ;
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
        estimated_cost
    )
    VALUES (
        p_group_id,
        v_user_id,
        p_title,
        p_description,
        p_starts_at,
        p_ends_at,
        v_vote_window,
        COALESCE(p_threshold, 3),
        COALESCE(p_is_anonymous, TRUE),
        p_estimated_cost
    )
    RETURNING * INTO v_proposal;

    -- Auto-vote YES for the proposal creator
    INSERT INTO votes (proposal_id, user_id, vote)
    VALUES (v_proposal.id, v_user_id, 'YES');

    -- Record interaction for proposer (behavioural data layer)
    INSERT INTO user_interactions (user_id, proposal_id, group_id, was_proposer, vote, voted_at, vote_speed_ms)
    VALUES (v_user_id, v_proposal.id, p_group_id, TRUE, 'YES', NOW(), 0)
    ON CONFLICT (user_id, proposal_id) DO NOTHING;

    RETURN row_to_json(v_proposal);
END;
$$;

GRANT EXECUTE ON FUNCTION create_proposal_rpc TO authenticated;
GRANT EXECUTE ON FUNCTION cast_vote TO authenticated;
