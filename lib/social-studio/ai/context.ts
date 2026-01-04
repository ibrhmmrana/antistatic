/**
 * AI Context Builder for Social Studio
 * 
 * Fetches all available business context data for AI content generation
 */

import { createClient } from '@/lib/supabase/server'
import { getBusinessContext } from '@/lib/reputation/business-context'

export interface AiContextPayload {
  business: {
    name: string
    address: string | null
    city: string | null
    phone: string | null
    website: string | null
    primaryCategory: string | null
    categories: string[]
    hours: string | null
  }
  channels: Array<{
    platform: 'instagram' | 'facebook' | 'google_business' | 'linkedin' | 'tiktok'
    username: string | null
    connected: boolean
    status: string
  }>
  performance: {
    gbp: {
      callClicks: number
      websiteClicks: number
      directionsRequests: number
      avgRating: number | null
      reviewCount: number | null
    }
    instagram: {
      postsLast30Days: number | null
      avgLikes: number | null
      maxLikes: number | null
      totalComments: number | null
      hasAnyComments: boolean | null
    }
    facebook: Record<string, any> | null
  }
  reviews: {
    summary: {
      avgRating: number | null
      totalCount: number | null
      lastReviewAt: string | null
    }
    sentiment: any
    topKeywords: string[]
    recentHighlights: Array<{
      text: string
      rating: number
      author: string
      publishedAt: string
    }>
  }
  competitors: Array<{
    name: string
    rating: number | null
    reviewCount: number | null
    categories: string[]
  }>
  localSEO: {
    topSearchTerms: string[]
  }
  aiAnalysis: {
    gbp: {
      positiveSummary: string | null
      negativeSummary: string | null
      themes: Array<{
        theme: string
        you: string
        competitorName: string
        competitor: string
      }>
    } | null
    instagram: {
      summary: string | null
      whatWorks: string[]
      risksSummary: string | null
    } | null
    facebook: {
      summary: string | null
      whatWorks: string[]
      risksSummary: string | null
    } | null
  }
  socialContent: {
    instagram: {
      recentPosts: Array<{
        caption: string
        timestamp: string
        likes: number
        comments: number
      }>
      recentComments: Array<{
        text: string
        username: string
        timestamp: string
      }>
    }
    facebook: {
      recentPosts: Array<{
        message: string
        timestamp: string
      }>
    }
  }
}

/**
 * Build comprehensive AI context payload for a business location
 */
