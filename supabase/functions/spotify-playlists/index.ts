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
  console.log("Received request:", {
    method: req.method,
    url: req.url,
    headers: Object.fromEntries(req.headers.entries()),
  });

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    console.log("Handling CORS preflight request");
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get the request body
    const requestData = await req.json();
    console.log("Request data:", requestData);

    const { userId, action, playlistId } = requestData;

    if (!userId) {
      console.error("Missing userId in request");
      return new Response(JSON.stringify({ error: "Missing userId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!action) {
      console.error("Missing action in request");
      return new Response(JSON.stringify({ error: "Missing action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Function to get access token
    const getAccessToken = async (userId: string) => {
      console.log("Getting access token for user:", userId);
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select(
          "spotify_access_token, spotify_refresh_token, spotify_token_expires_at"
        )
        .eq("id", userId)
        .single();

      if (profileError) {
        console.error("Error fetching profile:", profileError);
        throw new Error("Failed to fetch profile");
      }

      if (!profile.spotify_access_token || !profile.spotify_refresh_token) {
        console.error("No Spotify tokens found for user");
        throw new Error("No Spotify tokens found");
      }

      // Check if token is expired
      const expiresAt = new Date(profile.spotify_token_expires_at).getTime();
      const now = Date.now();
      console.log("Token expiration check:", {
        expiresAt,
        now,
        isExpired: now >= expiresAt,
      });

      if (now >= expiresAt) {
        console.log("Token expired, refreshing...");
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
          console.error("Failed to refresh token:", await response.text());
          throw new Error("Failed to refresh token");
        }

        const data = await response.json();
        console.log("Token refresh successful");

        // Update the tokens in the database
        const { error: updateError } = await supabase
          .from("profiles")
          .update({
            spotify_access_token: data.access_token,
            spotify_token_expires_at: new Date(
              Date.now() + data.expires_in * 1000
            ).toISOString(),
          })
          .eq("id", userId);

        if (updateError) {
          console.error("Error updating tokens:", updateError);
          throw new Error("Failed to update tokens");
        }

        return data.access_token;
      }

      return profile.spotify_access_token;
    };

    // Handle different actions
    if (action === "get_playlists") {
      console.log("Getting playlists for user:", userId);
      const accessToken = await getAccessToken(userId);
      console.log("Got access token, fetching playlists from Spotify");

      const response = await fetch(
        "https://api.spotify.com/v1/me/playlists?limit=50",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Spotify API error:", {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });
        return new Response(
          JSON.stringify({ error: "Failed to fetch playlists from Spotify" }),
          {
            status: response.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const data = await response.json();
      console.log("Successfully fetched playlists:", {
        count: data.items.length,
      });

      const playlists = data.items.map((playlist: any) => {
        console.log("Processing playlist:", {
          id: playlist.id,
          name: playlist.name,
          hasImages: playlist.images && playlist.images.length > 0,
        });

        return {
          id: playlist.id,
          name: playlist.name,
          description: playlist.description || "",
          image:
            playlist.images?.[0]?.url ||
            "https://community.spotify.com/t5/image/serverpage/image-id/55829iC2AD64ADB887E2A5/image-size/default?v=mpbl-1&px=-1",
          spotify_url: playlist.external_urls?.spotify || "",
          owner: playlist.owner?.display_name || "Unknown",
          tracks_count: playlist.tracks?.total || 0,
        };
      });

      return new Response(JSON.stringify({ playlists }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else if (action === "select_playlist") {
      if (!playlistId) {
        console.error("Missing playlistId for select_playlist action");
        return new Response(JSON.stringify({ error: "Missing playlistId" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log("Selecting playlist:", { userId, playlistId });
      const accessToken = await getAccessToken(userId);
      console.log("Got access token, fetching playlist details");

      const response = await fetch(
        `https://api.spotify.com/v1/playlists/${playlistId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Spotify API error:", {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });
        return new Response(
          JSON.stringify({ error: "Failed to fetch playlist details" }),
          {
            status: response.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const playlist = await response.json();
      console.log("Successfully fetched playlist details");

      const playlistData = {
        id: playlist.id,
        name: playlist.name,
        description: playlist.description,
        image: playlist.images[0]?.url,
        spotify_url: playlist.external_urls.spotify,
        owner: playlist.owner.display_name,
        tracks_count: playlist.tracks.total,
      };

      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          spotify_selected_playlist: playlistData,
        })
        .eq("id", userId);

      if (updateError) {
        console.error(
          "Error updating profile with selected playlist:",
          updateError
        );
        return new Response(
          JSON.stringify({ error: "Failed to update profile" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      console.log("Successfully updated profile with selected playlist");
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      console.error("Invalid action:", action);
      return new Response(JSON.stringify({ error: "Invalid action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
