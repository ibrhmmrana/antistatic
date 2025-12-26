import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/competitors/search-terms
 * Returns all search terms for a location
 * If no terms exist, attempts to sync from GBP API
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const locationId = searchParams.get('locationId')
    const autoSync = searchParams.get('autoSync') !== 'false' // Default to true

    if (!locationId) {
      return NextResponse.json({ error: 'locationId is required' }, { status: 400 })
    }

    // Check if terms exist
    const { data: terms, error } = await supabase
      .from('search_terms')
      .select('*')
      .eq('business_location_id', locationId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[Search Terms API] Error:', error)
      return NextResponse.json({ error: 'Failed to fetch search terms' }, { status: 500 })
    }

    // Remove duplicates by term (case-insensitive)
    if (terms && terms.length > 0) {
      const seen = new Set<string>()
      const uniqueTerms = terms.filter((term) => {
        const normalized = term.term?.trim().toLowerCase()
        if (!normalized || seen.has(normalized)) {
          return false
        }
        seen.add(normalized)
        return true
      })
      return NextResponse.json({ terms: uniqueTerms })
    }

    // If no terms and autoSync is enabled, try to sync from GBP
    if ((!terms || terms.length === 0) && autoSync) {
      try {
        const syncResponse = await fetch(`${request.nextUrl.origin}/api/competitors/search-terms/sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': request.headers.get('cookie') || '',
          },
          body: JSON.stringify({ businessLocationId: locationId }),
        })

        if (syncResponse.ok) {
          // Fetch terms again after sync
          const { data: syncedTerms } = await supabase
            .from('search_terms')
            .select('*')
            .eq('business_location_id', locationId)
            .order('created_at', { ascending: false })

          // Remove duplicates by term (case-insensitive)
          if (syncedTerms && syncedTerms.length > 0) {
            const seen = new Set<string>()
            const uniqueTerms = syncedTerms.filter((term) => {
              const normalized = term.term?.trim().toLowerCase()
              if (!normalized || seen.has(normalized)) {
                return false
              }
              seen.add(normalized)
              return true
            })
            return NextResponse.json({ terms: uniqueTerms })
          }
          return NextResponse.json({ terms: syncedTerms || [] })
        } else {
          console.warn('[Search Terms API] Auto-sync failed, returning empty array')
        }
      } catch (syncError) {
        console.error('[Search Terms API] Auto-sync error:', syncError)
        // Continue and return empty array
      }
    }

    return NextResponse.json({ terms: terms || [] })
  } catch (error: any) {
    console.error('[Search Terms API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch search terms' },
      { status: 500 }
    )
  }
}

