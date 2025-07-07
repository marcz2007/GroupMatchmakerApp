-- Create notifications table
CREATE TABLE
    notifications (
        id UUID DEFAULT uuid_generate_v4 () PRIMARY KEY,
        user_id UUID REFERENCES auth.users (id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        group_id UUID REFERENCES groups (id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP
        WITH
            TIME ZONE DEFAULT NOW ()
    );

-- Create index for better performance
CREATE INDEX idx_notifications_user_id ON notifications (user_id);

CREATE INDEX idx_notifications_read ON notifications (read);

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS policies for notifications
CREATE POLICY "Users can view their own notifications" ON notifications FOR
SELECT
    USING (user_id = auth.uid ());

CREATE POLICY "Users can update their own notifications" ON notifications FOR
UPDATE USING (user_id = auth.uid ());

CREATE POLICY "System can create notifications for users" ON notifications FOR INSERT
WITH
    CHECK (true);

-- Allow system to create notifications
-- Add comment
COMMENT ON TABLE notifications IS 'User notifications for various app events';