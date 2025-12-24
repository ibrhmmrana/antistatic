import { createClient } from '@/lib/supabase/server'
import { Database } from '@/lib/supabase/database.types'
import { getGBPAccessTokenForLocation } from '@/lib/gbp/client'
import { gbpApiRequest } from '@/lib/gbp/client'

type MiniSeries = Array<{ x: string; y: number }>

export interface OverviewMetrics {
  reviews: {
    ratingAvg: number
    newReviews7d: number
    deltaRating?: number
    series7d: MiniSeries
  }
  listings: {
    directions30d: number // Total for past 30 days
    directions7d: number // Total for last 7 days (for reference)
    directions7dPrev: number // Total for previous 7 days (for delta)
    deltaDirections?: number // Change in direction requests (absolute)
    series7d: MiniSeries // Chart data for last 7 days
  }
  impressions: {
    impressions7d: number
    impressions7dPrev: number
    deltaImpressions?: number
    series7d: MiniSeries
  }
  callsAndWebsite: {
    calls7d: number
    websiteClicks7d: number
    calls7dPrev: number
    websiteClicks7dPrev: number
    deltaCalls?: number
    deltaWebsite?: number
    callsSeries7d: MiniSeries
    websiteSeries7d: MiniSeries
  }
  social: {
    posts7d: number
    analyzedChannels: string[] // List of channel names that were analyzed (e.g., ['facebook', 'instagram'])
    series7d?: MiniSeries
  }
  visibility: {
    likes7d: number // Total likes across all social channels in past 7 days
    comments7d: number // Total comments across all social channels in past 7 days
    analyzedChannels: string[] // List of channel names that were analyzed
    series7d: MiniSeries
  }
}

type BusinessReview = Database['public']['Tables']['business_reviews']['Row']
type BusinessReviewSelect = Pick<BusinessReview, 'rating' | 'published_at'>
type BusinessInsight = Database['public']['Tables']['business_insights']['Row']
type BusinessLocation = Database['public']['Tables']['business_locations']['Row']
type BusinessLocationSelect = Pick<BusinessLocation, 'google_location_name'>

/**
 * Convert star rating string to number
 */
function starRatingToNumber(rating: string): number {
  const map: Record<string, number> = {
    'ONE': 1,
    'TWO': 2,
    'THREE': 3,
    'FOUR': 4,
    'FIVE': 5,
  }
  return map[rating] || 0
}

/**
 * Extract location ID from GBP location resource name
 * Example: "accounts/123/locations/456" -> "456"
 */
function extractLocationId(locationName: string): string | null {
  const match = locationName.match(/locations\/(\d+)/)
  return match ? match[1] : null
}

/**
 * Fetch GBP performance metrics for listings
 */
