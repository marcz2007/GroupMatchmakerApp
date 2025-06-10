-- Add word patterns column to profiles table
ALTER TABLE profiles
ADD COLUMN word_patterns JSONB DEFAULT '{
  "unigrams": [],
  "bigrams": [],
  "trigrams": [],
  "topWords": []
}'::jsonb;

-- Create an index for faster word pattern matching
CREATE INDEX idx_profiles_word_patterns ON profiles USING gin (word_patterns);

-- Create a function to calculate word pattern similarity between users
CREATE OR REPLACE FUNCTION calculate_word_pattern_similarity(
    user1_patterns JSONB,
    user2_patterns JSONB
) RETURNS FLOAT AS $$
DECLARE
    similarity FLOAT := 0;
    total_weight FLOAT := 0;
    unigram_weight FLOAT := 0.4;
    bigram_weight FLOAT := 0.3;
    trigram_weight FLOAT := 0.3;
BEGIN
    -- Calculate unigram similarity
    WITH unigram_overlap AS (
        SELECT COUNT(*) as overlap
        FROM jsonb_array_elements_text(user1_patterns->'unigrams') u1
        JOIN jsonb_array_elements_text(user2_patterns->'unigrams') u2
        ON u1 = u2
    )
    SELECT COALESCE(overlap::FLOAT / NULLIF(
        (jsonb_array_length(user1_patterns->'unigrams') + 
         jsonb_array_length(user2_patterns->'unigrams'))::FLOAT / 2, 0), 0)
    INTO similarity
    FROM unigram_overlap;

    total_weight := total_weight + unigram_weight;

    -- Calculate bigram similarity
    WITH bigram_overlap AS (
        SELECT COUNT(*) as overlap
        FROM jsonb_array_elements_text(user1_patterns->'bigrams') b1
        JOIN jsonb_array_elements_text(user2_patterns->'bigrams') b2
        ON b1 = b2
    )
    SELECT similarity + (COALESCE(overlap::FLOAT / NULLIF(
        (jsonb_array_length(user1_patterns->'bigrams') + 
         jsonb_array_length(user2_patterns->'bigrams'))::FLOAT / 2, 0), 0) * bigram_weight)
    INTO similarity
    FROM bigram_overlap;

    total_weight := total_weight + bigram_weight;

    -- Calculate trigram similarity
    WITH trigram_overlap AS (
        SELECT COUNT(*) as overlap
        FROM jsonb_array_elements_text(user1_patterns->'trigrams') t1
        JOIN jsonb_array_elements_text(user2_patterns->'trigrams') t2
        ON t1 = t2
    )
    SELECT similarity + (COALESCE(overlap::FLOAT / NULLIF(
        (jsonb_array_length(user1_patterns->'trigrams') + 
         jsonb_array_length(user2_patterns->'trigrams'))::FLOAT / 2, 0), 0) * trigram_weight)
    INTO similarity
    FROM trigram_overlap;

    total_weight := total_weight + trigram_weight;

    -- Normalize by total weight
    RETURN similarity / total_weight;
END;
$$ LANGUAGE plpgsql;

-- Create a function to find similar users based on word patterns
CREATE OR REPLACE FUNCTION find_similar_users_by_patterns(
    current_user_id UUID,
    similarity_threshold FLOAT DEFAULT 0.1,
    max_results INTEGER DEFAULT 10
)
RETURNS TABLE (
    user_id UUID,
    username TEXT,
    similarity_score FLOAT,
    common_patterns JSONB
) AS $$
BEGIN
    RETURN QUERY
    WITH current_user_patterns AS (
        SELECT word_patterns
        FROM profiles
        WHERE id = current_user_id
    ),
    pattern_similarities AS (
        SELECT 
            p.id,
            p.username,
            calculate_word_pattern_similarity(cu.word_patterns, p.word_patterns) as similarity,
            jsonb_build_object(
                'unigrams', (
                    SELECT jsonb_agg(u1)
                    FROM jsonb_array_elements_text(cu.word_patterns->'unigrams') u1
                    JOIN jsonb_array_elements_text(p.word_patterns->'unigrams') u2
                    ON u1 = u2
                ),
                'bigrams', (
                    SELECT jsonb_agg(b1)
                    FROM jsonb_array_elements_text(cu.word_patterns->'bigrams') b1
                    JOIN jsonb_array_elements_text(p.word_patterns->'bigrams') b2
                    ON b1 = b2
                ),
                'trigrams', (
                    SELECT jsonb_agg(t1)
                    FROM jsonb_array_elements_text(cu.word_patterns->'trigrams') t1
                    JOIN jsonb_array_elements_text(p.word_patterns->'trigrams') t2
                    ON t1 = t2
                )
            ) as common_patterns
        FROM profiles p
        CROSS JOIN current_user_patterns cu
        WHERE p.id != current_user_id
        AND p.word_patterns IS NOT NULL
        AND p.word_patterns != '{"unigrams":[],"bigrams":[],"trigrams":[],"topWords":[]}'::jsonb
    )
    SELECT 
        id as user_id,
        username,
        similarity as similarity_score,
        common_patterns
    FROM pattern_similarities
    WHERE similarity >= similarity_threshold
    ORDER BY similarity DESC
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql; 