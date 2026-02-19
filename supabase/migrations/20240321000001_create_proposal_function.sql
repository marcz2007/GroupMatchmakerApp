-- Create a SECURITY DEFINER function to create proposals
-- This bypasses RLS while still validating membership
CREATE OR REPLACE FUNCTION create_proposal_rpc(
    p_group_id UUID,
    p_title TEXT,
    p_description TEXT DEFAULT NULL,
    p_starts_at TIMESTAMPTZ DEFAULT NULL,
    p_ends_at TIMESTAMPTZ DEFAULT NULL,
    p_vote_window_ends_at TIMESTAMPTZ DEFAULT NULL,
    p_threshold INTEGER DEFAULT 3
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
        threshold
    )
    VALUES (
        p_group_id,
        v_user_id,
        p_title,
        p_description,
        p_starts_at,
        p_ends_at,
        v_vote_window,
        COALESCE(p_threshold, 3)
    )
    RETURNING * INTO v_proposal;

    -- Auto-vote YES for the proposal creator
    INSERT INTO votes (proposal_id, user_id, vote)
    VALUES (v_proposal.id, v_user_id, 'YES');

    RETURN row_to_json(v_proposal);
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_proposal_rpc TO authenticated;
