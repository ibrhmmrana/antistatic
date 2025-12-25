-- Add social media username columns to business_locations table
-- These store usernames extracted from Google Business Profile social links
-- or manually entered by the user during onboarding

ALTER TABLE business_locations 
ADD COLUMN IF NOT EXISTS facebook_username TEXT,
ADD COLUMN IF NOT EXISTS instagram_username TEXT,
ADD COLUMN IF NOT EXISTS linkedin_username TEXT,
ADD COLUMN IF NOT EXISTS x_username TEXT;

COMMENT ON COLUMN business_locations.facebook_username IS 'Facebook username extracted from GBP or manually entered';
COMMENT ON COLUMN business_locations.instagram_username IS 'Instagram username extracted from GBP or manually entered';
COMMENT ON COLUMN business_locations.linkedin_username IS 'LinkedIn username extracted from GBP or manually entered';
COMMENT ON COLUMN business_locations.x_username IS 'X (Twitter) username extracted from GBP or manually entered';






