import { supabase } from "../supabase";

export interface Group {
  id: string;
  name: string;
  description: string;
  created_at: string;
}

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
      owner_id: groupData.created_by,
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

  const { error: memberError } = await supabase
    .from("group_members")
    .insert({ group_id: newGroup.id, user_id: groupData.created_by });

  if (memberError) {
    console.error("Error adding creator to group:", memberError);
    throw memberError;
  }

  return newGroup;
};

export async function getGroupMemberCount(groupId: string): Promise<number> {
  const { data, error } = await supabase.rpc("get_group_member_count", {
    p_group_id: groupId,
  });

  if (error) {
    console.error("Error fetching group member count:", error);
    throw error;
  }

  return data;
}
