import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/locations/[locationId]/enabled-tools
 * Returns the enabled_tools array for a business location
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { locationId: string } }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const locationId = params.locationId

    if (!locationId) {
      return NextResponse.json(
        { error: 'locationId is required' },
        { status: 400 }
      )
    }

    // Verify location belongs to user and get enabled_tools
    const { data: location, error } = await supabase
      .from('business_locations')
      .select('id, user_id, enabled_tools')
      .eq('id', locationId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) {
      console.error('[enabled-tools] Database error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch location' },
        { status: 500 }
      )
    }

    if (!location) {
      return NextResponse.json(
        { error: 'Location not found or access denied' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      enabled_tools: location.enabled_tools || [],
    })
  } catch (error) {
    console.error('[enabled-tools] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

