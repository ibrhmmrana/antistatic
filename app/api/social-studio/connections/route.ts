import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type UiPlatform = 'instagram' | 'facebook' | 'google_business' | 'linkedin' | 'tiktok'

type Channel = {
  id: UiPlatform
  name: string
  iconPath: string
  connected: boolean
  status: 'connected' | 'expired' | 'missing_permissions' | 'needs_reauth' | 'not_connected'
  displayName?: string | null
  avatarUrl?: string | null
  username?: string | null
  canSelect: boolean
  needsReconnect: boolean
}

// Platform configuration
const PLATFORM_CONFIG: Record<UiPlatform, { name: string; iconPath: string }> = {
  instagram: {
    name: 'Instagram',
    iconPath: '/Instagram_logo_2022.svg',
  },
  facebook: {
    name: 'Facebook',
    iconPath: '/Facebook_f_logo_(2019).svg',
  },
  google_business: {
    name: 'Google',
    iconPath: '/Google__G__logo.svg',
  },
  linkedin: {
    name: 'LinkedIn',
    iconPath: '/LinkedIn_logo_initials.png.webp',
  },
  tiktok: {
    name: 'TikTok',
    iconPath: '/tik-tok-logo_578229-290.avif',
  },
}

// Map database provider to UI platform
function mapProviderToPlatform(provider: string): UiPlatform | null {
  switch (provider) {
    case 'google_gbp':
      return 'google_business'
    case 'facebook':
      return 'facebook'
    case 'linkedin':
      return 'linkedin'
    case 'tiktok':
      return 'tiktok'
    default:
      return null
  }
}

// Check if token is expired
function isTokenExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false
  try {
    const expiry = new Date(expiresAt)
    return expiry <= new Date()
  } catch {
    return false
  }
}

