import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getValidAccessToken } from '@/lib/gbp/client'

/**
 * Create or update a reply to a Google Business Profile review
 * 
 * Request body:
 * - reviewName: The full review name (e.g., "accounts/123/locations/456/reviews/789")
 * - replyText: The reply text to post
 */
export async function POST(request: NextRequest) {
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

    // Get business location ID
    const body = await request.json()
    const { reviewName, replyText, businessLocationId: bodyLocationId } = body

    if (!reviewName || !replyText) {
      return NextResponse.json(
        { error: 'reviewName and replyText are required' },
        { status: 400 }
      )
    }

    let businessLocationId: string
    if (bodyLocationId) {
      businessLocationId = bodyLocationId
    } else {
      const { data: location } = await supabase
        .from('business_locations')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (!location) {
        return NextResponse.json(
          { error: 'Business location not found' },
          { status: 404 }
        )
      }
      businessLocationId = location.id
    }

    // Verify GBP is connected
    const { data: connectedAccount } = await supabase
      .from('connected_accounts')
      .select('id')
      .eq('user_id', user.id)
      .eq('business_location_id', businessLocationId)
      .eq('provider', 'google_gbp')
      .eq('status', 'connected')
      .single()

    if (!connectedAccount) {
      return NextResponse.json(
        { error: 'Google Business Profile not connected' },
        { status: 400 }
      )
    }

    // Call GBP API to update review reply
    // Reviews API uses mybusiness.googleapis.com/v4
    const accessToken = await getValidAccessToken(user.id, businessLocationId, requestUrl.origin)
    
    const reviewsBaseUrl = 'https://mybusiness.googleapis.com/v4'
    const replyUrl = `${reviewsBaseUrl}/${reviewName}/reply`
    
    const replyResponse = await fetch(replyUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reply: {
          comment: replyText,
        },
      }),
    })

    if (!replyResponse.ok) {
      const error = await replyResponse.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(`GBP Reply API error: ${error.error?.message || JSON.stringify(error)}`)
    }

    const replyData = await replyResponse.json()

    return NextResponse.json({
      success: true,
      reply: replyData.reply,
    })
  } catch (error: any) {
    console.error('Error posting GBP reply:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to post reply' },
      { status: 500 }
    )
  }
}

