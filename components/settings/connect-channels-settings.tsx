'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/lib/supabase/database.types'

type BusinessLocation = Database['public']['Tables']['business_locations']['Row']
type BusinessLocationSelect = Pick<BusinessLocation, 'facebook_username' | 'instagram_username' | 'linkedin_username' | 'tiktok_username'>
type BusinessLocationUpdate = Database['public']['Tables']['business_locations']['Update']

interface ConnectedAccount {
  provider: string
  status: string
  display_name?: string | null
}

interface ConnectChannelsSettingsProps {
  locationId: string
  connectedAccounts: ConnectedAccount[]
}

interface Channel {
  id: string
  name: string
  subLabel: string
  provider: string
  comingSoon?: boolean
  icon: string
  iconBg: string
}

const CHANNELS: Channel[] = [
  {
    id: 'google_gbp',
    name: 'Google Business Profile',
    subLabel: 'Reviews & messages',
    provider: 'google',
    icon: 'G',
    iconBg: 'bg-[#4285F4]',
  },
  {
    id: 'facebook',
    name: 'Facebook',
    subLabel: 'Enter your username',
    provider: 'facebook',
    icon: 'f',
    iconBg: 'bg-[#1877F2]',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    subLabel: 'Enter your username',
    provider: 'instagram',
    icon: '📷',
    iconBg: 'bg-gradient-to-br from-purple-500 to-pink-500',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    subLabel: 'Enter your username',
    provider: 'linkedin',
    icon: 'in',
    iconBg: 'bg-[#0077B5]',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    subLabel: 'Enter your username',
    provider: 'tiktok',
    icon: '🎵',
    iconBg: 'bg-[#000000]',
  },
]

interface InstagramConnectionStatus {
  connected: boolean
  username?: string | null
  instagram_user_id?: string
  scopes?: string[]
}

