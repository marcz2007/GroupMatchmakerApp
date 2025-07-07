-- Add description field to group_activity_suggestions table
ALTER TABLE group_activity_suggestions
ADD COLUMN description TEXT;

-- Add comment to document the new field
COMMENT ON COLUMN group_activity_suggestions.description IS 'Optional description for the activity suggestion';