-- Migration: Fix Instagram Inbox ID Model
-- 
-- Root issue: ID model mismatch - comparing igAccountId (professional account id like 333...)
-- against message participant ids like 1784... (scoped IDs) is wrong.
--
-- This migration:
-- 1. Adds self_scoped_id column to store the correct "self" participant ID
-- 2. Drops dangerous unique index that causes conversation merging
-- 3. Ensures instagram_user_cache uniqueness is scoped properly
--
-- Run this migration before doing a clean resync

BEGIN;

-- Step 1: Add self_scoped_id column to instagram_connections
-- This stores the Instagram-scoped user ID (IGSID) that represents our own account
-- in conversations/messages (e.g., 1784...), NOT the professional account ID (e.g., 333...)
ALTER TABLE public.instagram_connections
ADD COLUMN IF NOT EXISTS self_scoped_id TEXT;

-- Add comment for clarity
COMMENT ON COLUMN public.instagram_connections.self_scoped_id IS 
'Instagram-scoped user ID (IGSID) that represents our own account in conversations/messages. '
'This is different from instagram_user_id (professional account ID). '
'Discovered by matching instagram_username against conversation participants.';

-- Step 2: Drop the dangerous unique index that causes conversation merging
-- This index on (ig_account_id, participant_igsid) can merge/overwrite unrelated conversations
-- if participant selection is wrong
DROP INDEX IF EXISTS public.idx_instagram_conversations_unique;

-- Step 3: Add columns to instagram_conversations for group chat support
-- We need to handle group chats where participant_igsid should be NULL or synthetic
ALTER TABLE public.instagram_conversations
ADD COLUMN IF NOT EXISTS is_group BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS participant_count INTEGER;

-- Update participant_igsid to allow NULL for group chats
ALTER TABLE public.instagram_conversations
ALTER COLUMN participant_igsid DROP NOT NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.instagram_conversations.is_group IS 
'True if this is a group chat (more than 2 participants). '
'For group chats, participant_igsid may be NULL or a synthetic value like GROUP:<conversation_id>.';
COMMENT ON COLUMN public.instagram_conversations.participant_count IS 
'Number of participants in the conversation. For 1:1 chats, this is 2.';

-- Step 4: Ensure instagram_user_cache uniqueness is scoped properly
-- Keep/ensure unique index on (ig_account_id, ig_user_id) (already added in previous migration)
-- Ensure ig_account_id is NOT NULL
DO $$
BEGIN
  -- Add unique index if it doesn't exist
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'instagram_user_cache'
      AND indexname = 'instagram_user_cache_ig_account_id_ig_user_id_unique'
  ) THEN
    CREATE UNIQUE INDEX instagram_user_cache_ig_account_id_ig_user_id_unique
    ON public.instagram_user_cache(ig_account_id, ig_user_id);
  END IF;
  
  -- Ensure ig_account_id is NOT NULL
  ALTER TABLE public.instagram_user_cache
  ALTER COLUMN ig_account_id SET NOT NULL;
EXCEPTION
  WHEN OTHERS THEN
    -- If column doesn't exist or constraint already exists, continue
    RAISE NOTICE 'Skipping constraint modification: %', SQLERRM;
END $$;

-- Step 5: Add helpful indexes for performance
CREATE INDEX IF NOT EXISTS idx_instagram_conversations_account_id_updated
  ON public.instagram_conversations(ig_account_id, updated_time DESC);

CREATE INDEX IF NOT EXISTS idx_instagram_conversations_is_group
  ON public.instagram_conversations(ig_account_id, is_group) WHERE is_group = TRUE;

COMMIT;

-- Verification queries (run these after migration to verify):
-- 
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'instagram_connections' AND column_name = 'self_scoped_id';
-- 
-- SELECT indexname FROM pg_indexes 
-- WHERE tablename = 'instagram_conversations' 
-- AND indexname = 'idx_instagram_conversations_unique';
-- (Should return 0 rows - index should be dropped)
-- 
-- SELECT COUNT(*) as null_ig_account_id 
-- FROM instagram_user_cache 
-- WHERE ig_account_id IS NULL;
-- (Should be 0)

