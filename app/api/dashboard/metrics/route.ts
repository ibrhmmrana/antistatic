import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchGBPPerformanceMetrics, fetchGBPImpressionsMetrics, fetchGBPCallsAndWebsiteMetrics } from '@/lib/dashboard/get-overview-metrics'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const businessLocationId = searchParams.get('businessLocationId')
    const timePeriod = parseInt(searchParams.get('timePeriod') || '7', 10) // Days
    const metricType = searchParams.get('metricType') // 'listings' | 'impressions' | 'callsAndWebsite'

    if (!businessLocationId) {
      return NextResponse.json({ error: 'businessLocationId is required' }, { status: 400 })
    }

    if (!metricType) {
      return NextResponse.json({ error: 'metricType is required' }, { status: 400 })
    }

    // Calculate date ranges based on time period
    const now = new Date()
    now.setHours(23, 59, 59, 999) // End of today
    
    // Selected period: from (now - timePeriod) to now
    const periodStartDate = new Date(now)
    periodStartDate.setDate(periodStartDate.getDate() - timePeriod)
    periodStartDate.setHours(0, 0, 0, 0) // Start of day
    
    // For chart, show the full time period
    const chartStartDate = new Date(periodStartDate)
    chartStartDate.setHours(0, 0, 0, 0)
    
    // For delta comparison, use previous period of same length
    // Previous period: from (periodStartDate - timePeriod) to periodStartDate
    const prevPeriodStart = new Date(periodStartDate)
    prevPeriodStart.setDate(prevPeriodStart.getDate() - timePeriod)
    prevPeriodStart.setHours(0, 0, 0, 0)
    const prevPeriodEnd = new Date(periodStartDate)
    prevPeriodEnd.setHours(23, 59, 59, 999)
    
    // Fetch data from a wider range to ensure we have all the data we need
    // Fetch from prevPeriodStart to now to get both current and previous period data
    const fetchStartDate = new Date(prevPeriodStart)
    fetchStartDate.setHours(0, 0, 0, 0)

    let result: any = {}

    if (metricType === 'listings') {
      const performanceMetrics = await fetchGBPPerformanceMetrics(
        user.id,
        businessLocationId,
        fetchStartDate, // Fetch from previous period start to get all data
        now,
        chartStartDate, // Chart shows selected period
        prevPeriodStart,
        prevPeriodEnd
      )

      if (performanceMetrics) {
        const delta = performanceMetrics.directions7dPrev > 0
          ? performanceMetrics.directions7d - performanceMetrics.directions7dPrev
          : (performanceMetrics.directions7d > 0 ? performanceMetrics.directions7d : undefined)

        result = {
          metrics: {
            listings: {
              directions7d: performanceMetrics.directions7d,
              directions7dPrev: performanceMetrics.directions7dPrev,
              deltaDirections: delta,
              series7d: performanceMetrics.series7d,
            },
          },
        }
      }
    } else if (metricType === 'impressions') {
      const impressionsMetrics = await fetchGBPImpressionsMetrics(
        user.id,
        businessLocationId,
        fetchStartDate, // Fetch from previous period start to get all data
        now,
        chartStartDate, // Chart shows selected period
        prevPeriodStart,
        prevPeriodEnd
      )

      if (impressionsMetrics) {
        const delta = impressionsMetrics.impressions7dPrev > 0
          ? impressionsMetrics.impressions7d - impressionsMetrics.impressions7dPrev
          : (impressionsMetrics.impressions7d > 0 ? impressionsMetrics.impressions7d : undefined)

        result = {
          metrics: {
            impressions: {
              impressions7d: impressionsMetrics.impressions7d,
              impressions7dPrev: impressionsMetrics.impressions7dPrev,
              deltaImpressions: delta,
              series7d: impressionsMetrics.series7d,
            },
          },
        }
      }
    } else if (metricType === 'callsAndWebsite') {
      const callsAndWebsiteMetrics = await fetchGBPCallsAndWebsiteMetrics(
        user.id,
        businessLocationId,
        fetchStartDate, // Fetch from previous period start to get all data
        now,
        chartStartDate, // Chart shows selected period
        prevPeriodStart,
        prevPeriodEnd
      )

      if (callsAndWebsiteMetrics) {
        const deltaCalls = callsAndWebsiteMetrics.calls7dPrev > 0
          ? callsAndWebsiteMetrics.calls7d - callsAndWebsiteMetrics.calls7dPrev
          : (callsAndWebsiteMetrics.calls7d > 0 ? callsAndWebsiteMetrics.calls7d : undefined)

        const deltaWebsite = callsAndWebsiteMetrics.websiteClicks7dPrev > 0
          ? callsAndWebsiteMetrics.websiteClicks7d - callsAndWebsiteMetrics.websiteClicks7dPrev
          : (callsAndWebsiteMetrics.websiteClicks7d > 0 ? callsAndWebsiteMetrics.websiteClicks7d : undefined)

        result = {
          metrics: {
            callsAndWebsite: {
              calls7d: callsAndWebsiteMetrics.calls7d,
              websiteClicks7d: callsAndWebsiteMetrics.websiteClicks7d,
              calls7dPrev: callsAndWebsiteMetrics.calls7dPrev,
              websiteClicks7dPrev: callsAndWebsiteMetrics.websiteClicks7dPrev,
              deltaCalls,
              deltaWebsite,
              callsSeries7d: callsAndWebsiteMetrics.callsSeries7d,
              websiteSeries7d: callsAndWebsiteMetrics.websiteSeries7d,
            },
          },
        }
      }
    }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[Dashboard Metrics API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch metrics' },
      { status: 500 }
    )
  }
}

