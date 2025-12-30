import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const sendRequestSchema = z.object({
  to: z.string().regex(/^\+27\d{9,10}$/, 'Invalid South African phone number format (must be +27XXXXXXXXX or +27XXXXXXXXXX)'),
  customerName: z.string().min(1, 'Customer name is required'),
  headerImageUrl: z.string().url('Invalid header image URL'),
  businessLocationId: z.string().uuid('Invalid business location ID'),
  businessName: z.string().optional(),
  businessPhone: z.string().optional(),
})

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
    
    // Validate request body
    const validationResult = sendRequestSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: validationResult.error.errors },
        { status: 400 }
      )
    }

    const { to, customerName, headerImageUrl, businessLocationId, businessName: customBusinessName, businessPhone: customBusinessPhone } = validationResult.data

    // Verify user owns the business location
    const { data: location, error: locationError } = await supabase
      .from('business_locations')
      .select('id, name, phone_number, place_id')
      .eq('id', businessLocationId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (locationError || !location) {
      return NextResponse.json({ error: 'Business location not found' }, { status: 404 })
    }

    const locationData: { id: string; name: string; phone_number: string; place_id: string } = location

    // Validate header image URL is from our Supabase storage
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!headerImageUrl.includes(supabaseUrl || '') && !headerImageUrl.startsWith('https://')) {
      return NextResponse.json(
        { error: 'Header image URL must be from Supabase Storage' },
        { status: 400 }
      )
    }

    // Use custom values if provided and non-empty, otherwise fallback to database values
    // This allows users to override the business name/phone with custom values
    const businessName = (customBusinessName && customBusinessName.trim()) 
      ? customBusinessName.trim() 
      : (locationData.name || 'Business')
    const businessPhone = (customBusinessPhone && customBusinessPhone.trim())
      ? customBusinessPhone.trim()
      : (locationData.phone_number || '')
    const placeId = locationData.place_id || ''

    if (!placeId) {
      return NextResponse.json(
        { error: 'Connect Google Business Profile first to get place ID' },
        { status: 400 }
      )
    }

    // Get WhatsApp credentials from environment
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
    const graphVersion = process.env.WHATSAPP_GRAPH_VERSION || 'v23.0'

    if (!phoneNumberId || !accessToken) {
      console.error('[WhatsApp Send] Missing credentials:', {
        hasPhoneNumberId: !!phoneNumberId,
        hasAccessToken: !!accessToken,
        phoneNumberId: phoneNumberId ? '***' : 'missing',
        accessToken: accessToken ? '***' : 'missing',
      })
      return NextResponse.json(
        { 
          error: 'WhatsApp service not configured',
          details: 'Please add WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN to your environment variables'
        },
        { status: 500 }
      )
    }

    // Create review request record (status: sending)
    const { data: reviewRequest, error: insertError } = await supabase
      .from('review_requests')
      .insert({
        org_id: user.id,
        business_location_id: businessLocationId,
        channel: 'whatsapp',
        to_recipient: to,
        customer_name: customerName,
        template_name: 'review_temp_1',
        header_image_url: headerImageUrl,
        place_id: placeId,
        status: 'sending',
      } as any)
      .select()
      .single()

    if (insertError) {
      console.error('[WhatsApp Send] Failed to create review request record:', insertError)
      return NextResponse.json(
        { error: 'Failed to create review request record' },
        { status: 500 }
      )
    }

    // Construct WhatsApp Graph API payload
    const payload = {
      messaging_product: 'whatsapp',
      to: to,
      type: 'template',
      template: {
        name: 'review_temp_1',
        language: { code: 'en' },
        components: [
          {
            type: 'header',
            parameters: [
              {
                type: 'image',
                image: {
                  link: headerImageUrl,
                },
              },
            ],
          },
          {
            type: 'body',
            parameters: [
              { type: 'text', text: customerName },
              { type: 'text', text: businessName },
              { type: 'text', text: businessPhone },
            ],
          },
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [
              { type: 'text', text: placeId },
            ],
          },
        ],
      },
    }

    // Send to Meta Graph API
    const graphApiUrl = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`
    const graphResponse = await fetch(graphApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    })

    const graphData = await graphResponse.json()

    if (!graphResponse.ok) {
      console.error('[WhatsApp Send] Graph API error:', graphData)
      
      // Update review request record to failed
      await (supabase
        .from('review_requests') as any)
        .update({
          status: 'failed',
          error: graphData.error?.message || 'Unknown error',
        })
        .eq('id', reviewRequest.id)

      return NextResponse.json(
        { error: graphData.error?.message || 'Failed to send WhatsApp message' },
        { status: graphResponse.status }
      )
    }

    // Update review request record to sent
    const updateResult = await (supabase
      .from('review_requests') as any)
      .update({
        status: 'sent',
        meta_message_id: graphData.messages?.[0]?.id || null,
      })
      .eq('id', reviewRequest.id) as any
    
    const updateError = updateResult.error

    if (updateError) {
      console.error('[WhatsApp Send] Failed to update review request:', updateError)
    }

    return NextResponse.json({
      success: true,
      messageId: graphData.messages?.[0]?.id,
      status: 'sent',
    })
  } catch (error: any) {
    console.error('[WhatsApp Send API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