export async function getAiContext(businessLocationId: string): Promise<AiContextPayload> {
  const supabase = await createClient()

  // 1. Business identity (using existing helper)
  const businessContext = await getBusinessContext(businessLocationId)

  // 2. Business location data
  const { data: locationData } = await supabase
    .from('business_locations')
    .select('name, formatted_address, phone_number, website, category, categories, instagram_username, facebook_username, linkedin_username, x_username, tiktok_username, place_id')
    .eq('id', businessLocationId)
    .maybeSingle()
  
  const location = locationData as {
    name?: string
    formatted_address?: string
    phone_number?: string
    website?: string
    category?: string
    categories?: string[]
    instagram_username?: string
    facebook_username?: string
    linkedin_username?: string
    x_username?: string
    tiktok_username?: string
    place_id?: string
  } | null

  // 3. Business insights (GBP + social data)
  const { data: insightsData } = await supabase
    .from('business_insights')
    .select(`
      gbp_primary_category,
      gbp_website_url,
      gbp_phone,
      gbp_address,
      gbp_avg_rating,
      gbp_review_count,
      gbp_last_review_at,
      gbp_total_call_clicks,
      gbp_total_website_clicks,
      gbp_total_directions_requests,
      review_sentiment_summary,
      top_review_keywords,
      apify_opening_hours,
      apify_competitors,
      gbp_ai_analysis,
      instagram_ai_analysis,
      instagram_username,
      instagram_metrics,
      instagram_raw_posts,
      instagram_raw_comments,
      facebook_ai_analysis,
      facebook_metrics,
      facebook_raw_posts
    `)
    .eq('location_id', businessLocationId)
    .eq('source', 'google')
    .maybeSingle()
  
  const insights = insightsData as {
    gbp_primary_category?: string
    gbp_website_url?: string
    gbp_phone?: string
    gbp_address?: string
    gbp_avg_rating?: number
    gbp_review_count?: number
    gbp_last_review_at?: string
    gbp_total_call_clicks?: number
    gbp_total_website_clicks?: number
    gbp_total_directions_requests?: number
    review_sentiment_summary?: any
    top_review_keywords?: string[]
    apify_opening_hours?: any
    apify_competitors?: any
    gbp_ai_analysis?: any
    instagram_ai_analysis?: any
    instagram_username?: string
    instagram_metrics?: any
    instagram_raw_posts?: any[]
    instagram_raw_comments?: any[]
    facebook_ai_analysis?: any
    facebook_metrics?: any
    facebook_raw_posts?: any[]
  } | null

  // 4. Recent reviews (last 10)
  const { data: reviewsData } = await supabase
    .from('business_reviews')
    .select('rating, review_text, author_name, published_at')
    .eq('location_id', businessLocationId)
    .order('published_at', { ascending: false })
    .limit(10)
  
  const reviews = reviewsData as Array<{
    rating?: number
    review_text?: string
    author_name?: string
    published_at?: string
  }> | null

  // 5. Search terms (last 20, dedupe)
  const { data: searchTermsData } = await supabase
    .from('search_terms')
    .select('term')
    .eq('business_location_id', businessLocationId)
    .order('created_at', { ascending: false })
    .limit(50)
  
  const searchTerms = searchTermsData as Array<{
    term?: string
  }> | null

  // Dedupe search terms
  const uniqueSearchTerms: string[] = Array.from(
    new Set((searchTerms || []).map((st) => st.term).filter((term): term is string => Boolean(term)))
  ).slice(0, 20)

  // 6. Connected accounts
  const { data: connectedAccountsData } = await supabase
    .from('connected_accounts')
    .select('provider, display_name, avatar_url, status')
    .eq('business_location_id', businessLocationId)
  
  const connectedAccounts = connectedAccountsData as Array<{
    provider?: string
    display_name?: string
    avatar_url?: string
    status?: string
  }> | null

  // 7. Instagram connection
  const { data: instagramConnectionData } = await supabase
    .from('instagram_connections')
    .select('instagram_user_id, instagram_username')
    .eq('business_location_id', businessLocationId)
    .maybeSingle()
  
  const instagramConnection = instagramConnectionData as {
    instagram_user_id?: string
    instagram_username?: string
  } | null

  // Build channels array
  const channels: AiContextPayload['channels'] = []
  
  if (instagramConnection || location?.instagram_username) {
    channels.push({
      platform: 'instagram',
      username: instagramConnection?.instagram_username || location?.instagram_username || null,
      connected: !!instagramConnection,
      status: instagramConnection ? 'connected' : 'not_connected',
    })
  }
  
  if (location?.facebook_username) {
    const fbAccount = connectedAccounts?.find((acc: any) => acc.provider === 'facebook')
    channels.push({
      platform: 'facebook',
      username: location.facebook_username,
      connected: !!fbAccount,
      status: fbAccount?.status || 'not_connected',
    })
  }
  
  if (location?.linkedin_username) {
    channels.push({
      platform: 'linkedin',
      username: location.linkedin_username,
      connected: false,
      status: 'not_connected',
    })
  }
  
  if (location?.tiktok_username) {
    channels.push({
      platform: 'tiktok',
      username: location.tiktok_username,
      connected: false,
      status: 'not_connected',
    })
  }

  // Always include Google Business Profile
  const gbpAccount = connectedAccounts?.find((acc: any) => acc.provider === 'google_gbp')
  channels.push({
    platform: 'google_business',
    username: location?.name || null,
    connected: !!gbpAccount,
    status: gbpAccount?.status || 'not_connected',
  })

  // Parse Instagram metrics
  const instagramMetrics = insights?.instagram_metrics as any
  const instagramPerformance = {
    postsLast30Days: instagramMetrics?.postsLast30Days || null,
    avgLikes: instagramMetrics?.avgLikesPerPost || null,
    maxLikes: instagramMetrics?.maxLikes || null,
    totalComments: instagramMetrics?.totalCommentsAnalyzed || null,
    hasAnyComments: instagramMetrics?.hasAnyComments || null,
  }

  // Parse Facebook metrics
  const facebookMetrics = insights?.facebook_metrics as any

  // Parse Instagram AI analysis
  const instagramAnalysis = insights?.instagram_ai_analysis as any
  const instagramAi = instagramAnalysis ? {
    summary: instagramAnalysis.summary || null,
    whatWorks: Array.isArray(instagramAnalysis.whatWorks) ? instagramAnalysis.whatWorks : [],
    risksSummary: instagramAnalysis.risksSummary || null,
  } : null

  // Parse Facebook AI analysis
  const facebookAnalysis = insights?.facebook_ai_analysis as any
  const facebookAi = facebookAnalysis ? {
    summary: facebookAnalysis.summary || null,
    whatWorks: Array.isArray(facebookAnalysis.whatWorks) ? facebookAnalysis.whatWorks : [],
    risksSummary: facebookAnalysis.risksSummary || null,
  } : null

  // Parse GBP AI analysis
  const gbpAnalysis = insights?.gbp_ai_analysis as any
  const gbpAi = gbpAnalysis ? {
    positiveSummary: gbpAnalysis.positiveSummary || null,
    negativeSummary: gbpAnalysis.negativeSummary || null,
    themes: Array.isArray(gbpAnalysis.themes) 
      ? gbpAnalysis.themes.slice(0, 5).map((t: any) => ({
          theme: t.theme || '',
          you: t.you || '',
          competitorName: t.competitorName || '',
          competitor: t.competitor || '',
        }))
      : [],
  } : null

  // Parse competitors (limit to top 5)
  const competitors: AiContextPayload['competitors'] = []
  if (insights?.apify_competitors) {
    const compData = insights.apify_competitors as any
    if (compData.places && Array.isArray(compData.places)) {
      const competitorPlaces = compData.places
        .filter((p: any) => !p.isSelf && p.placeId !== location?.place_id)
        .slice(0, 5)
      
      competitors.push(...competitorPlaces.map((p: any) => ({
        name: p.name || 'Unknown',
        rating: p.rating || null,
        reviewCount: p.reviewsCount || null,
        categories: Array.isArray(p.categories) ? p.categories : [],
      })))
    }
  }

  // Parse Instagram posts (last 5-10)
  const instagramPosts: AiContextPayload['socialContent']['instagram']['recentPosts'] = []
  if (insights?.instagram_raw_posts && Array.isArray(insights.instagram_raw_posts)) {
    const posts = insights.instagram_raw_posts.slice(0, 10)
    instagramPosts.push(...posts.map((p: any) => ({
      caption: p.caption || p.text || '',
      timestamp: p.timestamp || p.created_time || '',
      likes: p.likes_count || p.like_count || 0,
      comments: p.comments_count || p.comment_count || 0,
    })))
  }

  // Parse Instagram comments (last 5-10)
  const instagramComments: AiContextPayload['socialContent']['instagram']['recentComments'] = []
  if (insights?.instagram_raw_comments && Array.isArray(insights.instagram_raw_comments)) {
    const comments = insights.instagram_raw_comments.slice(0, 10)
    instagramComments.push(...comments.map((c: any) => ({
      text: c.text || c.comment || '',
      username: c.username || c.from?.username || '',
      timestamp: c.timestamp || c.created_time || '',
    })))
  }

  // Parse Facebook posts (last 5-10)
  const facebookPosts: AiContextPayload['socialContent']['facebook']['recentPosts'] = []
  if (insights?.facebook_raw_posts && Array.isArray(insights.facebook_raw_posts)) {
    const posts = insights.facebook_raw_posts.slice(0, 10)
    facebookPosts.push(...posts.map((p: any) => ({
      message: p.message || p.text || '',
      timestamp: p.created_time || p.timestamp || '',
    })))
  }

  // Parse review sentiment and keywords
  const reviewSentiment = insights?.review_sentiment_summary as any
  const topKeywords = Array.isArray(insights?.top_review_keywords)
    ? insights.top_review_keywords.slice(0, 10)
    : []

  // Format hours summary
  let hoursSummary: string | null = null
  if (insights?.apify_opening_hours) {
    const hours = insights.apify_opening_hours
    if (Array.isArray(hours)) {
      hoursSummary = hours
        .map((h: any) => `${h.day || ''}: ${h.hours || ''}`)
        .filter((s: string) => s.length > 0)
        .join(', ')
    }
  }

  // Build recent review highlights
  const recentHighlights = (reviews || [])
    .filter((r: any) => r.review_text && r.rating)
    .slice(0, 5)
    .map((r: any) => ({
      text: r.review_text || '',
      rating: r.rating || 0,
      author: r.author_name || 'Anonymous',
      publishedAt: r.published_at || '',
    }))

  return {
    business: {
      name: businessContext.businessName,
      address: businessContext.address || null,
      city: businessContext.city || null,
      phone: businessContext.phone || null,
      website: businessContext.website || null,
      primaryCategory: businessContext.primaryCategory || null,
      categories: businessContext.serviceHighlights || [],
      hours: hoursSummary || businessContext.hoursSummary || null,
    },
    channels,
    performance: {
      gbp: {
        callClicks: insights?.gbp_total_call_clicks || 0,
        websiteClicks: insights?.gbp_total_website_clicks || 0,
        directionsRequests: insights?.gbp_total_directions_requests || 0,
        avgRating: insights?.gbp_avg_rating || null,
        reviewCount: insights?.gbp_review_count || null,
      },
      instagram: instagramPerformance,
      facebook: facebookMetrics || null,
    },
    reviews: {
      summary: {
        avgRating: insights?.gbp_avg_rating || null,
        totalCount: insights?.gbp_review_count || null,
        lastReviewAt: insights?.gbp_last_review_at || null,
      },
      sentiment: reviewSentiment || null,
      topKeywords,
      recentHighlights,
    },
    competitors,
    localSEO: {
      topSearchTerms: uniqueSearchTerms,
    },
    aiAnalysis: {
      gbp: gbpAi,
      instagram: instagramAi,
      facebook: facebookAi,
    },
    socialContent: {
      instagram: {
        recentPosts: instagramPosts,
        recentComments: instagramComments,
      },
      facebook: {
        recentPosts: facebookPosts,
      },
    },
  }
}

