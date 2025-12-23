import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AuthLayout } from '@/components/layouts/auth-layout'
import { AuthCard } from '@/components/auth/auth-card'
import { getOnboardingStep, getOnboardingStepUrl } from '@/lib/onboarding/get-onboarding-step'

export default async function AuthPage({
  searchParams,
}: {
  searchParams: { verified?: string }
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const step = await getOnboardingStep(supabase, user.id)
    const stepUrl = getOnboardingStepUrl(step)
    redirect(stepUrl)
  }

  return (
    <AuthLayout>
      <AuthCard showVerifiedMessage={searchParams?.verified === 'true'} />
    </AuthLayout>
  )
}

