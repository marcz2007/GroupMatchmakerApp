import { supabase } from "../supabase";

export interface User {
  id: string;
  username: string;
  bio?: string;
  interests?: string[];
  created_at: string;
  updated_at?: string;
  avatar_url?: string;
  first_name?: string;
  last_name?: string;
}

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
    console.error("[UserService] getProfileById failed:", error);
    return null;
  }
}

export async function getProfilesByIds(userIds: string[]): Promise<User[]> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .in("id", userIds);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("[UserService] getProfilesByIds failed:", error);
    return [];
  }
}

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
    console.error("[UserService] updateUserProfile failed:", error);
    return null;
  }
}
