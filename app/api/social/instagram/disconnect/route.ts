import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/social/instagram/disconnect
 * 
 * Disconnect Instagram integration and delete connection data
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { locationId } = body

    if (!locationId) {
      return NextResponse.json({ error: 'locationId is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify location belongs to user
    const { data: location } = await supabase
      .from('business_locations')
      .select('id')
      .eq('id', locationId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!location) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }

    // Delete all Instagram data for this location (cascade will handle related tables)
    // Delete in order: comments -> media -> insights -> sync_state -> connection
    
    // Delete comments
    await supabase
      .from('instagram_comments')
      .delete()
      .eq('business_location_id', locationId)

    // Delete media
    await supabase
      .from('instagram_media')
      .delete()
      .eq('business_location_id', locationId)

    // Delete insights
    await supabase
      .from('instagram_insights_daily')
      .delete()
      .eq('business_location_id', locationId)

    // Delete sync state
    await supabase
      .from('instagram_sync_state')
      .delete()
      .eq('business_location_id', locationId)

    // Delete Instagram connection
    const { error: deleteError } = await supabase
      .from('instagram_connections')
      .delete()
      .eq('business_location_id', locationId)

    if (deleteError) {
      console.error('[Instagram Disconnect] Error:', deleteError)
      return NextResponse.json(
        { error: 'Failed to disconnect Instagram' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Instagram disconnected and all data deleted successfully',
    })
  } catch (error: any) {
    console.error('[Instagram Disconnect API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

