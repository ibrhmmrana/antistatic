-- Add unique constraint and indexes to instagram_dm_events
-- Idempotent: safe to run multiple times

-- Add unique constraint on message_id (if globally unique) or (business_location_id, message_id)
-- First, check if constraint already exists
DO $$
BEGIN
  -- Try to add unique constraint on message_id alone (if globally unique)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'instagram_dm_events_message_id_unique'
  ) THEN
    -- Check if message_id is globally unique by testing
    -- If not, we'll use composite key
    BEGIN
      ALTER TABLE public.instagram_dm_events 
      ADD CONSTRAINT instagram_dm_events_message_id_unique 
      UNIQUE (message_id);
    EXCEPTION WHEN OTHERS THEN
      -- If message_id is not unique, use composite key instead
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'instagram_dm_events_location_message_unique'
      ) THEN
        ALTER TABLE public.instagram_dm_events 
        ADD CONSTRAINT instagram_dm_events_location_message_unique 
        UNIQUE (business_location_id, message_id);
      END IF;
    END;
  END IF;
END $$;

-- Ensure index on business_location_id + timestamp exists
CREATE INDEX IF NOT EXISTS idx_instagram_dm_events_location_timestamp 
ON public.instagram_dm_events(business_location_id, timestamp DESC NULLS LAST);

-- Ensure index on message_id exists
CREATE INDEX IF NOT EXISTS idx_instagram_dm_events_message_id 
ON public.instagram_dm_events(message_id) 
WHERE message_id IS NOT NULL;

