import { createClient } from '@/lib/supabase/server'
import { Database } from '@/lib/supabase/database.types'

type BusinessLocation = Database['public']['Tables']['business_locations']['Row']
type BusinessLocationSelect = Pick<
  BusinessLocation,
  'name' | 'google_location_name' | 'formatted_address' | 'phone_number' | 'website' | 'category' | 'categories'
>

type BusinessInsight = Database['public']['Tables']['business_insights']['Row']
type BusinessInsightSelect = Pick<
  BusinessInsight,
  'gbp_primary_category' | 'gbp_website_url' | 'gbp_phone' | 'gbp_address' | 'apify_opening_hours'
>

export interface BusinessContext {
  businessName: string
  primaryCategory?: string
  city?: string
  address?: string
  phone?: string
  website?: string
  hoursSummary?: string
  serviceHighlights?: string[]
}

/**
 * Extract city from formatted address
 */
function extractCity(address: string | null | undefined): string | undefined {
  if (!address) return undefined
  // Try to extract city from common address formats
  // e.g., "123 Main St, New York, NY 10001" -> "New York"
  const parts = address.split(',')
  if (parts.length >= 2) {
    return parts[parts.length - 2]?.trim()
  }
  return undefined
}

/**
 * Format opening hours summary from JSON
 */
function formatHoursSummary(hoursJson: any): string | undefined {
  if (!hoursJson || typeof hoursJson !== 'object') return undefined

  // Handle different possible formats
  if (Array.isArray(hoursJson)) {
    // Format: [{ day: "Monday", hours: "9:00 AM - 5:00 PM" }]
    const formatted = hoursJson
      .map((day: any) => {
        if (typeof day === 'object' && day.day && day.hours) {
          return `${day.day}: ${day.hours}`
        }
        return null
      })
      .filter(Boolean)
      .join(', ')

    return formatted || undefined
  }

  // Try to extract readable format
  try {
    const str = JSON.stringify(hoursJson)
    if (str.length < 200) {
      return str
    }
  } catch {
    // Ignore
  }

  return undefined
}

/**
 * Get business context for a location ID
 * Pulls from business_locations and business_insights tables
 */
export async function getBusinessContext(locationId: string): Promise<BusinessContext> {
  const supabase = await createClient()

  // Fetch from business_locations
  const locationResult = await supabase
    .from('business_locations')
    .select('name, google_location_name, formatted_address, phone_number, website, category, categories')
    .eq('id', locationId)
    .maybeSingle()

  const location = locationResult.data as BusinessLocationSelect | null

  // Fetch from business_insights (GBP data)
  const insightsResult = await supabase
    .from('business_insights')
    .select('gbp_primary_category, gbp_website_url, gbp_phone, gbp_address, apify_opening_hours')
    .eq('location_id', locationId)
    .eq('source', 'google')
    .maybeSingle()

  const insights = insightsResult.data as BusinessInsightSelect | null

  // Build context with fallbacks
  // google_location_name is like "accounts/123/locations/456", we want the actual business name
  // So prefer the name field, fallback to extracting from google_location_name if needed
  const businessName = location?.name || location?.google_location_name?.split('/').pop()?.replace(/-/g, ' ') || 'our business'

  const primaryCategory = insights?.gbp_primary_category || location?.category || undefined

  const address = location?.formatted_address || undefined
  const city = extractCity(address)

  const phone = insights?.gbp_phone || location?.phone_number || undefined

  const website = insights?.gbp_website_url || location?.website || undefined

  const hoursSummary = formatHoursSummary(insights?.apify_opening_hours)

  // Service highlights from categories
  const serviceHighlights: string[] = []
  if (location?.categories && Array.isArray(location.categories)) {
    serviceHighlights.push(...location.categories.filter((c): c is string => typeof c === 'string'))
  }
  if (insights?.gbp_primary_category && !serviceHighlights.includes(insights.gbp_primary_category)) {
    serviceHighlights.unshift(insights.gbp_primary_category)
  }

  return {
    businessName,
    primaryCategory,
    city,
    address,
    phone,
    website,
    hoursSummary,
    serviceHighlights: serviceHighlights.length > 0 ? serviceHighlights : undefined,
  }
}

