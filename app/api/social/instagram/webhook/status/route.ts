import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/social/instagram/webhook/status
 * 
 * Get webhook status and configuration info for Instagram messaging
 */
export async function GET(request: NextRequest) {
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
      .select('instagram_user_id, scopes')
      .eq('business_location_id', locationId)
      .maybeSingle()

    if (!connection) {
      return NextResponse.json({ error: 'Instagram not connected' }, { status: 404 })
    }

    // Get webhook state from sync_state
    const { data: syncState } = await (supabase
      .from('instagram_sync_state') as any)
      .select('webhook_verified_at, last_webhook_event_at, last_webhook_error')
      .eq('business_location_id', locationId)
      .maybeSingle()

    // Check if messaging permission is granted
    const grantedScopes = connection.scopes || []
    const hasMessagesPermission = grantedScopes.some((s: string) => 
      s.includes('instagram_business_manage_messages')
    )

    // Get webhook callback URL
    // Use environment variable or construct from request
    const host = request.headers.get('host') || 'app.antistatic.ai'
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 
      (request.headers.get('x-forwarded-proto') || 'http')
    const callbackUrl = `${protocol}://${host}/api/webhooks/meta/instagram`

    return NextResponse.json({
      hasMessagesPermission,
      webhookVerifiedAt: syncState?.webhook_verified_at || null,
      lastWebhookEventAt: syncState?.last_webhook_event_at || null,
      lastWebhookError: syncState?.last_webhook_error || null,
      callbackUrl,
      verifyTokenEnvVar: 'META_WEBHOOK_VERIFY_TOKEN',
      isConfigured: !!syncState?.webhook_verified_at,
    })
  } catch (error: any) {
    console.error('[Instagram Webhook Status] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
