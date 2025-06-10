import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing required environment variables");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function getAccessToken(userId: string): Promise<string | null> {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select(
      "spotify_access_token, spotify_refresh_token, spotify_token_expires_at"
    )
    .eq("id", userId)
    .single();

  if (error || !profile) {
    console.error("Error fetching profile:", error);
    return null;
  }

  // Check if token is expired
  const expiresAt = new Date(profile.spotify_token_expires_at);
  if (expiresAt <= new Date()) {
    // Token is expired, refresh it
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(
          `${Deno.env.get("SPOTIFY_CLIENT_ID")}:${Deno.env.get(
            "SPOTIFY_CLIENT_SECRET"
          )}`
        )}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: profile.spotify_refresh_token,
      }),
    });

    if (!response.ok) {
      console.error("Error refreshing token:", await response.text());
      return null;
    }

    const data = await response.json();

    // Update the tokens in the database
    await supabase
      .from("profiles")
      .update({
        spotify_access_token: data.access_token,
        spotify_token_expires_at: new Date(
          Date.now() + data.expires_in * 1000
        ).toISOString(),
      })
      .eq("id", userId);

    return data.access_token;
  }

  return profile.spotify_access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { userId, action, playlistId } = await req.json();

    if (!userId) {
      throw new Error("User ID is required");
    }

    const accessToken = await getAccessToken(userId);
    if (!accessToken) {
      throw new Error("Could not get access token");
    }

    if (action === "get_playlists") {
      // Fetch user's playlists
      const response = await fetch(
        "https://api.spotify.com/v1/me/playlists?limit=50",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch playlists: ${response.statusText}`);
      }

      const data = await response.json();
      const playlists = data.items.map((playlist: any) => ({
        id: playlist.id,
        name: playlist.name,
        description: playlist.description,
        image: playlist.images[0]?.url,
        spotify_url: playlist.external_urls.spotify,
        owner: playlist.owner.display_name,
        tracks_count: playlist.tracks.total,
      }));

      return new Response(JSON.stringify({ playlists }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else if (action === "select_playlist" && playlistId) {
      // Get playlist details
      const response = await fetch(
        `https://api.spotify.com/v1/playlists/${playlistId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch playlist: ${response.statusText}`);
      }

      const playlist = await response.json();
      const playlistData = {
        id: playlist.id,
        name: playlist.name,
        description: playlist.description,
        image: playlist.images[0]?.url,
        spotify_url: playlist.external_urls.spotify,
        owner: playlist.owner.display_name,
        tracks_count: playlist.tracks.total,
      };

      // Update user's profile with selected playlist
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          spotify_selected_playlist: playlistData,
        })
        .eq("id", userId);

      if (updateError) {
        throw new Error(`Failed to update profile: ${updateError.message}`);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      throw new Error("Invalid action");
    }
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
