-- Add GBP-specific fields to social_studio_posts table
-- These fields store metadata for Google Business Profile posts

-- Add platform column (if not exists) - allows filtering by platform
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'social_studio_posts' AND column_name = 'platform'
  ) THEN
    ALTER TABLE public.social_studio_posts 
    ADD COLUMN platform TEXT;
    
    -- Set platform based on platforms array for existing rows
    -- If platforms contains 'google_business', set platform = 'google_business'
    UPDATE public.social_studio_posts
    SET platform = 'google_business'
    WHERE 'google_business' = ANY(platforms);
    
    COMMENT ON COLUMN public.social_studio_posts.platform IS 'Primary platform for this post (google_business, instagram, etc). Used for filtering and display.';
  END IF;
END $$;

-- Add media_url for storing single media URL (for GBP posts)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'social_studio_posts' AND column_name = 'media_url'
  ) THEN
    ALTER TABLE public.social_studio_posts 
    ADD COLUMN media_url TEXT;
    
    COMMENT ON COLUMN public.social_studio_posts.media_url IS 'Public URL for media (image/video) used in the post. For GBP, this is the sourceUrl from media[0].';
  END IF;
END $$;

-- Add cta JSONB for call-to-action data
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'social_studio_posts' AND column_name = 'cta'
  ) THEN
    ALTER TABLE public.social_studio_posts 
    ADD COLUMN cta JSONB;
    
    COMMENT ON COLUMN public.social_studio_posts.cta IS 'Call-to-action object: {actionType: string, url?: string}';
  END IF;
END $$;

-- Add gbp_local_post_name (unique identifier from GBP API)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'social_studio_posts' AND column_name = 'gbp_local_post_name'
  ) THEN
    ALTER TABLE public.social_studio_posts 
    ADD COLUMN gbp_local_post_name TEXT UNIQUE;
    
    -- Create index for faster lookups
    CREATE INDEX IF NOT EXISTS idx_social_studio_posts_gbp_local_post_name 
    ON public.social_studio_posts(gbp_local_post_name) 
    WHERE gbp_local_post_name IS NOT NULL;
    
    COMMENT ON COLUMN public.social_studio_posts.gbp_local_post_name IS 'GBP LocalPost resource name (e.g., accounts/.../locations/.../localPosts/...). Used as unique key for syncing.';
  END IF;
END $$;

-- Add gbp_search_url (optional search URL from GBP)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'social_studio_posts' AND column_name = 'gbp_search_url'
  ) THEN
    ALTER TABLE public.social_studio_posts 
    ADD COLUMN gbp_search_url TEXT;
    
    COMMENT ON COLUMN public.social_studio_posts.gbp_search_url IS 'Google Search URL for viewing the post on Google.';
  END IF;
END $$;

-- Add platform_meta JSONB for platform-specific metadata
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'social_studio_posts' AND column_name = 'platform_meta'
  ) THEN
    ALTER TABLE public.social_studio_posts 
    ADD COLUMN platform_meta JSONB;
    
    COMMENT ON COLUMN public.social_studio_posts.platform_meta IS 'Platform-specific metadata (e.g., raw GBP payload for debugging).';
  END IF;
END $$;

-- Update caption to be used as content/summary for GBP posts
-- (caption column already exists, no migration needed)

-- Add index for published_at for faster date range queries
CREATE INDEX IF NOT EXISTS idx_social_studio_posts_published_at 
ON public.social_studio_posts(published_at) 
WHERE published_at IS NOT NULL;

-- Add composite index for date range queries (scheduled_at OR published_at)
CREATE INDEX IF NOT EXISTS idx_social_studio_posts_date_range 
ON public.social_studio_posts(business_location_id, COALESCE(scheduled_at, published_at, created_at));


