import { supabase } from '../supabase';

// Define interfaces for the database entities
export interface Group {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  created_at: string;
  interests?: string[];
  photo_url?: string;
  music_genres?: string[];
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  joined_at: string;
}

export interface Profile {
  id: string;
  username: string;
  bio?: string;
  interests?: string[];
  photo_url?: string;
  style_vector?: number[];
  music_genres?: string[];
  spotify_connected?: boolean;
}

export interface GroupEvent {
  id: string;
  group_id: string;
  name: string;
  description?: string;
  location?: string;
  start_time?: string;
  end_time?: string;
  created_at: string;
}

// Matchmaking score weights
const WEIGHTS = {
  interestOverlap: 0.3,
  styleSimilarity: 0.2,
  musicCompatibility: 0.2,
  textualRelevance: 0.3
};

/**
 * Calculate interest overlap score between two arrays of interests
 * @param interests1 First array of interests
 * @param interests2 Second array of interests
 * @returns Score between 0-1
 */
export function calculateInterestOverlap(interests1: string[] = [], interests2: string[] = []): number {
  if (interests1.length === 0 || interests2.length === 0) return 0;
  
  // Normalize interests by converting to lowercase
  const normalizedInterests1 = interests1.map(i => i.toLowerCase().trim());
  const normalizedInterests2 = interests2.map(i => i.toLowerCase().trim());
  
  // Find common interests
  const commonInterests = normalizedInterests1.filter(interest => 
    normalizedInterests2.includes(interest)
  );
  
  // Calculate Jaccard similarity (intersection over union)
  const union = new Set([...normalizedInterests1, ...normalizedInterests2]);
  return commonInterests.length / union.size;
}

/**
 * Calculate style similarity based on style vectors
 * This is a placeholder for the AI-based style analysis
 * @param styleVector1 Style vector for first group/user
 * @param styleVector2 Style vector for second group/user
 * @returns Score between 0-1
 */
export function calculateStyleSimilarity(styleVector1?: number[], styleVector2?: number[]): number {
  if (!styleVector1 || !styleVector2) return 0.5; // Default if no style data
  
  // Placeholder: In a real implementation, this would use cosine similarity 
  // or another vector distance measure
  return 0.5; // Default medium similarity
}

/**
 * Calculate music compatibility based on genre overlap
 * @param genres1 First array of music genres
 * @param genres2 Second array of music genres
 * @returns Score between 0-1
 */
export function calculateMusicCompatibility(genres1: string[] = [], genres2: string[] = []): number {
  // Reuse interest overlap logic for genres
  return calculateInterestOverlap(genres1, genres2);
}

/**
 * Calculate relevance of a group to a search query
 * This is a placeholder for the NLP/LLM-based text analysis
 * @param query Search query
 * @param group Group data
 * @returns Score between 0-1
 */
export function calculateTextualRelevance(query: string, group: Group): number {
  if (!query) return 0;
  
  // Normalize query
  const normalizedQuery = query.toLowerCase().trim();
  
  // Search in group name and description
  const groupText = `${group.name} ${group.description}`.toLowerCase();
  
  // Simple text matching for now
  // In a real implementation, this would use more sophisticated NLP/LLM
  const queryWords = normalizedQuery.split(/\s+/);
  let matchCount = 0;
  
  queryWords.forEach(word => {
    if (groupText.includes(word)) matchCount++;
  });
  
  return matchCount / queryWords.length;
}

/**
 * Calculate overall match score between user/group and potential match group
 * @param query Search query (activity or event)
 * @param userInterests User or user's group interests
 * @param userGenres User or user's group music genres
 * @param userStyle User or user's group style vector
 * @param matchGroup Potential match group
 * @returns Score between 0-1
 */
export function calculateMatchScore(
  query: string,
  userInterests: string[] = [],
  userGenres: string[] = [],
  userStyle?: number[],
  matchGroup: Group
): number {
  // Calculate individual scores
  const interestScore = calculateInterestOverlap(userInterests, matchGroup.interests);
  const styleScore = calculateStyleSimilarity(userStyle, undefined); // placeholder for group style
  const musicScore = calculateMusicCompatibility(userGenres, matchGroup.music_genres);
  const textScore = calculateTextualRelevance(query, matchGroup);
  
  // Calculate weighted score
  const weightedScore = 
    (interestScore * WEIGHTS.interestOverlap) +
    (styleScore * WEIGHTS.styleSimilarity) +
    (musicScore * WEIGHTS.musicCompatibility) +
    (textScore * WEIGHTS.textualRelevance);
  
  return weightedScore;
}

/**
 * Find matching groups based on activity
 * @param query Activity search query
 * @param currentGroupId Current group ID (to exclude from results)
 * @returns Promise with array of matching groups sorted by score
 */
export async function findGroupsByActivity(
  query: string,
  currentGroupId?: string
): Promise<{ group: Group; score: number }[]> {
  try {
    // Get all groups except current
    const { data: groups, error } = await supabase
      .from('groups')
      .select('*')
      .neq('id', currentGroupId || '')
      .limit(50);
    
    if (error) throw error;
    if (!groups || groups.length === 0) return [];
    
    // Get current user or group interests
    // Placeholder - in a real implementation you would fetch the user's group interests
    const userInterests: string[] = [];
    const userGenres: string[] = [];
    
    // Calculate scores and sort
    const scoredGroups = groups.map(group => ({
      group,
      score: calculateMatchScore(query, userInterests, userGenres, undefined, group)
    }));
    
    // Sort by score (highest first)
    return scoredGroups.sort((a, b) => b.score - a.score);
    
  } catch (error) {
    console.error('Error finding groups by activity:', error);
    return [];
  }
}

/**
 * Find matching groups based on event
 * @param query Event search query
 * @param currentGroupId Current group ID (to exclude from results)
 * @returns Promise with array of matching groups sorted by score
 */
export async function findGroupsByEvent(
  query: string,
  currentGroupId?: string
): Promise<{ group: Group; score: number }[]> {
  try {
    // Get groups with matching events
    // This is a simplification - in a real implementation, you would
    // search through events table and find groups attending those events
    
    // For now, reuse the activity search as placeholder
    return findGroupsByActivity(query, currentGroupId);
    
  } catch (error) {
    console.error('Error finding groups by event:', error);
    return [];
  }
} 