export function ConnectChannelsSettings({ locationId, connectedAccounts }: ConnectChannelsSettingsProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<ConnectedAccount[]>(connectedAccounts)
  const [socialUsernames, setSocialUsernames] = useState({
    facebook: '',
    instagram: '',
    linkedin: '',
    tiktok: '',
  })
  const [instagramStatus, setInstagramStatus] = useState<InstagramConnectionStatus | null>(null)
  const [instagramLoading, setInstagramLoading] = useState(true)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  // Extract Instagram OAuth callback params
  const igStatus = searchParams.get('ig')
  const igConnected = searchParams.get('connected')
  const igError = searchParams.get('ig_error')
  const igErrorReason = searchParams.get('reason')
  const igUsername = searchParams.get('ig_username')
  const igUserId = searchParams.get('ig_user_id')
  const gbpStatus = searchParams.get('gbp') || searchParams.get('google')

  // Remove #_ hash fragment on mount (Meta sometimes appends it)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#_') {
      const url = new URL(window.location.href)
      url.hash = ''
      router.replace(url.pathname + url.search)
    }
  }, [router])

  // Load existing social usernames from database on mount
  useEffect(() => {
    const loadSocialUsernames = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) return

        const locationResult = await supabase
          .from('business_locations')
          .select('facebook_username, instagram_username, linkedin_username, tiktok_username')
          .eq('id', locationId)
          .maybeSingle()
        
        const location = locationResult.data as BusinessLocationSelect | null

        if (location) {
          setSocialUsernames({
            facebook: location.facebook_username || '',
            instagram: location.instagram_username || '',
            linkedin: location.linkedin_username || '',
            tiktok: location.tiktok_username || '',
          })
        }
      } catch (err) {
        console.warn('Failed to load social usernames:', err)
      }
    }

    loadSocialUsernames()
  }, [locationId, supabase])

  const refreshAccounts = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) return

      const { data: connectedAccountsData } = await supabase
        .from('connected_accounts')
        .select('provider, status, display_name')
        .eq('user_id', user.id)
        .eq('business_location_id', locationId)
        .eq('status', 'connected')

      if (connectedAccountsData) {
        setAccounts(connectedAccountsData)
      }
    } catch (err) {
      console.error('Failed to refresh accounts:', err)
    }
  }

  // Fetch Instagram connection status
  useEffect(() => {
    const fetchInstagramStatus = async () => {
      if (!locationId) return

      try {
        setInstagramLoading(true)
        const response = await fetch(`/api/integrations/instagram/status?business_location_id=${locationId}`)
        if (response.ok) {
          const data = await response.json()
          setInstagramStatus(data)
        } else {
          setInstagramStatus({ connected: false })
        }
      } catch (err) {
        console.error('Failed to fetch Instagram status:', err)
        setInstagramStatus({ connected: false })
      } finally {
        setInstagramLoading(false)
      }
    }

    fetchInstagramStatus()
  }, [locationId])

  // Check for OAuth callback success/error
  useEffect(() => {
    // Check for Instagram OAuth callback
    if (igStatus === 'connected' && igConnected === '1') {
      // Set Instagram status immediately from URL params if available
      if (igUsername || igUserId) {
        setInstagramStatus({
          connected: true,
          username: igUsername || null,
          instagram_user_id: igUserId || undefined,
          scopes: [],
        })
      }

      // Refresh Instagram status from API to get full details
      const fetchStatus = async () => {
        try {
          const response = await fetch(`/api/integrations/instagram/status?business_location_id=${locationId}`)
          if (response.ok) {
            const data = await response.json()
            setInstagramStatus(data)
          }
        } catch (err) {
          console.error('Failed to refresh Instagram status:', err)
        }
      }
      fetchStatus()

      setSuccess(`Instagram account connected successfully${igUsername ? ` as @${igUsername}` : ''}.`)
      router.replace('/settings')
    } else if (igStatus === 'error') {
      // Handle Instagram errors
      let errorMessage = 'Failed to connect Instagram account. Please try again.'
      
      if (igErrorReason) {
        try {
          errorMessage = decodeURIComponent(igErrorReason)
        } catch (e) {
          errorMessage = igErrorReason
        }
      } else if (igError) {
        const errorMessages: Record<string, string> = {
          access_denied: 'Instagram connection was cancelled. Please try again when ready.',
          invalid_request: 'Invalid Instagram OAuth request. Please check configuration.',
          redirect_uri_mismatch: 'Redirect URI mismatch. Please contact support.',
          no_code: 'No authorization code received from Instagram.',
          invalid_state: 'Invalid or expired OAuth state. Please try again.',
          invalid_session: 'Invalid session. Please try again.',
          expired_state: 'OAuth session expired. Please try again.',
          config_error: 'Instagram OAuth not configured properly.',
          token_exchange_failed: 'Failed to exchange authorization code. Please try again.',
          invalid_token_response: 'Invalid response from Instagram. Please try again.',
          db_save_failed: 'Failed to save connection. Please try again.',
          not_authenticated: 'User not authenticated. Please log in and try again.',
          internal_error: 'An internal error occurred. Please try again.',
        }
        errorMessage = errorMessages[igError] || errorMessage
      }
      
      setError(errorMessage)
      router.replace('/settings')
    }

    // Check for Google Business Profile OAuth callback
    if (gbpStatus === 'connected') {
      refreshAccounts()
      setSuccess('Google Business Profile connected successfully.')
      router.replace('/settings')
      
      // Trigger GBP data fetch and analysis (same as onboarding)
      triggerGBPDataAndAnalysis()
    } else if (gbpStatus === 'error') {
      const errorReason = searchParams.get('reason')
      const errorMessage = errorReason 
        ? decodeURIComponent(errorReason)
        : 'Failed to connect Google Business Profile. Please try again.'
      setError(errorMessage)
      router.replace('/settings')
    }
  }, [searchParams, router, locationId, igStatus, igConnected, igUsername, igUserId, igError, igErrorReason, gbpStatus])

  // Check if Google Business Profile is connected
  const isGoogleConnected = accounts.some(
    (acc) => acc.provider === 'google_gbp' && acc.status === 'connected'
  )

  // Track if we've already triggered GBP data fetch to prevent double execution
  const gbpDataFetchTriggeredKey = `gbp_data_fetch_triggered_${locationId}`
  const gbpDataFetchTriggeredRef = useRef(
    typeof window !== 'undefined' ? sessionStorage.getItem(gbpDataFetchTriggeredKey) === 'true' : false
  )
  
  // Track previous GBP connection state to detect when it transitions from disconnected to connected
  const prevIsGoogleConnectedRef = useRef(isGoogleConnected)
  
  // Track if this is the initial mount
  const isInitialMountRef = useRef(true)

  // Trigger GBP data fetch and analysis when GBP is connected (same logic as onboarding)
  useEffect(() => {
    // Skip on initial mount
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false
      prevIsGoogleConnectedRef.current = isGoogleConnected
      return
    }
    
    // Only trigger if GBP just transitioned from disconnected to connected
    const gbpJustConnected = !prevIsGoogleConnectedRef.current && isGoogleConnected
    
    prevIsGoogleConnectedRef.current = isGoogleConnected
    
    if (!gbpJustConnected) {
      return
    }
    
    triggerGBPDataAndAnalysis()
  }, [isGoogleConnected, locationId])

  const triggerGBPDataAndAnalysis = async () => {
    if (!isGoogleConnected || !locationId) {
      return
    }
    
    const gbpAccount = accounts.find(
      (acc) => acc.provider === 'google_gbp' && acc.status === 'connected'
    )
    if (!gbpAccount) {
      return
    }

    // Prevent double execution
    if (gbpDataFetchTriggeredRef.current) {
      console.log('[Settings] GBP data fetch already triggered, skipping')
      return
    }

    gbpDataFetchTriggeredRef.current = true
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(gbpDataFetchTriggeredKey, 'true')
    }
    console.log('[Settings] Triggering GBP data fetch and analysis (one-time execution)')

    try {
      console.log('[Settings] Fetching GBP reviews first (this may take 1-2 minutes)...')
      const reviewsResponse = await fetch(`/api/locations/${locationId}/gbp-reviews?forceRefresh=true`)
      if (reviewsResponse.ok) {
        const reviewsData = await reviewsResponse.json().catch(() => null)
        console.log('[Settings] GBP reviews fetch initiated', {
          success: reviewsData?.success,
          reviewCount: reviewsData?.summary?.totalReviewCount,
        })
        
        // Poll for reviews to be available, then trigger analysis
        const maxAttempts = 20
        let attempts = 0
        
        const pollAndTriggerAnalysis = async () => {
          attempts++
          
          try {
            const analysisResponse = await fetch(`/api/locations/${locationId}/analysis/gbp`)
            
            if (analysisResponse.ok) {
              const analysisData = await analysisResponse.json().catch(() => null)
              if (analysisData?.success) {
                console.log('[Settings] Background GBP analysis completed successfully')
                return
              }
            } else if (analysisResponse.status === 404) {
              if (attempts < maxAttempts) {
                console.log(`[Settings] Insights row not ready yet, retrying in 6s (attempt ${attempts}/${maxAttempts})...`)
                setTimeout(pollAndTriggerAnalysis, 6000)
              } else {
                console.warn('[Settings] Timeout waiting for insights row to be created')
              }
              return
            } else {
              const errorData = await analysisResponse.json().catch(() => ({}))
              if (errorData.error === 'NOT_ENOUGH_DATA') {
                if (attempts < maxAttempts) {
                  console.log(`[Settings] Not enough reviews yet (${errorData.details?.totalReviews || 0} found), retrying in 6s (attempt ${attempts}/${maxAttempts})...`)
                  setTimeout(pollAndTriggerAnalysis, 6000)
                } else {
                  console.warn('[Settings] Timeout waiting for reviews - analysis will be triggered when user reaches analysis page')
                }
                return
              } else {
                console.warn('[Settings] Background GBP analysis trigger failed:', analysisResponse.status, errorData.error)
              }
            }
          } catch (analysisError) {
            if (attempts < maxAttempts) {
              console.log(`[Settings] Error checking analysis status, retrying in 6s (attempt ${attempts}/${maxAttempts})...`)
              setTimeout(pollAndTriggerAnalysis, 6000)
            } else {
              console.warn('[Settings] Background GBP analysis trigger error after max attempts:', analysisError)
            }
          }
        }
        
        setTimeout(pollAndTriggerAnalysis, 10000)
      } else {
        console.warn('[Settings] GBP reviews fetch failed:', reviewsResponse.status)
        gbpDataFetchTriggeredRef.current = false
      }
    } catch (error) {
      console.warn('[Settings] Background GBP data fetch error:', error)
      gbpDataFetchTriggeredRef.current = false
    }
  }

  const handleChannelClick = async (channel: Channel) => {
    // Handle Google Business Profile OAuth
    if (channel.id === 'google_gbp') {
      setLoading(channel.id)
      setError(null)

      try {
        const response = await fetch('/api/google/gbp/auth')
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to generate OAuth URL')
        }

        if (!data.url && !data.authUrl) {
          throw new Error('No OAuth URL returned')
        }

        window.location.href = data.url || data.authUrl
      } catch (err: any) {
        console.error('OAuth error:', err)
        setError(err.message || 'Failed to connect account')
        setLoading(null)
      }
      return
    }

    // Handle Instagram OAuth
    if (channel.id === 'instagram') {
      setLoading(channel.id)
      setError(null)

      try {
        window.location.href = `/api/integrations/instagram/connect?business_location_id=${locationId}&return_to=/settings`
      } catch (err: any) {
        console.error('Instagram OAuth error:', err)
        setError(err.message || 'Failed to connect Instagram account')
        setLoading(null)
      }
      return
    }
  }

  const handleSave = async () => {
    setLoading('save')
    setError(null)
    setSuccess(null)

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        throw new Error('User not authenticated')
      }

      // Save social usernames to database
      const updateData = {
        facebook_username: socialUsernames.facebook || null,
        instagram_username: socialUsernames.instagram || null,
        linkedin_username: socialUsernames.linkedin || null,
        tiktok_username: socialUsernames.tiktok || null,
      }
      const { error: updateError } = await (supabase as any)
        .from('business_locations')
        .update(updateData)
        .eq('id', locationId)

      if (updateError) {
        console.error('Failed to save social usernames:', updateError)
        throw new Error('Failed to save social usernames')
      }

      // Trigger all social analyses in the background (same as onboarding)
      // Trigger Instagram analysis if username provided
      if (socialUsernames.instagram?.trim()) {
        fetch('/api/social/instagram/analysis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: socialUsernames.instagram.trim(),
            locationId: locationId,
            resultsLimitPosts: 30,
            resultsLimitComments: 20,
            forceRefresh: false,
          }),
        })
          .then((res) => {
            if (res.ok) {
              console.log('[Settings] Instagram analysis triggered')
            } else {
              console.warn('[Settings] Instagram analysis trigger failed:', res.status)
            }
          })
          .catch((err) => {
            console.warn('[Settings] Instagram analysis trigger error:', err)
          })
      }

      // Trigger Facebook analysis if username provided
      if (socialUsernames.facebook?.trim()) {
        fetch('/api/social/facebook/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            facebookUrl: socialUsernames.facebook.trim(),
            locationId: locationId,
            resultsLimit: 30,
            force: false,
          }),
        })
          .then((res) => {
            if (res.ok) {
              console.log('[Settings] Facebook analysis triggered')
            } else {
              console.warn('[Settings] Facebook analysis trigger failed:', res.status)
            }
          })
          .catch((err) => {
            console.warn('[Settings] Facebook analysis trigger error:', err)
          })
      }

      setSuccess('Settings saved successfully. Analyses are running in the background.')
      setLoading(null)
    } catch (err: any) {
      console.error('Failed to save settings:', err)
      setError(err.message || 'Failed to save settings')
      setLoading(null)
    }
  }

  const getChannelStatus = (channel: Channel) => {
    if (channel.comingSoon) {
      return { label: 'Coming soon', color: 'text-[var(--google-grey-500)]', bg: 'bg-[var(--google-grey-100)]', dot: 'bg-[var(--google-grey-400)]' }
    }

    const account = accounts.find((acc) => acc.provider === channel.id)
    if (account && account.status === 'connected') {
      return { label: 'Connected', color: 'text-green-700', bg: 'bg-green-50', dot: 'bg-green-500' }
    }
    return { label: 'Not connected', color: 'text-[var(--google-grey-600)]', bg: 'bg-[var(--google-grey-100)]', dot: 'bg-[var(--google-grey-400)]' }
  }

  const isChannelConnected = (channel: Channel) => {
    return accounts.some((acc) => acc.provider === channel.id && acc.status === 'connected')
  }

  return (
    <div className="max-w-5xl">
      {/* Success/Error Messages */}
      {success && (
        <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200">
          <p className="text-sm text-green-700" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
            {success}
          </p>
        </div>
      )}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200">
          <p className="text-sm text-red-700" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
            {error}
          </p>
        </div>
      )}

      {/* Channel Cards Section */}
      <section className="bg-white border border-[var(--google-grey-200)] rounded-2xl shadow-sm mt-6 p-6">
        {/* Google Business Profile - Prominent */}
        {(() => {
          const gbpChannel = CHANNELS.find(ch => ch.id === 'google_gbp')
          if (!gbpChannel) return null
          const status = getChannelStatus(gbpChannel)
          const isConnected = isChannelConnected(gbpChannel)
          const isLoading = loading === gbpChannel.id
          const isDisabled = loading !== null && !isLoading

          return (
            <div className="mb-6">
              <button
                onClick={() => handleChannelClick(gbpChannel)}
                disabled={isDisabled}
                className={`
                  w-full flex items-center justify-between rounded-xl border bg-white px-5 py-4
                  transition-all
                  ${isConnected ? 'border-[#1565B4] bg-[#EDF5FD]' : 'border-[var(--google-grey-300)]'}
                  hover:border-[#1565B4] hover:shadow-sm cursor-pointer
                  ${isDisabled ? 'opacity-50' : ''}
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1565B4]
                `}
              >
                {/* Left: Icon + Name */}
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <img src="/Google__G__logo.svg" alt="Google" className="w-12 h-12 object-contain flex-shrink-0" />
                  <div className="flex flex-col">
                    <span className="font-medium text-base text-[var(--google-grey-900)]" style={{ fontFamily: '"Google Sans"' }}>
                      {gbpChannel.name}
                    </span>
                    <span className="text-sm text-[var(--google-grey-600)] text-left" style={{ fontFamily: 'var(--font-roboto-stack)', textAlign: 'left' }}>
                      {gbpChannel.subLabel}
                    </span>
                  </div>
                </div>

                {/* Right: Status Pill */}
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${status.bg} ${status.color} flex-shrink-0 ml-2`} style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                  <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`}></span>
                  {isLoading ? 'Connecting...' : status.label}
                </div>
              </button>
            </div>
          )
        })()}

        {/* Social Media Channels - 2x2 Grid */}
        <div>
          <label className="block text-sm font-medium text-[var(--google-grey-700)] mb-4" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
            Social Media Usernames
          </label>
          <div className="grid grid-cols-2 gap-4">
            {CHANNELS.filter(ch => ch.id !== 'google_gbp').map((channel) => {
              const usernameKey = channel.id as 'facebook' | 'instagram' | 'linkedin' | 'tiktok'
              
              // Get logo image path
              const getLogoPath = () => {
                switch (channel.id) {
                  case 'facebook':
                    return '/Facebook_f_logo_(2019).svg'
                  case 'instagram':
                    return '/Instagram_logo_2022.svg'
                  case 'linkedin':
                    return '/LinkedIn_logo_initials.png.webp'
                  case 'tiktok':
                    return '/tik-tok-logo_578229-290.avif'
                  default:
                    return ''
                }
              }

              // Check if Instagram is connected via OAuth
              const isInstagramOAuthConnected = channel.id === 'instagram' && instagramStatus?.connected === true
              const isInstagramLoading = channel.id === 'instagram' && (instagramLoading || loading === channel.id)

              return (
                <div key={channel.id} className="w-full">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Input
                        placeholder={`${channel.name} username`}
                        value={socialUsernames[usernameKey] || ''}
                        onChange={(e) => setSocialUsernames({
                          ...socialUsernames,
                          [usernameKey]: e.target.value
                        })}
                        icon={
                          <img 
                            src={getLogoPath()} 
                            alt={channel.name} 
                            className="w-6 h-6 object-contain flex-shrink-0"
                          />
                        }
                        disabled={channel.id === 'instagram' && isInstagramOAuthConnected}
                      />
                    </div>
                    {channel.id === 'instagram' && (
                      <div className="flex gap-2">
                        {isInstagramOAuthConnected ? (
                          <>
                            <button
                              onClick={() => handleChannelClick(channel)}
                              disabled={loading !== null && loading !== channel.id}
                              className={`
                                px-4 py-2 text-sm font-medium rounded-md border transition-colors
                                bg-white border-[var(--google-grey-300)] text-[var(--google-grey-700)] hover:border-[#1565B4] hover:text-[#1565B4]
                                ${loading === channel.id ? 'opacity-50 cursor-wait' : ''}
                                ${loading !== null && loading !== channel.id ? 'opacity-50 cursor-not-allowed' : ''}
                              `}
                              style={{ fontFamily: 'var(--font-roboto-stack)' }}
                            >
                              {loading === channel.id ? 'Reconnecting...' : 'Reconnect'}
                            </button>
                            <button
                              onClick={async () => {
                                if (!confirm('Are you sure you want to disconnect your Instagram account?')) return
                                try {
                                  setLoading('instagram_disconnect')
                                  setError(null)
                                  const response = await fetch(`/api/integrations/instagram/disconnect?business_location_id=${locationId}`, {
                                    method: 'POST',
                                  })
                                  if (response.ok) {
                                    setInstagramStatus({ connected: false })
                                    const statusResponse = await fetch(`/api/integrations/instagram/status?business_location_id=${locationId}`)
                                    if (statusResponse.ok) {
                                      const statusData = await statusResponse.json()
                                      setInstagramStatus(statusData)
                                    }
                                  } else {
                                    const errorData = await response.json().catch(() => ({}))
                                    setError(errorData.error || 'Failed to disconnect Instagram account')
                                  }
                                } catch (err: any) {
                                  setError(err.message || 'Failed to disconnect Instagram account')
                                } finally {
                                  setLoading(null)
                                }
                              }}
                              disabled={loading !== null}
                              className="px-4 py-2 text-sm font-medium rounded-md border border-red-300 text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              style={{ fontFamily: 'var(--font-roboto-stack)' }}
                            >
                              Disconnect
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleChannelClick(channel)}
                            disabled={loading !== null && loading !== channel.id}
                            className={`
                              px-4 py-2 text-sm font-medium rounded-md border transition-colors
                              bg-white border-[var(--google-grey-300)] text-[var(--google-grey-700)] hover:border-[#1565B4] hover:text-[#1565B4]
                              ${isInstagramLoading ? 'opacity-50 cursor-wait' : ''}
                              ${loading !== null && loading !== channel.id ? 'opacity-50 cursor-not-allowed' : ''}
                            `}
                            style={{ fontFamily: 'var(--font-roboto-stack)' }}
                          >
                            {isInstagramLoading ? 'Connecting...' : 'Connect via OAuth'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {channel.id === 'instagram' && isInstagramOAuthConnected && instagramStatus?.username && (
                    <p className="text-xs text-green-600 mt-1" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                      Connected as @{instagramStatus.username}.
                    </p>
                  )}
                  {channel.id === 'instagram' && isInstagramOAuthConnected && !instagramStatus?.username && (
                    <p className="text-xs text-green-600 mt-1" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                      Instagram connected via OAuth.
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Helper Text */}
        <p className="text-sm text-[var(--google-grey-500)] mt-4" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
          Enter the usernames for your main social profiles. These are used for reporting and messaging.
        </p>

        {/* Save Button */}
        <div className="mt-6">
          <Button
            variant="primary"
            size="md"
            onClick={handleSave}
            disabled={loading !== null}
          >
            {loading === 'save' ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </section>
    </div>
  )
}

