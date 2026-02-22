-- 007_dynamic_threshold.sql
-- Change default proposal threshold from hardcoded 3 to 33% of group members (min 2)

-- Drop old function signatures to avoid ambiguity
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
        v_computed_threshold,
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
