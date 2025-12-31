import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { InstagramIntegrationSettings } from '@/components/settings/InstagramIntegrationSettings'

export default async function InstagramIntegrationPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth')
  }

  // Get user's business location
  const { data: location } = await supabase
    .from('business_locations')
    .select('id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const typedLocation = location as { id: string } | null

  if (!typedLocation) {
    redirect('/onboarding/business')
  }

  // Get Instagram connection for this location
  const { data: connection } = await supabase
    .from('instagram_connections')
    .select('instagram_user_id, instagram_username, created_at')
    .eq('business_location_id', typedLocation.id)
    .maybeSingle()

  return <InstagramIntegrationSettings businessLocationId={typedLocation.id} connection={connection} />
}

