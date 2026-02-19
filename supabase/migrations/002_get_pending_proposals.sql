-- ============================================
-- RPC FUNCTION: Get pending (unvoted) proposals for a user
-- Returns open proposals across all user's groups where the user hasn't voted yet
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
            'created_by_profile', (
                SELECT json_build_object(
                    'id', pr.id,
                    'display_name', COALESCE(pr.first_name, pr.username, 'Someone'),
                    'avatar_url', pr.avatar_url
                )
                FROM profiles pr WHERE pr.id = p.created_by
            ),
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
