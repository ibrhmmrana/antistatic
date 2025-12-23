import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { OnboardingLayout } from '@/components/layouts/onboarding-layout'
import { BusinessSearch } from '@/components/onboarding/business-search'
import { getOnboardingStep, getOnboardingStepUrl } from '@/lib/onboarding/get-onboarding-step'

// Force dynamic rendering since we use searchParams
export const dynamic = 'force-dynamic'

export default async function BusinessOnboardingPage({
  searchParams,
}: {
  searchParams: { allowBack?: string }
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth')
  }

  // Check onboarding progress and redirect if needed
  // Allow back navigation if allowBack query param is present
  const step = await getOnboardingStep(supabase, user.id)
  if (step !== 'business' && !searchParams?.allowBack) {
    const stepUrl = getOnboardingStepUrl(step)
    redirect(stepUrl)
  }

  // Get user name
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  // Extract first name
  const fullName = profile?.full_name || user.user_metadata?.full_name || user.user_metadata?.name || ''
  const firstName = fullName ? fullName.split(' ')[0] : 'there'

  return (
    <OnboardingLayout currentStep="business">
      <BusinessSearch userName={firstName} />
    </OnboardingLayout>
  )
}

