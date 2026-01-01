-- Instagram DM Events Table Migration
-- Creates a simple table for storing Instagram DM webhook events
-- Idempotent: safe to run multiple times

CREATE TABLE IF NOT EXISTS public.instagram_dm_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_location_id UUID NOT NULL REFERENCES public.business_locations(id) ON DELETE CASCADE,
  ig_user_id TEXT,
  sender_id TEXT,
  recipient_id TEXT,
  message_id TEXT,
  text TEXT,
  timestamp TIMESTAMPTZ,
  raw JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_instagram_dm_events_location_created ON public.instagram_dm_events(business_location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_instagram_dm_events_message_id ON public.instagram_dm_events(message_id) WHERE message_id IS NOT NULL;

-- Enable RLS
ALTER TABLE public.instagram_dm_events ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "Users can view own instagram_dm_events" ON public.instagram_dm_events;
DROP POLICY IF EXISTS "Users can insert own instagram_dm_events" ON public.instagram_dm_events;
DROP POLICY IF EXISTS "Users can update own instagram_dm_events" ON public.instagram_dm_events;
DROP POLICY IF EXISTS "Users can delete own instagram_dm_events" ON public.instagram_dm_events;

-- RLS Policies: Only location owner can read/write
CREATE POLICY "Users can view own instagram_dm_events"
  ON public.instagram_dm_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = instagram_dm_events.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own instagram_dm_events"
  ON public.instagram_dm_events FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = instagram_dm_events.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own instagram_dm_events"
  ON public.instagram_dm_events FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = instagram_dm_events.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own instagram_dm_events"
  ON public.instagram_dm_events FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.business_locations
      WHERE business_locations.id = instagram_dm_events.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

