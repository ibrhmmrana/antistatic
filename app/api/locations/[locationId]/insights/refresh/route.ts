import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { refreshLocationInsights } from '@/lib/insights/service'
import { findGBPConnectedAccount } from '@/lib/gbp/client'

/**
 * POST /api/locations/[locationId]/insights/refresh
 * 
 * Trigger a refresh of insights by fetching from GBP
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { locationId: string } }
) {
  const { locationId } = params
  try {
    const requestUrl = new URL(request.url)
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

    // Verify user owns this location and GBP is connected
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

    // Verify GBP is connected using shared helper
    const connectedAccount = await findGBPConnectedAccount(supabase, locationId, user.id)

    if (!connectedAccount) {
      return NextResponse.json(
        { error: 'Google Business Profile not connected' },
        { status: 400 }
      )
    }

    // Refresh insights
    console.log('[Insights API] Refreshing insights for location:', locationId)
    const insights = await refreshLocationInsights(
      user.id,
      locationId,
      {
        place_id: location.place_id,
        name: location.name,
        formatted_address: location.formatted_address || undefined,
      },
      requestUrl.origin
    )

    // Return insights regardless of success/error status
    // The insights object will have scrapeStatus: 'success' or 'error'
    return NextResponse.json({
      success: true,
      insights,
    })
  } catch (error: any) {
    console.error('[Insights API] Error refreshing insights:', error)
    
    // Even if refreshLocationInsights throws, try to return the error state from DB
    try {
      const { getLocationInsights } = await import('@/lib/insights/service')
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
      const { data: { user: fallbackUser } } = await supabase.auth.getUser()
      if (fallbackUser) {
        const insights = await getLocationInsights(locationId, fallbackUser.id)
        if (insights) {
          return NextResponse.json({
            success: true,
            insights,
          })
        }
      }
    } catch (fallbackError) {
      console.error('[Insights API] Fallback error:', fallbackError)
      // Ignore fallback errors
    }

    // Last resort: return a generic error response
    return NextResponse.json(
      { error: error.message || 'Failed to refresh insights' },
      { status: 500 }
    )
  }
}

