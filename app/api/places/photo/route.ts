import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const photoReference = searchParams.get('photo_reference')
  const maxWidth = searchParams.get('maxwidth') || '800'

  if (!photoReference) {
    return NextResponse.json({ error: 'photo_reference parameter is required' }, { status: 400 })
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Google Maps API key not configured' }, { status: 500 })
  }

  try {
    const photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxWidth}&photo_reference=${photoReference}&key=${apiKey}`
    
    // Fetch the image - Google Places Photo API returns a redirect, so we need to follow it
    const imageResponse = await fetch(photoUrl, {
      redirect: 'follow',
    })
    
    if (!imageResponse.ok) {
      throw new Error('Failed to fetch photo from Google')
    }

    const imageBuffer = await imageResponse.arrayBuffer()
    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg'

    // Return the image with proper headers
    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch photo' },
      { status: 500 }
    )
  }
}

