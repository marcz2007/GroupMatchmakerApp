-- Add spotify_selected_playlist column to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS spotify_selected_playlist JSONB;

-- Add comment to the column
COMMENT ON COLUMN profiles.spotify_selected_playlist IS 'Stores the selected Spotify playlist information including id, name, description, image, spotify_url, owner, and tracks_count';