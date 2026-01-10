-- Create business_insights table
-- Stores combined insights from Google Business Profile APIs and Apify scraping
-- One row per location, source defaults to 'google' for now

CREATE TABLE IF NOT EXISTS business_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES business_locations(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'google',
  scrape_status TEXT NOT NULL DEFAULT 'not_started' CHECK (scrape_status IN ('not_started', 'in_progress', 'success', 'error')),
  scrape_error TEXT,
  last_scraped_at TIMESTAMPTZ,
  next_scheduled_scrape_at TIMESTAMPTZ,
  
  -- Official GBP fields (from Google APIs)
  gbp_avg_rating NUMERIC,
  gbp_review_count INTEGER,
  gbp_primary_category TEXT,
  gbp_additional_categories JSONB,
  gbp_website_url TEXT,
  gbp_phone TEXT,
  gbp_address JSONB,
  gbp_last_review_at TIMESTAMPTZ,
  
  -- GBP performance metrics (from Business Profile Performance APIs)
  gbp_total_call_clicks INTEGER DEFAULT 0,
  gbp_total_website_clicks INTEGER DEFAULT 0,
  gbp_total_directions_requests INTEGER DEFAULT 0,
  gbp_metrics_raw JSONB,
  
  -- Apify scraped fields
  apify_place_id TEXT,
  apify_total_score NUMERIC,
  apify_user_ratings_total INTEGER,
  apify_price_level INTEGER,
  apify_categories JSONB,
  apify_opening_hours JSONB,
  apify_raw_payload JSONB,
  
  -- Derived analysis fields
  review_sentiment_summary JSONB,
  top_review_keywords JSONB,
  last_analysis_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_location_source UNIQUE (location_id, source)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_business_insights_location_id ON business_insights(location_id);
CREATE INDEX IF NOT EXISTS idx_business_insights_scrape_status ON business_insights(scrape_status);
CREATE INDEX IF NOT EXISTS idx_business_insights_last_scraped_at ON business_insights(last_scraped_at);

-- Add updated_at trigger
CREATE TRIGGER update_business_insights_updated_at
  BEFORE UPDATE ON business_insights
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE business_insights ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own business insights"
  ON business_insights FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM business_locations
      WHERE business_locations.id = business_insights.location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own business insights"
  ON business_insights FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM business_locations
      WHERE business_locations.id = business_insights.location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own business insights"
  ON business_insights FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM business_locations
      WHERE business_locations.id = business_insights.location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own business insights"
  ON business_insights FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM business_locations
      WHERE business_locations.id = business_insights.location_id
      AND business_locations.user_id = auth.uid()
    )
  );

COMMENT ON TABLE business_insights IS 'Combined insights from Google Business Profile APIs and Apify scraping';
COMMENT ON COLUMN business_insights.source IS 'Data source, defaults to "google" for now';
COMMENT ON COLUMN business_insights.scrape_status IS 'Status of the last scrape/analysis attempt';
COMMENT ON COLUMN business_insights.gbp_metrics_raw IS 'Raw performance metrics payload from GBP Performance API';
















