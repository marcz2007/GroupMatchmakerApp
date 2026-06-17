-- ============================================
-- Populate profile name/username from signup metadata.
--
-- handle_new_user previously copied only (id, email), so the first_name /
-- username passed at sign-up — and the full name Google provides on OAuth —
-- were dropped. Every new user landed with no display name. Now copy them from
-- raw_user_meta_data, deriving first/last name from a full name when that's all
-- we get (e.g. Google sign-in sends `full_name`/`name`).
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_meta  JSONB := COALESCE(new.raw_user_meta_data, '{}'::jsonb);
  v_full  TEXT  := COALESCE(NULLIF(v_meta->>'full_name', ''), NULLIF(v_meta->>'name', ''), '');
  v_first TEXT;
  v_last  TEXT;
BEGIN
  v_first := COALESCE(NULLIF(v_meta->>'first_name', ''), NULLIF(split_part(v_full, ' ', 1), ''));
  -- everything after the first word of the full name
  v_last  := COALESCE(NULLIF(v_meta->>'last_name', ''), NULLIF(regexp_replace(v_full, '^\S+\s*', ''), ''));

  INSERT INTO public.profiles (id, email, first_name, last_name, username)
  VALUES (
    new.id,
    new.email,
    v_first,
    v_last,
    NULLIF(v_meta->>'username', '')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
