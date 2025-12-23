import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { OnboardingLayout } from '@/components/layouts/onboarding-layout'
import { ConnectAccounts } from '@/components/onboarding/connect-accounts'
import { getOnboardingStep, getOnboardingStepUrl } from '@/lib/onboarding/get-onboarding-step'

// Force dynamic rendering since we use searchParams
export const dynamic = 'force-dynamic'

export default async function ConnectAccountsPage({
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
  // Also allow staying on connect page even after GBP is connected (user may want to enter social usernames)
  const step = await getOnboardingStep(supabase as any, user.id)
  if (step !== 'connect' && !searchParams?.allowBack) {
    const stepUrl = getOnboardingStepUrl(step)
    redirect(stepUrl)
  }
  
  // If user is on connect page with allowBack, or if step is still 'connect', allow them to stay
  // This prevents auto-redirect after GBP connection

  // Get the user's business location (most recent one)
  const { data: locations } = await supabase
    .from('business_locations')
    .select('id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!locations) {
    redirect('/onboarding/business')
  }

  // Get user name
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  // Get connected accounts for this location
  // Don't filter by status='connected' here - fetch all to see current state
  const { data: connectedAccounts, error: accountsError } = await supabase
    .from('connected_accounts')
    .select('provider, status, display_name')
    .eq('user_id', user.id)
    .eq('business_location_id', locations.id)

  if (accountsError) {
    console.error('Error fetching connected accounts on server:', accountsError)
  }
  
  console.log('Server-side connected accounts:', connectedAccounts)

  const firstName = profile?.full_name?.split(' ')[0] || 'there'

  return (
    <OnboardingLayout currentStep="connect">
      <ConnectAccounts
        userName={firstName}
        locationId={locations.id}
        connectedAccounts={connectedAccounts || []}
      />
    </OnboardingLayout>
  )
}

