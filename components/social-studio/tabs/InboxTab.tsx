'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { InstagramInbox } from '@/components/social/instagram/inbox'
import { Button } from '@/components/ui/button'

interface InboxTabProps {
  businessLocationId: string
}

type InstagramConnection = {
  id: string
  business_location_id: string
  instagram_user_id: string
  instagram_username: string | null
} | null

export function InboxTab({ businessLocationId }: InboxTabProps) {
  const [instagramConnection, setInstagramConnection] = useState<InstagramConnection>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const fetchConnection = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          setLoading(false)
          return
        }

        // Fetch Instagram connection for this business location
        const { data: connection } = await (supabase
          .from('instagram_connections') as any)
          .select('id, business_location_id, instagram_user_id, instagram_username')
          .eq('business_location_id', businessLocationId)
          .maybeSingle()

        setInstagramConnection(connection || null)
      } catch (error) {
        console.error('[InboxTab] Error fetching Instagram connection:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchConnection()
  }, [businessLocationId, supabase])

  // Show loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1a73e8] mx-auto mb-4"></div>
          <p className="text-sm text-slate-600">Loading inbox...</p>
        </div>
      </div>
    )
  }

  // Show connect prompt if not connected
  if (!instagramConnection) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center max-w-md">
          <div className="mb-4">
            <svg
              className="w-16 h-16 mx-auto text-slate-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-slate-900 mb-2" style={{ fontFamily: 'var(--font-google-sans)' }}>
            Connect Instagram to enable Inbox
          </h3>
          <p className="text-slate-600 mb-6" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
            Connect your Instagram Business account to view and manage direct messages in one place.
          </p>
          <Button
            variant="primary"
            size="md"
            onClick={() => {
              window.location.href = `/api/integrations/instagram/connect?business_location_id=${businessLocationId}&return_to=${encodeURIComponent('/social-studio?tab=inbox')}`
            }}
          >
            Connect Instagram
          </Button>
        </div>
      </div>
    )
  }

  // Render the existing InstagramInbox component
  return (
    <div className="h-full">
      <InstagramInbox 
        locationId={businessLocationId} 
        instagramConnection={instagramConnection}
      />
    </div>
  )
}
