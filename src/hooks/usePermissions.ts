import { useAuth } from "../contexts/AuthContext";

export function usePermissions() {
  const { profile } = useAuth();

  // Full-app features (groups, creating events, messaging) are gated on email
  // verification. Only restrict when we have a loaded profile that is
  // explicitly unverified — if the profile hasn't loaded yet (or the fetch
  // failed), stay permissive in the UI so we never briefly hide tabs from a
  // verified user. The database triggers/RLS are the real enforcement.
  const verified = profile ? !!profile.email_verified_at : true;

  return {
    canAccessGroups: verified,
    canAccessFullApp: verified,
    canUseAdvancedFeatures: profile?.calendar_connected ?? false,
  };
}
