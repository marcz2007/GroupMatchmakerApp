-- Create enum for suggestion status
CREATE TYPE suggestion_status AS ENUM ('pending', 'approved', 'rejected');

-- Create enum for vote type
CREATE TYPE vote_type AS ENUM ('yes', 'no', 'maybe');

-- Create table for activity suggestions
CREATE TABLE group_activity_suggestions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    suggestion TEXT NOT NULL,
    suggested_date TIMESTAMP WITH TIME ZONE,
    location TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    status suggestion_status DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create table for votes
CREATE TABLE activity_suggestion_votes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    suggestion_id UUID REFERENCES group_activity_suggestions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    vote vote_type NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(suggestion_id, user_id)
);

-- Create function to check if suggestion should be approved
CREATE OR REPLACE FUNCTION check_suggestion_approval()
RETURNS TRIGGER AS $$
DECLARE
    total_members INTEGER;
    yes_votes INTEGER;
    suggestion_status suggestion_status;
BEGIN
    -- Get total number of group members
    SELECT COUNT(*) INTO total_members
    FROM group_members
    WHERE group_id = (
        SELECT group_id
        FROM group_activity_suggestions
        WHERE id = NEW.suggestion_id
    );

    -- Get number of yes votes
    SELECT COUNT(*) INTO yes_votes
    FROM activity_suggestion_votes
    WHERE suggestion_id = NEW.suggestion_id
    AND vote = 'yes';

    -- If 33% or more members have voted yes, approve the suggestion
    IF (yes_votes::float / total_members) >= 0.33 THEN
        UPDATE group_activity_suggestions
        SET status = 'approved'
        WHERE id = NEW.suggestion_id
        RETURNING status INTO suggestion_status;

        -- If suggestion was just approved, create a chat message
        IF suggestion_status = 'approved' THEN
            INSERT INTO messages (
                group_id,
                user_id,
                content,
                type
            )
            SELECT 
                g.group_id,
                g.created_by,
                format(
                    '🎉 Activity Approved! %s%s%s',
                    g.suggestion,
                    CASE WHEN g.suggested_date IS NOT NULL 
                        THEN format(' on %s', g.suggested_date::date)
                        ELSE ''
                    END,
                    CASE WHEN g.location IS NOT NULL 
                        THEN format(' at %s', g.location)
                        ELSE ''
                    END
                ),
                'activity_approved'
            FROM group_activity_suggestions g
            WHERE g.id = NEW.suggestion_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to check for approval after each vote
CREATE TRIGGER check_suggestion_approval_trigger
AFTER INSERT ON activity_suggestion_votes
FOR EACH ROW
EXECUTE FUNCTION check_suggestion_approval();

-- Create RLS policies
ALTER TABLE group_activity_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_suggestion_votes ENABLE ROW LEVEL SECURITY;

-- Policies for group_activity_suggestions
CREATE POLICY "Users can view suggestions for groups they are members of"
    ON group_activity_suggestions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM group_members
            WHERE group_id = group_activity_suggestions.group_id
            AND user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create suggestions for groups they are members of"
    ON group_activity_suggestions FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM group_members
            WHERE group_id = group_activity_suggestions.group_id
            AND user_id = auth.uid()
        )
    );

-- Policies for activity_suggestion_votes
CREATE POLICY "Users can view votes for suggestions in their groups"
    ON activity_suggestion_votes FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM group_members gm
            JOIN group_activity_suggestions gas ON gas.group_id = gm.group_id
            WHERE gas.id = activity_suggestion_votes.suggestion_id
            AND gm.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can vote on suggestions in their groups"
    ON activity_suggestion_votes FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM group_members gm
            JOIN group_activity_suggestions gas ON gas.group_id = gm.group_id
            WHERE gas.id = activity_suggestion_votes.suggestion_id
            AND gm.user_id = auth.uid()
        )
    ); 