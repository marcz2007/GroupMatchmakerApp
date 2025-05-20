import { supabase } from "../supabase";

export interface Group {
  id: string;
  name: string;
  description?: string;
}

interface GroupMemberData {
  groups: Group[];
}

/**
 * Fetches all groups that a user is a member of
 * @param userId The ID of the user
 * @returns Promise with array of groups
 */
export async function getUserGroups(userId: string): Promise<Group[]> {
  try {
    const { data, error } = await supabase
      .from("group_members")
      .select(
        `
        groups (
          id,
          name,
          description
        )
      `
      )
      .eq("user_id", userId);

    if (error) throw error;
    if (!data) return [];

    // Transform the data into a simple array of groups
    const allGroups = (data as GroupMemberData[])
      .flatMap((item) => item.groups)
      .filter(
        (group): group is Group =>
          group !== null &&
          typeof group === "object" &&
          "id" in group &&
          "name" in group
      );

    // Remove duplicates based on group id
    return Array.from(
      new Map(allGroups.map((group) => [group.id, group])).values()
    );
  } catch (error) {
    console.error("Error fetching user groups:", error);
    throw error;
  }
}

/**
 * Fetches a single group by ID
 * @param groupId The ID of the group to fetch
 * @returns Promise with the group data or null if not found
 */
export async function getGroupById(groupId: string): Promise<Group | null> {
  try {
    const { data, error } = await supabase
      .from("groups")
      .select("id, name, description")
      .eq("id", groupId)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Error fetching group:", error);
    return null;
  }
}
