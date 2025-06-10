import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_FUNCTION_URL = Deno.env.get("SUPABASE_FUNCTION_URL");

if (!SUPABASE_FUNCTION_URL) {
  throw new Error("Missing required environment variables");
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    console.log("Middleware received callback with:", {
      hasCode: !!code,
      hasState: !!state,
      hasError: !!error,
    });

    if (error) {
      console.error("Spotify authorization error:", error);
      return new Response(
        JSON.stringify({
          error: "Spotify authorization failed",
          details: error,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!code || !state) {
      console.error("Missing required parameters:", {
        code: !!code,
        state: !!state,
      });
      return new Response(
        JSON.stringify({ error: "Missing required parameters" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Forward the request to the actual callback function with authorization
    const response = await fetch(`${SUPABASE_FUNCTION_URL}/spotify-callback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state}`, // Use state as the token
      },
      body: JSON.stringify({
        code,
        state,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Callback function error:", errorData);
      return new Response(
        JSON.stringify({
          error: "Failed to process callback",
          details: errorData,
        }),
        {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Forward the response from the callback function
    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in middleware function:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
