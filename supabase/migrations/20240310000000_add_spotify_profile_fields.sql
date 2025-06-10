-- Add Spotify profile fields to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS spotify_user_id TEXT,
ADD COLUMN IF NOT EXISTS spotify_display_name TEXT,
ADD COLUMN IF NOT EXISTS spotify_email TEXT;

-- Add comment to explain the fields
COMMENT ON COLUMN profiles.spotify_user_id IS 'The Spotify user ID';

COMMENT ON COLUMN profiles.spotify_display_name IS 'The Spotify display name';

COMMENT ON COLUMN profiles.spotify_email IS 'The Spotify email address';