export async function fetchGBPPerformanceMetrics(
  userId: string,
  businessLocationId: string,
  startDate: Date,
  endDate: Date,
  chartStartDate?: Date, // Optional: different start date for chart
  prevPeriodStartDate?: Date, // Optional: start date for previous period (for delta)
  prevPeriodEndDate?: Date // Optional: end date for previous period (for delta)
): Promise<{
  directions30d: number // Total for the full range
  directions7d: number // Total for selected period
  directions7dPrev: number // Total for previous period (for delta)
  series7d: MiniSeries // Chart data for selected period
} | null> {
  try {
    // Get access token
    const { accessToken } = await getGBPAccessTokenForLocation(userId, businessLocationId)

    // Get location name from business_locations or fetch it
    const supabase = await createClient()
    const businessLocationResult = await supabase
      .from('business_locations')
      .select('google_location_name')
      .eq('id', businessLocationId)
      .maybeSingle()

    const businessLocation = businessLocationResult.data as BusinessLocationSelect | null
    let locationName: string | null = businessLocation?.google_location_name || null

    // If we don't have location name stored, fetch it
    if (!locationName) {
      const { accountName } = await getGBPAccessTokenForLocation(userId, businessLocationId)
      const locationsResponse = await gbpApiRequest<{ locations: Array<{ name: string }> }>(
        `/${accountName}/locations`,
        userId,
        businessLocationId,
        { method: 'GET' }
      )

      const locations = locationsResponse.locations || []
      if (locations.length === 0) {
        return null
      }

      locationName = locations[0].name
    }

    // Extract location ID from location name
    const locationId = extractLocationId(locationName)
    if (!locationId) {
      console.warn('[Dashboard Metrics] Could not extract location ID from:', locationName)
      return null
    }

    // Build query parameters
    const params = new URLSearchParams({
      dailyMetrics: 'BUSINESS_DIRECTION_REQUESTS',
      'daily_range.start_date.year': String(startDate.getFullYear()),
      'daily_range.start_date.month': String(startDate.getMonth() + 1),
      'daily_range.start_date.day': String(startDate.getDate()),
      'daily_range.end_date.year': String(endDate.getFullYear()),
      'daily_range.end_date.month': String(endDate.getMonth() + 1),
      'daily_range.end_date.day': String(endDate.getDate()),
    })

    const metricsUrl = `https://businessprofileperformance.googleapis.com/v1/locations/${locationId}:fetchMultiDailyMetricsTimeSeries?${params.toString()}`

    const response = await fetch(metricsUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      console.warn('[Dashboard Metrics] Failed to fetch GBP performance metrics:', response.status)
      return null
    }

    const metricsData = await response.json()

    // Handle response format: could be array with single object, or direct object
    let responseData: any
    if (Array.isArray(metricsData) && metricsData.length > 0) {
      responseData = metricsData[0]
    } else {
      responseData = metricsData
    }

    // Parse the nested structure
    const multiDailyMetricTimeSeries = responseData.multiDailyMetricTimeSeries || []
    if (multiDailyMetricTimeSeries.length === 0) {
      return null
    }

    const dailyMetricTimeSeries = multiDailyMetricTimeSeries[0]?.dailyMetricTimeSeries || []
    if (dailyMetricTimeSeries.length === 0) {
      return null
    }

    const timeSeries = dailyMetricTimeSeries[0]?.timeSeries
    if (!timeSeries || !timeSeries.datedValues) {
      return null
    }

    const datedValues = timeSeries.datedValues || []

    // Calculate totals for full range, selected period, and previous period
    let directions30d = 0
    let directions7d = 0
    let directions7dPrev = 0
    const directionsByDay = new Map<string, number>()
    const chartStart = chartStartDate || startDate

    // Normalize dates for comparison
    const normalizeDate = (d: Date) => {
      const normalized = new Date(d)
      normalized.setHours(0, 0, 0, 0)
      return normalized
    }

    const startDateNormalized = normalizeDate(startDate)
    const endDateNormalized = normalizeDate(endDate)
    const chartStartNormalized = normalizeDate(chartStart)
    const prevPeriodStartNormalized = prevPeriodStartDate ? normalizeDate(prevPeriodStartDate) : null
    const prevPeriodEndNormalized = prevPeriodEndDate ? normalizeDate(prevPeriodEndDate) : null

    datedValues.forEach((datedValue: any) => {
      if (!datedValue.date || !datedValue.value) return

      const { year, month, day } = datedValue.date
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const value = parseInt(datedValue.value, 10) || 0

      const date = normalizeDate(new Date(year, month - 1, day))
      
      // Count for full range
      if (date >= startDateNormalized && date <= endDateNormalized) {
        directions30d += value
        directionsByDay.set(dateStr, (directionsByDay.get(dateStr) || 0) + value)
      }
      
      // Count for selected period (for chart and primary metric)
      if (date >= chartStartNormalized && date <= endDateNormalized) {
        directions7d += value
      }
      
      // Count for previous period (for delta)
      if (prevPeriodStartNormalized && prevPeriodEndNormalized && date >= prevPeriodStartNormalized && date < prevPeriodEndNormalized) {
        directions7dPrev += value
      }
    })

    // Build series for selected period (fill missing days with 0)
    const series7d: MiniSeries = []
    const daysDiff = Math.ceil((endDateNormalized.getTime() - chartStartNormalized.getTime()) / (1000 * 60 * 60 * 24))
    
    for (let i = daysDiff - 1; i >= 0; i--) {
      const date = new Date(endDateNormalized)
      date.setDate(date.getDate() - i)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const dateStr = `${year}-${month}-${day}`
      series7d.push({
        x: dateStr,
        y: directionsByDay.get(dateStr) || 0,
      })
    }

    return {
      directions30d,
      directions7d,
      directions7dPrev,
      series7d,
    }
  } catch (error: any) {
    console.warn('[Dashboard Metrics] Error fetching GBP performance metrics:', error.message)
    return null
  }
}

/**
 * Fetch GBP impressions metrics (sum of all impression types)
 */
