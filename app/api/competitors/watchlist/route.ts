import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/competitors/watchlist
 * Returns all competitors in the watchlist
 */
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
    const locationId = searchParams.get('locationId')

    if (!locationId) {
      return NextResponse.json({ error: 'locationId is required' }, { status: 400 })
    }

    // Get watchlist with competitor details
    const { data: watchlist, error } = await supabase
      .from('competitor_watchlist')
      .select(`
        id,
        is_active,
        notes,
        created_at,
        competitor:competitors (
          id,
          place_id,
          title,
          category_name,
          address,
          lat,
          lng,
          phone,
          website,
          image_url,
          total_score,
          reviews_count,
          raw_apify
        )
      `)
      .eq('business_location_id', locationId)
      .eq('is_active', true)

    if (error) {
      console.error('[Watchlist API] Error:', error)
      return NextResponse.json({ error: 'Failed to fetch watchlist' }, { status: 500 })
    }

    const competitors = (watchlist || []).map((item: any) => ({
      id: item.competitor.id,
      watchlistId: item.id,
      ...item.competitor,
    }))

    return NextResponse.json({ competitors })
  } catch (error: any) {
    console.error('[Watchlist API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch watchlist' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/competitors/watchlist
 * Add a competitor to the watchlist
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { placeId, source, socialHandles, notes, businessLocationId, competitorData } = body

    if (!placeId || !businessLocationId) {
      return NextResponse.json({ error: 'placeId and businessLocationId are required' }, { status: 400 })
    }

    // Verify location belongs to user
    const { data: location } = await supabase
      .from('business_locations')
      .select('id, user_id')
      .eq('id', businessLocationId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!location) {
      return NextResponse.json({ error: 'Location not found or access denied' }, { status: 404 })
    }

    // Upsert competitor
    const competitorPayload: any = {
      business_location_id: businessLocationId,
      place_id: placeId,
      title: competitorData?.title || 'Unknown',
      category_name: competitorData?.categoryName || competitorData?.category,
      address: competitorData?.address || competitorData?.formattedAddress,
      lat: competitorData?.lat || competitorData?.latitude,
      lng: competitorData?.lng || competitorData?.longitude,
      phone: competitorData?.phone || competitorData?.phoneNumber,
      website: competitorData?.website || competitorData?.websiteUri,
      image_url: competitorData?.imageUrl || competitorData?.photos?.[0]?.url,
      total_score: competitorData?.totalScore || competitorData?.rating,
      reviews_count: competitorData?.reviewsCount || competitorData?.userRatingsTotal || 0,
      raw_apify: competitorData?.rawApify || competitorData,
    }

    const { data: competitor, error: competitorError } = await supabase
      .from('competitors')
      .upsert(competitorPayload, {
        onConflict: 'business_location_id,place_id',
        ignoreDuplicates: false,
      })
      .select()
      .single()

    if (competitorError) {
      console.error('[Watchlist API] Error upserting competitor:', competitorError)
      return NextResponse.json({ error: 'Failed to add competitor' }, { status: 500 })
    }

    // Add to watchlist
    const { data: watchlistItem, error: watchlistError } = await supabase
      .from('competitor_watchlist')
      .upsert({
        business_location_id: businessLocationId,
        competitor_id: competitor.id,
        is_active: true,
        notes: notes || null,
      }, {
        onConflict: 'business_location_id,competitor_id',
        ignoreDuplicates: false,
      })
      .select()
      .single()

    if (watchlistError) {
      console.error('[Watchlist API] Error adding to watchlist:', watchlistError)
      return NextResponse.json({ error: 'Failed to add to watchlist' }, { status: 500 })
    }

    // Add social handles if provided
    if (socialHandles && Array.isArray(socialHandles) && socialHandles.length > 0) {
      const handlesPayload = socialHandles.map((handle: any) => ({
        business_location_id: businessLocationId,
        competitor_id: competitor.id,
        platform: handle.platform,
        handle: handle.handle,
        profile_url: handle.profileUrl || null,
      }))

      await supabase
        .from('competitor_social_handles')
        .upsert(handlesPayload, {
          onConflict: 'competitor_id,platform,handle',
          ignoreDuplicates: false,
        })
    }

    return NextResponse.json({
      success: true,
      competitor: {
        id: competitor.id,
        ...competitor,
      },
    })
  } catch (error: any) {
    console.error('[Watchlist API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to add to watchlist' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/competitors/watchlist
 * Remove a competitor from the watchlist
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const placeId = searchParams.get('placeId')
    const businessLocationId = searchParams.get('businessLocationId')

    if (!placeId || !businessLocationId) {
      return NextResponse.json({ error: 'placeId and businessLocationId are required' }, { status: 400 })
    }

    // Verify location belongs to user
    const { data: location } = await supabase
      .from('business_locations')
      .select('id, user_id')
      .eq('id', businessLocationId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!location) {
      return NextResponse.json({ error: 'Location not found or access denied' }, { status: 404 })
    }

    // Find the competitor by place_id
    const { data: competitor } = await supabase
      .from('competitors')
      .select('id')
      .eq('business_location_id', businessLocationId)
      .eq('place_id', placeId)
      .maybeSingle()

    if (!competitor) {
      return NextResponse.json({ error: 'Competitor not found' }, { status: 404 })
    }

    // Remove from watchlist by setting is_active to false
    const { error: watchlistError } = await supabase
      .from('competitor_watchlist')
      .update({ is_active: false })
      .eq('business_location_id', businessLocationId)
      .eq('competitor_id', competitor.id)

    if (watchlistError) {
      console.error('[Watchlist API] Error removing from watchlist:', watchlistError)
      return NextResponse.json({ error: 'Failed to remove from watchlist' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Watchlist API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to remove from watchlist' },
      { status: 500 }
    )
  }
}

