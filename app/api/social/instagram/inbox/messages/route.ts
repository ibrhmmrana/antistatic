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

    // Get messages for conversation
    const { data: messages, error } = await (supabase
      .from('instagram_messages') as any)
      .select('message_id, direction, from_id, to_id, text, created_time')
      .eq('business_location_id', locationId)
      .eq('conversation_id', threadId)
      .order('created_time', { ascending: true })
      .limit(100)

    if (error) {
      console.error('[Instagram Messages] Error:', error)
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
    }

    // Mark conversation as read (reset unread count)
    await (supabase
      .from('instagram_conversations') as any)
      .update({ unread_count: 0 })
      .eq('conversation_id', threadId)
      .eq('business_location_id', locationId)

    // Get conversation to get participant username
    const { data: conversation } = await (supabase
      .from('instagram_conversations') as any)
      .select('participant_username')
      .eq('business_location_id', locationId)
      .eq('conversation_id', threadId)
      .maybeSingle()

    const participantUsername = conversation?.participant_username || 'User'

    return NextResponse.json({
      messages: (messages || []).map((m: any) => ({
        id: m.message_id,
        direction: m.direction,
        from: {
          id: m.from_id,
          username: m.direction === 'inbound' ? participantUsername : 'You',
        },
        text: m.text || '',
        timestamp: m.created_time,
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

