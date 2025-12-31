-- Instagram OAuth Tables Migration
-- Run this SQL in your Supabase SQL Editor

-- 1) Create instagram_connections table
CREATE TABLE IF NOT EXISTS public.instagram_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_location_id UUID NOT NULL REFERENCES public.business_locations(id) ON DELETE CASCADE,
  instagram_user_id TEXT NOT NULL,
  instagram_username TEXT,
  access_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_location_instagram UNIQUE (business_location_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_instagram_connections_location_id ON public.instagram_connections(business_location_id);
CREATE INDEX IF NOT EXISTS idx_instagram_connections_user_id ON public.instagram_connections(instagram_user_id);

-- Add updated_at trigger
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname='update_instagram_connections_updated_at' AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER update_instagram_connections_updated_at
      BEFORE UPDATE ON public.instagram_connections
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- Enable RLS
ALTER TABLE public.instagram_connections ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='instagram_connections' AND policyname='Users can view own instagram connections'
  ) THEN
    CREATE POLICY "Users can view own instagram connections"
      ON public.instagram_connections FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.business_locations
          WHERE business_locations.id = instagram_connections.business_location_id
          AND business_locations.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='instagram_connections' AND policyname='Users can insert own instagram connections'
  ) THEN
    CREATE POLICY "Users can insert own instagram connections"
      ON public.instagram_connections FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.business_locations
          WHERE business_locations.id = instagram_connections.business_location_id
          AND business_locations.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='instagram_connections' AND policyname='Users can update own instagram connections'
  ) THEN
    CREATE POLICY "Users can update own instagram connections"
      ON public.instagram_connections FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.business_locations
          WHERE business_locations.id = instagram_connections.business_location_id
          AND business_locations.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='instagram_connections' AND policyname='Users can delete own instagram connections'
  ) THEN
    CREATE POLICY "Users can delete own instagram connections"
      ON public.instagram_connections FOR DELETE
      USING (
        EXISTS (
          SELECT 1 FROM public.business_locations
          WHERE business_locations.id = instagram_connections.business_location_id
          AND business_locations.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- 2) Create instagram_oauth_states table
CREATE TABLE IF NOT EXISTS public.instagram_oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_location_id UUID NOT NULL REFERENCES public.business_locations(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_instagram_oauth_states_state ON public.instagram_oauth_states(state);
CREATE INDEX IF NOT EXISTS idx_instagram_oauth_states_expires_at ON public.instagram_oauth_states(expires_at);

-- Enable RLS
ALTER TABLE public.instagram_oauth_states ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='instagram_oauth_states' AND policyname='Users can view own oauth states'
  ) THEN
    CREATE POLICY "Users can view own oauth states"
      ON public.instagram_oauth_states FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='instagram_oauth_states' AND policyname='Users can insert own oauth states'
  ) THEN
    CREATE POLICY "Users can insert own oauth states"
      ON public.instagram_oauth_states FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='instagram_oauth_states' AND policyname='Users can delete own oauth states'
  ) THEN
    CREATE POLICY "Users can delete own oauth states"
      ON public.instagram_oauth_states FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Cleanup expired states function (optional, can be called periodically)
CREATE OR REPLACE FUNCTION public.cleanup_expired_instagram_oauth_states()
RETURNS void AS $$
BEGIN
  DELETE FROM public.instagram_oauth_states
  WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

