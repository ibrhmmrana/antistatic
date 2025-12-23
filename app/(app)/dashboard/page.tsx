import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardContent } from '@/components/dashboard/dashboard-content'

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth')
  }

  // Check if onboarding is completed
  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed, full_name')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.onboarding_completed) {
    redirect('/onboarding/business')
  }

  // Get primary business location (most recent)
  const { data: business } = await supabase
    .from('business_locations')
    .select('id, name, formatted_address, rating, review_count, category, website, enabled_tools')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!business) {
    redirect('/onboarding/business')
  }

  // Get connected accounts for this business location
  const { data: connectedAccounts } = await supabase
    .from('connected_accounts')
    .select('provider, status')
    .eq('user_id', user.id)
    .eq('business_location_id', business.id)
    .eq('status', 'connected')

  const connectedProviders = connectedAccounts?.map((acc) => acc.provider) || []

  // Extract first name
  const firstName = profile?.full_name?.split(' ')[0] || 'there'

  return (
    <DashboardContent
      firstName={firstName}
      business={{
        name: business.name,
        formatted_address: business.formatted_address,
        rating: business.rating,
        review_count: business.review_count,
        category: business.category,
        website: business.website,
      }}
      enabledTools={business.enabled_tools || []}
      connectedProviders={connectedProviders}
    />
  )
}

