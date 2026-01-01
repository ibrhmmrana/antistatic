-- Add Facebook analysis columns to business_insights table
-- Stores Facebook AI analysis, raw posts, metrics, and metadata

ALTER TABLE business_insights
ADD COLUMN IF NOT EXISTS facebook_ai_analysis JSONB,
ADD COLUMN IF NOT EXISTS facebook_ai_analysis_generated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS facebook_url TEXT,
ADD COLUMN IF NOT EXISTS facebook_raw_posts JSONB,
ADD COLUMN IF NOT EXISTS facebook_metrics JSONB,
ADD COLUMN IF NOT EXISTS facebook_data_fetched_at TIMESTAMPTZ;

COMMENT ON COLUMN business_insights.facebook_ai_analysis IS 'Structured AI analysis for Facebook Page including diagnosis and prescriptions.';
COMMENT ON COLUMN business_insights.facebook_ai_analysis_generated_at IS 'Timestamp when the Facebook AI analysis was last generated.';
COMMENT ON COLUMN business_insights.facebook_url IS 'The Facebook Page URL that was analyzed.';
COMMENT ON COLUMN business_insights.facebook_raw_posts IS 'Normalized Facebook posts data from Apify (trimmed, no large blobs).';
COMMENT ON COLUMN business_insights.facebook_metrics IS 'Computed Facebook metrics (cadence, engagement, format mix, etc.).';
COMMENT ON COLUMN business_insights.facebook_data_fetched_at IS 'Timestamp when the Facebook raw data was last fetched from Apify.';




