-- Instagram Messages Tables Migration
-- Creates tables for storing Instagram Direct Messages (DMs)
-- Idempotent: safe to run multiple times

-- 1) instagram_threads
CREATE TABLE IF NOT EXISTS public.instagram_threads (
  id TEXT PRIMARY KEY, -- thread_id from Instagram
  business_location_id UUID NOT NULL REFERENCES public.business_locations(id) ON DELETE CASCADE,
  ig_user_id TEXT NOT NULL,
  participants TEXT[], -- Array of participant usernames/IDs
  last_message_at TIMESTAMPTZ,
  unread_count INTEGER DEFAULT 0,
  raw JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2) instagram_messages
CREATE TABLE IF NOT EXISTS public.instagram_messages (
  id TEXT PRIMARY KEY, -- message_id from Instagram
  business_location_id UUID NOT NULL REFERENCES public.business_locations(id) ON DELETE CASCADE,
  ig_user_id TEXT NOT NULL,
  thread_id TEXT NOT NULL REFERENCES public.instagram_threads(id) ON DELETE CASCADE,
  from_id TEXT,
  from_username TEXT,
  text TEXT,
  created_time TIMESTAMPTZ,
  raw JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_instagram_threads_location ON public.instagram_threads(business_location_id);
CREATE INDEX IF NOT EXISTS idx_instagram_threads_last_message ON public.instagram_threads(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_instagram_messages_location ON public.instagram_messages(business_location_id);
CREATE INDEX IF NOT EXISTS idx_instagram_messages_thread ON public.instagram_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_instagram_messages_created ON public.instagram_messages(created_time DESC);

-- Drop triggers if they exist (idempotent)
DROP TRIGGER IF EXISTS update_instagram_threads_updated_at ON public.instagram_threads;
DROP TRIGGER IF EXISTS update_instagram_messages_updated_at ON public.instagram_messages;

-- Add updated_at triggers
CREATE TRIGGER update_instagram_threads_updated_at
  BEFORE UPDATE ON public.instagram_threads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_instagram_messages_updated_at
  BEFORE UPDATE ON public.instagram_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE public.instagram_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "Users can view own instagram threads" ON public.instagram_threads;
DROP POLICY IF EXISTS "Users can insert own instagram threads" ON public.instagram_threads;
DROP POLICY IF EXISTS "Users can update own instagram threads" ON public.instagram_threads;
DROP POLICY IF EXISTS "Users can delete own instagram threads" ON public.instagram_threads;

DROP POLICY IF EXISTS "Users can view own instagram messages" ON public.instagram_messages;
DROP POLICY IF EXISTS "Users can insert own instagram messages" ON public.instagram_messages;
DROP POLICY IF EXISTS "Users can update own instagram messages" ON public.instagram_messages;
DROP POLICY IF EXISTS "Users can delete own instagram messages" ON public.instagram_messages;

-- RLS Policies for instagram_threads
CREATE POLICY "Users can view own instagram threads"
  ON public.instagram_threads FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = instagram_threads.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own instagram threads"
  ON public.instagram_threads FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = instagram_threads.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own instagram threads"
  ON public.instagram_threads FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = instagram_threads.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own instagram threads"
  ON public.instagram_threads FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = instagram_threads.business_location_id
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

