import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const businessLocationId = searchParams.get('businessLocationId')

  if (!businessLocationId) {
    return NextResponse.json({ error: 'Missing businessLocationId' }, { status: 400 })
  }

  // Get the raw connection data
  const { data: connection, error } = await (supabase
    .from('instagram_connections') as any)
    .select('*')
    .eq('business_location_id', businessLocationId)
    .maybeSingle()

  if (error || !connection) {
    return NextResponse.json({ 
      error: 'No connection found',
      details: error 
    }, { status: 404 })
  }

  // Don't expose the full token, just its characteristics
  return NextResponse.json({
    exists: true,
    instagramUserId: connection.instagram_user_id,
    tokenLength: connection.access_token?.length || 0,
    tokenExpiry: connection.token_expires_at,
    scopes: connection.scopes,
    scopesType: typeof connection.scopes,
    isArray: Array.isArray(connection.scopes),
    scopesCount: connection.scopes?.length || 0,
    createdAt: connection.created_at,
    updatedAt: connection.updated_at,
    
    // Detailed scope analysis
    hasBasicScope: connection.scopes?.includes('instagram_business_basic'),
    hasPublishScope: connection.scopes?.includes('instagram_business_content_publish'),
    hasInsightsScope: connection.scopes?.includes('instagram_business_manage_insights'),
    hasMessagesScope: connection.scopes?.includes('instagram_business_manage_messages'),
    hasCommentsScope: connection.scopes?.includes('instagram_business_manage_comments'),
  })
}

