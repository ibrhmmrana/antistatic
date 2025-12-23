import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getOnboardingStep, getOnboardingStepUrl } from '@/lib/onboarding/get-onboarding-step'

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const step = await getOnboardingStep(supabase, user.id)
    const stepUrl = getOnboardingStepUrl(step)
    redirect(stepUrl)
  } else {
    redirect('/auth')
  }
}

