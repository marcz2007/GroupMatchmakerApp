import { supabase } from "../supabase";

export interface User {
  id: string;
  username: string;
  bio?: string;
  interests?: string[];
  created_at: string;
  updated_at?: string;
  avatar_url?: string;
  firstName?: string;
  lastName?: string;
}

/**
 * Fetches a user by their ID
 * @param userId The ID of the user to fetch
 * @returns Promise with the user data or null if not found
 */
export async function getProfileById(profileId: string): Promise<User | null> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", profileId)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Error fetching profile:", error);
    return null;
  }
}

/**
 * Fetches multiple users by their IDs
 * @param userIds Array of user IDs to fetch
 * @returns Promise with array of user data
 */
export async function getProfilesByIds(userIds: string[]): Promise<User[]> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .in("id", userIds);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error fetching profiles:", error);
    return [];
  }
}

/**
 * Updates a user's profile information
 * @param userId The ID of the user to update
 * @param updates Object containing the fields to update
 * @returns Promise with the updated user data or null if update failed
 */
export async function updateUserProfile(
  userId: string,
  updates: Partial<Omit<User, "id" | "created_at">>
): Promise<User | null> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Error updating user profile:", error);
    return null;
  }
}
