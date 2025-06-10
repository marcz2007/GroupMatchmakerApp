import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SPOTIFY_CLIENT_ID = Deno.env.get("SPOTIFY_CLIENT_ID");
const SPOTIFY_CLIENT_SECRET = Deno.env.get("SPOTIFY_CLIENT_SECRET");
const SPOTIFY_REDIRECT_URI = Deno.env.get("SPOTIFY_REDIRECT_URI");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const APP_URL = Deno.env.get("APP_URL");

// Log environment variables (excluding sensitive ones)
console.log("Environment check:", {
  hasClientId: !!SPOTIFY_CLIENT_ID,
  hasClientSecret: !!SPOTIFY_CLIENT_SECRET,
  hasRedirectUri: !!SPOTIFY_REDIRECT_URI,
  hasSupabaseUrl: !!SUPABASE_URL,
  hasServiceRoleKey: !!SUPABASE_SERVICE_ROLE_KEY,
  hasAppUrl: !!APP_URL,
});

if (
  !SPOTIFY_CLIENT_ID ||
  !SPOTIFY_CLIENT_SECRET ||
  !SPOTIFY_REDIRECT_URI ||
  !SUPABASE_URL ||
  !SUPABASE_SERVICE_ROLE_KEY ||
  !APP_URL
) {
  throw new Error("Missing required environment variables");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function getTopGenres(accessToken: string): Promise<string[]> {
  try {
    const response = await fetch(
      "https://api.spotify.com/v1/me/top/artists?limit=50&time_range=medium_term",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch top artists: ${response.statusText}`);
    }

    const data = await response.json();
    const genres = new Set<string>();

    data.items.forEach((artist: any) => {
      artist.genres.forEach((genre: string) => genres.add(genre));
    });

    return Array.from(genres).slice(0, 5);
  } catch (error) {
    console.error("Error fetching top genres:", error);
    return [];
  }
}

async function getTopArtists(accessToken: string): Promise<any[]> {
  try {
    const response = await fetch(
      "https://api.spotify.com/v1/me/top/artists?limit=5&time_range=medium_term",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch top artists: ${response.statusText}`);
    }

    const data = await response.json();
    return data.items.map((artist: any) => ({
      name: artist.name,
      image: artist.images[0]?.url,
      spotify_url: artist.external_urls.spotify,
    }));
  } catch (error) {
    console.error("Error fetching top artists:", error);
    return [];
  }
}

function createHtmlResponse(message: string, redirectUrl: string) {
  return new Response(
    `<!DOCTYPE html>
    <html>
      <head>
        <title>Spotify Connection</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
            text-align: center;
            background-color: #121212;
            color: #ffffff;
          }
          .container {
            max-width: 600px;
            padding: 40px;
            background-color: #282828;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          }
          h1 {
            margin-bottom: 20px;
            color: #1DB954;
          }
          p {
            margin-bottom: 30px;
            line-height: 1.5;
          }
          .button {
            display: inline-block;
            padding: 12px 24px;
            background-color: #1DB954;
            color: white;
            text-decoration: none;
            border-radius: 500px;
            font-weight: bold;
            transition: background-color 0.3s ease;
          }
          .button:hover {
            background-color: #1ed760;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Spotify Connection</h1>
          <p>${message}</p>
          <a href="${redirectUrl}" class="button">Return to App</a>
        </div>
        <script>
          // Automatically redirect after 3 seconds
          setTimeout(() => {
            window.location.href = "${redirectUrl}";
          }, 3000);
        </script>
      </body>
    </html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        ...corsHeaders,
      },
    }
  );
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("=== Spotify Callback Function Started ===");
    console.log("Request URL:", req.url);
    console.log("Request method:", req.method);
    console.log("Request headers:", Object.fromEntries(req.headers.entries()));

    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    console.log("Request parameters:", { code, state, error });

    if (error) {
      console.error("Spotify authorization error:", error);
      return createHtmlResponse(
        `Error: ${error}. Please try connecting to Spotify again.`,
        APP_URL
      );
    }

    if (!code || !state) {
      console.error("Missing required parameters:", { code, state });
      return createHtmlResponse(
        "Missing required parameters. Please try connecting to Spotify again.",
        APP_URL
      );
    }

    console.log("Verifying state in database...");
    // Verify the state in the database
    const { data: stateData, error: stateError } = await supabase
      .from("spotify_auth_states")
      .select("user_id")
      .eq("state", state)
      .single();

    if (stateError) {
      console.error("Database error while verifying state:", stateError);
      return createHtmlResponse(
        "Error verifying state. Please try connecting to Spotify again.",
        APP_URL
      );
    }

    if (!stateData) {
      console.error("State not found in database:", state);
      return createHtmlResponse(
        "Invalid state parameter. Please try connecting to Spotify again.",
        APP_URL
      );
    }

    console.log("State verified successfully:", stateData);
    const userId = stateData.user_id;

    console.log("Exchanging authorization code for tokens...");
    // Exchange the authorization code for tokens
    const tokenResponse = await fetch(
      "https://accounts.spotify.com/api/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${btoa(
            `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`
          )}`,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: SPOTIFY_REDIRECT_URI,
        }),
      }
    );

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      console.error("Token exchange error:", errorData);
      return createHtmlResponse(
        "Failed to exchange authorization code. Please try again.",
        APP_URL
      );
    }

    const tokenData = await tokenResponse.json();
    console.log("Token exchange successful");

    // Get user's top genres and artists
    console.log("Fetching top genres and artists...");
    const [topGenres, topArtists] = await Promise.all([
      getTopGenres(tokenData.access_token),
      getTopArtists(tokenData.access_token),
    ]);
    console.log("Retrieved top genres:", topGenres);
    console.log("Retrieved top artists:", topArtists);

    // After getting the access token, fetch the user's profile
    console.log("Fetching Spotify user profile...");
    const profileResponse = await fetch("https://api.spotify.com/v1/me", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!profileResponse.ok) {
      console.error(
        "Error fetching Spotify profile:",
        await profileResponse.text()
      );
      throw new Error("Failed to fetch Spotify profile");
    }

    const spotifyProfile = await profileResponse.json();
    console.log("Spotify profile retrieved successfully");

    // Update the user's profile in the database
    console.log("Updating user profile in database...");
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        spotify_connected: true,
        spotify_top_genres: topGenres,
        spotify_top_artists: topArtists,
        spotify_refresh_token: tokenData.refresh_token,
        spotify_access_token: tokenData.access_token,
        spotify_token_expires_at: new Date(
          Date.now() + tokenData.expires_in * 1000
        ).toISOString(),
      })
      .eq("id", userId);

    if (updateError) {
      console.error("Error updating profile:", updateError);
      throw new Error("Failed to update profile");
    }

    console.log("Profile updated successfully");
    console.log("=== Spotify Callback Function Completed Successfully ===");

    return createHtmlResponse(
      "Successfully connected to Spotify! You can now close this window.",
      APP_URL
    );
  } catch (error) {
    console.error("Unexpected error in callback:", error);
    return createHtmlResponse(
      "An unexpected error occurred. Please try connecting to Spotify again.",
      APP_URL
    );
  }
});
