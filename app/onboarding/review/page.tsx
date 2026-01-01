import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { OnboardingLayout } from '@/components/layouts/onboarding-layout'
import { ReviewRequestDemo } from '@/components/onboarding/review-request-demo'
import { getOnboardingStep, getOnboardingStepUrl } from '@/lib/onboarding/get-onboarding-step'

// Force dynamic rendering since we use searchParams
export const dynamic = 'force-dynamic'

export default async function ReviewPage({
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
  if (step !== 'review' && !searchParams?.allowBack) {
    const stepUrl = getOnboardingStepUrl(step)
    redirect(stepUrl)
  }

  // Get business location
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

  return (
    <OnboardingLayout currentStep="review">
      <ReviewRequestDemo locationId={locations.id} />
    </OnboardingLayout>
  )
}


