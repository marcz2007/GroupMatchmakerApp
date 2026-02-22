import { useAuth } from "../contexts/AuthContext";

export function usePermissions() {
  const { profile } = useAuth();
  const isGuest = profile?.is_guest ?? false;

  return {
    canAccessGroups: !isGuest,
    canAccessFullApp: !isGuest,
    canUseAdvancedFeatures: profile?.calendar_connected ?? false,
  };
}
