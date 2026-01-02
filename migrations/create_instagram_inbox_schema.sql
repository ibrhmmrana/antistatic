-- ============================================================
-- Antistatic: Instagram Inbox Schema
-- Safe for current state: drops inbox tables, upgrades cache
-- ============================================================

-- ------------------------------------------------------------
-- 0) Clean up old/broken inbox tables (DEV-FRIENDLY)
--    This guarantees we don't have half-baked schemas.
-- ------------------------------------------------------------
DROP TABLE IF EXISTS public.instagram_messages CASCADE;
DROP TABLE IF EXISTS public.instagram_conversations CASCADE;

-- ============================================================
-- 1) instagram_user_cache: add ig_account_id + profile_pic, etc.
-- ============================================================

-- Ensure base table exists (your existing schema is compatible)
CREATE TABLE IF NOT EXISTS public.instagram_user_cache (
  ig_user_id TEXT,
  username TEXT,
  name TEXT,
  profile_pic_url TEXT,
  last_fetched_at TIMESTAMPTZ,
  fail_count INTEGER DEFAULT 0,
  last_failed_at TIMESTAMPTZ,
  raw JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add new columns if they don't exist
ALTER TABLE public.instagram_user_cache
  ADD COLUMN IF NOT EXISTS ig_account_id TEXT,
  ADD COLUMN IF NOT EXISTS profile_pic TEXT,
  ADD COLUMN IF NOT EXISTS follower_count INTEGER,
  ADD COLUMN IF NOT EXISTS is_user_follow_business BOOLEAN,
  ADD COLUMN IF NOT EXISTS is_business_follow_user BOOLEAN;

-- If profile_pic_url exists, copy into profile_pic (once)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'instagram_user_cache'
      AND column_name  = 'profile_pic_url'
  ) THEN
    UPDATE public.instagram_user_cache
    SET profile_pic = profile_pic_url
    WHERE profile_pic IS NULL
      AND profile_pic_url IS NOT NULL;
  END IF;
END $$;

-- Backfill ig_account_id with a placeholder for existing rows
UPDATE public.instagram_user_cache
SET ig_account_id = COALESCE(ig_account_id, 'MIGRATION_PLACEHOLDER');

-- Drop old primary key on ig_user_id if it exists (we'll use composite UNIQUE instead)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM   information_schema.table_constraints
    WHERE  table_schema = 'public'
      AND  table_name   = 'instagram_user_cache'
      AND  constraint_type = 'PRIMARY KEY'
      AND  constraint_name = 'instagram_user_cache_pkey'
  ) THEN
    ALTER TABLE public.instagram_user_cache
      DROP CONSTRAINT instagram_user_cache_pkey;
  END IF;
END $$;

-- Add a UNIQUE constraint on (ig_account_id, ig_user_id) for ON CONFLICT upserts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   information_schema.table_constraints
    WHERE  table_schema = 'public'
      AND  table_name   = 'instagram_user_cache'
      AND  constraint_type = 'UNIQUE'
      AND  constraint_name = 'instagram_user_cache_ig_account_ig_user_unique'
  ) THEN
    ALTER TABLE public.instagram_user_cache
      ADD CONSTRAINT instagram_user_cache_ig_account_ig_user_unique
      UNIQUE (ig_account_id, ig_user_id);
  END IF;
END $$;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_instagram_user_cache_account_id
  ON public.instagram_user_cache(ig_account_id);

CREATE INDEX IF NOT EXISTS idx_instagram_user_cache_user_id
  ON public.instagram_user_cache(ig_user_id);

CREATE INDEX IF NOT EXISTS idx_instagram_user_cache_username
  ON public.instagram_user_cache(username) WHERE username IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_instagram_user_cache_last_fetched
  ON public.instagram_user_cache(last_fetched_at DESC);

-- ============================================================
-- 2) instagram_conversations: fresh, clean schema
-- ============================================================

