import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function AppPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth')
  }

  // Check onboarding status
  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed')
    .eq('id', user.id)
    .single()

  if (!profile?.onboarding_completed) {
    redirect('/onboarding/business')
  }

  // Get user's business location
  const { data: location } = await supabase
    .from('business_locations')
    .select('name')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  return (
    <div className="min-h-screen bg-[var(--google-grey-50)]">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="bg-white rounded-xl shadow-[var(--shadow-md)] p-12">
          <h1 className="text-4xl font-semibold mb-4 text-[var(--google-grey-900)]">
            Welcome to Antistatic
          </h1>
          {location && (
            <p className="text-xl text-[var(--google-grey-600)]">
              You're managing <strong>{location.name}</strong>
            </p>
          )}
          <div className="mt-8 p-6 bg-[var(--google-grey-50)] rounded-lg">
            <p className="text-[var(--google-grey-700)]">
              Your dashboard is being set up. More features coming soon!
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}








