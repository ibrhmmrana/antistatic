'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material'
import { Database } from '@/lib/supabase/database.types'

type BusinessLocation = Database['public']['Tables']['business_locations']['Row']
type BusinessLocationSelect = Pick<BusinessLocation, 'facebook_username' | 'instagram_username' | 'linkedin_username' | 'tiktok_username'>
type BusinessLocationUpdate = Database['public']['Tables']['business_locations']['Update']

interface ConnectedAccount {
  provider: string
  status: string
  display_name?: string | null
}

interface ConnectAccountsProps {
  userName?: string
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

export function ConnectAccounts({ userName = 'there', locationId, connectedAccounts }: ConnectAccountsProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<ConnectedAccount[]>(connectedAccounts)
  const [goingBack, setGoingBack] = useState(false)
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
    const googleStatus = searchParams.get('google') || searchParams.get('gbp')
    const errorReason = searchParams.get('reason')
    const allowBack = searchParams.get('allowBack')

    // Check for Instagram OAuth callback
    const igStatus = searchParams.get('ig')
    const igConnected = searchParams.get('connected')
    const igError = searchParams.get('ig_error')
    const igUsername = searchParams.get('ig_username')
    const igUserId = searchParams.get('ig_user_id')

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

      // Preserve allowBack param
      if (allowBack) {
        router.replace('/onboarding/connect?allowBack=true')
      } else {
        router.replace('/onboarding/connect')
      }
    } else if (igError) {
      // Handle Instagram errors
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
      setError(errorMessages[igError] || 'Failed to connect Instagram account. Please try again.')

      // Preserve allowBack param
      if (allowBack) {
        router.replace('/onboarding/connect?allowBack=true')
      } else {
        router.replace('/onboarding/connect')
      }
    }

