-- Add enabled_tools column to business_locations table
-- This stores the array of tool IDs that the user has selected during onboarding

ALTER TABLE business_locations 
ADD COLUMN IF NOT EXISTS enabled_tools TEXT[];

-- Add a comment to document the column
COMMENT ON COLUMN business_locations.enabled_tools IS 'Array of enabled tool IDs: reputation_hub, social_studio, competitor_radar';
















