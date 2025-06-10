-- Add AI analysis fields to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS enable_ai_analysis BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS ai_analysis_scores JSONB DEFAULT '{
  "communicationStyle": 0.5,
  "activityPreference": 0.5,
  "socialDynamics": 0.5,
  "lastUpdated": null
}'::jsonb;

-- The following statements for the 'groups' table are commented out because the table and triggers already exist in the live database.
-- ALTER TABLE groups
-- ADD COLUMN IF NOT EXISTS ai_analysis_scores JSONB DEFAULT '{
--   "communicationStyle": 0.5,
--   "activityPreference": 0.5,
--   "socialDynamics": 0.5,
--   "lastUpdated": null
-- }'::jsonb;

-- ALTER TABLE groups ADD COLUMN enable_ai_analysis BOOLEAN DEFAULT false;

-- CREATE POLICY "Group members can update AI analysis settings"
-- ON groups
-- FOR UPDATE
-- USING (
--   EXISTS (
--     SELECT 1 FROM group_members
--     WHERE group_members.group_id = groups.id
--     AND group_members.user_id = auth.uid()
--   )
-- )
-- WITH CHECK (
--   EXISTS (
--     SELECT 1 FROM group_members
--     WHERE group_members.group_id = groups.id
--     AND group_members.user_id = auth.uid()
--   )
-- );

-- Create function to update AI analysis scores (shared by both tables)
CREATE OR REPLACE FUNCTION update_ai_analysis_scores()
RETURNS TRIGGER AS $$
BEGIN
  -- Update lastUpdated timestamp whenever scores are modified
  NEW.ai_analysis_scores = jsonb_set(
    NEW.ai_analysis_scores,
    '{lastUpdated}',
    to_jsonb(NOW()::text)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for profiles table
DROP TRIGGER IF EXISTS update_profile_ai_scores ON profiles;
CREATE TRIGGER update_profile_ai_scores
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  WHEN (NEW.ai_analysis_scores IS DISTINCT FROM OLD.ai_analysis_scores)
  EXECUTE FUNCTION update_ai_analysis_scores();

-- The following trigger for groups is commented out because it already exists in the live database.
-- DROP TRIGGER IF EXISTS update_group_ai_scores ON groups;
-- CREATE TRIGGER update_group_ai_scores
--   BEFORE UPDATE ON groups
--   FOR EACH ROW
--   WHEN (NEW.ai_analysis_scores IS DISTINCT FROM OLD.ai_analysis_scores)
--   EXECUTE FUNCTION update_ai_analysis_scores(); 