// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

serve(async (req) => {
  console.log("Received request to spotify-auth");

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get the user ID from the request body
    const { userId } = await req.json();
    console.log("Received user ID:", userId);

    if (!userId) {
      throw new Error("User ID is required");
    }

    // Log environment variables (excluding sensitive ones)
    console.log("Environment check:", {
      hasClientId: !!Deno.env.get("SPOTIFY_CLIENT_ID"),
      hasRedirectUri: !!Deno.env.get("SPOTIFY_REDIRECT_URI"),
      hasSupabaseUrl: !!Deno.env.get("SUPABASE_URL"),
      hasAnonKey: !!Deno.env.get("SUPABASE_ANON_KEY"),
    });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const clientId = Deno.env.get("SPOTIFY_CLIENT_ID");
    const redirectUri = Deno.env.get("SPOTIFY_REDIRECT_URI");

    if (!supabaseUrl || !supabaseAnonKey || !clientId || !redirectUri) {
      throw new Error("Missing required environment variables");
    }

    console.log("Creating Supabase client...");
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

    // Generate a random state
    console.log("Generating state...");
    const state = crypto.randomUUID();
    const stateWithUserId = `${state}`;

    // Store the state in the database
    console.log("Storing state in database...");
    const { error: insertError } = await supabaseClient
      .from("spotify_auth_states")
      .insert({
        id: crypto.randomUUID(),
        user_id: userId, // Use the provided user ID
        state: stateWithUserId,
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error("Error storing state:", insertError);
      throw new Error(`Failed to store state: ${insertError.message}`);
    }

    console.log("State stored successfully:", stateWithUserId);

    // Construct the Spotify authorization URL
    const scopes = [
      "user-read-email",
      "user-read-private",
      "user-top-read",
      "user-read-recently-played",
    ].join(" ");

    const authUrl = new URL("https://accounts.spotify.com/authorize");
    authUrl.searchParams.append("client_id", clientId);
    authUrl.searchParams.append("response_type", "code");
    authUrl.searchParams.append("redirect_uri", redirectUri);
    authUrl.searchParams.append("state", stateWithUserId);
    authUrl.searchParams.append("scope", scopes);

    console.log("Generated auth URL:", authUrl.toString());

    const responseBody = {
      authUrl: authUrl.toString(),
      state: stateWithUserId,
    };

    console.log("Sending response:", responseBody);

    // Return the authorization URL
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
