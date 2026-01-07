import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Instagram Connection Status Endpoint
 * 
 * Returns the connection status for the authenticated user's business location.
 * 
 * Query params:
 * - business_location_id: UUID of the business location (optional, uses most recent if not provided)
 */
export async function GET(request: NextRequest) {
  try {
    const requestUrl = new URL(request.url)
    const businessLocationIdParam = requestUrl.searchParams.get('business_location_id')
    const supabase = await createClient()

    // Verify user is authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get business location
    let businessLocationId: string
    if (businessLocationIdParam) {
      // Verify the location belongs to the user
      const { data: location, error: locationError } = await supabase
        .from('business_locations')
        .select('id')
        .eq('id', businessLocationIdParam)
        .eq('user_id', user.id)
        .maybeSingle()

      const typedLocation = location as { id: string } | null

      if (locationError || !typedLocation) {
        return NextResponse.json(
          { error: 'Business location not found or access denied' },
          { status: 404 }
        )
      }
      businessLocationId = typedLocation.id
    } else {
      // Get user's most recent business location
      const { data: location, error: locationError } = await supabase
        .from('business_locations')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      const typedLocation = location as { id: string } | null

      if (locationError || !typedLocation) {
        return NextResponse.json(
          { error: 'Business location not found' },
          { status: 404 }
        )
      }
      businessLocationId = typedLocation.id
    }

    // Get Instagram connection for this location
    const { data: connection, error: connectionError } = await supabase
      .from('instagram_connections')
      .select('instagram_user_id, instagram_username, scopes')
      .eq('business_location_id', businessLocationId)
      .maybeSingle()

    const typedConnection = connection as {
      instagram_user_id: string
      instagram_username: string | null
      scopes: string[] | null
    } | null


    if (connectionError) {
      console.error('[Instagram Status] Error fetching connection:', connectionError)
      return NextResponse.json(
        { error: 'Failed to fetch connection status' },
        { status: 500 }
      )
    }

    if (!typedConnection) {
      return NextResponse.json({
        connected: false,
      })
    }

    return NextResponse.json({
      connected: true,
      username: typedConnection.instagram_username || null,
      instagram_user_id: typedConnection.instagram_user_id,
      scopes: typedConnection.scopes || [],
    })
  } catch (error: any) {
    console.error('[Instagram Status] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

