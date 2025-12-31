# Antistatic Setup Guide

## Prerequisites

1. Node.js 18+ installed
2. A Supabase project
3. Google Cloud project with Places API and Maps API enabled

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Configure Environment Variables

Create a `.env.local` file in the root directory:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
GOOGLE_PLACES_API_KEY=your_google_places_api_key
GOOGLE_MAPS_API_KEY=your_google_maps_api_key

# WhatsApp Business API (for review requests)
WHATSAPP_PHONE_NUMBER_ID=your_whatsapp_phone_number_id
WHATSAPP_ACCESS_TOKEN=your_whatsapp_access_token
WHATSAPP_GRAPH_VERSION=v23.0

# Instagram OAuth (Business Login for Instagram)
INSTAGRAM_APP_ID=your_instagram_app_id
INSTAGRAM_APP_SECRET=your_instagram_app_secret
NEXT_PUBLIC_APP_URL=http://localhost:3000  # For development, or https://yourdomain.com for production

# Supabase Storage (optional, for image uploads)
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

### Getting Supabase Credentials

1. Go to your Supabase project dashboard
2. Navigate to Settings > API
3. Copy the "Project URL" and "anon public" key

### Getting Google API Keys

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the following APIs:
   - Places API
   - Maps JavaScript API
   - Maps Static API
4. Go to Credentials > Create Credentials > API Key
5. Restrict the API key to only the APIs you need (recommended for production)

### Getting WhatsApp Business API Credentials

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Create a Meta App or use an existing one
3. Add the "WhatsApp" product to your app
4. Go to WhatsApp > API Setup
5. Copy your **Phone Number ID** (this is your `WHATSAPP_PHONE_NUMBER_ID`)
6. Generate a **Temporary Access Token** or set up a **System User** for a permanent token (this is your `WHATSAPP_ACCESS_TOKEN`)
7. **Important**: Make sure your WhatsApp template `review_temp_1` is approved in Meta Business Manager before sending messages

**Note**: For production, use a System User access token instead of a temporary token. Temporary tokens expire after 24 hours.

### Getting Instagram OAuth Credentials (Business Login for Instagram)

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Create a Meta App or use an existing one
3. Add the "Instagram" product to your app
4. Go to Instagram > Basic Display (or Instagram > Instagram Login)
5. Set up "Instagram API with Instagram Login" (Business Login for Instagram)
6. Copy your **App ID** (this is your `INSTAGRAM_APP_ID`)
7. Copy your **App Secret** (this is your `INSTAGRAM_APP_SECRET`)

#### Meta App Checklist

**App Domains:**
- Must include: `antistatic.ai`
- Must include: `app.antistatic.ai`

**Redirect URL:**
- Must include exactly: `https://app.antistatic.ai/api/integrations/instagram/callback`
- For development: `http://localhost:3000/api/integrations/instagram/callback`
- Or use the exact redirect URI shown in Settings → Integrations → Instagram

**Instagram Use Case:**
- Ensure the Instagram use case is set to "API setup with Instagram login" (Business Login for Instagram)
- NOT "Facebook Login" or "Basic Display"

**Required Permissions (Scopes):**
- `instagram_business_basic` - Basic profile and media access
- `instagram_business_manage_comments` - Manage comments on posts
- `instagram_business_manage_messages` - Manage direct messages
- `instagram_business_content_publish` - Publish content to Instagram
- `instagram_business_manage_insights` - Access analytics and insights

**Note**: Your Instagram account must be a Business or Creator account and must be connected to a Facebook Page.

## Step 3: Set Up Supabase Database

Run the following SQL in your Supabase SQL Editor (Dashboard > SQL Editor):

```sql
-- Create profiles table
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create business_locations table
CREATE TABLE business_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  place_id TEXT NOT NULL,
  name TEXT NOT NULL,
  formatted_address TEXT,
  phone_number TEXT,
  website TEXT,
  rating NUMERIC,
  review_count INTEGER,
  category TEXT,
  lat NUMERIC,
  lng NUMERIC,
  open_now BOOLEAN,
  photos JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_locations ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Business locations policies
CREATE POLICY "Users can view own business locations"
  ON business_locations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own business locations"
  ON business_locations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own business locations"
  ON business_locations FOR UPDATE
  USING (auth.uid() = user_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_business_locations_updated_at
  BEFORE UPDATE ON business_locations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

## Step 4: Configure Google OAuth in Supabase

1. Go to your Supabase project dashboard
2. Navigate to Authentication > Providers
3. Enable Google provider
4. Add your Google OAuth credentials:
   - Client ID (from Google Cloud Console)
   - Client Secret (from Google Cloud Console)
5. Add authorized redirect URL: `https://your-project-ref.supabase.co/auth/v1/callback`

## Step 5: Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Testing the Flow

1. **Sign Up**: Visit `/auth` and create an account with email/password or use Google OAuth
2. **Business Search**: After signup, you'll be redirected to `/onboarding/business`. Search for a business using Google Places autocomplete
3. **Confirm Business**: Select a business and confirm the details on `/onboarding/business/confirm`
4. **Dashboard**: After confirmation, you'll be redirected to `/app` (placeholder dashboard)

## Troubleshooting

### "Google Places API key not configured"
- Make sure `GOOGLE_PLACES_API_KEY` is set in `.env.local`
- Restart the dev server after adding environment variables

### "Supabase client error"
- Verify your Supabase URL and anon key are correct
- Check that Row Level Security policies are set up correctly

### OAuth redirect not working
- Ensure the redirect URL in Supabase matches your callback route
- Check that Google OAuth is enabled in Supabase dashboard

### Database errors
- Make sure all SQL migrations have been run
- Verify RLS policies allow the current user to access their data

### "WhatsApp service not configured"
- Make sure `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_ACCESS_TOKEN` are set in `.env.local`
- Restart the dev server after adding environment variables
- Verify your WhatsApp template `review_temp_1` is approved in Meta Business Manager
- Check that your access token has the `whatsapp_business_messaging` permission

