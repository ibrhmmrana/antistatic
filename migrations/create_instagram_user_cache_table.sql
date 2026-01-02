-- Instagram User Cache Table Migration
-- Caches Instagram user information (username, profile pic) for DM participants
-- Idempotent: safe to run multiple times

CREATE TABLE IF NOT EXISTS public.instagram_user_cache (
  ig_user_id TEXT PRIMARY KEY,
  username TEXT,
  name TEXT,
  profile_pic_url TEXT,
  last_fetched_at TIMESTAMPTZ,
  fail_count INTEGER DEFAULT 0,
  last_failed_at TIMESTAMPTZ,
  raw JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_instagram_user_cache_username ON public.instagram_user_cache(username) WHERE username IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_instagram_user_cache_last_fetched ON public.instagram_user_cache(last_fetched_at DESC);

-- No RLS needed - this is a service-role only table for caching
-- Webhook handler uses service role client, so it can insert/update
-- API routes can read via service role or with proper RLS if needed

