-- Fix: Allow conversation creators to view their conversations
-- The issue is: user creates conversation, but can't SELECT it because they're not yet a participant

-- Drop existing SELECT policy
DROP POLICY IF EXISTS "Users can view conversations they participate in" ON public.chat_conversations;

-- Create new SELECT policy that also allows the creator to view
CREATE POLICY "Users can view conversations they created or participate in"
  ON public.chat_conversations
  FOR SELECT
  USING (
    created_by = auth.uid() 
    OR is_participant_in_conversation(id, auth.uid())
  );

-- Also need to fix the participant INSERT policy to allow creator to add themselves
-- The existing policy should work but let's verify by checking if creator can add themselves

-- The issue is the SELECT on chat_participants also needs the creator to be able to see participants
-- Update: Actually the participant SELECT policy uses is_participant_in_conversation which won't work for new conversations

-- Drop and recreate participant SELECT policy to allow creator to view
DROP POLICY IF EXISTS "Users can view participants in their conversations" ON public.chat_participants;

CREATE POLICY "Users can view participants in their conversations"
  ON public.chat_participants
  FOR SELECT
  USING (
    user_id = auth.uid() 
    OR is_participant_in_conversation(conversation_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM chat_conversations 
      WHERE id = conversation_id 
      AND created_by = auth.uid()
    )
  );