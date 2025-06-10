-- Allow null values in user_id column
ALTER TABLE spotify_auth_states
ALTER COLUMN user_id
DROP NOT NULL;