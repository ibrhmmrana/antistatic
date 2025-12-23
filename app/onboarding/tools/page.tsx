import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { OnboardingLayout } from '@/components/layouts/onboarding-layout'
import { ToolSelection } from '@/components/onboarding/tool-selection'
import { getOnboardingStep, getOnboardingStepUrl } from '@/lib/onboarding/get-onboarding-step'

// Force dynamic rendering since we use searchParams
export const dynamic = 'force-dynamic'

export default async function ToolsPage({
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
  if (step !== 'tools' && !searchParams?.allowBack) {
    const stepUrl = getOnboardingStepUrl(step)
    redirect(stepUrl)
  }

  // Get business location and tools
  const { data: locations } = await supabase
    .from('business_locations')
    .select('id, enabled_tools')
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

  const firstName = profile?.full_name?.split(' ')[0] || 'there'
  const savedTools = (locations.enabled_tools as string[]) || null

  return (
    <OnboardingLayout currentStep="tools">
      <ToolSelection userName={firstName} savedTools={savedTools} locationId={locations.id} />
    </OnboardingLayout>
  )
}

