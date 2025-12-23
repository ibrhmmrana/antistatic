import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getOnboardingStep, getOnboardingStepUrl } from '@/lib/onboarding/get-onboarding-step'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const type = requestUrl.searchParams.get('type') // Supabase includes 'type' param for email confirmation
  const supabase = await createClient()

  // Check if this is an email confirmation
  const isEmailConfirmation = type === 'signup' || type === 'email'

  if (code) {
    await supabase.auth.exchangeCodeForSession(code)
  }

  // Check if user exists and create profile if needed
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    // Check if profile exists
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .single()

    if (!existingProfile) {
      // Create profile
      await supabase.from('profiles').insert({
        id: user.id,
        full_name: user.user_metadata?.full_name || user.user_metadata?.name,
        onboarding_completed: false,
      })
    }

    // If this was an email confirmation, redirect to auth page with success message
    if (isEmailConfirmation) {
      return NextResponse.redirect(new URL('/auth?verified=true', requestUrl.origin))
    }

    // Redirect to the correct onboarding step
    const step = await getOnboardingStep(supabase, user.id)
    const stepUrl = getOnboardingStepUrl(step)
    return NextResponse.redirect(new URL(stepUrl, requestUrl.origin))
  }

  return NextResponse.redirect(new URL('/auth', requestUrl.origin))
}

