import { createClient } from '@/lib/supabase/server'
import { Database } from '@/lib/supabase/database.types'
import { getGBPAccessTokenForLocation } from '@/lib/gbp/client'
import { gbpApiRequest } from '@/lib/gbp/client'

type MiniSeries = Array<{ x: string; y: number }>

type BusinessLocation = Database['public']['Tables']['business_locations']['Row']
type BusinessLocationSelect = Pick<BusinessLocation, 'google_location_name'>

/**
 * Extract location ID from GBP location resource name
 * Example: "accounts/123/locations/456" -> "456"
 */
function extractLocationId(locationName: string): string | null {
  const match = locationName.match(/locations\/(\d+)/)
  return match ? match[1] : null
}

/**
 * Fetch reviews metrics for a given time period
 */
export async function fetchGBPReviewsMetrics(
  userId: string,
  businessLocationId: string,
  startDate: Date,
  endDate: Date,
  chartStartDate?: Date, // Optional: different start date for chart
  prevPeriodStartDate?: Date, // Optional: start date for previous period (for delta)
  prevPeriodEndDate?: Date // Optional: end date for previous period (for delta)
): Promise<{
  reviews7d: number // Total reviews for selected period
  reviews7dPrev: number // Total reviews for previous period (for delta)
  series7d: MiniSeries // Chart data for selected period
  overallRating: number // Current overall rating
} | null> {
  try {
    // Get access token and account name
    const { accessToken, accountName } = await getGBPAccessTokenForLocation(
      userId,
      businessLocationId
    )

    // Get location name from business_locations
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
    let reviewsPath: string
    if (locationName.startsWith(accountName)) {
      reviewsPath = `${locationName}/reviews`
    } else {
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
      console.warn('[Reviews Metrics] Failed to fetch GBP reviews:', reviewsResponse.status)
      return null
    }

    const reviewsData = await reviewsResponse.json()
    
    // Handle the response format
    let reviewsResponseData: any
    if (Array.isArray(reviewsData) && reviewsData.length > 0) {
      reviewsResponseData = reviewsData[0]
    } else {
      reviewsResponseData = reviewsData
    }

    const rawReviews = reviewsResponseData.reviews || []
    const overallRating = reviewsResponseData.averageRating || 0

    // Helper to format date as YYYY-MM-DD
    const formatDate = (date: Date) => {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }

    // Filter reviews by date ranges
    const chartStart = chartStartDate || startDate
    const periodEnd = endDate

    // Count reviews in selected period
    const reviewsInPeriod = rawReviews.filter((review: any) => {
      if (!review.createTime) return false
      const reviewDate = new Date(review.createTime)
      return reviewDate >= chartStart && reviewDate <= periodEnd
    })

    // Count reviews in previous period (for delta)
    let reviewsInPrevPeriod = 0
    if (prevPeriodStartDate && prevPeriodEndDate) {
      reviewsInPrevPeriod = rawReviews.filter((review: any) => {
        if (!review.createTime) return false
        const reviewDate = new Date(review.createTime)
        return reviewDate >= prevPeriodStartDate! && reviewDate <= prevPeriodEndDate!
      }).length
    }

    // Build time series: count reviews per day
    const reviewsByDay = new Map<string, number>()
    const series: MiniSeries = []

    // Initialize all days in the period with 0
    const currentDate = new Date(chartStart)
    const endDateCopy = new Date(periodEnd)
    const daysToProcess: Date[] = []
    
    // Collect all dates in the period
    while (currentDate <= endDateCopy) {
      daysToProcess.push(new Date(currentDate))
      currentDate.setDate(currentDate.getDate() + 1)
    }

    // Initialize map with all days set to 0
    daysToProcess.forEach((date) => {
      const day = formatDate(date)
      reviewsByDay.set(day, 0)
    })

    // Count reviews per day
    reviewsInPeriod.forEach((review: any) => {
      if (!review.createTime) return
      const reviewDate = new Date(review.createTime)
      const day = formatDate(reviewDate)
      if (reviewsByDay.has(day)) {
        const currentCount = reviewsByDay.get(day) || 0
        reviewsByDay.set(day, currentCount + 1)
      }
    })

    // Build series array in chronological order
    const sortedDays = Array.from(reviewsByDay.keys()).sort()
    sortedDays.forEach((day) => {
      series.push({
        x: day,
        y: reviewsByDay.get(day) || 0,
      })
    })

    return {
      reviews7d: reviewsInPeriod.length,
      reviews7dPrev: reviewsInPrevPeriod,
      series7d: series,
      overallRating,
    }
  } catch (error: any) {
    console.warn('[Reviews Metrics] Error fetching reviews:', error.message)
    return null
  }
}

