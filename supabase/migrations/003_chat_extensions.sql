-- ============================================
-- CHAT EXTENSION VOTES
-- ============================================

-- Add chat_expires_at column to event_rooms
ALTER TABLE event_rooms ADD COLUMN IF NOT EXISTS chat_expires_at TIMESTAMPTZ;

-- Backfill existing event rooms
UPDATE event_rooms
SET chat_expires_at = COALESCE(ends_at + INTERVAL '48 hours', created_at + INTERVAL '72 hours')
WHERE chat_expires_at IS NULL;

-- Create chat_extension_votes table
CREATE TABLE IF NOT EXISTS chat_extension_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_room_id UUID NOT NULL REFERENCES event_rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    vote BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(event_room_id, user_id)
);

CREATE INDEX idx_chat_extension_votes_event_room ON chat_extension_votes(event_room_id);

-- Enable RLS
ALTER TABLE chat_extension_votes ENABLE ROW LEVEL SECURITY;

-- RLS: participants can view votes for their event rooms
CREATE POLICY "Participants can view extension votes"
ON chat_extension_votes FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM event_room_participants
        WHERE event_room_id = chat_extension_votes.event_room_id
        AND user_id = auth.uid()
    )
);

-- RLS: participants can insert/update their own votes
CREATE POLICY "Participants can vote"
ON chat_extension_votes FOR INSERT
WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
        SELECT 1 FROM event_room_participants
        WHERE event_room_id = chat_extension_votes.event_room_id
        AND user_id = auth.uid()
    )
);

CREATE POLICY "Participants can update own vote"
ON chat_extension_votes FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ============================================
-- Vote to extend chat RPC
-- ============================================
CREATE OR REPLACE FUNCTION vote_to_extend_chat(p_event_room_id UUID, p_vote BOOLEAN)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_expires_at TIMESTAMPTZ;
    v_yes_count INTEGER;
    v_total_participants INTEGER;
    v_extended BOOLEAN := false;
    v_new_expires_at TIMESTAMPTZ;
BEGIN
    -- Verify participant
    IF NOT EXISTS (
        SELECT 1 FROM event_room_participants
        WHERE event_room_id = p_event_room_id
        AND user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Not a participant in this event';
    END IF;

    -- Get current expiry
    SELECT chat_expires_at INTO v_expires_at
    FROM event_rooms
    WHERE id = p_event_room_id;

    -- Verify within 24h of expiry
    IF v_expires_at IS NULL OR v_expires_at - INTERVAL '24 hours' > NOW() THEN
        RAISE EXCEPTION 'Voting is not open yet';
    END IF;

    IF v_expires_at <= NOW() THEN
        RAISE EXCEPTION 'Chat has already expired';
    END IF;

    -- Upsert vote
    INSERT INTO chat_extension_votes (event_room_id, user_id, vote)
    VALUES (p_event_room_id, auth.uid(), p_vote)
    ON CONFLICT (event_room_id, user_id)
    DO UPDATE SET vote = p_vote, created_at = NOW();

    -- Count votes and participants
    SELECT COUNT(*) FILTER (WHERE vote = true)
    INTO v_yes_count
    FROM chat_extension_votes
    WHERE event_room_id = p_event_room_id;

    SELECT COUNT(*)
    INTO v_total_participants
    FROM event_room_participants
    WHERE event_room_id = p_event_room_id;

    -- Check if all participants have voted
    IF (SELECT COUNT(*) FROM chat_extension_votes WHERE event_room_id = p_event_room_id) >= v_total_participants THEN
        IF v_yes_count > 0 THEN
            -- Extend chat for YES voters
            v_new_expires_at := v_expires_at + INTERVAL '48 hours';

            UPDATE event_rooms
            SET chat_expires_at = v_new_expires_at
            WHERE id = p_event_room_id;

            -- Remove participants who voted NO
            DELETE FROM event_room_participants
            WHERE event_room_id = p_event_room_id
            AND user_id IN (
                SELECT user_id FROM chat_extension_votes
                WHERE event_room_id = p_event_room_id
                AND vote = false
            );

            -- Clear votes for next round
            DELETE FROM chat_extension_votes
            WHERE event_room_id = p_event_room_id;

            v_extended := true;
        ELSE
            -- Everyone voted NO — let it expire naturally
            v_new_expires_at := v_expires_at;
        END IF;
    ELSE
        v_new_expires_at := v_expires_at;
    END IF;

    RETURN json_build_object(
        'success', true,
        'extended', v_extended,
        'new_expires_at', v_new_expires_at,
        'yes_count', v_yes_count,
        'total_participants', v_total_participants,
        'all_voted', (SELECT COUNT(*) FROM chat_extension_votes WHERE event_room_id = p_event_room_id) >= v_total_participants
    );
END;
$$;

-- ============================================
-- Get chat extension status RPC
-- ============================================
CREATE OR REPLACE FUNCTION get_chat_extension_status(p_event_room_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_expires_at TIMESTAMPTZ;
    v_my_vote BOOLEAN;
    v_yes_count INTEGER;
    v_total_participants INTEGER;
    v_voting_active BOOLEAN;
BEGIN
    -- Verify participant
    IF NOT EXISTS (
        SELECT 1 FROM event_room_participants
        WHERE event_room_id = p_event_room_id
        AND user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Not a participant in this event';
    END IF;

    -- Get expiry
    SELECT chat_expires_at INTO v_expires_at
    FROM event_rooms
    WHERE id = p_event_room_id;

    -- Check if voting is active (within 24h of expiry and not yet expired)
    v_voting_active := v_expires_at IS NOT NULL
        AND v_expires_at - INTERVAL '24 hours' <= NOW()
        AND v_expires_at > NOW();

    -- Get my vote
    SELECT vote INTO v_my_vote
    FROM chat_extension_votes
    WHERE event_room_id = p_event_room_id
    AND user_id = auth.uid();

    -- Count yes votes
    SELECT COUNT(*) FILTER (WHERE vote = true)
    INTO v_yes_count
    FROM chat_extension_votes
    WHERE event_room_id = p_event_room_id;

    -- Count total participants
    SELECT COUNT(*)
    INTO v_total_participants
    FROM event_room_participants
    WHERE event_room_id = p_event_room_id;

    RETURN json_build_object(
        'voting_active', v_voting_active,
        'my_vote', v_my_vote,
        'yes_count', v_yes_count,
        'total_votes', (SELECT COUNT(*) FROM chat_extension_votes WHERE event_room_id = p_event_room_id),
        'total_participants', v_total_participants,
        'expires_at', v_expires_at
    );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION vote_to_extend_chat TO authenticated;
GRANT EXECUTE ON FUNCTION get_chat_extension_status TO authenticated;
