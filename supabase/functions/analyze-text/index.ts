import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Common English stopwords to filter out
const stopwords = new Set([
  "the",
  "be",
  "to",
  "of",
  "and",
  "a",
  "in",
  "that",
  "have",
  "i",
  "it",
  "for",
  "not",
  "on",
  "with",
  "he",
  "as",
  "you",
  "do",
  "at",
  "this",
  "but",
  "his",
  "by",
  "from",
  "they",
  "we",
  "say",
  "her",
  "she",
  "or",
  "an",
  "will",
  "my",
  "one",
  "all",
  "would",
  "there",
  "their",
  "what",
  "so",
  "up",
  "out",
  "if",
  "about",
  "who",
  "get",
  "which",
  "go",
  "me",
  "when",
  "make",
  "can",
  "like",
  "time",
  "no",
  "just",
  "him",
  "know",
  "take",
  "people",
  "into",
  "year",
  "your",
  "good",
  "some",
  "could",
  "them",
  "see",
  "other",
  "than",
  "then",
  "now",
  "look",
  "only",
  "come",
  "its",
  "over",
  "think",
  "also",
  "back",
  "after",
  "use",
  "two",
  "how",
  "our",
  "work",
  "first",
  "well",
  "way",
  "even",
  "new",
  "want",
  "because",
  "any",
  "these",
  "give",
  "day",
  "most",
  "us",
]);

// Function to generate n-grams from text
function generateNGrams(text: string, n: number): string[] {
  const words = text
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopwords.has(word));

  const ngrams: string[] = [];
  for (let i = 0; i <= words.length - n; i++) {
    ngrams.push(words.slice(i, i + n).join(" "));
  }
  return ngrams;
}

