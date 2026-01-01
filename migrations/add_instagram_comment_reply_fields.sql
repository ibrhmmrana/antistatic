-- Add reply fields to instagram_comments table
-- Idempotent migration

ALTER TABLE public.instagram_comments 
ADD COLUMN IF NOT EXISTS reply_text TEXT,
ADD COLUMN IF NOT EXISTS reply_status TEXT DEFAULT 'pending' CHECK (reply_status IN ('pending', 'sent', 'failed'));

-- Update existing replied comments to have status 'sent'
UPDATE public.instagram_comments 
SET reply_status = 'sent' 
WHERE replied = true AND reply_status IS NULL;

