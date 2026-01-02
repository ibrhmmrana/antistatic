-- Instagram DM Unmatched Events Table Migration
-- Stores webhook events that couldn't be matched to a business_location_id
-- Idempotent: safe to run multiple times

CREATE TABLE IF NOT EXISTS public.instagram_dm_unmatched_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ig_account_id TEXT NOT NULL,
  message_id TEXT,
  payload_json JSONB NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_instagram_dm_unmatched_events_ig_account ON public.instagram_dm_unmatched_events(ig_account_id);
CREATE INDEX IF NOT EXISTS idx_instagram_dm_unmatched_events_created ON public.instagram_dm_unmatched_events(created_at DESC);

-- No RLS needed - this is for debugging/admin use only
-- Service role can insert, but we'll add a policy for admin access if needed

