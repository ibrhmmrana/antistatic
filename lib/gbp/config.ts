/**
 * Google Business Profile (GBP) OAuth Configuration
 * 
 * This configuration is separate from Supabase Auth's Google OAuth.
 * Supabase Auth uses its own Google OAuth client for user login.
 * GBP connection uses a dedicated OAuth client with business.manage scope.
 * 
 * Required environment variables:
 * - GBP_CLIENT_ID: Google OAuth 2.0 Client ID for Business Profile APIs
 * - GBP_CLIENT_SECRET: Google OAuth 2.0 Client Secret
 * - GBP_REDIRECT_URI: OAuth callback URL (must match Google Cloud Console)
 * 
 * The redirect URI should be configured in Google Cloud Console as:
 * - Development: http://localhost:3000/api/gbp/oauth/callback
 * - Production: https://yourdomain.com/api/gbp/oauth/callback
 */

export interface GBPOAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

/**
 * Get GBP OAuth configuration from environment variables
 * Throws error if required variables are missing
 */
export function getGBPOAuthConfig(origin?: string): GBPOAuthConfig {
  const clientId = process.env.GBP_CLIENT_ID
  const clientSecret = process.env.GBP_CLIENT_SECRET
  const redirectUri = process.env.GBP_REDIRECT_URI || 
                     (origin ? `${origin}/api/gbp/oauth/callback` : undefined)

  if (!clientId) {
    throw new Error('GBP_CLIENT_ID environment variable is required')
  }

  if (!clientSecret) {
    throw new Error('GBP_CLIENT_SECRET environment variable is required')
  }

  if (!redirectUri) {
    throw new Error('GBP_REDIRECT_URI environment variable is required or origin must be provided')
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
  }
}

/**
 * Required OAuth scopes for Google Business Profile APIs
 */
export const GBP_REQUIRED_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/business.manage',
] as const








