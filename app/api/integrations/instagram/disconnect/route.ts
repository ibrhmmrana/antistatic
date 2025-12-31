import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Instagram Disconnect Endpoint
 * 
 * Removes the Instagram connection for the authenticated user's business location.
 * 
 * Query params:
 * - business_location_id: UUID of the business location (optional, uses most recent if not provided)
 */
export async function POST(request: NextRequest) {
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

    // Delete Instagram connection
    const { error: deleteError } = await supabase
      .from('instagram_connections')
      .delete()
      .eq('business_location_id', businessLocationId)

    if (deleteError) {
      console.error('[Instagram Disconnect] Error:', deleteError)
      return NextResponse.json(
        { error: 'Failed to disconnect Instagram account' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Instagram Disconnect] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

