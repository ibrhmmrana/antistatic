-- Add apify_competitors JSONB field to business_insights table
-- Stores competitor comparison data from Apify scraping

ALTER TABLE business_insights
ADD COLUMN IF NOT EXISTS apify_competitors JSONB;

COMMENT ON COLUMN business_insights.apify_competitors IS 'Array of competitor places (including the business itself) scraped from Apify, with metrics for onboarding comparison. Structure: { places: CompetitorPlaceInsight[], comparison: CompetitorComparisonSummary, scrapedAt: string }';


