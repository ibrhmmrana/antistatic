import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { InstagramAPI } from '@/lib/instagram/api'

/**
 * POST /api/social/instagram/inbox/send
 * 
 * Send a message reply via Instagram API
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { locationId, threadId, message } = body

    if (!locationId || !threadId || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
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

    // Get thread to verify it exists
    const { data: thread } = await (supabase
      .from('instagram_threads') as any)
      .select('id, ig_user_id')
      .eq('id', threadId)
      .eq('business_location_id', locationId)
      .maybeSingle()

    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    }

    // Create API client
    const api = await InstagramAPI.create(locationId)

    if ('type' in api) {
      return NextResponse.json({ error: api.message }, { status: 400 })
    }

    // TODO: Implement actual message sending via Instagram API
    // For now, this is a stub - Instagram messaging API requires specific setup
    // The endpoint structure would be: POST /{ig-user-id}/messages with recipient_id and message text

    // Store sent message in DB (optimistic)
    const messageId = `msg_${Date.now()}_${Math.random()}`
    await (supabase
      .from('instagram_messages') as any)
      .insert({
        id: messageId,
        business_location_id: locationId,
        ig_user_id: thread.ig_user_id,
        thread_id: threadId,
        from_id: thread.ig_user_id, // Sent by us
        text: message,
        created_time: new Date().toISOString(),
      })

    // Update thread
    await (supabase
      .from('instagram_threads') as any)
      .update({
        last_message_at: new Date().toISOString(),
      })
      .eq('id', threadId)

    return NextResponse.json({
      success: true,
      messageId,
      note: 'Message sending requires Instagram messaging API setup with webhooks',
    })
  } catch (error: any) {
    console.error('[Instagram Send] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

