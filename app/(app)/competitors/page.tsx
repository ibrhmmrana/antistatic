import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CompetitorTrackerPage } from '@/components/competitors/CompetitorTrackerPage'
import { Database } from '@/lib/supabase/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']
type ProfileSelect = Pick<Profile, 'onboarding_completed'>
type BusinessLocation = Database['public']['Tables']['business_locations']['Row']
type BusinessLocationSelect = Pick<BusinessLocation, 'id' | 'name' | 'google_location_name'>

export default async function CompetitorsPage() {
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
    .select('onboarding_completed')
    .eq('id', user.id)
    .maybeSingle()

  const typedProfile = profile as ProfileSelect | null

  if (!typedProfile || !typedProfile.onboarding_completed) {
    redirect('/onboarding/business')
  }

  // Get primary business location
  const { data: business } = await supabase
    .from('business_locations')
    .select('id, name, google_location_name')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const typedBusiness = business as BusinessLocationSelect | null

  if (!typedBusiness) {
    redirect('/onboarding/business')
  }

  const businessName = typedBusiness.google_location_name || typedBusiness.name || 'our business'

  return <CompetitorTrackerPage businessLocationId={typedBusiness.id} businessName={businessName} />
}


