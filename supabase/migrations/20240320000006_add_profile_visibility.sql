-- Add visibility controls for different profile sections
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS visibility_settings JSONB DEFAULT '{
  "spotify": {
    "top_artists": true,
    "top_genres": true,
    "selected_playlist": true
  },
  "photos": true,
  "interests": true,
  "ai_analysis": false
}'::jsonb;

-- Add comment to explain the visibility settings
COMMENT ON COLUMN profiles.visibility_settings IS 'Controls which parts of the profile are visible on the public profile. Each section can be toggled independently.'; 