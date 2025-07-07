-- Add spotify_top_artists column to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS spotify_top_artists JSONB DEFAULT NULL;

-- Add comment to explain the column
COMMENT ON COLUMN profiles.spotify_top_artists IS 'Array of top Spotify artists with their names, images, and Spotify URLs';