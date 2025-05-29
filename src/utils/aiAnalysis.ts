import { supabase } from "../supabase";

const BIO_MIN_LENGTH = 100;
const MESSAGE_BATCH_SIZE = 5;
const MESSAGE_ANALYSIS_INTERVAL = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
const GROUP_ACTIVITY_THRESHOLD = 90 * 24 * 60 * 60 * 1000; // 90 days in milliseconds
const MAX_WORD_PATTERNS = 1000; // Maximum number of word patterns to store

interface AnalysisThresholds {
  bioMinLength: number;
  messageBatchSize: number;
  messageAnalysisInterval: number;
  groupActivityThreshold: number;
}

export const analysisThresholds: AnalysisThresholds = {
  bioMinLength: BIO_MIN_LENGTH,
  messageBatchSize: MESSAGE_BATCH_SIZE,
  messageAnalysisInterval: MESSAGE_ANALYSIS_INTERVAL,
  groupActivityThreshold: GROUP_ACTIVITY_THRESHOLD,
};

export const shouldAnalyzeBio = (
  bio: string,
  lastAnalysis?: string
): boolean => {
  console.log("[shouldAnalyzeBio] Checking bio:", {
    bioLength: bio?.length,
    minLength: BIO_MIN_LENGTH,
    lastAnalysis,
    hasBio: !!bio,
  });

  if (!bio || bio.length < BIO_MIN_LENGTH) {
    console.log("[shouldAnalyzeBio] Bio too short or missing");
    return false;
  }

  // If no previous analysis, analyze
  if (!lastAnalysis) {
    console.log("[shouldAnalyzeBio] No previous analysis, will analyze");
    return true;
  }

  try {
    const lastAnalysisDate = new Date(lastAnalysis);
    const now = new Date();

    // Validate the date is reasonable (not in the future and not too old)
    if (isNaN(lastAnalysisDate.getTime()) || lastAnalysisDate > now) {
      console.log(
        "[shouldAnalyzeBio] Invalid last analysis date, will analyze"
      );
      return true;
    }

    const shouldAnalyze =
      now.getTime() - lastAnalysisDate.getTime() > MESSAGE_ANALYSIS_INTERVAL;
    console.log("[shouldAnalyzeBio] Time-based check:", {
      lastAnalysisDate: lastAnalysisDate.toISOString(),
      now: now.toISOString(),
      timeDiff: now.getTime() - lastAnalysisDate.getTime(),
      interval: MESSAGE_ANALYSIS_INTERVAL,
      shouldAnalyze,
    });
    return shouldAnalyze;
  } catch (error) {
    console.error("[shouldAnalyzeBio] Error parsing date:", error);
    // If there's any error parsing the date, we should analyze
    return true;
  }
};

export const shouldAnalyzeMessages = async (
  userId: string,
  groupId: string
): Promise<boolean> => {
  // Check if user has enabled AI analysis
  const { data: profile } = await supabase
    .from("profiles")
    .select("enable_ai_analysis")
    .eq("id", userId)
    .single();

  if (!profile?.enable_ai_analysis) {
    return false;
  }

  // Check if group is active
  const { data: latestMessage } = await supabase
    .from("messages")
    .select("created_at")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!latestMessage) {
    return false;
  }

  const lastMessageDate = new Date(latestMessage.created_at);
  const now = new Date();
  if (now.getTime() - lastMessageDate.getTime() > GROUP_ACTIVITY_THRESHOLD) {
    return false;
  }

  // Check if we have enough messages to analyze
  const { count } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("group_id", groupId)
    .gte(
      "created_at",
      new Date(now.getTime() - MESSAGE_ANALYSIS_INTERVAL).toISOString()
    );

  return (count || 0) >= MESSAGE_BATCH_SIZE;
};

