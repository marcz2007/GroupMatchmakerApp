import { supabase } from "../supabase";

const BIO_MIN_LENGTH = 100;
const MESSAGE_BATCH_SIZE = 5;
const MESSAGE_ANALYSIS_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const GROUP_ACTIVITY_THRESHOLD = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

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
  if (!bio || bio.length < BIO_MIN_LENGTH) {
    return false;
  }

  // If no previous analysis, analyze
  if (!lastAnalysis) {
    return true;
  }

  // TODO: Implement similarity check with previous bio
  // For now, we'll analyze if it's been more than 24 hours
  const lastAnalysisDate = new Date(lastAnalysis);
  const now = new Date();
  return now.getTime() - lastAnalysisDate.getTime() > MESSAGE_ANALYSIS_INTERVAL;
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
  scores: {
    communicationStyle: number;
    activityPreference: number;
    socialDynamics: number;
  }
): Promise<void> => {
  await supabase
    .from("profiles")
    .update({
      ai_analysis_scores: {
        ...scores,
        lastUpdated: new Date().toISOString(),
      },
    })
    .eq("id", userId);
};

interface AIAnalysisScores {
  communicationStyle: number;
  activityPreference: number;
  socialDynamics: number;
  lastUpdated: string;
}

/**
 * Analyzes text content using AI to generate compatibility scores
 * @param text The text content to analyze
 * @returns Promise with analysis scores
 */
export async function analyzeText(text: string): Promise<AIAnalysisScores> {
  try {
    // Call Supabase Edge Function for AI analysis
    const { data, error } = await supabase.functions.invoke("analyze-text", {
      body: { text },
    });

    if (error) throw error;
    if (!data) throw new Error("No analysis data received");

    return {
      communicationStyle: data.communicationStyle || 0.5,
      activityPreference: data.activityPreference || 0.5,
      socialDynamics: data.socialDynamics || 0.5,
      lastUpdated: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Error in text analysis:", error);
    // Return neutral scores in case of error
    return {
      communicationStyle: 0.5,
      activityPreference: 0.5,
      socialDynamics: 0.5,
      lastUpdated: new Date().toISOString(),
    };
  }
}

/**
 * Updates a user's AI analysis scores
 * @param userId The user's ID
 * @param scores The new analysis scores
 */
export async function updateUserAnalysisScores(
  userId: string,
  scores: AIAnalysisScores
): Promise<void> {
  try {
    const { error } = await supabase
      .from("profiles")
      .update({
        aiAnalysisScores: scores,
      })
      .eq("id", userId);

    if (error) throw error;
  } catch (error) {
    console.error("Error updating AI analysis scores:", error);
    throw error;
  }
}

/**
 * Calculates compatibility score between two users based on their AI analysis scores
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

  // Weighted average of similarity scores
  const weights = {
    communication: 0.4,
    activity: 0.3,
    social: 0.3,
  };

  return (
    communicationSimilarity * weights.communication +
    activitySimilarity * weights.activity +
    socialSimilarity * weights.social
  );
}

/**
 * Analyzes chat messages for a user and updates their AI analysis scores
 * @param userId The user's ID
 * @param messages Array of chat messages
 */
export async function analyzeUserChatMessages(
  userId: string,
  messages: { content: string; created_at: string }[]
): Promise<void> {
  try {
    // Combine recent messages into a single text for analysis
    const recentMessages = messages
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      .slice(0, 50) // Analyze last 50 messages
      .map((msg) => msg.content)
      .join(" ");

    if (recentMessages.length === 0) return;

    // Get current scores
    const { data: profile } = await supabase
      .from("profiles")
      .select("aiAnalysisScores")
      .eq("id", userId)
      .single();

    const currentScores = profile?.aiAnalysisScores || {
      communicationStyle: 0.5,
      activityPreference: 0.5,
      socialDynamics: 0.5,
      lastUpdated: new Date().toISOString(),
    };

    // Analyze new messages
    const newScores = await analyzeText(recentMessages);

    // Blend new scores with existing scores (70% weight to existing scores)
    const blendedScores = {
      communicationStyle:
        currentScores.communicationStyle * 0.7 +
        newScores.communicationStyle * 0.3,
      activityPreference:
        currentScores.activityPreference * 0.7 +
        newScores.activityPreference * 0.3,
      socialDynamics:
        currentScores.socialDynamics * 0.7 + newScores.socialDynamics * 0.3,
      lastUpdated: new Date().toISOString(),
    };

    // Update scores in database
    await updateUserAnalysisScores(userId, blendedScores);
  } catch (error) {
    console.error("Error analyzing chat messages:", error);
  }
}

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
