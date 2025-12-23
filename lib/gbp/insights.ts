/**
 * Google Business Profile Insights Helper
 * 
 * Fetches official GBP data and performance metrics for insights.
 * Combines location details and performance API data.
 */

import { getValidAccessToken, gbpApiRequest, GBPLocation } from './client'

export interface GBPInsightsData {
  core: {
    avgRating: number | null
    reviewCount: number | null
    primaryCategory: string | null
    additionalCategories: string[]
    websiteUrl: string | null
    phone: string | null
    address: any | null
    lastReviewAt: string | null
  }
  performance: {
    totalCallClicks: number
    totalWebsiteClicks: number
    totalDirectionsRequests: number
    rawMetrics: any
  }
  locationName: string // GBP location resource name (e.g., "accounts/123/locations/456")
}

/**
 * Get GBP location details for a business location
 * 
 * @param userId - Antistatic user ID
 * @param businessLocationId - Antistatic business location ID
 * @param gbpLocationName - GBP location resource name (optional, will fetch if not provided)
 * @param origin - Request origin for token refresh
 * @returns GBP location details
 */
async function getGBPLocationDetails(
  userId: string,
  businessLocationId: string,
  gbpLocationName?: string,
  origin?: string
): Promise<{ location: GBPLocation; locationName: string }> {
  // If locationName not provided, fetch it
  if (!gbpLocationName) {
    try {
      // Get accounts first (same pattern as working locations route)
      console.log('[GBP Insights] Fetching accounts...')
      const accountsResponse = await gbpApiRequest<{ accounts: Array<{ name: string; accountName: string }> }>(
        '/accounts',
        userId,
        businessLocationId,
        { method: 'GET' },
        origin
      )

      const accounts = accountsResponse.accounts || []
      console.log('[GBP Insights] Accounts found:', accounts.length)
      if (accounts.length === 0) {
        throw new Error('No GBP accounts found')
      }

      // Find primary account (same logic as working locations route)
      const primaryAccount = accounts.find(acc => acc.accountName?.includes('accounts/')) || accounts[0]
      if (!primaryAccount) {
        throw new Error('No primary GBP account found')
      }
      const accountName = primaryAccount.name
      console.log('[GBP Insights] Using account:', accountName, 'accountName field:', primaryAccount.accountName)
      
      // Validate account name format
      if (!accountName || !accountName.startsWith('accounts/')) {
        throw new Error(`Invalid account name format: ${accountName}. Expected format: accounts/123456789`)
      }

      // Get locations using the same pattern as the existing locations route
      // Use gbpApiRequest which handles the correct base URL
      const locationsEndpoint = `/${accountName}/locations`
      console.log('[GBP Insights] Fetching locations from endpoint:', locationsEndpoint)
      const locationsResponse = await gbpApiRequest<{ locations: GBPLocation[] }>(
        locationsEndpoint,
        userId,
        businessLocationId,
        { method: 'GET' },
        origin
      )
      console.log('[GBP Insights] Locations response:', { count: locationsResponse.locations?.length || 0 })

      const locations = locationsResponse.locations || []
      
      if (locations.length === 0) {
        throw new Error('No GBP locations found')
      }

      // Use first location (TODO: match by placeId if available)
      const location = locations[0]
      console.log('[GBP Insights] Using location:', location.name)
      return { location, locationName: location.name }
    } catch (error: any) {
      console.error('[GBP Insights] Error in getGBPLocationDetails:', error.message)
      throw new Error(`Failed to fetch GBP location: ${error.message}`)
    }
  }

  // If we have a locationName, we need to get the location from the list
  // The Account Management API doesn't support fetching a single location directly
  // So we'll fetch the list and find the matching location
  const accountsResponse = await gbpApiRequest<{ accounts: Array<{ name: string; accountName: string }> }>(
    '/accounts',
    userId,
    businessLocationId,
    { method: 'GET' },
    origin
  )

  const accounts = accountsResponse.accounts || []
  if (accounts.length === 0) {
    throw new Error('No GBP accounts found')
  }

  // Find primary account (same logic as working locations route)
  const primaryAccount = accounts.find(acc => acc.accountName?.includes('accounts/')) || accounts[0]
  const accountName = primaryAccount.name

  // Get locations list
  const locationsResponse = await gbpApiRequest<{ locations: GBPLocation[] }>(
    `/${accountName}/locations`,
    userId,
    businessLocationId,
    { method: 'GET' },
    origin
  )

  const locations = locationsResponse.locations || []
  
  // Find the location matching the provided locationName
  const location = locations.find(loc => loc.name === gbpLocationName)
  
  if (!location) {
    throw new Error(`GBP location ${gbpLocationName} not found`)
  }
  
  return { location, locationName: gbpLocationName }
}

