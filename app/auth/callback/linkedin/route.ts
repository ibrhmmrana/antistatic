import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const cookieStore = await cookies()

  if (!code) {
    return NextResponse.redirect(
      new URL('/onboarding/connect?linkedin=error', request.url)
    )
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  try {
    const {
      data: { session },
      error: exchangeError,
    } = await supabase.auth.exchangeCodeForSession(code)

    if (exchangeError || !session) {
      console.error('Failed to exchange code for session:', exchangeError)
      return NextResponse.redirect(
        new URL('/onboarding/connect?linkedin=error', request.url)
      )
    }

    // Get the current user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.redirect(
        new URL('/onboarding/connect?linkedin=error', request.url)
      )
    }

    // Get the user's most recent business location
    const { data: location } = await supabase
      .from('business_locations')
      .select('id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!location) {
      return NextResponse.redirect(
        new URL('/onboarding/connect?linkedin=error', request.url)
      )
    }

    // Extract token information from session
    const accessToken = (session as any).provider_token || null
    const refreshToken = (session as any).provider_refresh_token || null
    const expiresAt = session.expires_at
      ? new Date(session.expires_at * 1000).toISOString()
      : null

    // Get provider account info from user metadata if available
    const providerAccountId = user.user_metadata?.provider_id || null
    const displayName = user.user_metadata?.full_name || user.user_metadata?.name || null
    const avatarUrl = user.user_metadata?.avatar_url || null

    // Upsert connected account
    const { error: upsertError } = await supabase
      .from('connected_accounts')
      .upsert(
        {
          user_id: user.id,
          business_location_id: location.id,
          provider: 'linkedin',
          provider_account_id: providerAccountId,
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_at: expiresAt,
          scopes: null,
          display_name: displayName,
          avatar_url: avatarUrl,
          status: 'connected',
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'business_location_id,provider',
        }
      )

    if (upsertError) {
      console.error('Failed to save connected account:', upsertError)
      return NextResponse.redirect(
        new URL('/onboarding/connect?linkedin=error', request.url)
      )
    }

    return NextResponse.redirect(new URL('/onboarding/connect?linkedin=connected', request.url))
  } catch (error: any) {
    console.error('LinkedIn callback error:', error)
    return NextResponse.redirect(
      new URL('/onboarding/connect?linkedin=error', request.url)
    )
  }
}