CREATE TABLE public.instagram_conversations (
  id TEXT PRIMARY KEY,              -- conversation id from API
  ig_account_id TEXT NOT NULL,      -- IG professional account id
  participant_igsid TEXT NOT NULL,  -- Instagram-scoped user id (IGSID)
  updated_time TIMESTAMPTZ NOT NULL,
  last_message_preview TEXT,
  last_message_at TIMESTAMPTZ NOT NULL,
  unread_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique per IG account + participant
CREATE UNIQUE INDEX IF NOT EXISTS idx_instagram_conversations_unique
  ON public.instagram_conversations(ig_account_id, participant_igsid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_instagram_conversations_account_id
  ON public.instagram_conversations(ig_account_id);

CREATE INDEX IF NOT EXISTS idx_instagram_conversations_participant
  ON public.instagram_conversations(participant_igsid);

CREATE INDEX IF NOT EXISTS idx_instagram_conversations_updated
  ON public.instagram_conversations(updated_time DESC);

CREATE INDEX IF NOT EXISTS idx_instagram_conversations_last_message
  ON public.instagram_conversations(last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_instagram_conversations_unread
  ON public.instagram_conversations(unread_count) WHERE unread_count > 0;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_instagram_conversations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_instagram_conversations_updated_at
ON public.instagram_conversations;

CREATE TRIGGER update_instagram_conversations_updated_at
  BEFORE UPDATE ON public.instagram_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_instagram_conversations_updated_at();

-- ============================================================
-- 3) instagram_messages: fresh, clean schema
-- ============================================================

CREATE TABLE public.instagram_messages (
  id TEXT PRIMARY KEY, -- message_id from API or generated id
  ig_account_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES public.instagram_conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_id TEXT NOT NULL, -- IGSID or IG_ID
  to_id TEXT NOT NULL,   -- IGSID or IG_ID
  text TEXT,
  attachments JSONB,
  created_time TIMESTAMPTZ NOT NULL,
  read_at TIMESTAMPTZ,
  raw JSONB, -- store the raw API/webhook payload
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_instagram_messages_account_id
  ON public.instagram_messages(ig_account_id);

CREATE INDEX IF NOT EXISTS idx_instagram_messages_conversation
  ON public.instagram_messages(conversation_id);

CREATE INDEX IF NOT EXISTS idx_instagram_messages_account_conversation_time
  ON public.instagram_messages(ig_account_id, conversation_id, created_time);

CREATE INDEX IF NOT EXISTS idx_instagram_messages_from_id
  ON public.instagram_messages(ig_account_id, from_id);

CREATE INDEX IF NOT EXISTS idx_instagram_messages_created
  ON public.instagram_messages(created_time DESC);

CREATE INDEX IF NOT EXISTS idx_instagram_messages_attachments
  ON public.instagram_messages USING GIN(attachments)
  WHERE attachments IS NOT NULL;

-- ============================================================
-- 4) RLS + policies
-- ============================================================

ALTER TABLE public.instagram_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view own instagram conversations"  ON public.instagram_conversations;
DROP POLICY IF EXISTS "Users can insert own instagram conversations" ON public.instagram_conversations;
DROP POLICY IF EXISTS "Users can update own instagram conversations" ON public.instagram_conversations;
DROP POLICY IF EXISTS "Users can delete own instagram conversations" ON public.instagram_conversations;

DROP POLICY IF EXISTS "Users can view own instagram messages"   ON public.instagram_messages;
DROP POLICY IF EXISTS "Users can insert own instagram messages" ON public.instagram_messages;
DROP POLICY IF EXISTS "Users can update own instagram messages" ON public.instagram_messages;
DROP POLICY IF EXISTS "Users can delete own instagram messages" ON public.instagram_messages;

-- Conversations policies
CREATE POLICY "Users can view own instagram conversations"
  ON public.instagram_conversations FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.instagram_connections ic
      JOIN public.business_locations bl ON bl.id = ic.business_location_id
      WHERE ic.instagram_user_id = instagram_conversations.ig_account_id
        AND bl.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own instagram conversations"
  ON public.instagram_conversations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.instagram_connections ic
      JOIN public.business_locations bl ON bl.id = ic.business_location_id
      WHERE ic.instagram_user_id = instagram_conversations.ig_account_id
        AND bl.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own instagram conversations"
  ON public.instagram_conversations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.instagram_connections ic
      JOIN public.business_locations bl ON bl.id = ic.business_location_id
      WHERE ic.instagram_user_id = instagram_conversations.ig_account_id
        AND bl.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own instagram conversations"
  ON public.instagram_conversations FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.instagram_connections ic
      JOIN public.business_locations bl ON bl.id = ic.business_location_id
      WHERE ic.instagram_user_id = instagram_conversations.ig_account_id
        AND bl.user_id = auth.uid()
    )
  );

-- Messages policies
CREATE POLICY "Users can view own instagram messages"
  ON public.instagram_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.instagram_connections ic
      JOIN public.business_locations bl ON bl.id = ic.business_location_id
      WHERE ic.instagram_user_id = instagram_messages.ig_account_id
        AND bl.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own instagram messages"
  ON public.instagram_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.instagram_connections ic
      JOIN public.business_locations bl ON bl.id = ic.business_location_id
      WHERE ic.instagram_user_id = instagram_messages.ig_account_id
        AND bl.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own instagram messages"
  ON public.instagram_messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.instagram_connections ic
      JOIN public.business_locations bl ON bl.id = ic.business_location_id
      WHERE ic.instagram_user_id = instagram_messages.ig_account_id
        AND bl.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own instagram messages"
  ON public.instagram_messages FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.instagram_connections ic
      JOIN public.business_locations bl ON bl.id = ic.business_location_id
      WHERE ic.instagram_user_id = instagram_messages.ig_account_id
        AND bl.user_id = auth.uid()
    )
  );

-- Done
SELECT 'Instagram inbox migration complete' AS status;
