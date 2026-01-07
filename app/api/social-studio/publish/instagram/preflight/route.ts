import { NextRequest, NextResponse } from 'next/server'
import { preflightMediaUrl } from '@/lib/instagram/publish-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/social-studio/publish/instagram/preflight?url=<encoded>
 * 
 * Quick test endpoint to check if Meta can fetch a media URL
 */
export async function GET(request: NextRequest) {
  try {
    const requestUrl = new URL(request.url)
    const mediaUrl = requestUrl.searchParams.get('url')

    if (!mediaUrl) {
      return NextResponse.json({ error: 'url parameter is required' }, { status: 400 })
    }

    const preflight = await preflightMediaUrl(mediaUrl)

    return NextResponse.json({
      ok: preflight.ok,
      status: preflight.status,
      contentType: preflight.contentType,
      contentLength: preflight.contentLength,
      finalUrl: preflight.finalUrl,
      error: preflight.error,
      canPublish: preflight.ok && preflight.status === 200 && preflight.contentType !== null,
      isJpeg: preflight.contentType === 'image/jpeg' || preflight.contentType === 'image/jpg',
    })
  } catch (error: any) {
    console.error('[IG Publish Preflight] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

