-- Instagram Direct Messages Tables Migration
-- Creates tables for storing Instagram DMs from Meta webhooks
-- Idempotent: safe to run multiple times

-- 1) instagram_dm_conversations
CREATE TABLE IF NOT EXISTS public.instagram_dm_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_location_id UUID NOT NULL REFERENCES public.business_locations(id) ON DELETE CASCADE,
  ig_account_id TEXT NOT NULL, -- The Instagram account ID for the connected professional account
  thread_key TEXT NOT NULL, -- Deterministic key e.g. sorted sender/recipient IDs
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_location_id, ig_account_id, thread_key)
);

-- 2) instagram_dm_messages
CREATE TABLE IF NOT EXISTS public.instagram_dm_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_location_id UUID NOT NULL REFERENCES public.business_locations(id) ON DELETE CASCADE,
  ig_account_id TEXT NOT NULL, -- Instagram account ID
  thread_key TEXT NOT NULL, -- References instagram_dm_conversations.thread_key
  message_mid TEXT, -- Instagram message ID (unique per account if available)
  sender_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  message_text TEXT,
  attachments JSONB,
  timestamp_ms BIGINT NOT NULL,
  raw_event JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_location_id, ig_account_id, message_mid)
);

-- 3) instagram_webhook_unmatched_events (for debugging)
CREATE TABLE IF NOT EXISTS public.instagram_webhook_unmatched_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ig_account_id TEXT,
  raw_payload JSONB NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_instagram_dm_conversations_location ON public.instagram_dm_conversations(business_location_id);
CREATE INDEX IF NOT EXISTS idx_instagram_dm_conversations_account ON public.instagram_dm_conversations(ig_account_id);
CREATE INDEX IF NOT EXISTS idx_instagram_dm_conversations_last_message ON public.instagram_dm_conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_instagram_dm_messages_location ON public.instagram_dm_messages(business_location_id);
CREATE INDEX IF NOT EXISTS idx_instagram_dm_messages_account ON public.instagram_dm_messages(ig_account_id);
CREATE INDEX IF NOT EXISTS idx_instagram_dm_messages_thread ON public.instagram_dm_messages(thread_key);
CREATE INDEX IF NOT EXISTS idx_instagram_dm_messages_timestamp ON public.instagram_dm_messages(business_location_id, ig_account_id, thread_key, timestamp_ms DESC);

-- Drop triggers if they exist (idempotent)
DROP TRIGGER IF EXISTS update_instagram_dm_conversations_updated_at ON public.instagram_dm_conversations;

-- Add updated_at trigger
CREATE TRIGGER update_instagram_dm_conversations_updated_at
  BEFORE UPDATE ON public.instagram_dm_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE public.instagram_dm_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_dm_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_webhook_unmatched_events ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "Users can view own instagram_dm_conversations" ON public.instagram_dm_conversations;
DROP POLICY IF EXISTS "Users can insert own instagram_dm_conversations" ON public.instagram_dm_conversations;
DROP POLICY IF EXISTS "Users can update own instagram_dm_conversations" ON public.instagram_dm_conversations;
DROP POLICY IF EXISTS "Users can delete own instagram_dm_conversations" ON public.instagram_dm_conversations;

DROP POLICY IF EXISTS "Users can view own instagram_dm_messages" ON public.instagram_dm_messages;
DROP POLICY IF EXISTS "Users can insert own instagram_dm_messages" ON public.instagram_dm_messages;
DROP POLICY IF EXISTS "Users can update own instagram_dm_messages" ON public.instagram_dm_messages;
DROP POLICY IF EXISTS "Users can delete own instagram_dm_messages" ON public.instagram_dm_messages;

DROP POLICY IF EXISTS "Users can view own instagram_webhook_unmatched_events" ON public.instagram_webhook_unmatched_events;
DROP POLICY IF EXISTS "Users can insert own instagram_webhook_unmatched_events" ON public.instagram_webhook_unmatched_events;

-- RLS Policies for instagram_dm_conversations
CREATE POLICY "Users can view own instagram_dm_conversations"
  ON public.instagram_dm_conversations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = instagram_dm_conversations.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own instagram_dm_conversations"
  ON public.instagram_dm_conversations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = instagram_dm_conversations.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own instagram_dm_conversations"
  ON public.instagram_dm_conversations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = instagram_dm_conversations.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own instagram_dm_conversations"
  ON public.instagram_dm_conversations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = instagram_dm_conversations.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

-- RLS Policies for instagram_dm_messages
CREATE POLICY "Users can view own instagram_dm_messages"
  ON public.instagram_dm_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = instagram_dm_messages.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own instagram_dm_messages"
  ON public.instagram_dm_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = instagram_dm_messages.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own instagram_dm_messages"
  ON public.instagram_dm_messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = instagram_dm_messages.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own instagram_dm_messages"
  ON public.instagram_dm_messages FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = instagram_dm_messages.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

-- RLS Policies for instagram_webhook_unmatched_events (admin only for debugging)
CREATE POLICY "Users can view own instagram_webhook_unmatched_events"
  ON public.instagram_webhook_unmatched_events FOR SELECT
  USING (true); -- Allow viewing for debugging (can restrict later)

CREATE POLICY "Users can insert own instagram_webhook_unmatched_events"
  ON public.instagram_webhook_unmatched_events FOR INSERT
  WITH CHECK (true); -- System can insert unmatched events
