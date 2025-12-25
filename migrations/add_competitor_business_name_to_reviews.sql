-- Add competitor_business_name column to business_reviews table
-- This stores the name of the competitor business for reviews with source = 'apify'

ALTER TABLE business_reviews
ADD COLUMN IF NOT EXISTS competitor_business_name TEXT;

COMMENT ON COLUMN business_reviews.competitor_business_name IS 'Name of the competitor business (only populated for reviews with source = apify). Used to identify which competitor each review belongs to.';

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_business_reviews_competitor_name ON business_reviews(competitor_business_name) WHERE source = 'apify';


