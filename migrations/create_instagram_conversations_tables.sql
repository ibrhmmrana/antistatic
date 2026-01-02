-- Instagram Conversations and Messages Tables Migration
-- Creates tables for storing Instagram Direct Messages (DMs)
-- Idempotent: safe to run multiple times

-- 1) instagram_conversations
CREATE TABLE IF NOT EXISTS public.instagram_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_location_id UUID NOT NULL REFERENCES public.business_locations(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL, -- Instagram conversation ID
  participant_ig_user_id TEXT NOT NULL, -- The other participant's Instagram user ID
  participant_username TEXT, -- The other participant's username
  updated_time TIMESTAMPTZ,
  unread_count INTEGER DEFAULT 0,
  last_message_text TEXT,
  last_message_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_location_id, conversation_id)
);

-- 2) instagram_messages (update existing or create new)
-- Drop existing instagram_messages if it exists with old schema
DROP TABLE IF EXISTS public.instagram_messages CASCADE;

CREATE TABLE IF NOT EXISTS public.instagram_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_location_id UUID NOT NULL REFERENCES public.business_locations(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL, -- References instagram_conversations.conversation_id
  message_id TEXT NOT NULL, -- Instagram message ID
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_id TEXT NOT NULL, -- Instagram user ID who sent the message
  to_id TEXT NOT NULL, -- Instagram user ID who received the message
  text TEXT,
  created_time TIMESTAMPTZ NOT NULL,
  raw_payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_location_id, message_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_instagram_conversations_location ON public.instagram_conversations(business_location_id);
CREATE INDEX IF NOT EXISTS idx_instagram_conversations_updated ON public.instagram_conversations(updated_time DESC);
CREATE INDEX IF NOT EXISTS idx_instagram_conversations_unread ON public.instagram_conversations(unread_count) WHERE unread_count > 0;
CREATE INDEX IF NOT EXISTS idx_instagram_messages_location ON public.instagram_messages(business_location_id);
CREATE INDEX IF NOT EXISTS idx_instagram_messages_conversation ON public.instagram_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_instagram_messages_created ON public.instagram_messages(created_time DESC);
CREATE INDEX IF NOT EXISTS idx_instagram_messages_direction ON public.instagram_messages(direction);

-- Drop triggers if they exist (idempotent)
DROP TRIGGER IF EXISTS update_instagram_conversations_updated_at ON public.instagram_conversations;
DROP TRIGGER IF EXISTS update_instagram_messages_updated_at ON public.instagram_messages;

-- Add updated_at triggers
CREATE TRIGGER update_instagram_conversations_updated_at
  BEFORE UPDATE ON public.instagram_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_instagram_messages_updated_at
  BEFORE UPDATE ON public.instagram_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE public.instagram_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "Users can view own instagram conversations" ON public.instagram_conversations;
DROP POLICY IF EXISTS "Users can insert own instagram conversations" ON public.instagram_conversations;
DROP POLICY IF EXISTS "Users can update own instagram conversations" ON public.instagram_conversations;
DROP POLICY IF EXISTS "Users can delete own instagram conversations" ON public.instagram_conversations;

DROP POLICY IF EXISTS "Users can view own instagram messages" ON public.instagram_messages;
DROP POLICY IF EXISTS "Users can insert own instagram messages" ON public.instagram_messages;
DROP POLICY IF EXISTS "Users can update own instagram messages" ON public.instagram_messages;
DROP POLICY IF EXISTS "Users can delete own instagram messages" ON public.instagram_messages;

-- RLS Policies for instagram_conversations
CREATE POLICY "Users can view own instagram conversations"
  ON public.instagram_conversations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = instagram_conversations.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own instagram conversations"
  ON public.instagram_conversations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = instagram_conversations.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own instagram conversations"
  ON public.instagram_conversations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = instagram_conversations.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own instagram conversations"
  ON public.instagram_conversations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = instagram_conversations.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

-- RLS Policies for instagram_messages
CREATE POLICY "Users can view own instagram messages"
  ON public.instagram_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = instagram_messages.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own instagram messages"
  ON public.instagram_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = instagram_messages.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own instagram messages"
  ON public.instagram_messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = instagram_messages.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own instagram messages"
  ON public.instagram_messages FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = instagram_messages.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

