-- Add TikTok username column to business_locations table
-- This stores the TikTok username manually entered by the user during onboarding

ALTER TABLE business_locations 
ADD COLUMN IF NOT EXISTS tiktok_username TEXT;

COMMENT ON COLUMN business_locations.tiktok_username IS 'TikTok username manually entered by user';










