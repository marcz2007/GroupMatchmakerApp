-- ============================================
-- DURABLE GOOGLE IDENTITY
-- Capture the user's stable Google account id (`sub`) + verified email when
-- they connect their calendar, so a returning user is recognized across
-- devices instead of relying on the email they happen to retype.
--
-- link_google_identity() is called from the OAuth callback. It either claims
-- the Google account for the current profile (first time) or, if the account
-- already belongs to another profile, re-points the current event's records
-- to that canonical profile and returns its id (the returning-user case).
-- ============================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS google_sub TEXT,
  ADD COLUMN IF NOT EXISTS google_email TEXT;

-- Non-unique for now: link_google_identity() guarantees a Google account maps
-- to a single canonical profile; a hard UNIQUE could fail the claim UPDATE
-- under a rare race. Can be tightened to a unique partial index later.
CREATE INDEX IF NOT EXISTS idx_profiles_google_sub
  ON profiles(google_sub) WHERE google_sub IS NOT NULL;

CREATE OR REPLACE FUNCTION link_google_identity(
    p_user_id UUID,
    p_google_sub TEXT,
    p_google_email TEXT,
    p_event_room_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_canonical UUID;
BEGIN
    IF p_google_sub IS NULL OR length(trim(p_google_sub)) = 0 THEN
        RETURN p_user_id;
    END IF;

    -- Is this Google account already linked to a different profile?
    SELECT id INTO v_canonical
    FROM profiles
    WHERE google_sub = p_google_sub
      AND id <> p_user_id
    LIMIT 1;

    IF v_canonical IS NULL THEN
        -- First time we've seen this Google account: claim it on the
        -- current profile and record the verified email.
        UPDATE profiles
        SET google_sub = p_google_sub,
            google_email = COALESCE(p_google_email, google_email)
        WHERE id = p_user_id;
        RETURN p_user_id;
    END IF;

    -- Returning user: a canonical profile already owns this Google account.
    -- Re-point this event's records from the freshly-created (duplicate)
    -- profile to the canonical one so the user is recognized and counted there.
    IF p_event_room_id IS NOT NULL AND p_user_id <> v_canonical THEN
        IF EXISTS (
            SELECT 1 FROM event_room_participants
            WHERE event_room_id = p_event_room_id AND user_id = v_canonical
        ) THEN
            -- Canonical is already a participant — just drop the duplicate.
            DELETE FROM event_room_participants
            WHERE event_room_id = p_event_room_id AND user_id = p_user_id;
        ELSE
            UPDATE event_room_participants
            SET user_id = v_canonical
            WHERE event_room_id = p_event_room_id AND user_id = p_user_id;
        END IF;

        DELETE FROM scheduling_calendar_syncs
        WHERE event_room_id = p_event_room_id AND user_id = p_user_id;

        INSERT INTO scheduling_calendar_syncs (event_room_id, user_id, calendar_provider)
        VALUES (p_event_room_id, v_canonical, 'google')
        ON CONFLICT (event_room_id, user_id) DO NOTHING;
    END IF;

    -- Keep the canonical profile's verified email fresh.
    UPDATE profiles
    SET google_email = COALESCE(p_google_email, google_email)
    WHERE id = v_canonical;

    RETURN v_canonical;
END;
$$;

GRANT EXECUTE ON FUNCTION link_google_identity(UUID, TEXT, TEXT, UUID) TO service_role;
