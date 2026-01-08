import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Lightweight endpoint to check authentication status
 * This endpoint goes through middleware, which refreshes the session and updates cookies
 * Used by client-side session refresh to sync localStorage session to cookies
 */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }

  return NextResponse.json({ authenticated: true, userId: user.id })
}

