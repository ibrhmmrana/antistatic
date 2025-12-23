import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getLocationInsights } from '@/lib/insights/service'

/**
 * GET /api/locations/[locationId]/insights
 * 
 * Fetch current insights for a location
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { locationId: string } }
) {
  try {
    const { locationId } = params
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

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Verify user owns this location
    const { data: location, error: locationError } = await supabase
      .from('business_locations')
      .select('id, name, place_id, formatted_address')
      .eq('id', locationId)
      .eq('user_id', user.id)
      .single()

    if (locationError || !location) {
      return NextResponse.json(
        { error: 'Location not found or access denied' },
        { status: 404 }
      )
    }

    // Get insights (pass userId for auth verification)
    const insights = await getLocationInsights(locationId, user.id)

    if (!insights) {
      // No insights yet - return empty state
      return NextResponse.json({
        scrapeStatus: 'not_started',
        lastScrapedAt: null,
        scrapeError: null,
        google: {
          rating: null,
          reviewCount: null,
          primaryCategory: null,
          additionalCategories: [],
          websiteUrl: null,
          phone: null,
          address: null,
          lastReviewAt: null,
        },
        performance: {
          totalCallClicks: 0,
          totalWebsiteClicks: 0,
          totalDirectionsRequests: 0,
        },
        summary: null,
      })
    }

    return NextResponse.json(insights)
  } catch (error: any) {
    console.error('[Insights API] Error fetching insights:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch insights' },
      { status: 500 }
    )
  }
}


