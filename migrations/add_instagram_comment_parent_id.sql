-- Add parent_comment_id to instagram_comments table to support nested replies
-- Idempotent migration

ALTER TABLE public.instagram_comments 
ADD COLUMN IF NOT EXISTS parent_comment_id TEXT REFERENCES public.instagram_comments(id) ON DELETE CASCADE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_instagram_comments_parent ON public.instagram_comments(parent_comment_id);

