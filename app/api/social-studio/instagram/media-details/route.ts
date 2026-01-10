import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getInstagramAccessTokenForLocation, InstagramAuthError } from '@/lib/instagram/tokens'
import { API_BASE, API_VERSION } from '@/lib/instagram/publish-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Fetch media details (media_url, thumbnail_url, permalink) for specific Instagram post IDs
 * Used when a post is selected in Inspector to fetch full details on demand
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const businessLocationId = searchParams.get('businessLocationId')
    const mediaIds = searchParams.get('mediaIds')?.split(',').filter(Boolean)

    if (!businessLocationId || !mediaIds || mediaIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Missing businessLocationId or mediaIds' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get Instagram access token
    let accessToken: string
    let igAccountId: string

    try {
      const tokenData = await getInstagramAccessTokenForLocation(businessLocationId)
      accessToken = tokenData.access_token
      igAccountId = tokenData.ig_account_id
    } catch (error: any) {
      if (error instanceof InstagramAuthError) {
        return NextResponse.json({
          ok: false,
          error: 'Instagram not connected',
        }, { status: 404 })
      }
      
      return NextResponse.json(
        {
          ok: false,
          error: 'Failed to get Instagram token',
        },
        { status: 500 }
      )
    }

    // Fetch details for each media ID
    const details: Record<string, any> = {}
    
    for (const mediaId of mediaIds) {
      try {
        const apiUrl = new URL(`${API_BASE}/${API_VERSION}/${mediaId}`)
        apiUrl.searchParams.set('fields', 'id,media_type,media_url,thumbnail_url,permalink,like_count,comments_count')
        apiUrl.searchParams.set('access_token', accessToken)

        const response = await fetch(apiUrl.toString(), { method: 'GET' })
        
        if (response.ok) {
          const data = await response.json()
          details[mediaId] = {
            id: data.id,
            media_type: data.media_type,
            media_url: data.media_url,
            thumbnail_url: data.thumbnail_url,
            permalink: data.permalink,
            like_count: data.like_count || 0,
            comments_count: data.comments_count || 0,
          }
        } else {
          console.warn(`[IG Media Details] Failed to fetch ${mediaId}:`, response.status)
          details[mediaId] = null
        }
      } catch (error: any) {
        console.error(`[IG Media Details] Error fetching ${mediaId}:`, error.message)
        details[mediaId] = null
      }
    }

    return NextResponse.json({
      ok: true,
      details,
    })
  } catch (error: any) {
    console.error(`[IG Media Details] Unexpected error:`, error.message)
    return NextResponse.json({
      ok: false,
      error: 'Internal server error',
    }, { status: 500 })
  }
}