export const getMessagesForAnalysis = async (
  groupId: string,
  lastAnalysisDate?: string
): Promise<string[]> => {
  const query = supabase
    .from("messages")
    .select("content")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false });

  if (lastAnalysisDate) {
    query.gte("created_at", lastAnalysisDate);
  } else {
    query.gte(
      "created_at",
      new Date(Date.now() - MESSAGE_ANALYSIS_INTERVAL).toISOString()
    );
  }

  const { data: messages } = await query.limit(MESSAGE_BATCH_SIZE);
  return messages?.map((m) => m.content) || [];
};

export const updateAnalysisScores = async (
  userId: string,
  analysisData: any
): Promise<void> => {
  try {
    // First get existing scores to preserve historical data
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("ai_analysis_scores, word_patterns")
      .eq("id", userId)
      .single();

    const existingScores = existingProfile?.ai_analysis_scores || {
      communicationStyle: 0.5,
      activityPreference: 0.5,
      socialDynamics: 0.5,
      lastUpdated: null,
    };

    const existingWordPatterns = existingProfile?.word_patterns || {
      unigrams: [],
      bigrams: [],
      trigrams: [],
      topWords: [],
    };

    // Blend new scores with existing scores (70% weight to existing scores)
    const blendedScores = {
      communicationStyle:
        existingScores.communicationStyle * 0.7 +
        analysisData.communicationStyle * 0.3,
      activityPreference:
        existingScores.activityPreference * 0.7 +
        analysisData.activityPreference * 0.3,
      socialDynamics:
        existingScores.socialDynamics * 0.7 + analysisData.socialDynamics * 0.3,
      lastUpdated: new Date().toISOString(),
    };

    // Merge word patterns, keeping the most recent and unique ones
    const mergedWordPatterns = {
      unigrams: [
        ...new Set([
          ...existingWordPatterns.unigrams,
          ...(analysisData.wordPatterns?.unigrams || []),
        ]),
      ].slice(0, MAX_WORD_PATTERNS),
      bigrams: [
        ...new Set([
          ...existingWordPatterns.bigrams,
          ...(analysisData.wordPatterns?.bigrams || []),
        ]),
      ].slice(0, MAX_WORD_PATTERNS),
      trigrams: [
        ...new Set([
          ...existingWordPatterns.trigrams,
          ...(analysisData.wordPatterns?.trigrams || []),
        ]),
      ].slice(0, MAX_WORD_PATTERNS),
      topWords: [
        ...existingWordPatterns.topWords,
        ...(analysisData.wordPatterns?.topWords || []),
      ]
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_WORD_PATTERNS),
    };

    console.log("[updateAnalysisScores] Updating scores with data:", {
      scores: blendedScores,
      wordPatterns: {
        unigramsCount: mergedWordPatterns.unigrams.length,
        bigramsCount: mergedWordPatterns.bigrams.length,
        trigramsCount: mergedWordPatterns.trigrams.length,
        topWordsCount: mergedWordPatterns.topWords.length,
        topWords: mergedWordPatterns.topWords.slice(0, 5).map((w: any) => ({
          word: w.word,
          score: w.score?.toFixed(3) || "0.000",
        })),
      },
    });

    const { error } = await supabase
      .from("profiles")
      .update({
        ai_analysis_scores: blendedScores,
        word_patterns: mergedWordPatterns,
      })
      .eq("id", userId);

    if (error) {
      console.error("Error updating analysis scores:", error);
      throw error;
    }
  } catch (error) {
    console.error("Error in updateAnalysisScores:", error);
    throw error;
  }
};

interface AIAnalysisScores {
  communicationStyle: number;
  activityPreference: number;
  socialDynamics: number;
  lastUpdated: string;
  wordPatterns?: {
    unigrams: string[];
    bigrams: string[];
    trigrams: string[];
    topWords: Array<{ word: string; score: number }>;
  };
}

/**
 * Analyzes text content using AI to generate compatibility scores
 * @param text The text content to analyze
 * @param allTexts Optional array of all texts for TF-IDF calculation
 * @returns Promise with analysis scores
 */
