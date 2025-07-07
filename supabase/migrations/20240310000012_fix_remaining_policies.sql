-- Fix any remaining potential infinite recursion issues in messages and group_images policies
-- These policies should be fine, but let's make them more explicit and robust
-- Drop and recreate messages policies to be more explicit
DROP POLICY IF EXISTS "Users can view messages in groups they belong to" ON messages;

DROP POLICY IF EXISTS "Users can send messages to groups they belong to" ON messages;

-- Create more explicit messages policies
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

-- Drop and recreate group_images policies to be more explicit
DROP POLICY IF EXISTS "Users can view images in groups they belong to" ON group_images;

DROP POLICY IF EXISTS "Users can upload images to groups they belong to" ON group_images;

-- Create more explicit group_images policies
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

-- Add UPDATE and DELETE policies for group_images
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