'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Database } from '@/lib/supabase/database.types'

type ConnectedAccount = Database['public']['Tables']['connected_accounts']['Row']
type ConnectedAccountSelect = Pick<ConnectedAccount, 'provider' | 'status' | 'display_name'>

interface Channel {
  id: string
  name: string
  subLabel: string
  provider: string
  comingSoon?: boolean
  logoPath?: string
  iconBg: string
}

const CHANNELS: Channel[] = [
  {
    id: 'google_gbp',
    name: 'Google Business Profile',
    subLabel: 'Reviews & messages',
    provider: 'google',
    logoPath: '/Google__G__logo.svg',
    iconBg: 'bg-[#4285F4]',
  },
  {
    id: 'facebook',
    name: 'Facebook',
    subLabel: 'Enter your username',
    provider: 'facebook',
    logoPath: '/Facebook_f_logo_(2019).svg',
    iconBg: 'bg-[#1877F2]',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    subLabel: 'Connect via OAuth',
    provider: 'instagram',
    logoPath: '/Instagram_logo_2022.svg',
    iconBg: 'bg-gradient-to-br from-purple-500 to-pink-500',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    subLabel: 'Enter your username',
    provider: 'linkedin',
    logoPath: '/LinkedIn_logo_initials.png.webp',
    iconBg: 'bg-[#0077B5]',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    subLabel: 'Enter your username',
    provider: 'tiktok',
    logoPath: '/tik-tok-logo_578229-290.avif',
    iconBg: 'bg-[#000000]',
  },
]

interface ConnectChannelsTabProps {
  locationId: string
}

export function ConnectChannelsTab({ locationId }: ConnectChannelsTabProps) {
  const [accounts, setAccounts] = useState<ConnectedAccountSelect[]>([])
  const [instagramConnected, setInstagramConnected] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const fetchConnections = async () => {
      // Fetch connected accounts
      const { data: connectedAccounts } = await supabase
        .from('connected_accounts')
        .select('provider, status, display_name')
        .eq('business_location_id', locationId)
        .eq('status', 'connected')

      if (connectedAccounts) {
        setAccounts(connectedAccounts as ConnectedAccountSelect[])
      }

      // Check Instagram OAuth connection
      const { data: instagramConnection } = await supabase
        .from('instagram_connections')
        .select('instagram_username')
        .eq('business_location_id', locationId)
        .maybeSingle()

      setInstagramConnected(!!instagramConnection)
    }

    fetchConnections()
  }, [locationId, supabase])

  const handleConnect = async (channel: Channel) => {
    if (channel.comingSoon) return

    setLoading(channel.id)

    try {
      if (channel.id === 'instagram') {
        // Redirect directly to Instagram OAuth connect endpoint
        // This endpoint handles the OAuth flow and redirects to Instagram
        window.location.href = `/api/integrations/instagram/connect?business_location_id=${locationId}`
      } else if (channel.id === 'google_gbp') {
        // Redirect to Google OAuth
        router.push('/api/gbp/oauth/connect')
      } else {
        // For other channels, show coming soon or handle differently
        console.log('Connecting', channel.name)
      }
    } catch (error) {
      console.error('Error connecting channel:', error)
      setLoading(null)
    }
  }

  const handleDisconnect = async (provider: string) => {
    if (provider === 'instagram') {
      try {
        const response = await fetch(`/api/integrations/instagram/disconnect?business_location_id=${locationId}`, {
          method: 'POST',
        })
        if (response.ok) {
          setInstagramConnected(false)
          setAccounts(accounts.filter(acc => acc.provider !== 'instagram'))
        }
      } catch (error) {
        console.error('Error disconnecting Instagram:', error)
      }
    } else {
      // Handle other providers
      console.log('Disconnecting', provider)
    }
  }

  const isConnected = (channel: Channel) => {
    if (channel.id === 'instagram') {
      return instagramConnected
    }
    return accounts.some(acc => acc.provider === channel.provider && acc.status === 'connected')
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-xl font-semibold mb-4 text-slate-900">Connect Social Media Channels</h2>
        <p className="text-slate-600 mb-6">
          Connect your social media accounts to manage them from one place
        </p>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {CHANNELS.map((channel) => {
            const connected = isConnected(channel)
            const isLoading = loading === channel.id

            return (
              <div
                key={channel.id}
                className={`border rounded-lg p-4 transition-all ${
                  connected ? 'border-green-500 bg-green-50 dark:bg-green-950' : 'border-border'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {channel.logoPath ? (
                      <div className="w-10 h-10 flex items-center justify-center">
                        <img
                          src={channel.logoPath}
                          alt={channel.name}
                          className="w-full h-full object-contain"
                        />
                      </div>
                    ) : (
                      <div
                        className={`w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold ${channel.iconBg}`}
                      >
                        {channel.name.charAt(0)}
                      </div>
                    )}
                    <div>
                      <h3 className="font-semibold text-slate-900">{channel.name}</h3>
                      <p className="text-sm text-slate-600">{channel.subLabel}</p>
                    </div>
                  </div>
                  {connected && (
                    <span className="text-xs bg-green-500 text-white px-2 py-1 rounded">
                      Connected
                    </span>
                  )}
                </div>

                <div className="flex gap-2">
                  {connected ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDisconnect(channel.provider)}
                      className="flex-1"
                    >
                      Disconnect
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handleConnect(channel)}
                      disabled={isLoading || channel.comingSoon}
                      className="flex-1"
                    >
                      {isLoading ? 'Connecting...' : channel.comingSoon ? 'Coming Soon' : 'Connect'}
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

