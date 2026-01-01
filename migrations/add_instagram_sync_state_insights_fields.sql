-- Add insights availability fields to instagram_sync_state
-- Idempotent migration

ALTER TABLE public.instagram_sync_state 
ADD COLUMN IF NOT EXISTS insights_available BOOLEAN DEFAULT NULL,
ADD COLUMN IF NOT EXISTS last_error_code TEXT,
ADD COLUMN IF NOT EXISTS last_error_message TEXT;

