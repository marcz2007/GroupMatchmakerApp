-- Update existing profiles to set username to email if it's null
UPDATE profiles 
SET username = auth.users.email 
FROM auth.users 
WHERE profiles.id = auth.users.id 
AND profiles.username IS NULL; 