-- Create spotify_auth_states table
CREATE TABLE
    IF NOT EXISTS spotify_auth_states (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
        state TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        UNIQUE (state)
    );

-- Add RLS policies
ALTER TABLE spotify_auth_states ENABLE ROW LEVEL SECURITY;

-- Allow service role to manage all states
CREATE POLICY "Service role can manage all states" ON spotify_auth_states USING (true)
WITH
    CHECK (true);

-- Allow users to read their own states
CREATE POLICY "Users can read their own states" ON spotify_auth_states FOR
SELECT
    USING (auth.uid () = user_id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_spotify_auth_states_user_id ON spotify_auth_states (user_id);

CREATE INDEX IF NOT EXISTS idx_spotify_auth_states_state ON spotify_auth_states (state);