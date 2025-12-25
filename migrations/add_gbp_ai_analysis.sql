-- Add gbp_ai_analysis JSONB field to business_insights table
-- Stores the cached AI-generated GBP weakness analysis

ALTER TABLE business_insights
ADD COLUMN IF NOT EXISTS gbp_ai_analysis JSONB;

ALTER TABLE business_insights
ADD COLUMN IF NOT EXISTS gbp_ai_analysis_generated_at TIMESTAMPTZ;

COMMENT ON COLUMN business_insights.gbp_ai_analysis IS 'Cached AI-generated GBP weakness analysis. Structure matches GBPWeaknessAnalysisResult: { headerSummary, positiveSummary, negativeSummary, themes[] }';
COMMENT ON COLUMN business_insights.gbp_ai_analysis_generated_at IS 'Timestamp when the AI analysis was last generated';


