/**
 * Instagram OAuth Configuration
 * 
 * This configuration handles Instagram Business Login OAuth flow.
 * Uses Instagram API with Instagram Login (Business Login for Instagram).
 * 
 * Required environment variables:
 * - INSTAGRAM_APP_ID: Meta App ID for Instagram Business Login
 * - INSTAGRAM_APP_SECRET: Meta App Secret
 * - NEXT_PUBLIC_APP_URL: Base URL of the application (e.g., https://yourdomain.com or http://localhost:3000)
 * 
 * The redirect URI is automatically constructed as:
 * ${NEXT_PUBLIC_APP_URL}/api/integrations/instagram/callback
 */

export interface InstagramOAuthConfig {
  appId: string
  appSecret: string
  redirectUri: string
}

/**
 * Get Instagram OAuth configuration from environment variables
 * Throws error if required variables are missing
 */
export function getInstagramOAuthConfig(): InstagramOAuthConfig {
  const appId = process.env.INSTAGRAM_APP_ID
  const appSecret = process.env.INSTAGRAM_APP_SECRET
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL

  if (!appId) {
    throw new Error('INSTAGRAM_APP_ID environment variable is required')
  }

  if (!appSecret) {
    throw new Error('INSTAGRAM_APP_SECRET environment variable is required')
  }

  if (!baseUrl) {
    throw new Error('NEXT_PUBLIC_APP_URL environment variable is required')
  }

  // Remove trailing slash if present
  const cleanBaseUrl = baseUrl.replace(/\/$/, '')
  const redirectUri = `${cleanBaseUrl}/api/integrations/instagram/callback`

  return {
    appId,
    appSecret,
    redirectUri,
  }
}

/**
 * Required OAuth scopes for Instagram Business API
 * Minimum scopes needed for MVP
 * Note: For Instagram API with Instagram Login (Business Login for Instagram)
 */
export const INSTAGRAM_REQUIRED_SCOPES = [
  'instagram_business_basic',
  'instagram_manage_comments',
  'instagram_business_manage_messages',
] as const

/**
 * Get the redirect URI for display in UI
 */
export function getInstagramRedirectUri(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const cleanBaseUrl = baseUrl.replace(/\/$/, '')
  return `${cleanBaseUrl}/api/integrations/instagram/callback`
}

/**
 * Log redirect URI to console (for developer reference)
 * Call this on server startup or in a development helper
 */
export function logInstagramRedirectUri(): void {
  if (process.env.NODE_ENV === 'development') {
    const redirectUri = getInstagramRedirectUri()
    console.log('\n📸 Instagram OAuth Configuration:')
    console.log(`   Redirect URI: ${redirectUri}`)
    console.log('   Paste this URL into Meta\'s "Set up Instagram business login" popup\n')
  }
}

