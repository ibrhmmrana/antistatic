-- Create competitors tracking tables
-- Supports competitor discovery, watchlist, rankings, and social tracking

-- Main competitors table
CREATE TABLE IF NOT EXISTS competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_location_id UUID NOT NULL REFERENCES business_locations(id) ON DELETE CASCADE,
  place_id TEXT NOT NULL,
  title TEXT NOT NULL,
  category_name TEXT,
  address TEXT,
  lat NUMERIC,
  lng NUMERIC,
  phone TEXT,
  website TEXT,
  image_url TEXT,
  total_score NUMERIC,
  reviews_count INTEGER DEFAULT 0,
  raw_apify JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_place_per_location UNIQUE (business_location_id, place_id)
);

-- Competitor watchlist
CREATE TABLE IF NOT EXISTS competitor_watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_location_id UUID NOT NULL REFERENCES business_locations(id) ON DELETE CASCADE,
  competitor_id UUID NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_watchlist_entry UNIQUE (business_location_id, competitor_id)
);

-- Competitor social handles
CREATE TABLE IF NOT EXISTS competitor_social_handles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_location_id UUID NOT NULL REFERENCES business_locations(id) ON DELETE CASCADE,
  competitor_id UUID NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'facebook', 'tiktok', 'youtube', 'x')),
  handle TEXT NOT NULL,
  profile_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_handle_per_competitor UNIQUE (competitor_id, platform, handle)
);

-- Search terms for ranking tracking
CREATE TABLE IF NOT EXISTS search_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_location_id UUID NOT NULL REFERENCES business_locations(id) ON DELETE CASCADE,
  term TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('gbp_insights', 'onboarding', 'manual')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Competitor rank snapshots
CREATE TABLE IF NOT EXISTS competitor_rank_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_location_id UUID NOT NULL REFERENCES business_locations(id) ON DELETE CASCADE,
  search_term_id UUID NOT NULL REFERENCES search_terms(id) ON DELETE CASCADE,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  results JSONB NOT NULL, -- ordered list of { placeId, title, rank, score, reviewsCount, ... }
  your_place_id TEXT NOT NULL,
  your_rank INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_snapshot_per_term_time UNIQUE (search_term_id, captured_at)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_competitors_business_location_id ON competitors(business_location_id);
CREATE INDEX IF NOT EXISTS idx_competitors_place_id ON competitors(place_id);
CREATE INDEX IF NOT EXISTS idx_competitor_watchlist_business_location_id ON competitor_watchlist(business_location_id);
CREATE INDEX IF NOT EXISTS idx_competitor_watchlist_competitor_id ON competitor_watchlist(competitor_id);
CREATE INDEX IF NOT EXISTS idx_competitor_watchlist_is_active ON competitor_watchlist(is_active);
CREATE INDEX IF NOT EXISTS idx_competitor_social_handles_competitor_id ON competitor_social_handles(competitor_id);
CREATE INDEX IF NOT EXISTS idx_search_terms_business_location_id ON search_terms(business_location_id);
CREATE INDEX IF NOT EXISTS idx_competitor_rank_snapshots_search_term_id ON competitor_rank_snapshots(search_term_id);
CREATE INDEX IF NOT EXISTS idx_competitor_rank_snapshots_captured_at ON competitor_rank_snapshots(captured_at DESC);

-- Add updated_at triggers
CREATE TRIGGER update_competitors_updated_at
  BEFORE UPDATE ON competitors
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_competitor_watchlist_updated_at
  BEFORE UPDATE ON competitor_watchlist
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_competitor_social_handles_updated_at
  BEFORE UPDATE ON competitor_social_handles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_search_terms_updated_at
  BEFORE UPDATE ON search_terms
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_social_handles ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_rank_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS Policies for competitors
CREATE POLICY "Users can view own competitors"
  ON competitors FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM business_locations
      WHERE business_locations.id = competitors.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own competitors"
  ON competitors FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM business_locations
      WHERE business_locations.id = competitors.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own competitors"
  ON competitors FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM business_locations
      WHERE business_locations.id = competitors.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

-- RLS Policies for competitor_watchlist
CREATE POLICY "Users can view own watchlist"
  ON competitor_watchlist FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM business_locations
      WHERE business_locations.id = competitor_watchlist.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage own watchlist"
  ON competitor_watchlist FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM business_locations
      WHERE business_locations.id = competitor_watchlist.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

-- RLS Policies for competitor_social_handles
CREATE POLICY "Users can view own social handles"
  ON competitor_social_handles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM business_locations
      WHERE business_locations.id = competitor_social_handles.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage own social handles"
  ON competitor_social_handles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM business_locations
      WHERE business_locations.id = competitor_social_handles.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

-- RLS Policies for search_terms
CREATE POLICY "Users can view own search terms"
  ON search_terms FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM business_locations
      WHERE business_locations.id = search_terms.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage own search terms"
  ON search_terms FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM business_locations
      WHERE business_locations.id = search_terms.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

-- RLS Policies for competitor_rank_snapshots
CREATE POLICY "Users can view own rank snapshots"
  ON competitor_rank_snapshots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM business_locations
      WHERE business_locations.id = competitor_rank_snapshots.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own rank snapshots"
  ON competitor_rank_snapshots FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM business_locations
      WHERE business_locations.id = competitor_rank_snapshots.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );



