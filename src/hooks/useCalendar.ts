import { useState, useCallback } from "react";
import { Alert, Linking } from "react-native";
import { supabase } from "../supabase";
import { useAuth } from "../contexts/AuthContext";

export const useCalendar = () => {
  const { user, refreshProfile, calendarConnected } = useAuth();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const connectGoogleCalendar = useCallback(async () => {
    if (!user?.id) {
      Alert.alert("Error", "You must be logged in to connect your calendar.");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke(
        "google-calendar-auth",
        {
          body: { userId: user.id },
        }
      );

      if (error) {
        console.error("Error getting auth URL:", error);
        Alert.alert("Error", "Failed to start calendar connection. Please try again.");
        return;
      }

      if (data?.authUrl) {
        const supported = await Linking.canOpenURL(data.authUrl);
        if (supported) {
          await Linking.openURL(data.authUrl);
          // After returning from browser, refresh profile
          setTimeout(() => {
            refreshProfile?.();
          }, 3000);
        } else {
          Alert.alert("Error", "Cannot open the authorization page.");
        }
      }
    } catch (error) {
      console.error("Error connecting calendar:", error);
      Alert.alert("Error", "An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [user?.id, refreshProfile]);

  const refreshBusyTimes = useCallback(async () => {
    if (!user?.id || !calendarConnected) {
      return;
    }

    setRefreshing(true);

    try {
      const { data, error } = await supabase.functions.invoke(
        "refresh-calendar-busy-times",
        {
          body: { userId: user.id },
        }
      );

      if (error) {
        console.error("Error refreshing busy times:", error);
        return false;
      }

      return data?.success ?? false;
    } catch (error) {
      console.error("Error refreshing busy times:", error);
      return false;
    } finally {
      setRefreshing(false);
    }
  }, [user?.id, calendarConnected]);

  const disconnectCalendar = useCallback(async () => {
    if (!user?.id) {
      return;
    }

    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          calendar_provider: null,
          calendar_connected: false,
          calendar_access_token: null,
          calendar_refresh_token: null,
          calendar_token_expires_at: null,
        })
        .eq("id", user.id);

      if (error) {
        console.error("Error disconnecting calendar:", error);
        Alert.alert("Error", "Failed to disconnect calendar.");
        return false;
      }

      // Clear busy times
      await supabase
        .from("calendar_busy_times")
        .delete()
        .eq("user_id", user.id);

      refreshProfile?.();
      return true;
    } catch (error) {
      console.error("Error disconnecting calendar:", error);
      Alert.alert("Error", "Failed to disconnect calendar.");
      return false;
    }
  }, [user?.id, refreshProfile]);

  return {
    loading,
    refreshing,
    calendarConnected,
    connectGoogleCalendar,
    refreshBusyTimes,
    disconnectCalendar,
  };
};
