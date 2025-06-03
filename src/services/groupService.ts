import { supabase } from "../supabase";

export interface Group {
  id: string;
  name: string;
  description: string;
  created_at: string;
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
  const { data: membershipData, error: fetchError } = await supabase
    .from("group_members")
    .select(`groups ( id, name, description, created_at )`)
    .eq("user_id", userId)
    .returns<{ groups: Group }[]>();

  if (fetchError) {
    console.error("Error fetching groups:", fetchError);
    throw fetchError;
  }

  const allFetchedGroups =
    membershipData
      ?.map((item) => item.groups)
      .filter((group): group is Group => group !== null) || [];

  // Ensure unique groups
  const uniqueGroups: Group[] = [];
  const encounteredGroupIds = new Set<string>();
  for (const group of allFetchedGroups) {
    if (!encounteredGroupIds.has(group.id)) {
      uniqueGroups.push(group);
      encounteredGroupIds.add(group.id);
    }
  }

  return uniqueGroups;
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
      .select("id, name, description, created_at")
      .eq("id", groupId)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Error fetching group:", error);
    return null;
  }
}

export const createGroup = async (groupData: {
  name: string;
  description: string;
  created_by: string;
}): Promise<Group> => {
  const { data: newGroup, error: groupError } = await supabase
    .from("groups")
    .insert({
      name: groupData.name,
      description: groupData.description,
    })
    .select()
    .single();

  if (groupError) {
    console.error("Error creating group:", groupError);
    throw groupError;
  }

  if (!newGroup) {
    throw new Error("Failed to create group");
  }

  // Add creator as a member
  const { error: memberError } = await supabase
    .from("group_members")
    .insert({ group_id: newGroup.id, user_id: groupData.created_by });

  if (memberError) {
    console.error("Error adding creator to group:", memberError);
    throw memberError;
  }

  return newGroup;
};