export async function analyzeText(
  text: string,
  allTexts: string[] = []
): Promise<AIAnalysisScores> {
  try {
    // Call Supabase Edge Function for AI analysis
    const { data, error } = await supabase.functions.invoke("analyze-text", {
      body: { text, allTexts },
    });

    console.log("Raw response from analyze-text:", data);

    if (error) throw error;
    if (!data) throw new Error("No analysis data received");

    const result = {
      communicationStyle: data.communicationStyle || 0.5,
      activityPreference: data.activityPreference || 0.5,
      socialDynamics: data.socialDynamics || 0.5,
      lastUpdated: new Date().toISOString(),
      wordPatterns: data.wordPatterns,
    };

    console.log("Processed analysis result:", result);
    return result;
  } catch (error) {
    console.error("Error in text analysis:", error);
    // Return neutral scores in case of error
    return {
      communicationStyle: 0.5,
      activityPreference: 0.5,
      socialDynamics: 0.5,
      lastUpdated: new Date().toISOString(),
      wordPatterns: {
        unigrams: [],
        bigrams: [],
        trigrams: [],
        topWords: [],
      },
    };
  }
}

/**
 * Finds users with similar word patterns
 * @param userId The user's ID
 * @param similarityThreshold Minimum similarity score (0-1)
 * @param maxResults Maximum number of results to return
 * @returns Promise with array of similar users
 */
export async function findSimilarUsersByPatterns(
  userId: string,
  similarityThreshold: number = 0.1,
  maxResults: number = 10
) {
  try {
    const { data, error } = await supabase.rpc(
      "find_similar_users_by_patterns",
      {
        current_user_id: userId,
        similarity_threshold: similarityThreshold,
        max_results: maxResults,
      }
    );

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Error finding similar users:", error);
    throw error;
  }
}

/**
 * Calculates compatibility score between two users based on their AI analysis scores and word patterns
 * @param user1Scores First user's analysis scores
 * @param user2Scores Second user's analysis scores
 * @returns Compatibility score between 0 and 1
 */
export function calculateCompatibilityScore(
  user1Scores: AIAnalysisScores,
  user2Scores: AIAnalysisScores
): number {
  // Calculate differences for each metric
  const communicationDiff = Math.abs(
    user1Scores.communicationStyle - user2Scores.communicationStyle
  );
  const activityDiff = Math.abs(
    user1Scores.activityPreference - user2Scores.activityPreference
  );
  const socialDiff = Math.abs(
    user1Scores.socialDynamics - user2Scores.socialDynamics
  );

  // Convert differences to similarity scores (1 - difference)
  const communicationSimilarity = 1 - communicationDiff;
  const activitySimilarity = 1 - activityDiff;
  const socialSimilarity = 1 - socialDiff;

  // Calculate word pattern similarity if available
  let wordPatternSimilarity = 0.5; // Default neutral score
  if (user1Scores.wordPatterns && user2Scores.wordPatterns) {
    // Calculate overlap in top words
    const user1Words = new Set(
      user1Scores.wordPatterns.topWords.map((w) => w.word)
    );
    const user2Words = new Set(
      user2Scores.wordPatterns.topWords.map((w) => w.word)
    );
    const commonWords = new Set(
      [...user1Words].filter((x) => user2Words.has(x))
    );

    wordPatternSimilarity =
      commonWords.size / Math.max(user1Words.size, user2Words.size);
  }

  // Weighted average of similarity scores
  const weights = {
    communication: 0.3,
    activity: 0.2,
    social: 0.2,
    wordPatterns: 0.3,
  };

  return (
    communicationSimilarity * weights.communication +
    activitySimilarity * weights.activity +
    socialSimilarity * weights.social +
    wordPatternSimilarity * weights.wordPatterns
  );
}

