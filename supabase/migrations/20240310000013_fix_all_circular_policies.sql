-- Comprehensive fix for all circular policy references
-- Drop all policies that might cause circular references
-- Drop all group_members policies
DROP POLICY IF EXISTS "Users can view group members" ON group_members;

DROP POLICY IF EXISTS "Group owners can view all members" ON group_members;

DROP POLICY IF EXISTS "Users can view their own group membership" ON group_members;

DROP POLICY IF EXISTS "Users can join groups" ON group_members;

-- Drop all groups policies
DROP POLICY IF EXISTS "Users can view groups they are members of" ON groups;

DROP POLICY IF EXISTS "Users can view groups they own or are a member of" ON groups;

DROP POLICY IF EXISTS "Users can view groups" ON groups;

DROP POLICY IF EXISTS "Users can create groups" ON groups;

DROP POLICY IF EXISTS "Group owners can update groups" ON groups;

-- Drop all messages policies that reference group_members
DROP POLICY IF EXISTS "Users can view messages in groups they belong to" ON messages;

DROP POLICY IF EXISTS "Users can send messages to groups they belong to" ON messages;

DROP POLICY IF EXISTS "Users can view messages in their groups" ON messages;

DROP POLICY IF EXISTS "Users can send messages to their groups" ON messages;

-- Drop all group_images policies that reference group_members
DROP POLICY IF EXISTS "Users can view images in groups they belong to" ON group_images;

DROP POLICY IF EXISTS "Users can upload images to groups they belong to" ON group_images;

DROP POLICY IF EXISTS "Users can view images in their groups" ON group_images;

DROP POLICY IF EXISTS "Users can upload images to their groups" ON group_images;

DROP POLICY IF EXISTS "Users can update images in their groups" ON group_images;

DROP POLICY IF EXISTS "Users can delete images in their groups" ON group_images;

-- Recreate safe policies for groups
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

CREATE POLICY "Users can create groups" ON groups FOR INSERT
WITH
    CHECK (auth.uid () = owner_id);

CREATE POLICY "Group owners can update groups" ON groups FOR
UPDATE USING (auth.uid () = owner_id);

-- Recreate safe policies for group_members (no circular references)
CREATE POLICY "Users can view their own membership" ON group_members FOR
SELECT
    USING (user_id = auth.uid ());

CREATE POLICY "Users can join groups" ON group_members FOR INSERT
WITH
    CHECK (auth.uid () = user_id);

-- Recreate safe policies for messages
CREATE POLICY "Users can view messages in their groups" ON messages FOR
SELECT
    USING (
        EXISTS (
            SELECT
                1
            FROM
                group_members
            WHERE
                group_id = messages.group_id
                AND user_id = auth.uid ()
        )
    );

CREATE POLICY "Users can send messages to their groups" ON messages FOR INSERT
WITH
    CHECK (
        auth.uid () = user_id
        AND EXISTS (
            SELECT
                1
            FROM
                group_members
            WHERE
                group_id = messages.group_id
                AND user_id = auth.uid ()
        )
    );

-- Recreate safe policies for group_images
CREATE POLICY "Users can view images in their groups" ON group_images FOR
SELECT
    USING (
        EXISTS (
            SELECT
                1
            FROM
                group_members
            WHERE
                group_id = group_images.group_id
                AND user_id = auth.uid ()
        )
    );

CREATE POLICY "Users can upload images to their groups" ON group_images FOR INSERT
WITH
    CHECK (
        EXISTS (
            SELECT
                1
            FROM
                group_members
            WHERE
                group_id = group_images.group_id
                AND user_id = auth.uid ()
        )
    );

CREATE POLICY "Users can update images in their groups" ON group_images FOR
UPDATE USING (
    EXISTS (
        SELECT
            1
        FROM
            group_members
        WHERE
            group_id = group_images.group_id
            AND user_id = auth.uid ()
    )
);

CREATE POLICY "Users can delete images in their groups" ON group_images FOR DELETE USING (
    EXISTS (
        SELECT
            1
        FROM
            group_members
        WHERE
            group_id = group_images.group_id
            AND user_id = auth.uid ()
    )
);