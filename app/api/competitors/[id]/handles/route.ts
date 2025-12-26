import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/competitors/[id]/handles
 * Get social handles for a competitor
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const competitorId = params.id

    const { data: handles, error } = await supabase
      .from('competitor_social_handles')
      .select('*')
      .eq('competitor_id', competitorId)

    if (error) {
      console.error('[Handles API] Error:', error)
      return NextResponse.json({ error: 'Failed to fetch handles' }, { status: 500 })
    }

    return NextResponse.json({ handles: handles || [] })
  } catch (error: any) {
    console.error('[Handles API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch handles' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/competitors/[id]/handles
 * Upsert social handles for a competitor
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const competitorId = params.id
    const body = await request.json()
    const { handles } = body

    if (!Array.isArray(handles)) {
      return NextResponse.json({ error: 'handles must be an array' }, { status: 400 })
    }

    // Get competitor to verify access
    const { data: competitor, error: competitorError } = await supabase
      .from('competitors')
      .select('business_location_id, business_locations!inner(user_id)')
      .eq('id', competitorId)
      .maybeSingle()

    if (competitorError || !competitor) {
      return NextResponse.json({ error: 'Competitor not found' }, { status: 404 })
    }

    // Delete existing handles
    await supabase
      .from('competitor_social_handles')
      .delete()
      .eq('competitor_id', competitorId)

    // Insert new handles
    if (handles.length > 0) {
      const handlesPayload = handles.map((handle: any) => ({
        business_location_id: competitor.business_location_id,
        competitor_id: competitorId,
        platform: handle.platform,
        handle: handle.handle,
        profile_url: handle.profileUrl || null,
      }))

      const { error: insertError } = await supabase
        .from('competitor_social_handles')
        .insert(handlesPayload)

      if (insertError) {
        console.error('[Handles API] Error inserting handles:', insertError)
        return NextResponse.json({ error: 'Failed to save handles' }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Handles API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to save handles' },
      { status: 500 }
    )
  }
}


