    -- 006_tiered_auth.sql
    -- Add guest tier support to profiles

    -- Add is_guest column to profiles
    -- Existing users default to false (full account users)
    -- New anonymous-auth users will have this set to true by the app
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_guest BOOLEAN NOT NULL DEFAULT false;
