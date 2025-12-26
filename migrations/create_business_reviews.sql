-- Create business_reviews table
-- Stores individual reviews from both GBP API and Apify scraping
-- Allows deduplication and cross-source analysis

CREATE TABLE IF NOT EXISTS business_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES business_locations(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('gbp', 'apify')),
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,
  author_name TEXT,
  author_photo_url TEXT,
  published_at TIMESTAMPTZ,
  review_url TEXT,
  review_id TEXT, -- External review ID from source
  raw_payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint to prevent duplicate reviews
  CONSTRAINT unique_location_source_review UNIQUE (location_id, source, review_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_business_reviews_location_id ON business_reviews(location_id);
CREATE INDEX IF NOT EXISTS idx_business_reviews_source ON business_reviews(source);
CREATE INDEX IF NOT EXISTS idx_business_reviews_published_at ON business_reviews(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_reviews_rating ON business_reviews(rating);

-- Add updated_at trigger
CREATE TRIGGER update_business_reviews_updated_at
  BEFORE UPDATE ON business_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE business_reviews ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own business reviews"
  ON business_reviews FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM business_locations
      WHERE business_locations.id = business_reviews.location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own business reviews"
  ON business_reviews FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM business_locations
      WHERE business_locations.id = business_reviews.location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own business reviews"
  ON business_reviews FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM business_locations
      WHERE business_locations.id = business_reviews.location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own business reviews"
  ON business_reviews FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM business_locations
      WHERE business_locations.id = business_reviews.location_id
      AND business_locations.user_id = auth.uid()
    )
  );

COMMENT ON TABLE business_reviews IS 'Individual reviews from GBP API and Apify scraping';
COMMENT ON COLUMN business_reviews.source IS 'Source of the review: "gbp" for official API, "apify" for scraped data';
COMMENT ON COLUMN business_reviews.review_id IS 'External review identifier from the source system';








