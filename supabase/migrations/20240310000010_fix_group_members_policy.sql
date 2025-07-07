-- Fix infinite recursion in group_members RLS policy
-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can view members of groups they belong to" ON group_members;

-- Create a new policy that doesn't cause infinite recursion
-- Users can view group members if they are the member themselves or if they are the group owner
CREATE POLICY "Users can view group members" ON group_members FOR
SELECT
    USING (
        user_id = auth.uid ()
        OR EXISTS (
            SELECT
                1
            FROM
                groups
            WHERE
                groups.id = group_members.group_id
                AND groups.owner_id = auth.uid ()
        )
    );

-- Also add a policy to allow group owners to view all members of their groups
CREATE POLICY "Group owners can view all members" ON group_members FOR
SELECT
    USING (
        EXISTS (
            SELECT
                1
            FROM
                groups
            WHERE
                groups.id = group_members.group_id
                AND groups.owner_id = auth.uid ()
        )
    );