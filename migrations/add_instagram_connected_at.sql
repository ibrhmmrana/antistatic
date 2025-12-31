-- Add connected_at column to instagram_connections table (idempotent)
-- This migration is safe to run multiple times

ALTER TABLE public.instagram_connections 
ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ DEFAULT NOW();

-- Update existing rows that don't have connected_at set
UPDATE public.instagram_connections 
SET connected_at = created_at 
WHERE connected_at IS NULL;

