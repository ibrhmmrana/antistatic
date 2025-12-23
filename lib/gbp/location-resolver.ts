/**
 * GBP Location Resolver
 * 
 * Helper to resolve and persist GBP location name immediately after connection.
 * This ensures google_location_name is stored as soon as GBP is connected,
 * not just when reviews are fetched.
 */

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getGBPAccessTokenForLocation } from './client'

/**
 * Resolve and persist GBP location name for a business location
 * This is called immediately after GBP connection to ensure location name is stored
 * 
 * @param userId - Antistatic user ID
 * @param businessLocationId - Antistatic business location ID
 * @param origin - Request origin for token refresh
 * @returns The resolved location name or null if it couldn't be resolved
 */
export async function resolveAndStoreGBPLocationName(
  userId: string,
  businessLocationId: string,
  origin?: string
): Promise<string | null> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {
          // No-op
        },
      },
    }
  )

  console.log('[GBP Location Resolver] Resolving location name for:', { userId, businessLocationId })

  try {
    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user || user.id !== userId) {
      console.error('[GBP Location Resolver] Authentication check failed:', {
        authError,
        userId,
        authenticatedUserId: user?.id,
      })
      return null
    }

    // Check if we already have the location name stored
    const { data: location, error: locationError } = await supabase
      .from('business_locations')
      .select('google_location_name, website')
      .eq('id', businessLocationId)
      .eq('user_id', userId)
      .single()

    if (locationError) {
      console.error('[GBP Location Resolver] Error fetching location:', locationError)
      return null
    }

    if (location?.google_location_name) {
      console.log('[GBP Location Resolver] Location name already stored:', location.google_location_name)
      return location.google_location_name
    }

    // Get access token and account name
    console.log('[GBP Location Resolver] Getting access token and account name...')
    const { accessToken, accountName } = await getGBPAccessTokenForLocation(
      userId,
      businessLocationId,
      origin
    )
    console.log('[GBP Location Resolver] Got access token and account:', { accountName, hasToken: !!accessToken })

    // Fetch locations from GBP API
    const locationsUrl = `https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations?readMask=name,title,storeCode,websiteUri,openInfo,metadata`
    console.log('[GBP Location Resolver] Fetching locations from:', locationsUrl)

    const locationsResponse = await fetch(locationsUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (!locationsResponse.ok) {
      const errorText = await locationsResponse.text()
      let errorData
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { error: errorText }
      }
      console.error('[GBP Location Resolver] Failed to fetch locations:', {
        status: locationsResponse.status,
        statusText: locationsResponse.statusText,
        error: errorData,
      })
      return null
    }

    const locationsData = await locationsResponse.json()
    const locations = locationsData.locations || []

    console.log('[GBP Location Resolver] Fetched locations:', {
      count: locations.length,
      locations: locations.map((loc: any) => ({
        name: loc.name,
        title: loc.title,
        websiteUri: loc.websiteUri,
      })),
    })

    if (locations.length === 0) {
      console.warn('[GBP Location Resolver] No GBP locations found')
      return null
    }

    // Select location: prefer one matching website, otherwise use first
    let selectedLocation = locations[0]
    const businessWebsite = location?.website

    if (businessWebsite && locations.length > 1) {
      // Try to find a location with matching website
      const matchingLocation = locations.find((loc: any) => {
        const locWebsite = loc.websiteUri
        if (!locWebsite || !businessWebsite) return false
        // Simple URL matching (normalize both)
        const normalizeUrl = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase()
        return normalizeUrl(locWebsite) === normalizeUrl(businessWebsite)
      })

      if (matchingLocation) {
        selectedLocation = matchingLocation
        console.log('[GBP Location Resolver] Matched location by website:', selectedLocation.name)
      } else {
        console.log('[GBP Location Resolver] No website match found, using first location')
      }
    }

    const locationName = selectedLocation.name
    console.log('[GBP Location Resolver] Selected location name:', locationName)

    // Persist the location name
    console.log('[GBP Location Resolver] Attempting to update business_locations:', {
      businessLocationId,
      userId,
      locationName,
    })
    
    const { data: updateData, error: updateError } = await supabase
      .from('business_locations')
      .update({ google_location_name: locationName })
      .eq('id', businessLocationId)
      .eq('user_id', userId)
      .select('id, google_location_name')

    if (updateError) {
      console.error('[GBP Location Resolver] Failed to persist location name:', {
        error: updateError,
        message: updateError.message,
        details: updateError.details,
        hint: updateError.hint,
        code: updateError.code,
      })
      return null
    }

    if (!updateData || updateData.length === 0) {
      console.warn('[GBP Location Resolver] Update succeeded but no rows returned. This might indicate RLS blocking the update.')
      return null
    }

    console.log('[GBP Location Resolver] Successfully persisted location name:', {
      locationName,
      updatedRow: updateData[0],
    })
    return locationName
  } catch (error: any) {
    console.error('[GBP Location Resolver] Error resolving location name:', {
      message: error.message,
      stack: error.stack,
    })
    // Don't throw - return null so OAuth flow can continue
    return null
  }
}

