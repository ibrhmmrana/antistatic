import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { gbpApiRequest, GBPLocation } from '@/lib/gbp/client'

/**
 * Get Google Business Profile locations for the authenticated user
 * 
 * Returns a list of all GBP locations associated with the connected account.
 * Uses the Business Profile Account Management API.
 */
export async function GET(request: NextRequest) {
  try {
    const requestUrl = new URL(request.url)
    const cookieStore = await cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll() {
            // No-op
          },
        },
      }
    )

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get business location ID from query or use most recent
    const locationIdParam = requestUrl.searchParams.get('businessLocationId')
    
    let businessLocationId: string
    if (locationIdParam) {
      businessLocationId = locationIdParam
    } else {
      const { data: location } = await supabase
        .from('business_locations')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (!location) {
        return NextResponse.json(
          { error: 'Business location not found' },
          { status: 404 }
        )
      }
      businessLocationId = location.id
    }

    // Get the primary GBP account name from connected_accounts
    const { data: connectedAccount } = await supabase
      .from('connected_accounts')
      .select('provider_account_id, display_name')
      .eq('user_id', user.id)
      .eq('business_location_id', businessLocationId)
      .eq('provider', 'google_gbp')
      .eq('status', 'connected')
      .single()

    if (!connectedAccount) {
      return NextResponse.json(
        { error: 'Google Business Profile not connected' },
        { status: 400 }
      )
    }

    // First, get accounts to find the primary account
    const accountsResponse = await gbpApiRequest<{ accounts: Array<{ name: string; accountName: string }> }>(
      '/accounts',
      user.id,
      businessLocationId,
      { method: 'GET' },
      requestUrl.origin
    )

    const accounts = accountsResponse.accounts || []
    const primaryAccount = accounts.find(acc => acc.accountName.includes('accounts/')) || accounts[0]

    if (!primaryAccount) {
      return NextResponse.json(
        { error: 'No GBP account found' },
        { status: 404 }
      )
    }

    // Extract account name (format: accounts/123456789)
    const accountName = primaryAccount.name

    // Get locations for this account
    const locationsResponse = await gbpApiRequest<{ locations: GBPLocation[] }>(
      `/${accountName}/locations`,
      user.id,
      businessLocationId,
      { method: 'GET' },
      requestUrl.origin
    )

    const locations = locationsResponse.locations || []

    // Normalize location data
    const normalizedLocations = locations.map((loc) => ({
      id: loc.locationId || loc.name.split('/').pop() || '',
      name: loc.title || '',
      address: loc.storefrontAddress ? {
        addressLines: loc.storefrontAddress.addressLines || [],
        locality: loc.storefrontAddress.locality || '',
        administrativeArea: loc.storefrontAddress.administrativeArea || '',
        postalCode: loc.storefrontAddress.postalCode || '',
        regionCode: loc.storefrontAddress.regionCode || '',
      } : null,
      placeId: loc.placeId || '',
      primaryCategory: loc.primaryCategory?.displayName || '',
      phoneNumber: loc.phoneNumbers?.primaryPhone || '',
      locationName: loc.name,
    }))

    return NextResponse.json({ locations: normalizedLocations })
  } catch (error: any) {
    console.error('Error fetching GBP locations:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch locations' },
      { status: 500 }
    )
  }
}






