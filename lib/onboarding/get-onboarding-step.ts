import { SupabaseClient } from '@supabase/supabase-js'

export type OnboardingStep = 'business' | 'connect' | 'analysis' | 'tools' | 'completed'

export async function getOnboardingStep(
  supabase: SupabaseClient,
  userId: string
): Promise<OnboardingStep> {
  // Check if onboarding is completed
  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed')
    .eq('id', userId)
    .single()

  if (profile?.onboarding_completed) {
    return 'completed'
  }

  // Check if user has a business location
  const { data: locations } = await supabase
    .from('business_locations')
    .select('id, enabled_tools')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!locations) {
    return 'business'
  }

  // Check if Google Business Profile is connected (connect comes before tools)
  const { data: connectedAccounts } = await supabase
    .from('connected_accounts')
    .select('provider, status')
    .eq('user_id', userId)
    .eq('business_location_id', locations.id)
    .eq('provider', 'google_gbp')
    .eq('status', 'connected')
    .maybeSingle()

  // If GBP is not connected, user needs to connect it
  if (!connectedAccounts) {
    return 'connect'
  }

  // Check if user has selected tools
  // If tools are selected, they've completed analysis step, so go to tools
  if (locations.enabled_tools && (locations.enabled_tools as string[]).length > 0) {
    return 'tools'
  }

  // GBP is connected but tools not selected - go to analysis page
  // User can navigate from connect -> analysis -> tools
  return 'analysis'
}

export function getOnboardingStepUrl(step: OnboardingStep): string {
  switch (step) {
    case 'business':
      return '/onboarding/business'
    case 'connect':
      return '/onboarding/connect'
    case 'analysis':
      return '/onboarding/analysis'
    case 'tools':
      return '/onboarding/tools'
    case 'completed':
      return '/dashboard'
    default:
      return '/onboarding/business'
  }
}

