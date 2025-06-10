-- Add Spotify-related columns to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS spotify_connected BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS spotify_top_genres TEXT[],
ADD COLUMN IF NOT EXISTS spotify_top_artists JSONB[], -- Store artist objects with name, image, and spotify_url
ADD COLUMN IF NOT EXISTS spotify_selected_playlist JSONB, -- Store playlist object with name, image, spotify_url, and description
ADD COLUMN IF NOT EXISTS spotify_refresh_token TEXT,
ADD COLUMN IF NOT EXISTS spotify_access_token TEXT,
ADD COLUMN IF NOT EXISTS spotify_token_expires_at TIMESTAMP WITH TIME ZONE;

-- Add RLS policies for Spotify data
CREATE POLICY "Users can update their own Spotify data"
  ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_spotify_connected ON profiles(spotify_connected); 