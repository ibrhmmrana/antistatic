import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncInstagramInbox } from '@/lib/instagram/inbox-sync'
import { InstagramAuthError } from '@/lib/instagram/tokens'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/social/instagram/inbox/sync?locationId={id}
 * 
 * Sync Instagram inbox (conversations and messages) from the API
 */
export async function POST(request: NextRequest) {
  try {
    const requestUrl = new URL(request.url)
    const locationId = requestUrl.searchParams.get('locationId')

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

    // Get Instagram connection
    const { data: connection } = await (supabase
      .from('instagram_connections') as any)
      .select('access_token, instagram_user_id, token_expires_at')
      .eq('business_location_id', locationId)
      .maybeSingle()

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox-sync/route.ts:47',message:'Connection loaded',data:{hasConnection:!!connection,hasToken:!!connection?.access_token,igUserId:connection?.instagram_user_id,hasExpiresAt:!!connection?.token_expires_at,expiresAt:connection?.token_expires_at},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion

    if (!connection || !connection.access_token) {
      return NextResponse.json({ error: 'Instagram not connected' }, { status: 404 })
    }

    // Sync inbox
    const result = await syncInstagramInbox(
      locationId,
      connection.instagram_user_id,
      connection.access_token
    )

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox-sync/route.ts:60',message:'Sync completed',data:{conversationsFound:result.conversationsFound,conversationsUpserted:result.conversationsUpserted,messagesUpserted:result.messagesUpserted,errors:result.errors},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (error: any) {
    console.error('[Instagram Inbox Sync API] Error:', error)
    
    if (error instanceof InstagramAuthError) {
      return NextResponse.json(
        {
          error: {
            type: 'instagram_auth',
            code: error.code,
            message: error.message,
          },
        },
        { status: 401 }
      )
    }
    
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

