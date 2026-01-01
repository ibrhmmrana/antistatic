-- Add categories field to business_locations for storing Google Places categories array
ALTER TABLE business_locations
ADD COLUMN IF NOT EXISTS categories TEXT[];

COMMENT ON COLUMN business_locations.categories IS 'Array of Google Places categories/types (e.g., ["Cafe", "Food", "Restaurant"])';





