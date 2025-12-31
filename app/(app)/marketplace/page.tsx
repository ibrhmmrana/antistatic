import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Database } from '@/lib/supabase/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']
type ProfileSelect = Pick<Profile, 'onboarding_completed'>

export default async function MarketplacePage() {
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

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-white -mt-14 md:-mt-16 pt-14 md:pt-16">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
          <div className="text-center">
            <h1 className="text-3xl font-semibold text-slate-900 mb-4" style={{ fontFamily: 'var(--font-google-sans)' }}>
              Marketplace
            </h1>
            <p className="text-slate-600" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
              Coming soon...
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

