-- Create instagram_oauth_states table
-- Stores OAuth state parameters for CSRF protection
CREATE TABLE IF NOT EXISTS instagram_oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_location_id UUID NOT NULL REFERENCES business_locations(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_instagram_oauth_states_state ON instagram_oauth_states(state);
CREATE INDEX IF NOT EXISTS idx_instagram_oauth_states_expires_at ON instagram_oauth_states(expires_at);

-- Enable RLS
ALTER TABLE instagram_oauth_states ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own oauth states"
  ON instagram_oauth_states FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own oauth states"
  ON instagram_oauth_states FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own oauth states"
  ON instagram_oauth_states FOR DELETE
  USING (auth.uid() = user_id);

-- Cleanup expired states (run periodically via cron or trigger)
-- This is a helper function that can be called periodically
CREATE OR REPLACE FUNCTION cleanup_expired_instagram_oauth_states()
RETURNS void AS $$
BEGIN
  DELETE FROM instagram_oauth_states
  WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

