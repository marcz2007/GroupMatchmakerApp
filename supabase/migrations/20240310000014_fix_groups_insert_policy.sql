-- Fix groups INSERT policy to allow authenticated users to create groups
-- Drop existing INSERT policy if it exists
DROP POLICY IF EXISTS "Users can create groups" ON groups;

-- Create a more permissive INSERT policy
CREATE POLICY "Users can create groups" ON groups FOR INSERT
WITH
    CHECK (auth.uid () = owner_id);

-- Also ensure there's a policy for users to update their own groups
DROP POLICY IF EXISTS "Group owners can update groups" ON groups;

CREATE POLICY "Group owners can update groups" ON groups FOR
UPDATE USING (auth.uid () = owner_id)
WITH
    CHECK (auth.uid () = owner_id);