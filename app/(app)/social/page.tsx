import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SocialStudioPage } from '@/components/social/SocialStudioPage'
import { Database } from '@/lib/supabase/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']
type ProfileSelect = Pick<Profile, 'onboarding_completed'>
type BusinessLocation = Database['public']['Tables']['business_locations']['Row']
type BusinessLocationSelect = Pick<BusinessLocation, 'id'>
type ConnectedAccount = Database['public']['Tables']['connected_accounts']['Row']
type ConnectedAccountSelect = Pick<ConnectedAccount, 'provider' | 'status' | 'display_name'>

export default async function SocialPage() {
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
  const { data: location } = await supabase
    .from('business_locations')
    .select('id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const businessLocation = location as BusinessLocationSelect | null

  if (!businessLocation) {
    redirect('/onboarding/business')
  }

  // Get connected accounts
  const { data: connectedAccounts } = await supabase
    .from('connected_accounts')
    .select('provider, status, display_name')
    .eq('business_location_id', businessLocation.id)
    .eq('status', 'connected')

  const accounts = (connectedAccounts || []) as ConnectedAccountSelect[]

  // Check for Instagram OAuth connection
  const { data: instagramConnection } = await supabase
    .from('instagram_connections')
    .select('*')
    .eq('business_location_id', businessLocation.id)
    .maybeSingle()

  return (
    <SocialStudioPage
      locationId={businessLocation.id}
      connectedAccounts={accounts}
      instagramConnection={instagramConnection}
    />
  )
}

