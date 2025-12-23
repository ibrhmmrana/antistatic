import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layouts/app-shell'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth')
  }

  // Get user profile for display
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle()

  // Get primary business for top bar
  const { data: business } = await supabase
    .from('business_locations')
    .select('name, rating, review_count')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (
    <AppShell
      userName={profile?.full_name || user.user_metadata?.full_name || user.email || 'User'}
      userEmail={user.email || undefined}
      businessName={business?.name || null}
      businessRating={business?.rating || null}
      businessReviewCount={business?.review_count || null}
    >
      {children}
    </AppShell>
  )
}