export async function fetchGBPImpressionsMetrics(
  userId: string,
  businessLocationId: string,
  startDate: Date,
  endDate: Date,
  chartStartDate?: Date, // Optional: different start date for chart
  prevPeriodStartDate?: Date, // Optional: start date for previous period (for delta)
  prevPeriodEndDate?: Date // Optional: end date for previous period (for delta)
): Promise<{
  impressions7d: number // Total for selected period
  impressions7dPrev: number // Total for previous period (for delta)
  series7d: MiniSeries // Chart data for selected period
} | null> {
  try {
    // Get access token
    const { accessToken } = await getGBPAccessTokenForLocation(userId, businessLocationId)

    // Get location name from business_locations or fetch it
    const supabase = await createClient()
    const businessLocationResult = await supabase
      .from('business_locations')
      .select('google_location_name')
      .eq('id', businessLocationId)
      .maybeSingle()

    const businessLocation = businessLocationResult.data as BusinessLocationSelect | null
    let locationName: string | null = businessLocation?.google_location_name || null

    // If we don't have location name stored, fetch it
    if (!locationName) {
      const { accountName } = await getGBPAccessTokenForLocation(userId, businessLocationId)
      const locationsResponse = await gbpApiRequest<{ locations: Array<{ name: string }> }>(
        `/${accountName}/locations`,
        userId,
        businessLocationId,
        { method: 'GET' }
      )

      const locations = locationsResponse.locations || []
      if (locations.length === 0) {
        return null
      }

      locationName = locations[0].name
    }

    // Extract location ID from location name
    const locationId = extractLocationId(locationName)
    if (!locationId) {
      console.warn('[Dashboard Metrics] Could not extract location ID from:', locationName)
      return null
    }

    // Build query parameters - multiple dailyMetrics parameters
    const params = new URLSearchParams()
    params.append('dailyMetrics', 'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH')
    params.append('dailyMetrics', 'BUSINESS_IMPRESSIONS_MOBILE_SEARCH')
    params.append('dailyMetrics', 'BUSINESS_IMPRESSIONS_DESKTOP_MAPS')
    params.append('dailyMetrics', 'BUSINESS_IMPRESSIONS_MOBILE_MAPS')
    params.append('dailyRange.start_date.year', String(startDate.getFullYear()))
    params.append('dailyRange.start_date.month', String(startDate.getMonth() + 1))
    params.append('dailyRange.start_date.day', String(startDate.getDate()))
    params.append('dailyRange.end_date.year', String(endDate.getFullYear()))
    params.append('dailyRange.end_date.month', String(endDate.getMonth() + 1))
    params.append('dailyRange.end_date.day', String(endDate.getDate()))

    const metricsUrl = `https://businessprofileperformance.googleapis.com/v1/locations/${locationId}:fetchMultiDailyMetricsTimeSeries?${params.toString()}`

    const response = await fetch(metricsUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      console.warn('[Dashboard Metrics] Failed to fetch GBP impressions metrics:', response.status)
      return null
    }

    const metricsData = await response.json()

    // Handle response format: could be array with single object, or direct object
    let responseData: any
    if (Array.isArray(metricsData) && metricsData.length > 0) {
      responseData = metricsData[0]
    } else {
      responseData = metricsData
    }

    // Parse the nested structure
    const multiDailyMetricTimeSeries = responseData.multiDailyMetricTimeSeries || []
    if (multiDailyMetricTimeSeries.length === 0) {
      return null
    }

    const dailyMetricTimeSeries = multiDailyMetricTimeSeries[0]?.dailyMetricTimeSeries || []
    if (dailyMetricTimeSeries.length === 0) {
      return null
    }

    // Sum all impression types by date
    const impressionsByDay = new Map<string, number>()
    const chartStart = chartStartDate || startDate

    // Process each metric type (DESKTOP_SEARCH, MOBILE_SEARCH, DESKTOP_MAPS, MOBILE_MAPS)
    dailyMetricTimeSeries.forEach((metricSeries: any) => {
      const timeSeries = metricSeries?.timeSeries
      if (!timeSeries || !timeSeries.datedValues) return

      const datedValues = timeSeries.datedValues || []
      datedValues.forEach((datedValue: any) => {
        if (!datedValue.date || !datedValue.value) return

        const { year, month, day } = datedValue.date
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        const value = parseInt(datedValue.value, 10) || 0

        // Sum all impression types for this date
        impressionsByDay.set(dateStr, (impressionsByDay.get(dateStr) || 0) + value)
      })
    })

    // Calculate totals for selected period and previous period
    let impressions7d = 0
    let impressions7dPrev = 0

    // Normalize dates for comparison
    const normalizeDate = (d: Date) => {
      const normalized = new Date(d)
      normalized.setHours(0, 0, 0, 0)
      return normalized
    }

    const chartStartNormalized = normalizeDate(chartStart)
    const endDateNormalized = normalizeDate(endDate)
    const prevPeriodStartNormalized = prevPeriodStartDate ? normalizeDate(prevPeriodStartDate) : null
    const prevPeriodEndNormalized = prevPeriodEndDate ? normalizeDate(prevPeriodEndDate) : null

    impressionsByDay.forEach((value, dateStr) => {
      const [year, month, day] = dateStr.split('-').map(Number)
      const date = normalizeDate(new Date(year, month - 1, day))
      
      // Count for selected period (for chart and primary metric)
      if (date >= chartStartNormalized && date <= endDateNormalized) {
        impressions7d += value
      }
      
      // Count for previous period (for delta)
      if (prevPeriodStartNormalized && prevPeriodEndNormalized && date >= prevPeriodStartNormalized && date < prevPeriodEndNormalized) {
        impressions7dPrev += value
      }
    })

    // Build series for selected period (fill missing days with 0)
    const series7d: MiniSeries = []
    const daysDiff = Math.ceil((endDateNormalized.getTime() - chartStartNormalized.getTime()) / (1000 * 60 * 60 * 24))
    
    for (let i = daysDiff - 1; i >= 0; i--) {
      const date = new Date(endDateNormalized)
      date.setDate(date.getDate() - i)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const dateStr = `${year}-${month}-${day}`
      series7d.push({
        x: dateStr,
        y: impressionsByDay.get(dateStr) || 0,
      })
    }

    return {
      impressions7d,
      impressions7dPrev,
      series7d,
    }
  } catch (error: any) {
    console.warn('[Dashboard Metrics] Error fetching GBP impressions metrics:', error.message)
    return null
  }
}

/**
 * Fetch GBP calls and website clicks metrics
 */
