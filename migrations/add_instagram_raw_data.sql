-- Add Instagram raw data columns to business_insights table
-- Stores Apify posts, comments, and computed metrics for dashboard display

ALTER TABLE business_insights
ADD COLUMN IF NOT EXISTS instagram_raw_posts JSONB,
ADD COLUMN IF NOT EXISTS instagram_raw_comments JSONB,
ADD COLUMN IF NOT EXISTS instagram_metrics JSONB,
ADD COLUMN IF NOT EXISTS instagram_data_fetched_at TIMESTAMPTZ;

COMMENT ON COLUMN business_insights.instagram_raw_posts IS 'Raw Instagram posts data from Apify, stored for dashboard display.';
COMMENT ON COLUMN business_insights.instagram_raw_comments IS 'Raw Instagram comments data from Apify, stored for dashboard display.';
COMMENT ON COLUMN business_insights.instagram_metrics IS 'Computed Instagram metrics (likes, posting frequency, etc.) for dashboard display.';
COMMENT ON COLUMN business_insights.instagram_data_fetched_at IS 'Timestamp when the Instagram raw data was last fetched from Apify.';




