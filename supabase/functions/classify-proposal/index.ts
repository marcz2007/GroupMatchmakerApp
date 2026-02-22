import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const VALID_CATEGORIES = ["social", "arts", "sport", "food", "travel", "wellness"];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the user's auth token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization header required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { proposal_id, title, description, estimated_cost, starts_at } = await req.json();
    if (!proposal_id || !title) {
      return new Response(
        JSON.stringify({ error: "proposal_id and title are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build the classification prompt
    const openRouterApiKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!openRouterApiKey) {
      throw new Error("OPENROUTER_API_KEY is not configured");
    }

    const proposalText = [
      `Title: ${title}`,
      description ? `Description: ${description}` : null,
      estimated_cost ? `Estimated cost: ${estimated_cost}` : null,
      starts_at ? `Starts at: ${starts_at}` : null,
    ].filter(Boolean).join("\n");

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openRouterApiKey}`,
        "HTTP-Referer": supabaseUrl,
        "X-Title": "GroupMatchmakerApp",
      },
      body: JSON.stringify({
        model: "anthropic/claude-3-haiku",
        messages: [
          {
            role: "system",
            content: `You classify event proposals into categories. Respond ONLY with a valid JSON object, no other text.

Categories and their subcategories:
- social: bar, pub, club, karaoke, house_party, picnic, hangout
- arts: theatre, cinema, gig, comedy, museum, gallery, concert
- sport: gym, run, hike, swim, football, tennis, climbing, cycling
- food: restaurant, cafe, brunch, dinner_party, cooking_class, food_market
- travel: day_trip, weekend_away, road_trip, city_break
- wellness: spa, yoga, meditation, walk

Genre is optional (mainly for arts/music, e.g. comedy, drama, jazz, rock, electronic, classical).

Return JSON with these exact keys:
- category: one of [social, arts, sport, food, travel, wellness]
- subcategory: a specific subcategory from the list above, or null
- genre: a genre string if applicable, or null
- confidence: a number 0-1 indicating how confident you are`,
          },
          {
            role: "user",
            content: `Classify this event proposal:\n${proposalText}`,
          },
        ],
        temperature: 0.2,
        max_tokens: 100,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenRouter API error:", response.status, errorText);
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json();
    const responseContent = data.choices?.[0]?.message?.content;
    if (!responseContent) {
      throw new Error("No response content from OpenRouter");
    }

    // Clean markdown code fences and parse JSON
    const cleanedResponse = responseContent.trim().replace(/^```json\n?|\n?```$/g, "");
    const classification = JSON.parse(cleanedResponse);

    // Validate category, fallback to "social" if invalid
    const category = VALID_CATEGORIES.includes(classification.category)
      ? classification.category
      : "social";
    const confidence = typeof classification.confidence === "number"
      ? Math.max(0, Math.min(1, classification.confidence))
      : 0.5;

    // Write to event_segments using service_role client
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { error: upsertError } = await supabase
      .from("event_segments")
      .upsert(
        {
          proposal_id,
          category,
          subcategory: classification.subcategory || null,
          genre: classification.genre || null,
          facets: {},
          model_version: "claude-3-haiku",
          confidence,
          source: "ai",
        },
        { onConflict: "proposal_id" }
      );

    if (upsertError) {
      console.error("Error upserting event_segments:", upsertError);
      throw new Error(`Database error: ${upsertError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        category,
        subcategory: classification.subcategory || null,
        genre: classification.genre || null,
        confidence,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in classify-proposal:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
