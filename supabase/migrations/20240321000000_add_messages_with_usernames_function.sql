-- Create a function to get messages with usernames
-- This properly joins messages -> auth.users -> profiles
CREATE OR REPLACE FUNCTION get_messages_with_usernames(
  p_group_id UUID,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  created_at TIMESTAMPTZ,
  user_id UUID,
  username TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.id,
    m.content,
    m.created_at,
    m.user_id,
    p.username
  FROM messages m
  LEFT JOIN profiles p ON m.user_id = p.id
  WHERE m.group_id = p_group_id
  ORDER BY m.created_at DESC
  LIMIT p_limit;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_messages_with_usernames(UUID, INTEGER) TO authenticated; 