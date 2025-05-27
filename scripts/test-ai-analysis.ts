import { supabase } from "../src/supabase";
import { triggerAnalysisForAllUsers } from "../src/utils/aiAnalysis";

async function main() {
  console.log("Starting AI analysis test...");

  // Test bio analysis
  console.log("\nTesting bio analysis...");
  await triggerAnalysisForAllUsers("bio");

  // Get active groups
  const { data: groups, error } = await supabase
    .from("groups")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("Error fetching groups:", error);
    return;
  }

  if (groups && groups.length > 0) {
    // Test message analysis for the most recent group
    console.log("\nTesting message analysis for group:", groups[0].id);
    await triggerAnalysisForAllUsers("messages", groups[0].id);
  } else {
    console.log("\nNo groups found for message analysis");
  }

  console.log("\nAI analysis test completed!");
}

main().catch(console.error);
