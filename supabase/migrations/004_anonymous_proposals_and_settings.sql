-- ============================================
-- 004: Anonymous Proposals & Estimated Cost
-- ============================================

-- ============================================
-- SCHEMA CHANGES
-- ============================================

-- Add is_anonymous column (existing rows stay visible, new ones anonymous by default)
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE proposals ALTER COLUMN is_anonymous SET DEFAULT TRUE;

-- Add estimated_cost column (free-text, e.g. "£25", "$10", "FREE")
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS estimated_cost TEXT DEFAULT NULL;

-- ============================================
-- UPDATE: create_proposal_rpc
-- Drop old 7-param signature first to avoid ambiguous overload
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

    RETURN row_to_json(v_proposal);
END;
$$;

GRANT EXECUTE ON FUNCTION create_proposal_rpc TO authenticated;

-- ============================================
-- UPDATE: get_group_proposals
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
            'created_by_profile', CASE
                WHEN p.is_anonymous = TRUE THEN NULL
                ELSE (
                    SELECT json_build_object('id', id, 'display_name', COALESCE(first_name, username, 'Someone'), 'avatar_url', avatar_url)
                    FROM profiles WHERE id = p.created_by
                )
            END
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
-- UPDATE: get_pending_proposals_for_user
-- ============================================
CREATE OR REPLACE FUNCTION get_pending_proposals_for_user()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_agg(
        json_build_object(
            'proposal', row_to_json(p),
            'vote_counts', json_build_object(
                'yes_count', COALESCE(vc.yes_count, 0),
                'maybe_count', COALESCE(vc.maybe_count, 0),
                'no_count', COALESCE(vc.no_count, 0),
                'total_votes', COALESCE(vc.total_votes, 0)
            ),
            'my_vote', NULL,
            'created_by_profile', CASE
                WHEN p.is_anonymous = TRUE THEN NULL
                ELSE (
                    SELECT json_build_object(
                        'id', pr.id,
                        'display_name', COALESCE(pr.first_name, pr.username, 'Someone'),
                        'avatar_url', pr.avatar_url
                    )
                    FROM profiles pr WHERE pr.id = p.created_by
                )
            END,
            'group_name', g.name
        )
        ORDER BY p.created_at DESC
    )
    INTO result
    FROM proposals p
    INNER JOIN group_members gm ON gm.group_id = p.group_id AND gm.user_id = auth.uid()
    INNER JOIN groups g ON g.id = p.group_id
    LEFT JOIN proposal_vote_counts vc ON vc.proposal_id = p.id
    LEFT JOIN votes v ON v.proposal_id = p.id AND v.user_id = auth.uid()
    WHERE p.status = 'open'
      AND p.vote_window_ends_at > NOW()
      AND v.id IS NULL
      AND p.created_by != auth.uid();

    RETURN COALESCE(result, '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION get_pending_proposals_for_user() TO authenticated;

-- ============================================
-- NEW: get_group_member_count
-- ============================================
CREATE OR REPLACE FUNCTION get_group_member_count(p_group_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    -- Validate caller is a member
    IF NOT EXISTS (
        SELECT 1 FROM group_members
        WHERE group_id = p_group_id
        AND user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Not a member of this group';
    END IF;

    SELECT COUNT(*)::INTEGER INTO v_count
    FROM group_members
    WHERE group_id = p_group_id;

    RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION get_group_member_count TO authenticated;