// Determine channel status and selectability
function getChannelStatus(
  status: string | null | undefined,
  expiresAt: string | null | undefined
): {
  status: Channel['status']
  canSelect: boolean
  needsReconnect: boolean
} {
  const isExpired = isTokenExpired(expiresAt)
  const dbStatus = status || 'not_connected'

  if (isExpired) {
    return {
      status: 'expired',
      canSelect: false,
      needsReconnect: true,
    }
  }

  switch (dbStatus) {
    case 'connected':
      return {
        status: 'connected',
        canSelect: true,
        needsReconnect: false,
      }
    case 'expired':
      return {
        status: 'expired',
        canSelect: false,
        needsReconnect: true,
      }
    case 'missing_permissions':
      return {
        status: 'missing_permissions',
        canSelect: false,
        needsReconnect: true,
      }
    case 'needs_reauth':
      return {
        status: 'needs_reauth',
        canSelect: false,
        needsReconnect: true,
      }
    default:
      return {
        status: 'not_connected',
        canSelect: false,
        needsReconnect: false,
      }
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const businessLocationId = searchParams.get('businessLocationId')

    if (!businessLocationId) {
      return NextResponse.json({ error: 'businessLocationId is required' }, { status: 400 })
    }

    // Verify business location belongs to user
    const { data: location, error: locationError } = await supabase
      .from('business_locations')
      .select('id, instagram_username, facebook_username, linkedin_username, tiktok_username')
      .eq('id', businessLocationId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (locationError || !location) {
      return NextResponse.json({ error: 'Business location not found' }, { status: 404 })
    }

    // Fetch connected accounts
    const { data: connectedAccounts, error: accountsError } = await supabase
      .from('connected_accounts')
      .select('provider, display_name, avatar_url, status, expires_at')
      .eq('business_location_id', businessLocationId)

    if (accountsError) {
      console.error('[Social Studio Connections] Error fetching connected_accounts:', accountsError)
    }

    // Fetch Instagram connection (using safe cast for untyped table)
    const { data: instagramConnection, error: instagramError } = await (supabase
      .from('instagram_connections' as any) as any)
      .select('instagram_username, token_expires_at')
      .eq('business_location_id', businessLocationId)
      .maybeSingle()

    if (instagramError) {
      console.error('[Social Studio Connections] Error fetching instagram_connections:', instagramError)
    }

    // Build channels map
    const channelsMap = new Map<UiPlatform, Channel>()

    // Process connected_accounts
    const accounts = (connectedAccounts || []) as Array<{
      provider: string
      display_name: string | null
      avatar_url: string | null
      status: string | null
      expires_at: string | null
    }>

    for (const account of accounts) {
      const platform = mapProviderToPlatform(account.provider)
      if (!platform) continue

      const { status, canSelect, needsReconnect } = getChannelStatus(account.status, account.expires_at)
      const config = PLATFORM_CONFIG[platform]

      channelsMap.set(platform, {
        id: platform,
        name: config.name,
        iconPath: config.iconPath,
        connected: true,
        status,
        displayName: account.display_name,
        avatarUrl: account.avatar_url,
        canSelect,
        needsReconnect,
      })
    }

    // Process Instagram connection (special case - separate table)
    const typedInstagram = instagramConnection as {
      instagram_username: string | null
      token_expires_at: string | null
    } | null

    if (typedInstagram) {
      const { status, canSelect, needsReconnect } = getChannelStatus('connected', typedInstagram.token_expires_at)
      const config = PLATFORM_CONFIG.instagram

      channelsMap.set('instagram', {
        id: 'instagram',
        name: config.name,
        iconPath: config.iconPath,
        connected: true,
        status,
        displayName: typedInstagram.instagram_username,
        username: typedInstagram.instagram_username,
        canSelect,
        needsReconnect,
      })
    } else if (location.instagram_username) {
      // Fallback: username-only (not OAuth connected)
      const config = PLATFORM_CONFIG.instagram
      channelsMap.set('instagram', {
        id: 'instagram',
        name: config.name,
        iconPath: config.iconPath,
        connected: false,
        status: 'not_connected',
        username: location.instagram_username,
        canSelect: false,
        needsReconnect: false,
      })
    }

    // Add fallback channels for other platforms (username-only, not OAuth)
    // Only add if not already in map (don't override OAuth connections)
    if (!channelsMap.has('facebook') && location.facebook_username) {
      const config = PLATFORM_CONFIG.facebook
      channelsMap.set('facebook', {
        id: 'facebook',
        name: config.name,
        iconPath: config.iconPath,
        connected: false,
        status: 'not_connected',
        username: location.facebook_username,
        canSelect: false,
        needsReconnect: false,
      })
    }

    if (!channelsMap.has('linkedin') && location.linkedin_username) {
      const config = PLATFORM_CONFIG.linkedin
      channelsMap.set('linkedin', {
        id: 'linkedin',
        name: config.name,
        iconPath: config.iconPath,
        connected: false,
        status: 'not_connected',
        username: location.linkedin_username,
        canSelect: false,
        needsReconnect: false,
      })
    }

    if (!channelsMap.has('tiktok') && location.tiktok_username) {
      const config = PLATFORM_CONFIG.tiktok
      channelsMap.set('tiktok', {
        id: 'tiktok',
        name: config.name,
        iconPath: config.iconPath,
        connected: false,
        status: 'not_connected',
        username: location.tiktok_username,
        canSelect: false,
        needsReconnect: false,
      })
    }

    // Always include ALL platforms, even if not connected
    // This ensures users can see all available options and be prompted to connect
    const allPlatforms: UiPlatform[] = ['instagram', 'facebook', 'google_business', 'linkedin', 'tiktok']
    
    for (const platform of allPlatforms) {
      if (!channelsMap.has(platform)) {
        const config = PLATFORM_CONFIG[platform]
        channelsMap.set(platform, {
          id: platform,
          name: config.name,
          iconPath: config.iconPath,
          connected: false,
          status: 'not_connected',
          canSelect: false,
          needsReconnect: false,
        })
      }
    }

    // Convert map to array, sorted to show connected first, then unconnected
    const channels = Array.from(channelsMap.values()).sort((a, b) => {
      // Connected channels first
      if (a.connected && !b.connected) return -1
      if (!a.connected && b.connected) return 1
      // Then by name
      return a.name.localeCompare(b.name)
    })

    return NextResponse.json({ channels })
  } catch (error: any) {
    console.error('[Social Studio Connections] Error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

