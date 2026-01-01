-- Create instagram_connections table
-- Stores Instagram OAuth tokens for business locations
CREATE TABLE IF NOT EXISTS instagram_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_location_id UUID NOT NULL REFERENCES business_locations(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_instagram_connections_location_id ON instagram_connections(business_location_id);
CREATE INDEX IF NOT EXISTS idx_instagram_connections_user_id ON instagram_connections(instagram_user_id);

-- Add updated_at trigger
CREATE TRIGGER update_instagram_connections_updated_at
  BEFORE UPDATE ON instagram_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE instagram_connections ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own instagram connections"
  ON instagram_connections FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM business_locations
      WHERE business_locations.id = instagram_connections.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own instagram connections"
  ON instagram_connections FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM business_locations
      WHERE business_locations.id = instagram_connections.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own instagram connections"
  ON instagram_connections FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM business_locations
      WHERE business_locations.id = instagram_connections.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own instagram connections"
  ON instagram_connections FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM business_locations
      WHERE business_locations.id = instagram_connections.business_location_id
      AND business_locations.user_id = auth.uid()
    )
  );