/**
 * Get GBP performance metrics for a location
 * 
 * @param userId - Antistatic user ID
 * @param businessLocationId - Antistatic business location ID
 * @param locationName - GBP location resource name
 * @param origin - Request origin for token refresh
 * @returns Performance metrics
 */
async function getGBPPerformanceMetrics(
  userId: string,
  businessLocationId: string,
  locationName: string,
  origin?: string
): Promise<{
  totalCallClicks: number
  totalWebsiteClicks: number
  totalDirectionsRequests: number
  rawMetrics: any
}> {
  // Performance API may not be available or may require additional setup
  // Return zeros gracefully if it fails
  try {
    const accessToken = await getValidAccessToken(userId, businessLocationId, origin)
    
    // Business Profile Performance API
    // Note: This API may require different scopes or setup
    // Using the Performance API endpoint
    const performanceBaseUrl = 'https://businessprofileperformance.googleapis.com/v1'
    
    // Get daily metrics for last 90 days
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 90)

    const metricsUrl = `${performanceBaseUrl}/${locationName}/fetchMultiDailyMetricsTimeSeries`
  
    const requestBody = {
      dailyMetrics: [
        'BUSINESS_CALLS',
        'BUSINESS_DIRECTION_REQUESTS',
        'BUSINESS_WEBSITE_CLICKS',
      ],
      dailyRange: {
        startDate: {
          year: startDate.getFullYear(),
          month: startDate.getMonth() + 1,
          day: startDate.getDate(),
        },
        endDate: {
          year: endDate.getFullYear(),
          month: endDate.getMonth() + 1,
          day: endDate.getDate(),
        },
      },
    }

    const response = await fetch(metricsUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      console.warn('[GBP Insights] Performance API error (may not be available):', {
        status: response.status,
        error: error.error?.message || JSON.stringify(error),
      })
      // Return zeros if performance API is not available
      return {
        totalCallClicks: 0,
        totalWebsiteClicks: 0,
        totalDirectionsRequests: 0,
        rawMetrics: null,
      }
    }

    const metricsData = await response.json()

    // Aggregate daily metrics
    let totalCallClicks = 0
    let totalWebsiteClicks = 0
    let totalDirectionsRequests = 0

    if (metricsData.multiDailyMetricTimeSeries) {
      for (const series of metricsData.multiDailyMetricTimeSeries) {
        if (series.dailyMetricValues) {
          for (const dailyValue of series.dailyMetricValues) {
            const value = dailyValue.dailyValue?.values?.[0]?.value || 0
            
            if (series.dailyMetric === 'BUSINESS_CALLS') {
              totalCallClicks += value
            } else if (series.dailyMetric === 'BUSINESS_WEBSITE_CLICKS') {
              totalWebsiteClicks += value
            } else if (series.dailyMetric === 'BUSINESS_DIRECTION_REQUESTS') {
              totalDirectionsRequests += value
            }
          }
        }
      }
    }

    return {
      totalCallClicks,
      totalWebsiteClicks,
      totalDirectionsRequests,
      rawMetrics: metricsData,
    }
  } catch (error: any) {
    console.warn('[GBP Insights] Performance metrics API not available:', error.message)
    // Return zeros on error - this is expected if Performance API is not enabled
    return {
      totalCallClicks: 0,
      totalWebsiteClicks: 0,
      totalDirectionsRequests: 0,
      rawMetrics: null,
    }
  }
}

/**
 * Get latest review timestamp from GBP
 * 
 * @param userId - Antistatic user ID
 * @param businessLocationId - Antistatic business location ID
 * @param locationName - GBP location resource name
 * @param origin - Request origin for token refresh
 * @returns Latest review timestamp or null
 */
