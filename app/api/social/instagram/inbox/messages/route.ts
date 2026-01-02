import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/social/instagram/inbox/messages
 * 
 * Fetch messages for a specific thread
 */
export async function GET(request: NextRequest) {
  try {
    const requestUrl = new URL(request.url)
    const locationId = requestUrl.searchParams.get('locationId')
    const threadId = requestUrl.searchParams.get('threadId')

    if (!locationId || !threadId) {
      return NextResponse.json({ error: 'locationId and threadId are required' }, { status: 400 })
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

    // Get Instagram connection to determine our account ID
    const { data: connection } = await (supabase
      .from('instagram_connections') as any)
      .select('instagram_user_id')
      .eq('business_location_id', locationId)
      .maybeSingle()

    if (!connection) {
      return NextResponse.json({ error: 'Instagram not connected' }, { status: 404 })
    }

    // Get messages for thread (using new DM tables)
    const { data: messages, error } = await (supabase
      .from('instagram_dm_messages') as any)
      .select('message_mid, sender_id, recipient_id, message_text, timestamp_ms, attachments')
      .eq('business_location_id', locationId)
      .eq('ig_account_id', connection.instagram_user_id)
      .eq('thread_key', threadId)
      .order('timestamp_ms', { ascending: true })
      .limit(100)

    if (error) {
      console.error('[Instagram Messages] Error:', error)
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
    }

    return NextResponse.json({
      messages: (messages || []).map((m: any) => ({
        id: m.message_mid || `msg_${m.timestamp_ms}`,
        direction: m.sender_id === connection.instagram_user_id ? 'outbound' : 'inbound',
        from: {
          id: m.sender_id,
          username: m.sender_id === connection.instagram_user_id ? 'You' : `@user_${m.sender_id.slice(-6)}`,
        },
        text: m.message_text || '',
        timestamp: new Date(m.timestamp_ms).toISOString(),
        attachments: m.attachments,
      })),
    })
  } catch (error: any) {
    console.error('[Instagram Messages] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

