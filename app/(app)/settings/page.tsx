import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ConnectChannelsSettings } from '@/components/settings/connect-channels-settings'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth')
  }

  // Get the user's business location (most recent one)
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

  // Get connected accounts for this location
  const { data: connectedAccounts } = await supabase
    .from('connected_accounts')
    .select('provider, status, display_name')
    .eq('user_id', user.id)
    .eq('business_location_id', typedLocation.id)
    .eq('status', 'connected')

  return (
    <div className="min-h-screen bg-[#f1f3f4]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl lg:text-3xl font-medium mb-3 text-[var(--google-grey-900)]" style={{ fontFamily: 'var(--font-google-sans)' }}>
          Settings
        </h1>
        <p className="text-base text-[var(--google-grey-600)] mb-6" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
          Manage your connected accounts and social media channels.
        </p>
        
        <ConnectChannelsSettings 
          locationId={typedLocation.id} 
          connectedAccounts={connectedAccounts || []} 
        />
      </div>
    </div>
  )
}