async function getLatestReviewTimestamp(
  userId: string,
  businessLocationId: string,
  locationName: string,
  origin?: string
): Promise<string | null> {
  try {
    const accessToken = await getValidAccessToken(userId, businessLocationId, origin)
    const reviewsBaseUrl = 'https://mybusiness.googleapis.com/v4'
    const reviewsUrl = `${reviewsBaseUrl}/${locationName}/reviews?pageSize=1&orderBy=updateTime desc`

    const response = await fetch(reviewsUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    const reviews = data.reviews || []
    if (reviews.length > 0) {
      return reviews[0].updateTime || reviews[0].createTime || null
    }

    return null
  } catch (error) {
    console.warn('[GBP Insights] Error fetching latest review:', error)
    return null
  }
}

/**
 * Get comprehensive GBP insights for a business location
 * 
 * @param userId - Antistatic user ID
 * @param businessLocationId - Antistatic business location ID
 * @param gbpLocationName - Optional GBP location resource name (will fetch if not provided)
 * @param origin - Request origin for token refresh
 * @returns Combined GBP insights data
 */
export async function getGBPInsights(
  userId: string,
  businessLocationId: string,
  gbpLocationName?: string,
  origin?: string
): Promise<GBPInsightsData> {
  console.log('[GBP Insights] Fetching insights for location:', {
    userId,
    businessLocationId,
    gbpLocationName,
  })

  // Get location details
  let location: GBPLocation
  let locationName: string
  
  try {
    const result = await getGBPLocationDetails(
      userId,
      businessLocationId,
      gbpLocationName,
      origin
    )
    location = result.location
    locationName = result.locationName
  } catch (error: any) {
    console.error('[GBP Insights] Error fetching location details:', error)
    throw new Error(`Failed to fetch GBP location: ${error.message}`)
  }

  // Get performance metrics (may fail if API not available, that's OK)
  let performance
  try {
    performance = await getGBPPerformanceMetrics(
      userId,
      businessLocationId,
      locationName,
      origin
    )
  } catch (error: any) {
    console.warn('[GBP Insights] Performance metrics not available:', error.message)
    // Return zeros if performance API fails
    performance = {
      totalCallClicks: 0,
      totalWebsiteClicks: 0,
      totalDirectionsRequests: 0,
      rawMetrics: null,
    }
  }

  // Get latest review timestamp
  const lastReviewAt = await getLatestReviewTimestamp(
    userId,
    businessLocationId,
    locationName,
    origin
  )

  // Extract categories
  const primaryCategory = location.primaryCategory?.displayName || null
  const additionalCategories: string[] = (location as any).categories?.map((cat: any) => cat.displayName) || []

  // Build address object
  const address = location.storefrontAddress ? {
    addressLines: location.storefrontAddress.addressLines || [],
    locality: location.storefrontAddress.locality || '',
    administrativeArea: location.storefrontAddress.administrativeArea || '',
    postalCode: location.storefrontAddress.postalCode || '',
    regionCode: location.storefrontAddress.regionCode || '',
  } : null

  // Extract website URL if available
  const websiteUrl = (location as any).websiteUri || null

  // Note: Rating and review count may need to come from Places API or reviews API
  // For now, we'll fetch from reviews API if available
  let avgRating: number | null = null
  let reviewCount: number | null = null

  try {
    const accessToken = await getValidAccessToken(userId, businessLocationId, origin)
    const reviewsBaseUrl = 'https://mybusiness.googleapis.com/v4'
    const reviewsUrl = `${reviewsBaseUrl}/${locationName}/reviews?pageSize=1`

    const reviewsResponse = await fetch(reviewsUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (reviewsResponse.ok) {
      const reviewsData = await reviewsResponse.json()
      // Note: GBP Reviews API may not return aggregate rating/count
      // We may need to calculate from individual reviews or use Places API
      reviewCount = reviewsData.totalReviewCount || null
    }
  } catch (error) {
    console.warn('[GBP Insights] Could not fetch review count:', error)
  }

  return {
    core: {
      avgRating,
      reviewCount,
      primaryCategory,
      additionalCategories,
      websiteUrl,
      phone: location.phoneNumbers?.primaryPhone || null,
      address,
      lastReviewAt,
    },
    performance,
    locationName,
  }
}

