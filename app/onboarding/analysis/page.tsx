import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { OnboardingLayout } from '@/components/layouts/onboarding-layout'
import { ChannelAnalysisPage } from '@/components/onboarding/channel-analysis-page'
import { getOnboardingStep, getOnboardingStepUrl } from '@/lib/onboarding/get-onboarding-step'

// Force dynamic rendering since we use searchParams
export const dynamic = 'force-dynamic'

export default async function AnalysisPage({
  searchParams,
}: {
  searchParams: { allowBack?: string }
}) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {
          // No-op for server components
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth')
  }

  // Check onboarding progress and redirect if needed
  // Allow back navigation if allowBack query param is present
  const step = await getOnboardingStep(supabase as any, user.id)
  
  // If user is already on the correct step (analysis), don't redirect
  if (step === 'analysis') {
    // User is on the correct step, continue rendering
  } else if (step === 'completed') {
    // Onboarding is complete, redirect to dashboard
    redirect('/dashboard')
  } else if (step !== 'connect' && !searchParams?.allowBack) {
    // User needs to complete a prerequisite step
    const stepUrl = getOnboardingStepUrl(step)
    // Only redirect if we're not already on that step (prevent loops)
    if (stepUrl !== '/onboarding/analysis') {
      redirect(stepUrl)
    }
  }

  // Get the user's business location (most recent one)
  const { data: location } = await supabase
    .from('business_locations')
    .select('id, facebook_username, instagram_username, linkedin_username, tiktok_username')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!location) {
    redirect('/onboarding/business')
  }

  // Get connected accounts for this location
  const { data: connectedAccounts } = await supabase
    .from('connected_accounts')
    .select('provider, status, display_name')
    .eq('user_id', user.id)
    .eq('business_location_id', location.id)
    .eq('status', 'connected')

  const isGoogleConnected = connectedAccounts?.some(
    (acc) => acc.provider === 'google_gbp'
  ) || false

  return (
    <OnboardingLayout currentStep="analysis">
      <ChannelAnalysisPage
        locationId={location.id}
        isGoogleConnected={isGoogleConnected}
        socialUsernames={{
          facebook: location.facebook_username || '',
          instagram: location.instagram_username || '',
          linkedin: location.linkedin_username || '',
          tiktok: location.tiktok_username || '',
        }}
      />
    </OnboardingLayout>
  )
}

