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

    // Get messages for thread
    const { data: messages, error } = await supabase
      .from('instagram_messages')
      .select('id, from_id, from_username, text, created_time')
      .eq('business_location_id', locationId)
      .eq('thread_id', threadId)
      .order('created_time', { ascending: true })
      .limit(100)

    if (error) {
      console.error('[Instagram Messages] Error:', error)
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
    }

    // Mark thread as read (reset unread count)
    await supabase
      .from('instagram_threads')
      .update({ unread_count: 0 })
      .eq('id', threadId)
      .eq('business_location_id', locationId)

    return NextResponse.json({
      messages: messages || [],
    })
  } catch (error: any) {
    console.error('[Instagram Messages] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