// Function to calculate TF-IDF scores
function calculateTFIDF(text: string, allTexts: string[]): Map<string, number> {
  const words = text
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopwords.has(word));

  const wordFreq = new Map<string, number>();
  words.forEach((word) => {
    wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
  });

  const tfidf = new Map<string, number>();
  const totalDocs = allTexts.length;

  wordFreq.forEach((freq, word) => {
    // Calculate TF (Term Frequency)
    const tf = freq / words.length;

    // Calculate IDF (Inverse Document Frequency)
    const docsWithWord = allTexts.filter((doc) =>
      doc.toLowerCase().includes(word)
    ).length;
    const idf = Math.log(totalDocs / (docsWithWord + 1));

    // Calculate TF-IDF
    tfidf.set(word, tf * idf);
  });

  return tfidf;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Log the raw request
    console.log("Raw request:", {
      method: req.method,
      headers: Object.fromEntries(req.headers.entries()),
    });

    const body = await req.json();
    console.log("Request body:", body);

    const { text, type, allTexts = [] } = body;
    console.log("Parsed request:", { text, type, allTexts });

    if (!text) {
      console.error("No text provided in request");
      throw new Error("No text provided for analysis");
    }

    // Generate n-grams (unigrams, bigrams, trigrams)
    const unigrams = generateNGrams(text, 1);
    const bigrams = generateNGrams(text, 2);
    const trigrams = generateNGrams(text, 3);

    console.log("Generated n-grams:", {
      unigramsCount: unigrams.length,
      bigramsCount: bigrams.length,
      trigramsCount: trigrams.length,
      sampleUnigrams: unigrams.slice(0, 5),
      sampleBigrams: bigrams.slice(0, 5),
      sampleTrigrams: trigrams.slice(0, 5),
    });

    // Calculate TF-IDF scores
    const tfidfScores = calculateTFIDF(text, allTexts);

    // Get top words by TF-IDF score
    const topWords = Array.from(tfidfScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([word, score]) => ({ word, score }));

    console.log("Generated top words:", {
      count: topWords.length,
      sample: topWords.slice(0, 5).map((w) => ({
        word: w.word,
        score: w.score.toFixed(3),
      })),
    });

    // Check if OpenRouter API key is set
    const openRouterApiKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!openRouterApiKey) {
      console.error("OPENROUTER_API_KEY is not set");
      throw new Error("OpenRouter API key is not configured");
    }

    // Create prompt for analysis
    const prompt = `Analyze the following ${
      type || "text"
    } and provide scores (0-1) for:
1. Communication style (formal/informal, detailed/brief, etc.)
2. Activity preferences (outdoor/indoor, social/solo, etc.)
3. Social dynamics (leadership/followership, group/solo oriented, etc.)

Text to analyze: "${text}"

Provide the scores in JSON format with these exact keys: communicationStyle, activityPreference, socialDynamics`;

    console.log("Sending prompt to OpenRouter:", prompt);

    try {
      // Get analysis from OpenRouter
      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openRouterApiKey}`,
            "HTTP-Referer": "https://nqtycfrgzjiehatokmfn.supabase.co",
            "X-Title": "GroupMatchmakerApp",
          },
          body: JSON.stringify({
            model: "anthropic/claude-3-haiku",
            messages: [
              {
                role: "system",
                content:
                  "You are an AI that analyzes text and provides scores for communication style, activity preferences, and social dynamics. Respond ONLY with a valid JSON object containing these exact keys: communicationStyle, activityPreference, socialDynamics. Each value should be a number between 0 and 1. Do not include any other text or explanation.",
              },
              {
                role: "user",
                content: prompt,
              },
            ],
            temperature: 0.3,
            max_tokens: 150,
          }),
        }
      );

      console.log("OpenRouter response status:", response.status);
      const responseText = await response.text();
      console.log("Raw OpenRouter response text:", responseText);

      if (!response.ok) {
        console.error("OpenRouter API error response:", responseText);
        throw new Error(
          `OpenRouter API error: ${response.status} ${response.statusText}`
        );
      }

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error("Error parsing OpenRouter response:", parseError);
        throw new Error(
          `Invalid JSON response from OpenRouter: ${parseError.message}`
        );
      }

      console.log("Parsed OpenRouter response:", data);

      const responseContent = data.choices?.[0]?.message?.content;
      if (!responseContent) {
        console.error("No response content in OpenRouter response:", data);
        throw new Error("No response content from OpenRouter");
      }

      console.log("Response content from OpenRouter:", responseContent);

      try {
        // Clean the response text to ensure it's valid JSON
        const cleanedResponse = responseContent
          .trim()
          .replace(/^```json\n?|\n?```$/g, "");
        console.log("Cleaned response text:", cleanedResponse);

        // Parse the JSON response
        const scores = JSON.parse(cleanedResponse);

        // Validate scores
        if (!scores || typeof scores !== "object") {
          throw new Error("Invalid scores format: not an object");
        }

        const requiredKeys = [
          "communicationStyle",
          "activityPreference",
          "socialDynamics",
        ];
        for (const key of requiredKeys) {
          if (typeof scores[key] !== "number") {
            throw new Error(`Invalid score for ${key}: not a number`);
          }
        }

        const validatedScores = {
          communicationStyle: Math.max(
            0,
            Math.min(1, scores.communicationStyle)
          ),
          activityPreference: Math.max(
            0,
            Math.min(1, scores.activityPreference)
          ),
          socialDynamics: Math.max(0, Math.min(1, scores.socialDynamics)),
        };

        console.log("Returning validated scores:", validatedScores);

        // Combine both analyses
        const analysis = {
          ...validatedScores,
          wordPatterns: {
            unigrams,
            bigrams,
            trigrams,
            topWords,
          },
          lastUpdated: new Date().toISOString(),
        };

        console.log(
          "Final analysis object:",
          JSON.stringify(analysis, null, 2)
        );

        const response = new Response(JSON.stringify(analysis), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });

        console.log("Response being sent:", await response.clone().text());
        return response;
      } catch (parseError) {
        console.error("Error parsing scores:", parseError);
        console.error("Failed response content:", responseContent);
        throw new Error(`Invalid scores format: ${parseError.message}`);
      }
    } catch (openRouterError) {
      console.error("OpenRouter API error:", openRouterError);
      throw new Error(
        `Failed to get analysis from OpenRouter: ${openRouterError.message}`
      );
    }
  } catch (error) {
    console.error("Error in analyze-text function:", error);
    return new Response(
      JSON.stringify({
        error: error.message,
        details: error.toString(),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
