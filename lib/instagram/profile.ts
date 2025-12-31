/**
 * Instagram Profile Helper
 * 
 * Fetches Instagram user profile information using the Instagram Graph API.
 * Used after OAuth token exchange to get username and user ID.
 */

export interface InstagramProfile {
  id: string
  username: string
}

/**
 * Get Instagram user profile using access token
 * 
 * @param accessToken - Instagram access token from OAuth
 * @returns Instagram profile with id and username, or null if fetch fails
 */
export async function getInstagramProfile(accessToken: string): Promise<InstagramProfile | null> {
  try {
    // Instagram Graph API endpoint for user profile
    // For Instagram Business accounts, we use the user_id from token response
    // and fetch username from the Graph API
    const response = await fetch(`https://graph.instagram.com/me?fields=id,username&access_token=${accessToken}`)
    
    if (!response.ok) {
      console.error('[Instagram Profile] Failed to fetch profile:', {
        status: response.status,
        statusText: response.statusText,
      })
      return null
    }

    const data = await response.json()
    
    if (data.error) {
      console.error('[Instagram Profile] API error:', data.error)
      return null
    }

    if (!data.id || !data.username) {
      console.warn('[Instagram Profile] Missing id or username in response:', data)
      return null
    }

    return {
      id: data.id,
      username: data.username,
    }
  } catch (error: any) {
    console.error('[Instagram Profile] Error fetching profile:', error)
    return null
  }
}

