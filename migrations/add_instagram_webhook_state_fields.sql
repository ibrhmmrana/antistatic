-- Add webhook state tracking fields to instagram_sync_state
-- Idempotent: safe to run multiple times

ALTER TABLE public.instagram_sync_state 
  ADD COLUMN IF NOT EXISTS webhook_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_webhook_event_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_webhook_error TEXT;

