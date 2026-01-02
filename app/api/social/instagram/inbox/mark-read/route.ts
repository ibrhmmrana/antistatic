import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/social/instagram/inbox/mark-read?locationId={id}&conversationId={id}
 * 
 * Mark all messages in a conversation as read
 */
export async function POST(request: NextRequest) {
  try {
    const requestUrl = new URL(request.url)
    const locationId = requestUrl.searchParams.get('locationId')
    const conversationId = requestUrl.searchParams.get('conversationId')

    if (!locationId || !conversationId) {
      return NextResponse.json({ error: 'locationId and conversationId are required' }, { status: 400 })
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

    // Get Instagram connection to get ig_account_id
    const { data: connection } = await (supabase
      .from('instagram_connections') as any)
      .select('instagram_user_id')
      .eq('business_location_id', locationId)
      .maybeSingle()

    if (!connection) {
      return NextResponse.json({ error: 'Instagram not connected' }, { status: 404 })
    }

    const now = new Date().toISOString()

    // Mark all inbound messages in this conversation as read
    await (supabase
      .from('instagram_messages') as any)
      .update({ read_at: now })
      .eq('ig_account_id', connection.instagram_user_id)
      .eq('conversation_id', conversationId)
      .eq('direction', 'inbound')
      .is('read_at', null)

    // Reset unread count on conversation
    await (supabase
      .from('instagram_conversations') as any)
      .update({ unread_count: 0 })
      .eq('id', conversationId)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Instagram Inbox Mark Read] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

