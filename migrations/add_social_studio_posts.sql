-- Social Studio Posts Table Migration
-- Creates table for scheduled social media posts
-- Idempotent: safe to run multiple times

CREATE TABLE IF NOT EXISTS public.social_studio_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_location_id UUID NOT NULL REFERENCES public.business_locations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'published', 'failed')),
  platforms TEXT[] NOT NULL DEFAULT '{}',
  topic TEXT,
  caption TEXT,
  media JSONB DEFAULT '[]'::jsonb,
  link_url TEXT,
  utm JSONB,
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT platforms_not_empty CHECK (array_length(platforms, 1) > 0)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_social_studio_posts_business_location_scheduled 
  ON public.social_studio_posts(business_location_id, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_social_studio_posts_business_location_status 
  ON public.social_studio_posts(business_location_id, status);

CREATE INDEX IF NOT EXISTS idx_social_studio_posts_scheduled_at 
  ON public.social_studio_posts(scheduled_at) WHERE scheduled_at IS NOT NULL;

-- RLS Policies (following existing patterns)
ALTER TABLE public.social_studio_posts ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see posts for their business locations
CREATE POLICY "Users can view their own posts"
  ON public.social_studio_posts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = social_studio_posts.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

-- Policy: Users can insert posts for their business locations
CREATE POLICY "Users can insert their own posts"
  ON public.social_studio_posts
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = social_studio_posts.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

-- Policy: Users can update posts for their business locations
CREATE POLICY "Users can update their own posts"
  ON public.social_studio_posts
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = social_studio_posts.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = social_studio_posts.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

-- Policy: Users can delete posts for their business locations
CREATE POLICY "Users can delete their own posts"
  ON public.social_studio_posts
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = social_studio_posts.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_social_studio_posts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_social_studio_posts_updated_at
  BEFORE UPDATE ON public.social_studio_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_social_studio_posts_updated_at();

COMMENT ON TABLE public.social_studio_posts IS 'Scheduled and published social media posts for Social Studio';
COMMENT ON COLUMN public.social_studio_posts.platforms IS 'Array of platform identifiers: instagram, facebook, google_business, linkedin, tiktok';
COMMENT ON COLUMN public.social_studio_posts.media IS 'Array of media objects: [{url, type, filePath}]';
COMMENT ON COLUMN public.social_studio_posts.utm IS 'UTM parameters object: {source, medium, campaign, term, content}';

