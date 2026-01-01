import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/social/instagram/messages
 * 
 * Fetch Instagram Direct Messages (DMs)
 * Feature-gated: Returns enabled: false if messages API is not available
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
      .select('access_token, instagram_user_id, scopes')
      .eq('business_location_id', locationId)
      .maybeSingle()

    if (!connection || !connection.access_token) {
      return NextResponse.json({ error: 'Instagram not connected' }, { status: 404 })
    }

    // Get threads and messages from cached DB
    const { data: threads } = await (supabase
      .from('instagram_threads') as any)
      .select('id, unread_count, last_message_at')
      .eq('business_location_id', locationId)
      .order('last_message_at', { ascending: false })
      .limit(10)

    // Get messages from most recent threads
    const threadIds = (threads || []).map((t: any) => t.id)
    const { data: messages } = await (supabase
      .from('instagram_messages') as any)
      .select('id, from_username, text, created_time, thread_id')
      .eq('business_location_id', locationId)
      .in('thread_id', threadIds.length > 0 ? threadIds : [''])
      .order('created_time', { ascending: false })
      .limit(20)

    // Check if messaging is enabled (has threads or permission)
    const hasMessagesPermission = connection.scopes?.some((s: string) => s.includes('instagram_business_manage_messages'))
    const hasMessages = (threads && threads.length > 0) || (messages && messages.length > 0)

    if (!hasMessagesPermission && !hasMessages) {
      return NextResponse.json({
        enabled: false,
        messages: [],
        note: 'Messaging requires instagram_business_manage_messages permission and webhook setup',
      })
    }

    return NextResponse.json({
      enabled: true,
      messages: (messages || []).map((m: any) => ({
        id: m.id,
        from: {
          username: m.from_username || 'unknown',
          id: '',
        },
        text: m.text || '',
        timestamp: m.created_time,
        threadId: m.thread_id,
      })),
      threads: threads || [],
    })
  } catch (error: any) {
    console.error('[Instagram Messages API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

