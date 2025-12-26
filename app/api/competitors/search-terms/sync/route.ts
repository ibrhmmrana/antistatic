import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGBPAccessTokenForLocation } from '@/lib/gbp/client'

/**
 * POST /api/competitors/search-terms/sync
 * Fetches search keywords from GBP Performance API and stores them in search_terms table
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { businessLocationId } = body

    if (!businessLocationId) {
      return NextResponse.json({ error: 'businessLocationId is required' }, { status: 400 })
    }

    // Get business location with google_location_name
    const { data: location, error: locationError } = await supabase
      .from('business_locations')
      .select('id, google_location_name, user_id')
      .eq('id', businessLocationId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (locationError || !location) {
      return NextResponse.json({ error: 'Location not found or access denied' }, { status: 404 })
    }

    if (!location.google_location_name) {
      return NextResponse.json({ error: 'Google location name not found. Please connect your Google Business Profile.' }, { status: 400 })
    }

    // Extract location ID from google_location_name (format: accounts/123/locations/456)
    const locationIdMatch = location.google_location_name.match(/locations\/(\d+)/)
    if (!locationIdMatch) {
      return NextResponse.json({ error: 'Invalid location name format' }, { status: 400 })
    }

    const gbpLocationId = locationIdMatch[1]

    // Get access token
    const { accessToken } = await getGBPAccessTokenForLocation(
      user.id,
      businessLocationId,
      request.headers.get('origin') || undefined
    )

    // Calculate date range (last 2 months)
    // Use the same month for start and end to get current month's data
    // Or use last 2 months as the user's example shows
    const now = new Date()
    const endMonth = now.getMonth() + 1 // Current month (1-indexed, e.g., 12 for December)
    const endYear = now.getFullYear()
    
    // Start from previous month
    let startMonth = endMonth - 1
    let startYear = endYear
    if (startMonth <= 0) {
      startMonth = 12
      startYear = endYear - 1
    }

    console.log('[Search Terms Sync] Date range:', {
      startYear,
      startMonth,
      endYear,
      endMonth,
      currentDate: now.toISOString(),
    })

    // Fetch search keywords from GBP Performance API
    const searchKeywordsUrl = `https://businessprofileperformance.googleapis.com/v1/locations/${gbpLocationId}/searchkeywords/impressions/monthly?monthlyRange.start_month.year=${startYear}&monthlyRange.start_month.month=${startMonth}&monthlyRange.end_month.year=${endYear}&monthlyRange.end_month.month=${endMonth}&pageSize=50`

    console.log('[Search Terms Sync] Fetching from:', searchKeywordsUrl)

    const response = await fetch(searchKeywordsUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Search Terms Sync] GBP API error:', response.status, errorText)
      return NextResponse.json(
        { error: `Failed to fetch search keywords: ${errorText}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    console.log('[Search Terms Sync] GBP API response type:', Array.isArray(data) ? 'array' : typeof data)
    console.log('[Search Terms Sync] GBP API response length/keys:', Array.isArray(data) ? data.length : (data ? Object.keys(data) : 'null'))
    console.log('[Search Terms Sync] GBP API response (first 500 chars):', JSON.stringify(data).substring(0, 500))
    
    // Parse response - it's an array with searchKeywordsCounts
    const searchKeywords: string[] = []
    
    // Handle array response (as shown in user's example)
    if (Array.isArray(data) && data.length > 0) {
      console.log('[Search Terms Sync] Response is array, length:', data.length)
      // Check if first element has searchKeywordsCounts
      if (data[0]?.searchKeywordsCounts) {
        const keywordsCounts = data[0].searchKeywordsCounts
        console.log('[Search Terms Sync] Keywords counts array length:', keywordsCounts.length)
        for (const item of keywordsCounts) {
          if (item?.searchKeyword) {
            searchKeywords.push(item.searchKeyword)
          }
        }
      } else {
        // Maybe the array itself contains the keywords?
        console.log('[Search Terms Sync] First array element keys:', data[0] ? Object.keys(data[0]) : 'null')
        // Try to find searchKeywordsCounts anywhere in the array
        for (const element of data) {
          if (element?.searchKeywordsCounts && Array.isArray(element.searchKeywordsCounts)) {
            for (const item of element.searchKeywordsCounts) {
              if (item?.searchKeyword) {
                searchKeywords.push(item.searchKeyword)
              }
            }
          }
        }
      }
    } else if (data && typeof data === 'object') {
      // Handle object response (maybe it's wrapped differently)
      console.log('[Search Terms Sync] Response is object, checking for searchKeywordsCounts...')
      if (data.searchKeywordsCounts && Array.isArray(data.searchKeywordsCounts)) {
        for (const item of data.searchKeywordsCounts) {
          if (item?.searchKeyword) {
            searchKeywords.push(item.searchKeyword)
          }
        }
      }
      // Check if there's a nested array
      if (Array.isArray(data) && data.length > 0 && data[0]?.searchKeywordsCounts) {
        for (const item of data[0].searchKeywordsCounts) {
          if (item?.searchKeyword) {
            searchKeywords.push(item.searchKeyword)
          }
        }
      }
    }

    console.log('[Search Terms Sync] Found keywords:', searchKeywords.length)
    if (searchKeywords.length > 0) {
      console.log('[Search Terms Sync] First 5 keywords:', searchKeywords.slice(0, 5))
    } else {
      console.warn('[Search Terms Sync] No keywords found! Full response structure:', {
        isArray: Array.isArray(data),
        type: typeof data,
        keys: data ? Object.keys(data) : null,
        firstElement: Array.isArray(data) && data.length > 0 ? Object.keys(data[0]) : null,
      })
    }

    // Filter out empty terms, normalize, and remove duplicates
    const validKeywords = Array.from(new Set(
      searchKeywords
        .map(term => term.trim().toLowerCase())
        .filter(term => term.length > 0)
    )).map(term => term.charAt(0).toUpperCase() + term.slice(1)) // Capitalize first letter for consistency
    
    console.log('[Search Terms Sync] Valid keywords after filtering and deduplication:', validKeywords.length)

    if (validKeywords.length === 0) {
      console.warn('[Search Terms Sync] No valid keywords to insert')
      return NextResponse.json({
        success: true,
        termsCount: 0,
        terms: [],
        message: 'No search keywords found in the response',
      })
    }

    // Delete existing GBP-sourced terms first
    const { error: deleteError } = await supabase
      .from('search_terms')
      .delete()
      .eq('business_location_id', businessLocationId)
      .eq('source', 'gbp_insights')

    if (deleteError) {
      console.error('[Search Terms Sync] Error deleting old terms:', deleteError)
      // Continue anyway - might be first sync or no old terms
    } else {
      console.log('[Search Terms Sync] Deleted old GBP-sourced terms')
    }

    // Prepare terms for insertion
    const termsToInsert = validKeywords.map(term => ({
      business_location_id: businessLocationId,
      term: term,
      source: 'gbp_insights' as const,
    }))

    console.log('[Search Terms Sync] Attempting to insert terms:', termsToInsert.length)
    console.log('[Search Terms Sync] First term example:', termsToInsert[0])
    
    // Insert new terms
    const { data: inserted, error: insertError } = await supabase
      .from('search_terms')
      .insert(termsToInsert)
      .select()

    if (insertError) {
      console.error('[Search Terms Sync] Error inserting terms:', {
        error: insertError,
        message: insertError.message,
        details: insertError.details,
        hint: insertError.hint,
        code: insertError.code,
        termsCount: termsToInsert.length,
        firstTerm: termsToInsert[0],
      })
      return NextResponse.json({ 
        error: `Failed to save search terms: ${insertError.message || 'Database error'}`,
        details: insertError.details,
        hint: insertError.hint,
        code: insertError.code,
      }, { status: 500 })
    }

    const insertedTerms = inserted || []
    console.log('[Search Terms Sync] Successfully inserted terms:', insertedTerms.length)

    return NextResponse.json({
      success: true,
      termsCount: validKeywords.length,
      terms: validKeywords,
      insertedTerms: insertedTerms,
    })

    return NextResponse.json({
      success: true,
      termsCount: searchKeywords.length,
      terms: searchKeywords,
      insertedTerms: insertedTerms,
    })
  } catch (error: any) {
    console.error('[Search Terms Sync] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to sync search terms' },
      { status: 500 }
    )
  }
}

