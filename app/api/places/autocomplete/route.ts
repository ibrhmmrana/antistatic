import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get('query')

  if (!query) {
    return NextResponse.json({ error: 'Query parameter is required' }, { status: 400 })
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Google Places API key not configured' }, { status: 500 })
  }

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&key=${apiKey}&types=establishment`
    )

    const data = await response.json()

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      return NextResponse.json(
        { error: data.error_message || 'Places API error' },
        { status: 500 }
      )
    }

    const suggestions = (data.predictions || []).map((prediction: any) => ({
      place_id: prediction.place_id,
      primaryText: prediction.structured_formatting.main_text,
      secondaryText: prediction.structured_formatting.secondary_text,
    }))

    return NextResponse.json({ suggestions })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch autocomplete suggestions' },
      { status: 500 }
    )
  }
}
















