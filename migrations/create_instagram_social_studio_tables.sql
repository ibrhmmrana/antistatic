-- Instagram Social Studio Tables Migration
-- Creates tables for caching Instagram data (media, comments, insights, sync state)
-- Idempotent: safe to run multiple times

-- 1) instagram_sync_state
CREATE TABLE IF NOT EXISTS public.instagram_sync_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_location_id UUID NOT NULL REFERENCES public.business_locations(id) ON DELETE CASCADE,
  ig_user_id TEXT,
  username TEXT,
  granted_scopes TEXT[],
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_location_sync_state UNIQUE (business_location_id)
);

-- 2) instagram_media
CREATE TABLE IF NOT EXISTS public.instagram_media (
  id TEXT PRIMARY KEY, -- ig_media_id
  business_location_id UUID NOT NULL REFERENCES public.business_locations(id) ON DELETE CASCADE,
  ig_user_id TEXT NOT NULL,
  permalink TEXT,
  caption TEXT,
  media_type TEXT,
  media_url TEXT,
  thumbnail_url TEXT,
  timestamp TIMESTAMPTZ,
  like_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  raw JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3) instagram_comments
CREATE TABLE IF NOT EXISTS public.instagram_comments (
  id TEXT PRIMARY KEY, -- ig_comment_id
  business_location_id UUID NOT NULL REFERENCES public.business_locations(id) ON DELETE CASCADE,
  ig_user_id TEXT NOT NULL,
  media_id TEXT NOT NULL REFERENCES public.instagram_media(id) ON DELETE CASCADE,
  username TEXT,
  text TEXT,
  timestamp TIMESTAMPTZ,
  replied BOOLEAN DEFAULT FALSE,
  replied_at TIMESTAMPTZ,
  raw JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4) instagram_insights_daily
CREATE TABLE IF NOT EXISTS public.instagram_insights_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_location_id UUID NOT NULL REFERENCES public.business_locations(id) ON DELETE CASCADE,
  ig_user_id TEXT NOT NULL,
  date DATE NOT NULL,
  reach INTEGER,
  impressions INTEGER,
  profile_visits INTEGER,
  website_clicks INTEGER,
  email_contacts INTEGER,
  phone_call_clicks INTEGER,
  raw JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_location_date_insights UNIQUE (business_location_id, date)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_instagram_sync_state_location ON public.instagram_sync_state(business_location_id);
CREATE INDEX IF NOT EXISTS idx_instagram_media_location ON public.instagram_media(business_location_id);
CREATE INDEX IF NOT EXISTS idx_instagram_media_timestamp ON public.instagram_media(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_instagram_media_type ON public.instagram_media(media_type);
CREATE INDEX IF NOT EXISTS idx_instagram_comments_location ON public.instagram_comments(business_location_id);
CREATE INDEX IF NOT EXISTS idx_instagram_comments_media ON public.instagram_comments(media_id);
CREATE INDEX IF NOT EXISTS idx_instagram_comments_timestamp ON public.instagram_comments(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_instagram_comments_replied ON public.instagram_comments(replied);
CREATE INDEX IF NOT EXISTS idx_instagram_insights_location ON public.instagram_insights_daily(business_location_id);
CREATE INDEX IF NOT EXISTS idx_instagram_insights_date ON public.instagram_insights_daily(date DESC);

-- Drop triggers if they exist (idempotent)
DROP TRIGGER IF EXISTS update_instagram_sync_state_updated_at ON public.instagram_sync_state;
DROP TRIGGER IF EXISTS update_instagram_media_updated_at ON public.instagram_media;
DROP TRIGGER IF EXISTS update_instagram_comments_updated_at ON public.instagram_comments;
DROP TRIGGER IF EXISTS update_instagram_insights_daily_updated_at ON public.instagram_insights_daily;

-- Add updated_at triggers
CREATE TRIGGER update_instagram_sync_state_updated_at
  BEFORE UPDATE ON public.instagram_sync_state
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_instagram_media_updated_at
  BEFORE UPDATE ON public.instagram_media
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_instagram_comments_updated_at
  BEFORE UPDATE ON public.instagram_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_instagram_insights_daily_updated_at
  BEFORE UPDATE ON public.instagram_insights_daily
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE public.instagram_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_insights_daily ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "Users can view own instagram sync state" ON public.instagram_sync_state;
DROP POLICY IF EXISTS "Users can insert own instagram sync state" ON public.instagram_sync_state;
DROP POLICY IF EXISTS "Users can update own instagram sync state" ON public.instagram_sync_state;
DROP POLICY IF EXISTS "Users can delete own instagram sync state" ON public.instagram_sync_state;

DROP POLICY IF EXISTS "Users can view own instagram media" ON public.instagram_media;
DROP POLICY IF EXISTS "Users can insert own instagram media" ON public.instagram_media;
DROP POLICY IF EXISTS "Users can update own instagram media" ON public.instagram_media;
DROP POLICY IF EXISTS "Users can delete own instagram media" ON public.instagram_media;

DROP POLICY IF EXISTS "Users can view own instagram comments" ON public.instagram_comments;
DROP POLICY IF EXISTS "Users can insert own instagram comments" ON public.instagram_comments;
DROP POLICY IF EXISTS "Users can update own instagram comments" ON public.instagram_comments;
DROP POLICY IF EXISTS "Users can delete own instagram comments" ON public.instagram_comments;

DROP POLICY IF EXISTS "Users can view own instagram insights" ON public.instagram_insights_daily;
DROP POLICY IF EXISTS "Users can insert own instagram insights" ON public.instagram_insights_daily;
DROP POLICY IF EXISTS "Users can update own instagram insights" ON public.instagram_insights_daily;
DROP POLICY IF EXISTS "Users can delete own instagram insights" ON public.instagram_insights_daily;

-- RLS Policies for instagram_sync_state
CREATE POLICY "Users can view own instagram sync state"
  ON public.instagram_sync_state FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = instagram_sync_state.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own instagram sync state"
  ON public.instagram_sync_state FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = instagram_sync_state.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own instagram sync state"
  ON public.instagram_sync_state FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = instagram_sync_state.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own instagram sync state"
  ON public.instagram_sync_state FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = instagram_sync_state.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

-- RLS Policies for instagram_media
CREATE POLICY "Users can view own instagram media"
  ON public.instagram_media FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = instagram_media.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own instagram media"
  ON public.instagram_media FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = instagram_media.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own instagram media"
  ON public.instagram_media FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = instagram_media.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own instagram media"
  ON public.instagram_media FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = instagram_media.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

-- RLS Policies for instagram_comments
CREATE POLICY "Users can view own instagram comments"
  ON public.instagram_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = instagram_comments.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own instagram comments"
  ON public.instagram_comments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = instagram_comments.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own instagram comments"
  ON public.instagram_comments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = instagram_comments.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own instagram comments"
  ON public.instagram_comments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = instagram_comments.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

-- RLS Policies for instagram_insights_daily
CREATE POLICY "Users can view own instagram insights"
  ON public.instagram_insights_daily FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = instagram_insights_daily.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own instagram insights"
  ON public.instagram_insights_daily FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = instagram_insights_daily.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own instagram insights"
  ON public.instagram_insights_daily FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = instagram_insights_daily.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own instagram insights"
  ON public.instagram_insights_daily FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = instagram_insights_daily.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

