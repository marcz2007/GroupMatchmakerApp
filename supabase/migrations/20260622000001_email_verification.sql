-- Email verification model: RSVPs create REAL accounts that are initially
-- UNVERIFIED. Unverified = event-attendee only; verified = full account.
--
-- We track verification with our OWN profiles.email_verified_at column rather
-- than auth.users.email_confirmed_at, because unverified users must still be
-- able to SIGN IN (do attendee actions / return later). Accounts are created
-- with auth-level email_confirm:true so sign-in works immediately; the product
-- "verified" tier is gated on email_verified_at, set only when the user clicks
-- our verification link.

-- 1. Verification flag on profiles ------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- Backfill: existing real (non-guest) users whose email is already confirmed
-- at the auth layer keep full access. Guests stay unverified (attendee tier).
UPDATE public.profiles p
SET email_verified_at = u.email_confirmed_at
FROM auth.users u
WHERE u.id = p.id
  AND u.email_confirmed_at IS NOT NULL
  AND COALESCE(p.is_guest, false) = false
  AND p.email_verified_at IS NULL;

-- 2. Single enforcement helper ----------------------------------------------
-- SECURITY DEFINER so it can read profiles without tripping RLS recursion.
CREATE OR REPLACE FUNCTION public.is_email_verified()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email_verified_at IS NOT NULL
  FROM public.profiles
  WHERE id = auth.uid();
$$;

-- 3. Verification tokens (mirrors calendar_auth_states) ----------------------
CREATE TABLE IF NOT EXISTS public.email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user
  ON public.email_verification_tokens(user_id);
ALTER TABLE public.email_verification_tokens ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role (edge functions) ever touches this table.

-- 4. RSVP rate-limit ledger --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rsvp_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,            -- e.g. "<ip>:<email>"
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rsvp_rate_limits_key_time
  ON public.rsvp_rate_limits(key, created_at);
ALTER TABLE public.rsvp_rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role (web-rsvp) ever touches this table.

-- 5. Enforcement trigger -----------------------------------------------------
-- Blocks only AUTHENTICATED, UNVERIFIED end-users. Service-role / system
-- inserts (auth.uid() IS NULL — web-rsvp, cron jobs, admin) pass through, as do
-- verified users. Applied as BEFORE INSERT so it also covers SECURITY DEFINER
-- RPCs (create_smart_event/create_poll_event/create_direct_event/
-- create_proposal_rpc), whose inserts still carry the caller's auth.uid().
CREATE OR REPLACE FUNCTION public.enforce_email_verified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_email_verified() THEN
    RAISE EXCEPTION 'Email verification required'
      USING ERRCODE = 'check_violation',
            HINT = 'Verify your email to unlock groups, events, and messaging.';
  END IF;
  RETURN NEW;
END;
$$;

-- Gate the full-account actions. NOT gated: event_room_participants (RSVP/join)
-- and poll voting, which unverified attendees must be able to do.
DROP TRIGGER IF EXISTS trg_verified_groups ON public.groups;
CREATE TRIGGER trg_verified_groups
  BEFORE INSERT ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.enforce_email_verified();

DROP TRIGGER IF EXISTS trg_verified_group_members ON public.group_members;
CREATE TRIGGER trg_verified_group_members
  BEFORE INSERT ON public.group_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_email_verified();

DROP TRIGGER IF EXISTS trg_verified_messages ON public.messages;
CREATE TRIGGER trg_verified_messages
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_email_verified();

DROP TRIGGER IF EXISTS trg_verified_event_messages ON public.event_messages;
CREATE TRIGGER trg_verified_event_messages
  BEFORE INSERT ON public.event_messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_email_verified();

DROP TRIGGER IF EXISTS trg_verified_event_rooms ON public.event_rooms;
CREATE TRIGGER trg_verified_event_rooms
  BEFORE INSERT ON public.event_rooms
  FOR EACH ROW EXECUTE FUNCTION public.enforce_email_verified();

DROP TRIGGER IF EXISTS trg_verified_proposals ON public.proposals;
CREATE TRIGGER trg_verified_proposals
  BEFORE INSERT ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.enforce_email_verified();
