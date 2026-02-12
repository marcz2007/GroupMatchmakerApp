import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

serve(async (req) => {
  console.log("Received request to google-calendar-auth");

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { userId } = await req.json();
    console.log("Received user ID:", userId);

    if (!userId) {
      throw new Error("User ID is required");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const redirectUri = Deno.env.get("GOOGLE_CALENDAR_REDIRECT_URI");

    console.log("Environment check:", {
      hasClientId: !!clientId,
      hasRedirectUri: !!redirectUri,
      hasSupabaseUrl: !!supabaseUrl,
      hasAnonKey: !!supabaseAnonKey,
    });

    if (!supabaseUrl || !supabaseAnonKey || !clientId || !redirectUri) {
      throw new Error("Missing required environment variables");
    }

    console.log("Creating Supabase client...");
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

    // Generate a random state
    console.log("Generating state...");
    const state = crypto.randomUUID();

    // Store the state in the database
    console.log("Storing state in database...");
    const { error: insertError } = await supabaseClient
      .from("calendar_auth_states")
      .insert({
        id: crypto.randomUUID(),
        user_id: userId,
        state: state,
        provider: "google",
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error("Error storing state:", insertError);
      throw new Error(`Failed to store state: ${insertError.message}`);
    }

    console.log("State stored successfully:", state);

    // Construct the Google OAuth authorization URL
    // Request only calendar.readonly scope for privacy - we only need to see busy/free times
    const scopes = [
      "https://www.googleapis.com/auth/calendar.readonly",
    ].join(" ");

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.append("client_id", clientId);
    authUrl.searchParams.append("response_type", "code");
    authUrl.searchParams.append("redirect_uri", redirectUri);
    authUrl.searchParams.append("state", state);
    authUrl.searchParams.append("scope", scopes);
    authUrl.searchParams.append("access_type", "offline");
    authUrl.searchParams.append("prompt", "consent");

    console.log("Generated auth URL:", authUrl.toString());

    const responseBody = {
      authUrl: authUrl.toString(),
      state: state,
    };

    console.log("Sending response:", responseBody);

    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    const errorResponse = {
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    };
    console.error("Error response:", errorResponse);
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
