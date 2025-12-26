-- Add google_location_name column to business_locations table
-- This stores the GBP location resource name (e.g., "accounts/123/locations/456")
-- which is needed to fetch reviews and other location-specific data

ALTER TABLE business_locations 
ADD COLUMN IF NOT EXISTS google_location_name TEXT;

-- Add a comment to document the column
COMMENT ON COLUMN business_locations.google_location_name IS 'Google Business Profile location resource name (e.g., accounts/123/locations/456)';




