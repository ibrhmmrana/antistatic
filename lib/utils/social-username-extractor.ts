/**
 * Extract social media username from URL
 * 
 * Converts social media URLs from Google Business Profile into username strings
 * for use in Antistatic's social username input fields.
 */

export type SocialPlatform = 'facebook' | 'instagram' | 'linkedin' | 'x'

/**
 * Extract username from a social media URL
 * 
 * @param url - The social media URL (e.g., "https://www.facebook.com/username")
 * @param platform - The platform type
 * @returns The extracted username, or null if parsing fails
 */
export function extractSocialUsername(
  url: string,
  platform: SocialPlatform
): string | null {
  if (!url || typeof url !== 'string') {
    return null
  }

  try {
    // Normalize URL - add protocol if missing
    let normalizedUrl = url.trim()
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = `https://${normalizedUrl}`
    }

    const urlObj = new URL(normalizedUrl)
    
    // Remove trailing slash and query params for cleaner parsing
    let pathname = urlObj.pathname.replace(/\/$/, '') // Remove trailing slash
    const pathSegments = pathname.split('/').filter(segment => segment.length > 0)

    if (pathSegments.length === 0) {
      return null
    }

    switch (platform) {
      case 'facebook': {
        // Format: https://www.facebook.com/{username}
        // Use the last non-empty segment
        return pathSegments[pathSegments.length - 1] || null
      }

      case 'instagram': {
        // Format: https://www.instagram.com/{username}
        // Use the last non-empty segment
        return pathSegments[pathSegments.length - 1] || null
      }

      case 'linkedin': {
        // Format: https://www.linkedin.com/company/{slug} or /in/{slug}
        // If first segment is 'company' or 'in', use the second segment
        if (pathSegments.length >= 2 && (pathSegments[0] === 'company' || pathSegments[0] === 'in')) {
          return pathSegments[1] || null
        }
        // Otherwise fall back to last segment
        return pathSegments[pathSegments.length - 1] || null
      }

      case 'x': {
        // Format: https://x.com/{handle} or https://twitter.com/{handle}
        // Use the last non-empty segment
        return pathSegments[pathSegments.length - 1] || null
      }

      default:
        return null
    }
  } catch (error) {
    // Invalid URL format
    return null
  }
}

