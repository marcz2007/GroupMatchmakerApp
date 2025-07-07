-- Fix infinite recursion in groups RLS policy
-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can view groups they are members of" ON groups;

-- Create a new policy that doesn't cause infinite recursion
-- Users can view groups if they are the owner or if they are a member (checked via direct query)
CREATE POLICY "Users can view groups" ON groups FOR
SELECT
    USING (
        owner_id = auth.uid ()
        OR EXISTS (
            SELECT
                1
            FROM
                group_members
            WHERE
                group_id = groups.id
                AND user_id = auth.uid ()
        )
    );