import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getOnboardingStep, getOnboardingStepUrl, type OnboardingStep } from '@/lib/onboarding/get-onboarding-step'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          cookiesToSet.forEach(({ name, value, options }) => {
            // Set cookies with proper expiration to ensure they persist
            // If Supabase sets maxAge, use it; otherwise set a reasonable default (7 days)
            const cookieOptions = {
              ...options,
              sameSite: 'lax' as const,
              httpOnly: options?.httpOnly ?? false, // Supabase needs JS access for some cookies
              secure: options?.secure ?? request.nextUrl.protocol === 'https:',
              path: '/',
            }
            // If Supabase didn't set maxAge, set a default of 7 days to ensure cookies persist
            // This prevents cookies from being cleared too early
            if (!options?.maxAge) {
              cookieOptions.maxAge = 60 * 60 * 24 * 7 // 7 days in seconds
            }
            response.cookies.set(name, value, cookieOptions)
          })
        },
      },
    }
  )

  // Check for Supabase auth cookies (Supabase uses project-specific cookie names)
  const cookies = request.cookies.getAll()
  const hasAuthToken = cookies.some(c => c.name.includes('auth-token'))
  
  console.log('[Middleware] Cookie check:', {
    pathname: request.nextUrl.pathname,
    hasAuthToken,
    cookieNames: cookies.map(c => c.name),
  })
  
  // Use getUser() instead of getSession() for proper authentication
  // getSession() reads from storage and may not be authentic
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  
  console.log('[Middleware] User check:', {
    pathname: request.nextUrl.pathname,
    hasUser: !!user,
    userId: user?.id,
    hasError: !!userError,
    errorMessage: userError?.message,
  })

  const pathname = request.nextUrl.pathname

  // Protected routes
  if (pathname.startsWith('/onboarding') || pathname.startsWith('/app') || pathname.startsWith('/dashboard') || pathname.startsWith('/reviews') || pathname.startsWith('/messaging') || pathname.startsWith('/social') || pathname.startsWith('/listings') || pathname.startsWith('/automations') || pathname.startsWith('/settings')) {
    if (!user) {
      console.log('[Middleware] Redirecting to /auth - no user found:', {
        pathname,
        hasUser: !!user,
        userError: userError?.message,
      })
      return NextResponse.redirect(new URL('/auth', request.url))
    }

    // Check onboarding status for app and dashboard routes
    if (pathname.startsWith('/app') || pathname.startsWith('/dashboard') || pathname.startsWith('/reviews') || pathname.startsWith('/messaging') || pathname.startsWith('/social') || pathname.startsWith('/listings') || pathname.startsWith('/automations') || pathname.startsWith('/settings')) {
      const step = await getOnboardingStep(supabase, user.id)
      if (step !== 'completed') {
        const stepUrl = getOnboardingStepUrl(step)
        return NextResponse.redirect(new URL(stepUrl, request.url))
      }
    }

    // For onboarding routes, redirect to the correct step if user is ahead or behind
    if (pathname.startsWith('/onboarding')) {
      const step = await getOnboardingStep(supabase, user.id)
      
      if (step === 'completed') {
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }

      // Check if allowBack query parameter is present (allows backwards navigation)
      const allowBack = request.nextUrl.searchParams.get('allowBack') === 'true'

      // Determine which step the user is trying to access
      const requestedStep: OnboardingStep = pathname.includes('/analysis')
        ? 'analysis'
        : pathname.includes('/connect')
        ? 'connect'
        : pathname.includes('/tools')
        ? 'tools'
        : pathname.includes('/review')
        ? 'review'
        : 'business'

      // Define step order for navigation
      const stepOrder: OnboardingStep[] = ['business', 'connect', 'analysis', 'tools', 'review']
      const currentStepIndex = stepOrder.indexOf(step)
      const requestedStepIndex = stepOrder.indexOf(requestedStep)

      // Get the URL for the current step
      const stepUrl = getOnboardingStepUrl(step)

      // If user is already on the correct step, don't redirect
      if (requestedStep === step) {
        return response
      }

      // If the requested step URL matches the current pathname, don't redirect (prevent loops)
      if (pathname === stepUrl) {
        return response
      }

      // Allow navigation to previous steps (backwards navigation) if allowBack is true
      // Only prevent forward navigation to steps they haven't reached yet
      if (requestedStepIndex > currentStepIndex && !allowBack) {
        return NextResponse.redirect(new URL(stepUrl, request.url))
      }

      // If user is trying to access a step that's behind their current step, allow it (backwards navigation)
      // This is handled by the allowBack check above, but we also allow it if they're going backwards
      if (requestedStepIndex < currentStepIndex) {
        return response
      }
    }
  }

  // Redirect authenticated users away from auth page
  if (pathname === '/auth' && user) {
    const step = await getOnboardingStep(supabase, user.id)
    const stepUrl = getOnboardingStepUrl(step)
    return NextResponse.redirect(new URL(stepUrl, request.url))
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

