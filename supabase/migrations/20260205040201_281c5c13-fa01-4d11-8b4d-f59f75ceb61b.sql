-- =============================================
-- CHAT SYSTEM DATABASE SCHEMA
-- =============================================

-- 1. Create chat_conversations table
CREATE TABLE public.chat_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_type TEXT NOT NULL DEFAULT 'direct' CHECK (conversation_type IN ('direct', 'group')),
  name TEXT, -- Group name (null for direct conversations)
  created_by UUID REFERENCES public.profiles(id),
  last_message_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create chat_participants table
CREATE TABLE public.chat_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_admin BOOLEAN DEFAULT false,
  last_read_at TIMESTAMPTZ DEFAULT now(),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, user_id)
);

-- 3. Create chat_messages table
CREATE TABLE public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id),
  content TEXT,
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'file', 'task_share')),
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  file_url TEXT,
  file_name TEXT,
  file_size INTEGER,
  is_edited BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Create chat_message_reactions table
CREATE TABLE public.chat_message_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

-- 5. Create indexes for performance
CREATE INDEX idx_chat_messages_conversation_id ON public.chat_messages(conversation_id);
CREATE INDEX idx_chat_messages_created_at ON public.chat_messages(created_at DESC);
CREATE INDEX idx_chat_participants_user_id ON public.chat_participants(user_id);
CREATE INDEX idx_chat_participants_conversation_id ON public.chat_participants(conversation_id);
CREATE INDEX idx_chat_conversations_org_id ON public.chat_conversations(org_id);
CREATE INDEX idx_chat_conversations_last_message_at ON public.chat_conversations(last_message_at DESC);

-- 6. Enable RLS on all tables
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_message_reactions ENABLE ROW LEVEL SECURITY;

-- 7. Create SECURITY DEFINER function to check participant status (prevents RLS infinite recursion)
CREATE OR REPLACE FUNCTION public.is_participant_in_conversation(conv_id UUID, check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM chat_participants
    WHERE conversation_id = conv_id AND user_id = check_user_id
  );
END;
$$;

-- 8. Create SECURITY DEFINER function to check if user is admin of conversation
CREATE OR REPLACE FUNCTION public.is_admin_of_conversation(conv_id UUID, check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM chat_participants
    WHERE conversation_id = conv_id AND user_id = check_user_id AND is_admin = true
  );
END;
$$;

-- =============================================
-- RLS POLICIES FOR chat_conversations
-- =============================================

CREATE POLICY "Users can view conversations they participate in"
  ON public.chat_conversations FOR SELECT
  USING (is_participant_in_conversation(id, auth.uid()));

CREATE POLICY "Authenticated users can create conversations"
  ON public.chat_conversations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND created_by = auth.uid());

CREATE POLICY "Admins can update their group conversations"
  ON public.chat_conversations FOR UPDATE
  USING (is_admin_of_conversation(id, auth.uid()));

-- =============================================
-- RLS POLICIES FOR chat_participants
-- =============================================

CREATE POLICY "Users can view participants in their conversations"
  ON public.chat_participants FOR SELECT
  USING (is_participant_in_conversation(conversation_id, auth.uid()));

CREATE POLICY "Conversation creator can add initial participants"
  ON public.chat_participants FOR INSERT
  WITH CHECK (
    -- Either adding themselves
    user_id = auth.uid()
    -- Or they are the creator of the conversation
    OR EXISTS (
      SELECT 1 FROM chat_conversations 
      WHERE id = conversation_id AND created_by = auth.uid()
    )
    -- Or they are an admin of the conversation
    OR is_admin_of_conversation(conversation_id, auth.uid())
  );

CREATE POLICY "Users can update their own participant record"
  ON public.chat_participants FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can leave or admins can remove participants"
  ON public.chat_participants FOR DELETE
  USING (
    user_id = auth.uid() -- Can leave themselves
    OR is_admin_of_conversation(conversation_id, auth.uid()) -- Admins can remove others
  );

-- =============================================
-- RLS POLICIES FOR chat_messages
-- =============================================

CREATE POLICY "Users can view messages in their conversations"
  ON public.chat_messages FOR SELECT
  USING (is_participant_in_conversation(conversation_id, auth.uid()));

CREATE POLICY "Users can send messages to their conversations"
  ON public.chat_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid() AND
    is_participant_in_conversation(conversation_id, auth.uid())
  );

CREATE POLICY "Users can edit their own messages"
  ON public.chat_messages FOR UPDATE
  USING (sender_id = auth.uid());

CREATE POLICY "Users can delete their own messages"
  ON public.chat_messages FOR DELETE
  USING (sender_id = auth.uid());

-- =============================================
-- RLS POLICIES FOR chat_message_reactions
-- =============================================

CREATE POLICY "Users can view reactions in their conversations"
  ON public.chat_message_reactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM chat_messages m
      WHERE m.id = message_id
        AND is_participant_in_conversation(m.conversation_id, auth.uid())
    )
  );

CREATE POLICY "Users can add reactions"
  ON public.chat_message_reactions FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM chat_messages m
      WHERE m.id = message_id
        AND is_participant_in_conversation(m.conversation_id, auth.uid())
    )
  );

CREATE POLICY "Users can remove their reactions"
  ON public.chat_message_reactions FOR DELETE
  USING (user_id = auth.uid());

-- =============================================
-- TRIGGERS
-- =============================================

-- Trigger to update last_message_at when new message is inserted
CREATE OR REPLACE FUNCTION public.update_conversation_last_message_at()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE chat_conversations
  SET last_message_at = NEW.created_at, updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_update_conversation_last_message
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_conversation_last_message_at();

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_chat_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_chat_conversations_updated_at
  BEFORE UPDATE ON public.chat_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_chat_updated_at();

CREATE TRIGGER trigger_chat_messages_updated_at
  BEFORE UPDATE ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_chat_updated_at();

-- =============================================
-- ENABLE REALTIME
-- =============================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_message_reactions;

-- =============================================
-- STORAGE BUCKET FOR CHAT ATTACHMENTS
-- =============================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for chat attachments
CREATE POLICY "Users can upload chat attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'chat-attachments' AND
    auth.uid() IS NOT NULL AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view chat attachments"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'chat-attachments' AND 
    auth.uid() IS NOT NULL
  );

CREATE POLICY "Users can delete their own chat attachments"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'chat-attachments' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );