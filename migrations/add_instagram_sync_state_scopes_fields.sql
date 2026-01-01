-- Add scopes tracking fields to instagram_sync_state
-- Idempotent migration

ALTER TABLE public.instagram_sync_state 
ADD COLUMN IF NOT EXISTS granted_scopes_list TEXT[],
ADD COLUMN IF NOT EXISTS missing_scopes_list TEXT[],
ADD COLUMN IF NOT EXISTS last_error_payload JSONB;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_instagram_sync_state_location ON public.instagram_sync_state(business_location_id);

