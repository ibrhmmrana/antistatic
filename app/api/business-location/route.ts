import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const locationId = searchParams.get('locationId')

    if (!locationId) {
      return NextResponse.json({ error: 'locationId is required' }, { status: 400 })
    }

    // Get business location details
    const { data: location, error } = await supabase
      .from('business_locations')
      .select('id, name, phone_number, place_id')
      .eq('id', locationId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (error || !location) {
      return NextResponse.json({ error: 'Business location not found' }, { status: 404 })
    }

    const locationData: { id: string; name: string; phone_number: string; place_id: string } = location

    return NextResponse.json({
      id: locationData.id,
      name: locationData.name,
      phone_number: locationData.phone_number,
      place_id: locationData.place_id,
    })
  } catch (error: any) {
    console.error('[Business Location API] Error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}


