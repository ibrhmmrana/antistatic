'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getInstagramRedirectUri } from '@/lib/instagram/config'
import { Button } from '@/components/ui/button'

interface InstagramConnection {
  instagram_user_id: string
  instagram_username: string | null
  created_at: string
}

interface InstagramIntegrationSettingsProps {
  businessLocationId: string
  connection: InstagramConnection | null
}

export function InstagramIntegrationSettings({ businessLocationId, connection }: InstagramIntegrationSettingsProps) {
  const [loading, setLoading] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [connectionState, setConnectionState] = useState<InstagramConnection | null>(connection)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  // Check for success/error messages from OAuth callback
  useEffect(() => {
    const success = searchParams.get('success')
    const error = searchParams.get('error')

    if (success) {
      // Refresh connection data
      refreshConnection()
      // Clear URL params
      router.replace('/settings/integrations/instagram')
    }

    if (error) {
      // Error will be shown in the UI
      router.replace('/settings/integrations/instagram')
    }
  }, [searchParams, router])

  const refreshConnection = async () => {
    try {
      const { data: location } = await supabase
        .from('business_locations')
        .select('id')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (location) {
        const { data: conn } = await supabase
          .from('instagram_connections')
          .select('instagram_user_id, instagram_username, created_at')
          .eq('business_location_id', location.id)
          .maybeSingle()

        setConnectionState(conn)
      }
    } catch (error) {
      console.error('Failed to refresh connection:', error)
    }
  }

  const handleConnect = async () => {
    setLoading(true)
    try {
      // Redirect to OAuth connect endpoint
      window.location.href = `/api/integrations/instagram/connect?business_location_id=${businessLocationId}`
    } catch (error: any) {
      console.error('Failed to initiate Instagram OAuth:', error)
      setLoading(false)
    }
  }

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect your Instagram account? This will remove all stored tokens.')) {
      return
    }

    setDisconnecting(true)
    try {
      const { error } = await supabase
        .from('instagram_connections')
        .delete()
        .eq('business_location_id', businessLocationId)

      if (error) {
        throw error
      }

      setConnectionState(null)
    } catch (error: any) {
      console.error('Failed to disconnect Instagram:', error)
      alert('Failed to disconnect Instagram account. Please try again.')
    } finally {
      setDisconnecting(false)
    }
  }

  const redirectUri = getInstagramRedirectUri()
  const isConnected = !!connectionState

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-semibold text-slate-900 mb-2" style={{ fontFamily: 'var(--font-google-sans)' }}>
        Instagram Integration
      </h1>
      <p className="text-sm text-slate-600 mb-6" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
        Connect your Instagram Business account to enable advanced features.
      </p>

      {/* Success/Error Messages */}
      {searchParams.get('success') && (
        <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200">
          <p className="text-sm text-green-700" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
            {searchParams.get('success')}
          </p>
        </div>
      )}
      {searchParams.get('error') && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200">
          <p className="text-sm text-red-700" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
            {searchParams.get('error')}
          </p>
        </div>
      )}

      {/* Connection Status */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-medium text-slate-900 mb-1" style={{ fontFamily: 'var(--font-google-sans)' }}>
              Connection Status
            </h2>
            <p className="text-sm text-slate-600" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
              {isConnected
                ? `Connected as ${connectionState?.instagram_username || connectionState?.instagram_user_id || 'Instagram account'}`
                : 'Not connected'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium ${
                isConnected
                  ? 'bg-green-100 text-green-700'
                  : 'bg-slate-100 text-slate-600'
              }`}
              style={{ fontFamily: 'var(--font-roboto-stack)' }}
            >
              {isConnected ? 'Connected' : 'Not Connected'}
            </span>
          </div>
        </div>

        {isConnected && connectionState?.created_at && (
          <p className="text-xs text-slate-500 mt-2" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
            Connected on {new Date(connectionState.created_at).toLocaleDateString()}
          </p>
        )}

        <div className="mt-4 flex gap-3">
          {!isConnected ? (
            <Button
              onClick={handleConnect}
              disabled={loading}
              variant="primary"
              size="md"
            >
              {loading ? 'Connecting...' : 'Connect Instagram'}
            </Button>
          ) : (
            <Button
              onClick={handleDisconnect}
              disabled={disconnecting}
              variant="secondary"
              size="md"
            >
              {disconnecting ? 'Disconnecting...' : 'Disconnect'}
            </Button>
          )}
        </div>
      </div>

      {/* Redirect URI Display */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-6">
        <h3 className="text-sm font-medium text-slate-900 mb-2" style={{ fontFamily: 'var(--font-google-sans)' }}>
          Meta Redirect URL
        </h3>
        <p className="text-xs text-slate-600 mb-3" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
          Copy this URL and paste it into Meta's "Set up Instagram business login" popup:
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded text-sm text-slate-900 font-mono break-all">
            {redirectUri}
          </code>
          <Button
            onClick={() => {
              navigator.clipboard.writeText(redirectUri)
              alert('Redirect URL copied to clipboard!')
            }}
            variant="secondary"
            size="sm"
          >
            Copy
          </Button>
        </div>
      </div>
    </div>
  )
}