export async function fetchGBPCallsAndWebsiteMetrics(
  userId: string,
  businessLocationId: string,
  startDate: Date,
  endDate: Date,
  chartStartDate?: Date, // Optional: different start date for chart
  prevPeriodStartDate?: Date, // Optional: start date for previous period (for delta)
  prevPeriodEndDate?: Date // Optional: end date for previous period (for delta)
): Promise<{
  calls7d: number // Total calls for selected period
  websiteClicks7d: number // Total website clicks for selected period
  calls7dPrev: number // Total calls for previous period (for delta)
  websiteClicks7dPrev: number // Total website clicks for previous period (for delta)
  callsSeries7d: MiniSeries // Chart data for calls (selected period)
  websiteSeries7d: MiniSeries // Chart data for website clicks (selected period)
} | null> {
  try {
    // Get access token and account name
    const { accessToken, accountName } = await getGBPAccessTokenForLocation(userId, businessLocationId)

    // Get location name from business_locations or fetch it
    const supabase = await createClient()
    const businessLocationResult = await supabase
      .from('business_locations')
      .select('google_location_name')
      .eq('id', businessLocationId)
      .maybeSingle()

    const businessLocation = businessLocationResult.data as BusinessLocationSelect | null
    let locationName: string | null = businessLocation?.google_location_name || null

    // If we don't have location name stored, fetch it
    if (!locationName) {
      const locationsResponse = await gbpApiRequest<{ locations: Array<{ name: string }> }>(
        `/${accountName}/locations`,
        userId,
        businessLocationId,
        { method: 'GET' }
      )

      const locations = locationsResponse.locations || []
      if (locations.length === 0) {
        return null
      }

      locationName = locations[0].name
    }

    // Extract location ID from location name
    const locationId = extractLocationId(locationName)
    if (!locationId) {
      console.warn('[Dashboard Metrics] Could not extract location ID from:', locationName)
      return null
    }

    // Build query parameters - multiple dailyMetrics parameters
    const params = new URLSearchParams()
    params.append('dailyMetrics', 'CALL_CLICKS')
    params.append('dailyMetrics', 'WEBSITE_CLICKS')
    params.append('daily_range.start_date.year', String(startDate.getFullYear()))
    params.append('daily_range.start_date.month', String(startDate.getMonth() + 1))
    params.append('daily_range.start_date.day', String(startDate.getDate()))
    params.append('daily_range.end_date.year', String(endDate.getFullYear()))
    params.append('daily_range.end_date.month', String(endDate.getMonth() + 1))
    params.append('daily_range.end_date.day', String(endDate.getDate()))

    const metricsUrl = `https://businessprofileperformance.googleapis.com/v1/locations/${locationId}:fetchMultiDailyMetricsTimeSeries?${params.toString()}`

    const response = await fetch(metricsUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      console.warn('[Dashboard Metrics] Failed to fetch GBP calls/website metrics:', response.status)
      return null
    }

    const metricsData = await response.json()

    // Handle response format: could be array with single object, or direct object
    let responseData: any
    if (Array.isArray(metricsData) && metricsData.length > 0) {
      responseData = metricsData[0]
    } else {
      responseData = metricsData
    }

    // Parse the nested structure
    const multiDailyMetricTimeSeries = responseData.multiDailyMetricTimeSeries || []
    if (multiDailyMetricTimeSeries.length === 0) {
      return null
    }

    const dailyMetricTimeSeries = multiDailyMetricTimeSeries[0]?.dailyMetricTimeSeries || []
    if (dailyMetricTimeSeries.length === 0) {
      return null
    }

    // Sum calls and website clicks by date
    const callsByDay = new Map<string, number>()
    const websiteByDay = new Map<string, number>()
    const chartStart = chartStartDate || startDate

    // Process each metric type (CALL_CLICKS, WEBSITE_CLICKS)
    dailyMetricTimeSeries.forEach((metricSeries: any) => {
      const timeSeries = metricSeries?.timeSeries
      if (!timeSeries || !timeSeries.datedValues) return

      const datedValues = timeSeries.datedValues || []
      const metricType = metricSeries.dailyMetric

      datedValues.forEach((datedValue: any) => {
        if (!datedValue.date || !datedValue.value) return

        const { year, month, day } = datedValue.date
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        const value = parseInt(datedValue.value, 10) || 0

        if (metricType === 'CALL_CLICKS') {
          callsByDay.set(dateStr, (callsByDay.get(dateStr) || 0) + value)
        } else if (metricType === 'WEBSITE_CLICKS') {
          websiteByDay.set(dateStr, (websiteByDay.get(dateStr) || 0) + value)
        }
      })
    })

    // Calculate totals for last 7 days and previous 7 days
    let calls7d = 0
    let websiteClicks7d = 0
    let calls7dPrev = 0
    let websiteClicks7dPrev = 0

    // Normalize dates to midnight for proper comparison
    const normalizeDate = (d: Date) => {
      const normalized = new Date(d)
      normalized.setHours(0, 0, 0, 0)
      return normalized
    }
    
    const chartStartNormalized = normalizeDate(chartStart)
    const endDateNormalized = normalizeDate(endDate)
    const prevPeriodStartNormalized = prevPeriodStartDate ? normalizeDate(prevPeriodStartDate) : null
    const prevPeriodEndNormalized = prevPeriodEndDate ? normalizeDate(prevPeriodEndDate) : null

    callsByDay.forEach((value, dateStr) => {
      // Parse date string and normalize to midnight
      const [year, month, day] = dateStr.split('-').map(Number)
      const date = normalizeDate(new Date(year, month - 1, day))
      
      // Count for selected period (for chart and primary metric)
      if (date >= chartStartNormalized && date <= endDateNormalized) {
        calls7d += value
      }
      
      // Count for previous period (for delta) - exclude the end date to avoid overlap
      if (prevPeriodStartNormalized && prevPeriodEndNormalized && date >= prevPeriodStartNormalized && date < prevPeriodEndNormalized) {
        calls7dPrev += value
      }
    })

    websiteByDay.forEach((value, dateStr) => {
      // Parse date string and normalize to midnight
      const [year, month, day] = dateStr.split('-').map(Number)
      const date = normalizeDate(new Date(year, month - 1, day))
      
      // Count for selected period (for chart and primary metric)
      if (date >= chartStartNormalized && date <= endDateNormalized) {
        websiteClicks7d += value
      }
      
      // Count for previous period (for delta) - exclude the end date to avoid overlap
      if (prevPeriodStartNormalized && prevPeriodEndNormalized && date >= prevPeriodStartNormalized && date < prevPeriodEndNormalized) {
        websiteClicks7dPrev += value
      }
    })

    // Build series for selected period (fill missing days with 0)
    const callsSeries7d: MiniSeries = []
    const websiteSeries7d: MiniSeries = []
    const daysDiff = Math.ceil((endDateNormalized.getTime() - chartStartNormalized.getTime()) / (1000 * 60 * 60 * 24))
    
    for (let i = daysDiff - 1; i >= 0; i--) {
      const date = new Date(endDateNormalized)
      date.setDate(date.getDate() - i)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const dateStr = `${year}-${month}-${day}`
      callsSeries7d.push({
        x: dateStr,
        y: callsByDay.get(dateStr) || 0,
      })
      websiteSeries7d.push({
        x: dateStr,
        y: websiteByDay.get(dateStr) || 0,
      })
    }

    return {
      calls7d,
      websiteClicks7d,
      calls7dPrev,
      websiteClicks7dPrev,
      callsSeries7d,
      websiteSeries7d,
    }
  } catch (error: any) {
    console.warn('[Dashboard Metrics] Error fetching GBP calls/website metrics:', error.message)
    return null
  }
}