    if (googleStatus === 'connected') {
      refreshAccounts()
      // Preserve allowBack param to prevent auto-redirect
      if (allowBack) {
        router.replace('/onboarding/connect?allowBack=true')
      } else {
        router.replace('/onboarding/connect')
      }
    } else if (googleStatus === 'error') {
      // Show specific error message if provided, otherwise show generic one
      const errorMessage = errorReason 
        ? decodeURIComponent(errorReason)
        : 'Failed to connect Google Business Profile. Please try again.'
      setError(errorMessage)
      // Preserve allowBack param
      if (allowBack) {
        router.replace('/onboarding/connect?allowBack=true')
      } else {
        router.replace('/onboarding/connect')
      }
    }
  }, [searchParams, router, locationId])

  // Check if Google Business Profile is connected
  const isGoogleConnected = accounts.some(
    (acc) => acc.provider === 'google_gbp' && acc.status === 'connected'
  )

  // Track if we've already triggered GBP data fetch to prevent double execution
  const gbpDataFetchTriggeredRef = useRef(false)

  // Trigger GBP data fetch and analysis immediately when GBP is connected (fire and forget)
  useEffect(() => {
    const triggerGBPDataAndAnalysis = async () => {
      if (!isGoogleConnected || !locationId) {
        return
      }

      // Prevent double execution - only trigger once per connection
      if (gbpDataFetchTriggeredRef.current) {
        console.log('[Connect Accounts] GBP data fetch already triggered, skipping')
        return
      }

      gbpDataFetchTriggeredRef.current = true
      console.log('[Connect Accounts] Triggering GBP data fetch and analysis (one-time execution)')

      try {
        // Step 1: Fetch GBP reviews first (this creates the insights row, fetches reviews via Apify, etc.)
        // This is required before analysis can run
        // Use forceRefresh=true ONLY if there's no existing data (to avoid double Apify execution)
        console.log('[Connect Accounts] Fetching GBP reviews first (this may take 1-2 minutes)...')
        const reviewsResponse = await fetch(`/api/locations/${locationId}/gbp-reviews?forceRefresh=true`)
        if (reviewsResponse.ok) {
          const reviewsData = await reviewsResponse.json().catch(() => null)
          console.log('[Connect Accounts] GBP reviews fetch initiated', {
            success: reviewsData?.success,
            reviewCount: reviewsData?.summary?.totalReviewCount,
          })
          
          // Step 2: Poll for reviews to be available, then trigger analysis
          // Analysis needs at least 5 reviews with text, and the insights row must exist
          const maxAttempts = 20 // Try for up to 2 minutes (20 * 6 seconds)
          let attempts = 0
          
          const pollAndTriggerAnalysis = async () => {
            attempts++
            
            try {
              // Check if we have enough reviews by trying to trigger analysis
              // The analysis endpoint will return NOT_ENOUGH_DATA if reviews aren't ready
              const analysisResponse = await fetch(`/api/locations/${locationId}/analysis/gbp`)
              
              if (analysisResponse.ok) {
                const analysisData = await analysisResponse.json().catch(() => null)
                if (analysisData?.success) {
                  console.log('[Connect Accounts] Background GBP analysis completed successfully')
                  return // Success, stop polling
                }
              } else if (analysisResponse.status === 404) {
                // Insights row doesn't exist yet, keep polling
                if (attempts < maxAttempts) {
                  console.log(`[Connect Accounts] Insights row not ready yet, retrying in 6s (attempt ${attempts}/${maxAttempts})...`)
                  setTimeout(pollAndTriggerAnalysis, 6000)
                } else {
                  console.warn('[Connect Accounts] Timeout waiting for insights row to be created')
                }
                return
              } else {
                const errorData = await analysisResponse.json().catch(() => ({}))
                if (errorData.error === 'NOT_ENOUGH_DATA') {
                  // Not enough reviews yet, keep polling
                  if (attempts < maxAttempts) {
                    console.log(`[Connect Accounts] Not enough reviews yet (${errorData.details?.totalReviews || 0} found), retrying in 6s (attempt ${attempts}/${maxAttempts})...`)
                    setTimeout(pollAndTriggerAnalysis, 6000)
                  } else {
                    console.warn('[Connect Accounts] Timeout waiting for reviews - analysis will be triggered when user reaches analysis page')
                  }
                  return
                } else {
                  console.warn('[Connect Accounts] Background GBP analysis trigger failed:', analysisResponse.status, errorData.error)
                }
              }
            } catch (analysisError) {
              if (attempts < maxAttempts) {
                console.log(`[Connect Accounts] Error checking analysis status, retrying in 6s (attempt ${attempts}/${maxAttempts})...`)
                setTimeout(pollAndTriggerAnalysis, 6000)
              } else {
                console.warn('[Connect Accounts] Background GBP analysis trigger error after max attempts:', analysisError)
              }
            }
          }
          
          // Start polling after a short initial delay (reviews fetch might be async)
          setTimeout(pollAndTriggerAnalysis, 10000) // Wait 10 seconds before first check
        } else {
          console.warn('[Connect Accounts] GBP reviews fetch failed:', reviewsResponse.status)
          // Reset flag on failure so it can be retried
          gbpDataFetchTriggeredRef.current = false
        }
      } catch (error) {
        // Silently fail - don't show errors to user
        console.warn('[Connect Accounts] Background GBP data fetch error:', error)
        // Reset flag on error so it can be retried
        gbpDataFetchTriggeredRef.current = false
      }
    }

    triggerGBPDataAndAnalysis()
  }, [isGoogleConnected, locationId])

  const handleChannelClick = async (channel: Channel) => {
    // Handle Google Business Profile OAuth
    if (channel.id === 'google_gbp') {
      setLoading(channel.id)
      setError(null)

      try {
        // Get Google OAuth URL from our API
        // This will work for both initial connection and reconnection
        const response = await fetch('/api/google/gbp/auth')
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to generate OAuth URL')
        }

        if (!data.url && !data.authUrl) {
          throw new Error('No OAuth URL returned')
        }

        // Redirect to Google OAuth (support both response formats)
        // This will replace the existing connection with a new one
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
        // Redirect to Instagram OAuth connect endpoint
        window.location.href = `/api/integrations/instagram/connect?business_location_id=${locationId}`
      } catch (err: any) {
        console.error('Instagram OAuth error:', err)
        setError(err.message || 'Failed to connect Instagram account')
        setLoading(null)
      }
      return
    }
  }

  const handleContinue = async () => {
    if (!isGoogleConnected) {
      return
    }

    setLoading('continue')

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
        // Don't block the flow, just log the error
      }

      // Trigger all social analyses in the background (fire and forget)
      // This ensures analyses are running while user navigates to analysis page
      // Don't wait for analyses to complete - navigate immediately

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
              console.log('[Connect Accounts] Instagram analysis triggered')
            } else {
              console.warn('[Connect Accounts] Instagram analysis trigger failed:', res.status)
            }
          })
          .catch((err) => {
            console.warn('[Connect Accounts] Instagram analysis trigger error:', err)
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
              console.log('[Connect Accounts] Facebook analysis triggered')
            } else {
              console.warn('[Connect Accounts] Facebook analysis trigger failed:', res.status)
            }
          })
          .catch((err) => {
            console.warn('[Connect Accounts] Facebook analysis trigger error:', err)
          })
      }

      // Redirect to channel analysis page
      router.push('/onboarding/analysis?allowBack=true')
    } catch (err: any) {
      console.error('Failed to complete onboarding:', err)
      setError(err.message || 'Failed to complete onboarding')
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

  const handleBack = () => {
    setGoingBack(true)
    router.push('/onboarding/business?allowBack=true')
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <button
        onClick={handleBack}
        disabled={goingBack}
        className="flex items-center gap-2 text-[var(--google-grey-600)] hover:text-[var(--google-grey-900)] mb-6 transition-all duration-150 active:scale-95 active:opacity-70 disabled:opacity-70 disabled:cursor-not-allowed"
        style={{ fontFamily: 'var(--font-roboto-stack)' }}
      >
        <ArrowBackIcon sx={{ fontSize: 20 }} />
        <span className="text-sm font-medium">{goingBack ? 'Going back...' : 'Back'}</span>
      </button>
      {/* Header */}
      <h1 className="text-2xl lg:text-3xl font-medium mb-3 text-[var(--google-grey-900)] text-left" style={{ fontFamily: 'var(--font-google-sans)' }}>
        Connect your channels
      </h1>
      <p className="text-base text-[var(--google-grey-600)] mb-6 text-left" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
        Link the accounts Antistatic should use for reviews, messaging and social content.
      </p>

      {/* Success/Error Messages */}
      {searchParams.get('google') === 'connected' && (
        <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200">
          <p className="text-sm text-green-700" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
            Google Business Profile connected successfully.
          </p>
        </div>
      )}
      {igStatus === 'connected' && igConnected === '1' && (
        <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200">
          <p className="text-sm text-green-700" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
            Instagram account connected successfully{igUsername ? ` as @${igUsername}` : ''}.
          </p>
        </div>
      )}
      {searchParams.get('google') === 'error' && !error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200">
          <p className="text-sm text-red-700" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
            {searchParams.get('reason') 
              ? decodeURIComponent(searchParams.get('reason') || '')
              : 'Failed to connect Google Business Profile. Please try again.'}
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
                                  const response = await fetch(`/api/integrations/instagram/disconnect?business_location_id=${locationId}`, {
                                    method: 'POST',
                                  })
                                  if (response.ok) {
                                    setInstagramStatus({ connected: false })
                                  } else {
                                    setError('Failed to disconnect Instagram account')
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
                      Connected as @{instagramStatus.username}. Username field is for Apify analysis only.
                    </p>
                  )}
                  {channel.id === 'instagram' && isInstagramOAuthConnected && !instagramStatus?.username && (
                    <p className="text-xs text-green-600 mt-1" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                      Instagram connected via OAuth. Username field is for Apify analysis only.
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

        {/* Continue Button */}
        <div className="mt-6">
          <Button
            variant="primary"
            size="md"
            onClick={handleContinue}
            disabled={!isGoogleConnected || loading !== null}
          >
            {loading === 'continue' ? 'Loading...' : 'Continue'}
          </Button>
        </div>
      </section>
    </div>
  )
}
