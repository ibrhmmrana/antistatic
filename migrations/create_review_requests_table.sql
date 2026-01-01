-- Review requests table for logging WhatsApp/Email review requests
CREATE TABLE IF NOT EXISTS review_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_location_id UUID NOT NULL REFERENCES business_locations(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  to_recipient TEXT NOT NULL, -- WhatsApp number or email address
  customer_name TEXT NOT NULL,
  template_name TEXT NOT NULL,
  header_image_url TEXT,
  place_id TEXT,
  meta_message_id TEXT, -- Message ID from Meta Graph API response
  status TEXT NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'sent', 'failed')),
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_review_requests_org_id ON review_requests(org_id);
CREATE INDEX IF NOT EXISTS idx_review_requests_business_location_id ON review_requests(business_location_id);
CREATE INDEX IF NOT EXISTS idx_review_requests_status ON review_requests(status);
CREATE INDEX IF NOT EXISTS idx_review_requests_created_at ON review_requests(created_at DESC);

-- Enable RLS
ALTER TABLE review_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own review requests"
  ON review_requests FOR SELECT
  USING (auth.uid() = org_id);

CREATE POLICY "Users can insert own review requests"
  ON review_requests FOR INSERT
  WITH CHECK (auth.uid() = org_id);

CREATE POLICY "Users can update own review requests"
  ON review_requests FOR UPDATE
  USING (auth.uid() = org_id);



