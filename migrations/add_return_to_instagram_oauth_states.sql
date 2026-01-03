-- Add return_to column to instagram_oauth_states table
-- This allows storing the URL to redirect back to after OAuth reconnection

ALTER TABLE instagram_oauth_states 
ADD COLUMN IF NOT EXISTS return_to TEXT;

-- Add comment
COMMENT ON COLUMN instagram_oauth_states.return_to IS 'URL to redirect to after successful OAuth reconnection';

