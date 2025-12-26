-- Add location_range column to business_locations table
-- This stores the location range bucket selected during onboarding (e.g., "1", "2-5", "6-10", etc.)

ALTER TABLE business_locations 
ADD COLUMN IF NOT EXISTS location_range TEXT;

-- Add a comment to document the column
COMMENT ON COLUMN business_locations.location_range IS 'Location range bucket: 1, 2-5, 6-10, 11-20, 21-50, 51-100, 100+';