/**
 * Analyzes chat messages for a user and updates their AI analysis scores
 * @param userId The user's ID
 * @param messages Array of chat messages
 */
export const analyzeUserChatMessages = async (
  userId: string,
  messages: { content: string; created_at: string }[]
): Promise<void> => {
  try {
    console.log(
      "[analyzeUserChatMessages] Starting analysis for user:",
      userId
    );
    console.log(
      "[analyzeUserChatMessages] Messages to analyze:",
      messages.length
    );

    // Get user's profile to check if AI analysis is enabled
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("enable_ai_analysis")
      .eq("id", userId)
      .single();

    if (profileError) throw profileError;

    if (!profile?.enable_ai_analysis) {
      console.log("[analyzeUserChatMessages] AI analysis disabled for user");
      return;
    }

    // Combine messages into a single text
    const combinedText = messages.map((m) => m.content).join(" ");
    console.log("[analyzeUserChatMessages] Sending to analyze-text function:", {
      textLength: combinedText.length,
      messageCount: messages.length,
    });

    const { data: analysisData, error: analysisError } =
      await supabase.functions.invoke("analyze-text", {
        body: { text: combinedText, type: "messages" },
      });

    if (analysisError) throw analysisError;
    if (!analysisData) throw new Error("No analysis data received");

    console.log(
      "[analyzeUserChatMessages] Analysis successful, updating scores"
    );
    await updateAnalysisScores(userId, analysisData);
  } catch (error) {
    console.error("[analyzeUserChatMessages] Error:", error);
    throw error;
  }
};

/**
 * Triggers analysis for all users who have AI analysis enabled
 * @param type The type of content to analyze ('bio' or 'messages')
 * @param groupId Optional group ID if analyzing messages
 */
export async function triggerAnalysisForAllUsers(
  type: "bio" | "messages",
  groupId?: string
): Promise<void> {
  try {
    // Get all users with AI analysis enabled
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("id, bio, ai_analysis_scores")
      .eq("enable_ai_analysis", true);

    if (error) {
      console.error("Error fetching profiles:", error);
      return;
    }

    console.log(
      `Found ${profiles?.length || 0} users with AI analysis enabled`
    );

    // Process each user
    for (const profile of profiles || []) {
      try {
        if (type === "bio" && profile.bio) {
          // Analyze bio if it meets the minimum length requirement
          if (
            shouldAnalyzeBio(
              profile.bio,
              profile.ai_analysis_scores?.lastUpdated
            )
          ) {
            const { data: analysisData, error: analysisError } =
              await supabase.functions.invoke("analyze-text", {
                body: { text: profile.bio, type: "bio" },
              });

            if (analysisError) {
              console.error(
                `Error analyzing bio for user ${profile.id}:`,
                analysisError
              );
            } else if (analysisData) {
              await updateAnalysisScores(profile.id, analysisData);
              console.log(`Successfully analyzed bio for user ${profile.id}`);
            }
          }
        } else if (type === "messages" && groupId) {
          // Check if we should analyze messages for this user in this group
          if (await shouldAnalyzeMessages(profile.id, groupId)) {
            const messages = await getMessagesForAnalysis(groupId);
            if (messages.length > 0) {
              const { data: analysisData, error: analysisError } =
                await supabase.functions.invoke("analyze-text", {
                  body: { text: messages.join(" "), type: "messages" },
                });

              if (analysisError) {
                console.error(
                  `Error analyzing messages for user ${profile.id}:`,
                  analysisError
                );
              } else if (analysisData) {
                await updateAnalysisScores(profile.id, analysisData);
                console.log(
                  `Successfully analyzed messages for user ${profile.id}`
                );
              }
            }
          }
        }
      } catch (userError) {
        console.error(`Error processing user ${profile.id}:`, userError);
      }
    }
  } catch (error) {
    console.error("Error in triggerAnalysisForAllUsers:", error);
  }
}