/**
 * Fetch reviews from GBP API for metrics calculation
 */
async function fetchGBPReviewsForMetrics(
  userId: string,
  businessLocationId: string
): Promise<{
  averageRating: number
  totalReviewCount: number
  reviews: Array<{
    createTime: string
    starRating: string
    ratingValue: number
  }>
} | null> {
  try {
    // Get access token and account name
    const { accessToken, accountName } = await getGBPAccessTokenForLocation(
      userId,
      businessLocationId
    )

    // Get location name from business_locations or fetch it
    const supabase = await createClient()
    const businessLocationResult = await supabase
      .from('business_locations')
      .select('google_location_name')
      .eq('id', businessLocationId)
      .maybeSingle()

    const businessLocation = businessLocationResult.data as BusinessLocationSelect | null
    let locationName: string | null = businessLocation?.google_location_name || null

    // If we don't have location name stored, fetch it
    if (!locationName) {
      const locationsResponse = await gbpApiRequest<{ locations: Array<{ name: string }> }>(
        `/${accountName}/locations`,
        userId,
        businessLocationId,
        { method: 'GET' }
      )

      const locations = locationsResponse.locations || []
      if (locations.length === 0) {
        return null
      }

      locationName = locations[0].name
    }

    // Construct reviews URL
    // Format: https://mybusiness.googleapis.com/v4/accounts/{accountId}/locations/{locationId}/reviews
    // The locationName from the API is the full resource path like "accounts/123/locations/456"
    // If it already starts with the accountName, use it directly; otherwise combine them
    let reviewsPath: string
    if (locationName.startsWith(accountName)) {
      // Location name already includes account prefix, use it directly
      reviewsPath = `${locationName}/reviews`
    } else {
      // Combine account and location
      reviewsPath = `${accountName}/${locationName}/reviews`
    }

    const reviewsUrl = `https://mybusiness.googleapis.com/v4/${reviewsPath}`
    
    const reviewsResponse = await fetch(reviewsUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (!reviewsResponse.ok) {
      console.warn('[Dashboard Metrics] Failed to fetch GBP reviews:', reviewsResponse.status)
      return null
    }

    const reviewsData = await reviewsResponse.json()
    
    // Handle the response format: could be array with single object, or direct object
    let reviewsResponseData: any
    if (Array.isArray(reviewsData) && reviewsData.length > 0) {
      reviewsResponseData = reviewsData[0]
    } else {
      reviewsResponseData = reviewsData
    }

    const rawReviews = reviewsResponseData.reviews || []
    const averageRating = reviewsResponseData.averageRating || 0
    const totalReviewCount = reviewsResponseData.totalReviewCount || rawReviews.length

    // Transform reviews
    const reviews = rawReviews.map((review: any) => {
      const starRating = review.starRating || 'FIVE'
      return {
        createTime: review.createTime || '',
        starRating,
        ratingValue: starRatingToNumber(starRating),
      }
    })

    return {
      averageRating,
      totalReviewCount,
      reviews,
    }
  } catch (error: any) {
    console.warn('[Dashboard Metrics] Error fetching GBP reviews:', error.message)
    return null
  }
}

/**
 * Get overview metrics for dashboard
 */
export async function getOverviewMetrics(
  userId: string,
  businessLocationId: string
): Promise<OverviewMetrics> {
  const supabase = await createClient()

  // Calculate date ranges
  const now = new Date()
  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const fourteenDaysAgo = new Date(now)
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)

  // Helper to format date as YYYY-MM-DD
  const formatDate = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // ============================================================================
  // REVIEWS METRICS - Fetch from GBP API
  // ============================================================================
  const gbpReviewsData = await fetchGBPReviewsForMetrics(userId, businessLocationId)

  let ratingAvg = 0
  let newReviews7d = 0
  let newReviews14d = 0
  let deltaRating: number | undefined = undefined
  const reviewsSeries7d: MiniSeries = []

  if (gbpReviewsData) {
    // Use API average rating (current overall rating)
    ratingAvg = gbpReviewsData.averageRating || 0

    // Get all reviews to calculate historical average ratings
    const allReviews = gbpReviewsData.reviews

    // Calculate average rating for each day in the last 7 days
    // For each day, calculate the average rating of all reviews up to that day
    const ratingByDay = new Map<string, number>()
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now)
      date.setDate(date.getDate() - i)
      const day = formatDate(date)
      
      // Get all reviews up to and including this day
      const reviewsUpToDay = allReviews.filter((review) => {
        if (!review.createTime) return false
        const reviewDate = new Date(review.createTime)
        return reviewDate <= date
      })
      
      // Calculate average rating up to this day
      if (reviewsUpToDay.length > 0) {
        const totalRating = reviewsUpToDay.reduce((sum, r) => sum + r.ratingValue, 0)
        const avgRating = totalRating / reviewsUpToDay.length
        ratingByDay.set(day, Math.round(avgRating * 10) / 10) // Round to 1 decimal
      } else {
        ratingByDay.set(day, ratingAvg) // Use current average if no reviews yet
      }
    }

    // Calculate rating change: compare today's average to 7 days ago
    const todayRating = ratingByDay.get(formatDate(now)) || ratingAvg
    const sevenDaysAgoRating = ratingByDay.get(formatDate(sevenDaysAgo)) || ratingAvg
    const ratingChange = todayRating - sevenDaysAgoRating
    deltaRating = ratingChange // Store as absolute change in stars

    // Build time series for rating chart
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now)
      date.setDate(date.getDate() - i)
      const day = formatDate(date)
      reviewsSeries7d.push({
        x: day,
        y: ratingByDay.get(day) || ratingAvg,
      })
    }

    // Count new reviews for reference
    const reviews7d = allReviews.filter((review) => {
      if (!review.createTime) return false
      const reviewDate = new Date(review.createTime)
      return reviewDate >= sevenDaysAgo
    })
    newReviews7d = reviews7d.length
  } else {
    // Fallback: try database if API fails
    const reviews7dResult = await supabase
      .from('business_reviews')
      .select('rating, published_at')
      .eq('location_id', businessLocationId)
      .eq('source', 'gbp')
      .gte('published_at', sevenDaysAgo.toISOString())
      .order('published_at', { ascending: true })

    const reviews14dResult = await supabase
      .from('business_reviews')
      .select('rating, published_at')
      .eq('location_id', businessLocationId)
      .eq('source', 'gbp')
      .gte('published_at', fourteenDaysAgo.toISOString())
      .lt('published_at', sevenDaysAgo.toISOString())
      .order('published_at', { ascending: true })

    const reviews7d = reviews7dResult.data as BusinessReviewSelect[] | null
    const reviews14d = reviews14dResult.data as BusinessReviewSelect[] | null

    newReviews7d = reviews7d?.length || 0
    newReviews14d = reviews14d?.length || 0

    // Get all reviews for rating calculation
    const allReviewsDbResult = await supabase
      .from('business_reviews')
      .select('rating, published_at')
      .eq('location_id', businessLocationId)
      .eq('source', 'gbp')
      .order('published_at', { ascending: true })

    const allReviewsDb = allReviewsDbResult.data as BusinessReviewSelect[] | null

    // Calculate average rating for each day
    const ratingByDay = new Map<string, number>()
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now)
      date.setDate(date.getDate() - i)
      const day = formatDate(date)
      
      // Get all reviews up to and including this day
      const reviewsUpToDay = allReviewsDb?.filter((review) => {
        if (!review.published_at) return false
        const reviewDate = new Date(review.published_at)
        return reviewDate <= date
      }) || []
      
      // Calculate average rating up to this day
      if (reviewsUpToDay.length > 0) {
        const ratings = reviewsUpToDay.filter((r) => r.rating).map((r) => r.rating!)
        if (ratings.length > 0) {
          const totalRating = ratings.reduce((sum, r) => sum + r, 0)
          const avgRating = totalRating / ratings.length
          ratingByDay.set(day, Math.round(avgRating * 10) / 10)
        }
      }
    }

    // Use current overall rating if available
    const ratings7d = reviews7d?.filter((r) => r.rating).map((r) => r.rating!) || []
    ratingAvg = ratings7d.length > 0 ? ratings7d.reduce((a, b) => a + b, 0) / ratings7d.length : 0

    // Calculate rating change: compare today's average to 7 days ago
    const todayRating = ratingByDay.get(formatDate(now)) || ratingAvg
    const sevenDaysAgoRating = ratingByDay.get(formatDate(sevenDaysAgo)) || ratingAvg
    const ratingChange = todayRating - sevenDaysAgoRating
    deltaRating = ratingChange

    // Build time series for rating chart
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now)
      date.setDate(date.getDate() - i)
      const day = formatDate(date)
      reviewsSeries7d.push({
        x: day,
        y: ratingByDay.get(day) || ratingAvg,
      })
    }
  }

  // ============================================================================
  // LISTINGS METRICS (GBP Performance API)
  // ============================================================================
  // Fetch 30 days of data, but use last 7 days for chart
  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  
  // Calculate previous week dates for delta comparison
  const prevWeekStart = new Date(sevenDaysAgo)
  prevWeekStart.setDate(prevWeekStart.getDate() - 7)
  const prevWeekEnd = sevenDaysAgo

  const performanceMetrics = await fetchGBPPerformanceMetrics(
    userId,
    businessLocationId,
    thirtyDaysAgo, // Start date: 30 days ago
    now, // End date: today
    sevenDaysAgo, // Chart start date: 7 days ago (for chart data only)
    prevWeekStart, // Previous week start (for delta)
    prevWeekEnd // Previous week end (for delta)
  )

  let directions30d = 0
  let directions7d = 0
  let directions7dPrev = 0
  let deltaDirections: number | undefined = undefined
  let directionsSeries7d: MiniSeries = []

  if (performanceMetrics) {
    directions30d = performanceMetrics.directions30d // Total for 30 days
    directions7d = performanceMetrics.directions7d // Total for last 7 days
    directions7dPrev = performanceMetrics.directions7dPrev // Total for previous 7 days
    directionsSeries7d = performanceMetrics.series7d // Chart data for last 7 days
    
    // Calculate delta (change in direction requests)
    if (directions7dPrev > 0) {
      deltaDirections = directions7d - directions7dPrev
    } else if (directions7d > 0) {
      deltaDirections = directions7d // If no previous data, show current as positive change
    }
  } else {
    // Fallback: try database if API fails
    const { data: insights } = await supabase
      .from('business_insights')
      .select('gbp_total_directions_requests')
      .eq('location_id', businessLocationId)
      .eq('source', 'google')
      .maybeSingle()

    const totalDirections = (insights as BusinessInsight | null)?.gbp_total_directions_requests || 0
    directions30d = totalDirections
    directions7d = 0
    directions7dPrev = 0

    // Create empty series
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now)
      date.setDate(date.getDate() - i)
      directionsSeries7d.push({
        x: formatDate(date),
        y: 0,
      })
    }
  }

  // ============================================================================
  // IMPRESSIONS METRICS (GBP Performance API)
  // ============================================================================
  // Fetch 30 days of data, but use last 7 days for chart
  const impressionsMetrics = await fetchGBPImpressionsMetrics(
    userId,
    businessLocationId,
    thirtyDaysAgo, // Start date: 30 days ago
    now, // End date: today
    sevenDaysAgo, // Chart start date: 7 days ago (for chart data only)
    prevWeekStart, // Previous week start (for delta)
    prevWeekEnd // Previous week end (for delta)
  )

  let impressions7d = 0
  let impressions7dPrev = 0
  let deltaImpressions: number | undefined = undefined
  let impressionsSeries7d: MiniSeries = []

  if (impressionsMetrics) {
    impressions7d = impressionsMetrics.impressions7d // Total for last 7 days
    impressions7dPrev = impressionsMetrics.impressions7dPrev // Total for previous 7 days
    impressionsSeries7d = impressionsMetrics.series7d // Chart data for last 7 days
    
    // Calculate delta (change in impressions)
    if (impressions7dPrev > 0) {
      deltaImpressions = impressions7d - impressions7dPrev
    } else if (impressions7d > 0) {
      deltaImpressions = impressions7d // If no previous data, show current as positive change
    }
  } else {
    // Fallback: create empty series
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now)
      date.setDate(date.getDate() - i)
      impressionsSeries7d.push({
        x: formatDate(date),
        y: 0,
      })
    }
  }

  // ============================================================================
  // CALLS & WEBSITE METRICS (GBP Performance API)
  // ============================================================================
  // Fetch 30 days of data, but use last 7 days for chart
  const callsAndWebsiteMetrics = await fetchGBPCallsAndWebsiteMetrics(
    userId,
    businessLocationId,
    thirtyDaysAgo, // Start date: 30 days ago
    now, // End date: today
    sevenDaysAgo, // Chart start date: 7 days ago (for chart data only)
    prevWeekStart, // Previous week start (for delta)
    prevWeekEnd // Previous week end (for delta)
  )

  let calls7d = 0
  let websiteClicks7d = 0
  let calls7dPrev = 0
  let websiteClicks7dPrev = 0
  let deltaCalls: number | undefined = undefined
  let deltaWebsite: number | undefined = undefined
  let callsSeries7d: MiniSeries = []
  let websiteSeries7d: MiniSeries = []

  if (callsAndWebsiteMetrics) {
    calls7d = callsAndWebsiteMetrics.calls7d // Total for last 7 days
    websiteClicks7d = callsAndWebsiteMetrics.websiteClicks7d // Total for last 7 days
    calls7dPrev = callsAndWebsiteMetrics.calls7dPrev // Total for previous 7 days
    websiteClicks7dPrev = callsAndWebsiteMetrics.websiteClicks7dPrev // Total for previous 7 days
    callsSeries7d = callsAndWebsiteMetrics.callsSeries7d // Chart data for last 7 days
    websiteSeries7d = callsAndWebsiteMetrics.websiteSeries7d // Chart data for last 7 days
    
    // Calculate deltas (change in calls and website clicks)
    // Always calculate delta as the difference
    deltaCalls = calls7d - calls7dPrev
    
    // Only hide delta if both current and previous are 0 (no data at all)
    if (calls7d === 0 && calls7dPrev === 0) {
      deltaCalls = undefined
    }
    
    deltaWebsite = websiteClicks7d - websiteClicks7dPrev
    
    // Only hide delta if both current and previous are 0 (no data at all)
    if (websiteClicks7d === 0 && websiteClicks7dPrev === 0) {
      deltaWebsite = undefined
    }
  } else {
    // Fallback: create empty series
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now)
      date.setDate(date.getDate() - i)
      callsSeries7d.push({
        x: formatDate(date),
        y: 0,
      })
      websiteSeries7d.push({
        x: formatDate(date),
        y: 0,
      })
    }
  }

  // ============================================================================
  // SOCIAL METRICS - Fetch from business_insights (Facebook & Instagram posts)
  // ============================================================================
  let posts7d = 0
  const analyzedChannels: string[] = []

  // Get business location to check which social channels were analyzed
  const { data: location } = await supabase
    .from('business_locations')
    .select('facebook_username, instagram_username, linkedin_username, tiktok_username')
    .eq('id', businessLocationId)
    .maybeSingle()

  if (location) {
    // Track which channels were analyzed (have usernames)
    if (location.facebook_username) analyzedChannels.push('facebook')
    if (location.instagram_username) analyzedChannels.push('instagram')
    if (location.linkedin_username) analyzedChannels.push('linkedin')
    if (location.tiktok_username) analyzedChannels.push('tiktok')
  }

  // Get social posts from business_insights
  const { data: insights } = await supabase
    .from('business_insights')
    .select('facebook_raw_posts, instagram_raw_posts, instagram_raw_comments')
    .eq('location_id', businessLocationId)
    .eq('source', 'google')
    .maybeSingle()

  if (insights) {
    const sevenDaysAgoTimestamp = sevenDaysAgo.getTime()

    // Count Facebook posts from last 7 days
    if (insights.facebook_raw_posts && Array.isArray(insights.facebook_raw_posts)) {
      const facebookPosts = insights.facebook_raw_posts as Array<{ time?: string }>
      const recentFacebookPosts = facebookPosts.filter((post) => {
        if (!post.time) return false
        const postTime = new Date(post.time).getTime()
        return postTime >= sevenDaysAgoTimestamp
      })
      posts7d += recentFacebookPosts.length
    }

    // Count Instagram posts from last 7 days
    if (insights.instagram_raw_posts && Array.isArray(insights.instagram_raw_posts)) {
      const instagramPosts = insights.instagram_raw_posts as Array<{ timestamp?: string }>
      const recentInstagramPosts = instagramPosts.filter((post) => {
        if (!post.timestamp) return false
        const postTime = new Date(post.timestamp).getTime()
        return postTime >= sevenDaysAgoTimestamp
      })
      posts7d += recentInstagramPosts.length
    }
  }

  // ============================================================================
  // VISIBILITY METRICS - Calculate total likes and comments from social posts
  // ============================================================================
  let likes7d = 0
  let comments7d = 0
  const visibilityAnalyzedChannels: string[] = []

  // Reuse the location data and insights from above
  if (location) {
    // Track which channels were analyzed (have usernames)
    if (location.facebook_username) visibilityAnalyzedChannels.push('facebook')
    if (location.instagram_username) visibilityAnalyzedChannels.push('instagram')
    if (location.linkedin_username) visibilityAnalyzedChannels.push('linkedin')
    if (location.tiktok_username) visibilityAnalyzedChannels.push('tiktok')
  }

  if (insights) {
    const sevenDaysAgoTimestamp = sevenDaysAgo.getTime()

    // Calculate Facebook likes and comments from last 7 days
    if (insights.facebook_raw_posts && Array.isArray(insights.facebook_raw_posts)) {
      const facebookPosts = insights.facebook_raw_posts as Array<{
        time?: string
        timestamp?: string
        likes?: number
        comments?: number
      }>
      const recentFacebookPosts = facebookPosts.filter((post) => {
        const postTimeStr = post.time || post.timestamp
        if (!postTimeStr) return false
        const postTime = new Date(postTimeStr).getTime()
        return postTime >= sevenDaysAgoTimestamp
      })

      recentFacebookPosts.forEach((post) => {
        // Handle both 'likes' and potential variations
        const likes = typeof post.likes === 'number' ? post.likes : 0
        // Handle both 'comments' and potential variations
        const comments = typeof post.comments === 'number' ? post.comments : 0
        likes7d += likes
        comments7d += comments
      })
    }

    // Calculate Instagram likes and comments from last 7 days
    if (insights.instagram_raw_posts && Array.isArray(insights.instagram_raw_posts)) {
      const instagramPosts = insights.instagram_raw_posts as Array<{
        timestamp?: string
        time?: string
        likesCount?: number
        likes?: number
        commentsCount?: number
        comments?: number
      }>
      const recentInstagramPosts = instagramPosts.filter((post) => {
        const postTimeStr = post.timestamp || post.time
        if (!postTimeStr) return false
        const postTime = new Date(postTimeStr).getTime()
        return postTime >= sevenDaysAgoTimestamp
      })

      recentInstagramPosts.forEach((post) => {
        // Handle both 'likesCount' and 'likes' field names
        const likes = typeof post.likesCount === 'number' ? post.likesCount : (typeof post.likes === 'number' ? post.likes : 0)
        // Handle both 'commentsCount' and 'comments' field names
        const comments = typeof post.commentsCount === 'number' ? post.commentsCount : (typeof post.comments === 'number' ? post.comments : 0)
        likes7d += likes
        comments7d += comments
      })
    }

    // Also count comments from instagram_raw_comments if available (total comments across all posts)
    if (insights.instagram_raw_comments && Array.isArray(insights.instagram_raw_comments)) {
      const instagramComments = insights.instagram_raw_comments as Array<{
        timestamp?: string
        time?: string
        postUrl?: string
      }>
      const recentComments = instagramComments.filter((comment) => {
        const commentTimeStr = comment.timestamp || comment.time
        if (!commentTimeStr) return false
        const commentTime = new Date(commentTimeStr).getTime()
        return commentTime >= sevenDaysAgoTimestamp
      })
      // Add total count of comments (each comment object represents one comment)
      comments7d += recentComments.length
    }
  }


  return {
    reviews: {
      ratingAvg: Math.round(ratingAvg * 10) / 10, // Round to 1 decimal
      newReviews7d,
      deltaRating: deltaRating !== undefined ? Math.round(deltaRating * 10) / 10 : undefined,
      series7d: reviewsSeries7d,
    },
    listings: {
      directions30d,
      directions7d,
      directions7dPrev,
      deltaDirections,
      series7d: directionsSeries7d,
    },
    impressions: {
      impressions7d,
      impressions7dPrev,
      deltaImpressions,
      series7d: impressionsSeries7d,
    },
    callsAndWebsite: {
      calls7d,
      websiteClicks7d,
      calls7dPrev,
      websiteClicks7dPrev,
      deltaCalls,
      deltaWebsite,
      callsSeries7d,
      websiteSeries7d,
    },
    social: {
      posts7d,
      analyzedChannels,
      series7d: reviewsSeries7d, // Reuse reviews series as placeholder
    },
    visibility: {
      likes7d,
      comments7d,
      analyzedChannels: visibilityAnalyzedChannels,
      series7d: impressionsSeries7d,
    },
  }
}

