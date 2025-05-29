-- Add AI analysis fields to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS enable_ai_analysis BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS ai_analysis_scores JSONB DEFAULT '{
  "communicationStyle": 0.5,
  "activityPreference": 0.5,
  "socialDynamics": 0.5,
  "lastUpdated": null
}'::jsonb;

-- Add AI analysis scores to groups table
ALTER TABLE groups
ADD COLUMN IF NOT EXISTS ai_analysis_scores JSONB DEFAULT '{
  "communicationStyle": 0.5,
  "activityPreference": 0.5,
  "socialDynamics": 0.5,
  "lastUpdated": null
}'::jsonb;

-- Add enable_ai_analysis column to groups table
ALTER TABLE groups ADD COLUMN enable_ai_analysis BOOLEAN DEFAULT false;

-- Add RLS policy to allow group members to update enable_ai_analysis
CREATE POLICY "Group members can update AI analysis settings"
ON groups
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM group_members
    WHERE group_members.group_id = groups.id
    AND group_members.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM group_members
    WHERE group_members.group_id = groups.id
    AND group_members.user_id = auth.uid()
  )
);

-- Create function to update AI analysis scores
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

-- Create triggers for both tables
DROP TRIGGER IF EXISTS update_profile_ai_scores ON profiles;
CREATE TRIGGER update_profile_ai_scores
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  WHEN (NEW.ai_analysis_scores IS DISTINCT FROM OLD.ai_analysis_scores)
  EXECUTE FUNCTION update_ai_analysis_scores();

DROP TRIGGER IF EXISTS update_group_ai_scores ON groups;
CREATE TRIGGER update_group_ai_scores
  BEFORE UPDATE ON groups
  FOR EACH ROW
  WHEN (NEW.ai_analysis_scores IS DISTINCT FROM OLD.ai_analysis_scores)
  EXECUTE FUNCTION update_ai_analysis_scores(); 