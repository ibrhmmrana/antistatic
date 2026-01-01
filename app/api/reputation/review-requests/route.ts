import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      businessLocationId,
      customerName,
      customerPhone,
      templateId,
      reviewUrl,
      businessPhone,
      schedule,
      customDateTime,
    } = body

    if (!businessLocationId || !customerName || !customerPhone) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Stub: In production, this would:
    // 1. Store the request in database
    // 2. Schedule/queue the WhatsApp message
    // 3. Integrate with WhatsApp Business API

    console.log('[Review Request] Stub:', {
      businessLocationId,
      customerName,
      customerPhone,
      templateId,
      reviewUrl,
      businessPhone,
      schedule,
      customDateTime,
    })

    return NextResponse.json({
      success: true,
      message: 'Review request queued (stub)',
    })
  } catch (error: any) {
    console.error('[Review Request API] Error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}




