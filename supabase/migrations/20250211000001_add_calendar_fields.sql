-- Add calendar integration fields to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS calendar_provider TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS calendar_connected BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS calendar_access_token TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS calendar_refresh_token TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS calendar_token_expires_at TIMESTAMP WITH TIME ZONE;

-- Create calendar_auth_states table for OAuth flow
CREATE TABLE IF NOT EXISTS calendar_auth_states (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  state TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable RLS
ALTER TABLE calendar_auth_states ENABLE ROW LEVEL SECURITY;

-- Allow service role to manage states
CREATE POLICY "Service role can manage calendar_auth_states"
  ON calendar_auth_states
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create calendar_busy_times table to cache user availability
CREATE TABLE IF NOT EXISTS calendar_busy_times (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  fetched_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(user_id, start_time, end_time)
);

-- Enable RLS on calendar_busy_times
ALTER TABLE calendar_busy_times ENABLE ROW LEVEL SECURITY;

-- Users can only see busy times of group members (not their own event details)
CREATE POLICY "Users can view busy times of group members"
  ON calendar_busy_times FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_members gm1
      JOIN group_members gm2 ON gm1.group_id = gm2.group_id
      WHERE gm1.user_id = auth.uid()
      AND gm2.user_id = calendar_busy_times.user_id
    )
  );

-- Users can update their own busy times
CREATE POLICY "Users can manage their own busy times"
  ON calendar_busy_times FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_calendar_busy_times_user_id ON calendar_busy_times(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_busy_times_start_time ON calendar_busy_times(start_time);
