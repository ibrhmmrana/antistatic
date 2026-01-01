import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/social/instagram/insights
 * 
 * Fetch Instagram insights/analytics from cached DB
 */
export async function GET(request: NextRequest) {
  try {
    const requestUrl = new URL(request.url)
    const locationId = requestUrl.searchParams.get('locationId')

    if (!locationId) {
      return NextResponse.json({ error: 'locationId is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify location belongs to user
    const { data: location } = await supabase
      .from('business_locations')
      .select('id')
      .eq('id', locationId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!location) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }

    // Get sync state to check insights availability
    const { data: syncState } = await supabase
      .from('instagram_sync_state')
      .select('insights_available, last_error_code, last_error_message, last_error_payload, granted_scopes_list, missing_scopes_list')
      .eq('business_location_id', locationId)
      .maybeSingle()

    // Check if insights are disabled due to error
    if (syncState && syncState.insights_available === false) {
      const requiredPermission = syncState.last_error_message?.includes('permission') 
        ? 'instagram_business_manage_insights'
        : undefined

      return NextResponse.json({
        status: 'disabled',
        requiredPermission,
        lastError: syncState.last_error_message || 'Insights not available',
        errorCode: syncState.last_error_code,
        errorPayload: syncState.last_error_payload || null,
        missingScopes: syncState.missing_scopes_list || [],
      })
    }

    // Get insights from last 30 days
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { data: insights } = await supabase
      .from('instagram_insights_daily')
      .select('reach, impressions, profile_visits, website_clicks, email_contacts, phone_call_clicks, date')
      .eq('business_location_id', locationId)
      .gte('date', thirtyDaysAgo.toISOString().split('T')[0])
      .order('date', { ascending: false })

    if (!insights || insights.length === 0) {
      return NextResponse.json({
        status: 'empty',
        suggestion: 'Run Sync to fetch insights data',
      })
    }

    // Aggregate insights
    const totalReach = insights.reduce((sum, i) => sum + (i.reach || 0), 0)
    const totalImpressions = insights.reduce((sum, i) => sum + (i.impressions || 0), 0)
    const totalProfileVisits = insights.reduce((sum, i) => sum + (i.profile_visits || 0), 0)
    const totalWebsiteClicks = insights.reduce((sum, i) => sum + (i.website_clicks || 0), 0)
    const totalEmailContacts = insights.reduce((sum, i) => sum + (i.email_contacts || 0), 0)
    const totalPhoneCallClicks = insights.reduce((sum, i) => sum + (i.phone_call_clicks || 0), 0)

    // Calculate engagement rate (if we have media data)
    const { count: mediaCount } = await supabase
      .from('instagram_media')
      .select('*', { count: 'exact', head: true })
      .eq('business_location_id', locationId)
      .gte('timestamp', thirtyDaysAgo.toISOString())

    const { count: commentsCount } = await supabase
      .from('instagram_comments')
      .select('*', { count: 'exact', head: true })
      .eq('business_location_id', locationId)
      .gte('timestamp', thirtyDaysAgo.toISOString())

    const { data: mediaWithLikes } = await supabase
      .from('instagram_media')
      .select('like_count, comments_count')
      .eq('business_location_id', locationId)
      .gte('timestamp', thirtyDaysAgo.toISOString())

    const totalLikes = (mediaWithLikes || []).reduce((sum, m) => sum + (m.like_count || 0), 0)
    const totalEngagements = totalLikes + (commentsCount || 0)
    const engagementRate = totalImpressions > 0 ? (totalEngagements / totalImpressions) * 100 : undefined

    return NextResponse.json({
      status: 'success',
      reach: totalReach,
      impressions: totalImpressions,
      profileVisits: totalProfileVisits,
      websiteClicks: totalWebsiteClicks,
      emailContacts: totalEmailContacts,
      phoneCallClicks: totalPhoneCallClicks,
      engagementRate: engagementRate ? Number(engagementRate.toFixed(1)) : undefined,
      dailyData: insights.slice(0, 30), // Last 30 days
    })
  } catch (error: any) {
    console.error('[Instagram Insights API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

