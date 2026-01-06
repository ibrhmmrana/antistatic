/**
 * Normalize profile picture URL from various API response shapes
 * 
 * Instagram Graph API can return profile pictures in different formats:
 * - profile_pic (string URL)
 * - profile_pic_url (string URL)
 * - profile_picture_url (string URL)
 * - picture.data.url (nested object)
 * 
 * This helper extracts the first non-empty URL from any of these shapes.
 */
export function normalizeProfilePicUrl(raw: any): string | null {
  if (!raw) {
    return null
  }

  // Try direct string fields first (most common)
  if (typeof raw === 'string' && raw.trim() !== '') {
    return raw.trim()
  }

  if (typeof raw !== 'object') {
    return null
  }

  // Try common field names in order of likelihood
  const candidates = [
    raw.profile_pic,
    raw.profile_pic_url,
    raw.profile_picture_url,
    raw.picture?.data?.url,
    raw.picture?.url,
    raw.data?.url,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() !== '') {
      return candidate.trim()
    }
  }

  return null
}

