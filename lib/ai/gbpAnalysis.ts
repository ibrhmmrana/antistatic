/**
 * GBP AI Analysis
 * 
 * Types and helpers for generating AI analysis of Google Business Profile reviews
 */

import { openai } from '@/lib/openai'
import { SupabaseClient } from '@supabase/supabase-js'

// ============================================================================
// Types
// ============================================================================

export interface GbpAnalysisMetrics {
  business: {
    name: string
    category: string // primary category
    locationLabel: string // e.g. "Linden, Johannesburg"
    avgRating: number
    totalReviews: number
    positiveReviews: number
    negativeReviews: number
  }
  localStats: {
    competitorCount: number
    avgCompetitorRating: number
    bestCompetitorRating: number
    avgCompetitorReviews: number
    reviewCountPercentile: number // 0–1
    negativeShare: number // our % 1–3★
    avgCompetitorNegativeShare: number // competitors % 1–3★
  }
  samples: {
    yourReviews: string[] // short texts (e.g. 10–20 max)
    competitorReviews: string[] // short texts
  }
}

export interface GbpAnalysisResult {
  positioningSummary: string
  themeInsights: Array<{
    theme: string
    you: string // how you perform for that theme
    competitors: string // how competitors perform
  }>
  actionPlan: string[] // 3–5 bullet-style recommendations
}

// ============================================================================
// AI Analysis Generation
// ============================================================================

/**
 * Generate GBP channel analysis using OpenAI Responses API
 */
export async function getGbpChannelAnalysis(
  metrics: GbpAnalysisMetrics
): Promise<GbpAnalysisResult> {
  console.log('[GBP AI Analysis] Generating analysis with OpenAI Responses API...')

  const systemPrompt = `You are an AI reputation analyst for local service businesses.
You receive structured metrics for one business and its nearby competitors plus a sample of review texts.
Your job is to produce three concise sections:

1. A plain-English summary (2-4 sentences) of how this business compares locally.
2. A breakdown of what customers love vs where they complain, comparing the business to competitors (3-5 theme insights).
3. A concrete 30-day action playbook with 3-5 specific recommendations.

Rules:
- Use only the numbers provided in the input; do not invent new numeric values.
- It is OK to use phrases like "higher than most competitors" or "among the top in your area".
- Keep each section concise and skimmable.
- If there are no competitors, focus purely on the business' own strengths/risks.
- ALWAYS provide at least 3 themeInsights items, even if review data is limited.
- Output **only valid JSON**, no markdown, no explanation.

Return JSON with this exact structure:
{
  "positioningSummary": "string (2–4 sentences max)",
  "themeInsights": [
    {
      "theme": "short label like 'Staff friendliness' or 'Service quality'",
      "you": "how this shows up in your reviews",
      "competitors": "how it shows up for competitors"
    }
  ],
  "actionPlan": [
    "bullet-style action for next 30 days",
    "another action",
    "another action"
  ]
}`

  const userPrompt = `Analyze this business data and produce the requested sections:

${JSON.stringify(metrics, null, 2)}`

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set')
  }

  const baseURL = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1'
  const orgId = process.env.OPENAI_ORG_ID

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
  if (orgId) {
    headers['OpenAI-Organization'] = orgId
  }

  console.log('[GBP AI Analysis] Calling OpenAI Responses API with gpt-5-mini...')

  const response = await fetch(`${baseURL}/responses`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'gpt-5-mini',
      input: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      response_format: { type: 'json_object' },
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    const errorMessage = errorData.error?.message || response.statusText
    console.error('[GBP AI Analysis] OpenAI Responses API error:', errorMessage)
    throw new Error(`Failed to generate analysis with gpt-5-mini: ${errorMessage}`)
  }

  const responseData = await response.json()
  console.log('[GBP AI Analysis] OpenAI Responses API response received')

  // Extract output text from response (structure may vary)
  const outputText = responseData.output_text || responseData.output?.[0]?.text || responseData.text || ''
  
  if (!outputText) {
    throw new Error('OpenAI response did not contain output text')
  }

  let parsed: Partial<GbpAnalysisResult>
  try {
    parsed = JSON.parse(outputText) as Partial<GbpAnalysisResult>
  } catch (parseError: any) {
    console.error('[GBP AI Analysis] Failed to parse JSON response:', parseError)
    throw new Error(`Failed to parse OpenAI response: ${parseError.message}`)
  }

  // Validate and ensure required fields
  if (!parsed.positioningSummary || !Array.isArray(parsed.themeInsights) || !Array.isArray(parsed.actionPlan)) {
    throw new Error('OpenAI response missing required fields: positioningSummary, themeInsights, or actionPlan')
  }

  const result: GbpAnalysisResult = {
    positioningSummary: parsed.positioningSummary,
    themeInsights: parsed.themeInsights.length > 0
      ? parsed.themeInsights
      : generateFallbackThemes(metrics),
    actionPlan: parsed.actionPlan.length > 0
      ? parsed.actionPlan
      : generateFallbackActionPlan(metrics),
  }

  console.log('[GBP AI Analysis] Analysis generated successfully')
  return result
}

// ============================================================================
// Fallback Generators
// ============================================================================

function generateFallbackPositioning(metrics: GbpAnalysisMetrics): string {
  const { business, localStats } = metrics
  const competitorText = localStats.competitorCount > 0
    ? ` Compared to ${localStats.competitorCount} nearby competitors, you rank ${metrics.localStats.reviewCountPercentile >= 0.75 ? 'in the top 25%' : metrics.localStats.reviewCountPercentile >= 0.5 ? 'above average' : 'below average'} for review volume.`
    : ' Insights are based on your data only.'
  
  return `Your ${business.category} business has a ${business.avgRating.toFixed(1)}-star rating based on ${business.totalReviews} reviews.${competitorText}`
}

function generateFallbackThemes(metrics: GbpAnalysisMetrics): GbpAnalysisResult['themeInsights'] {
  const themes: GbpAnalysisResult['themeInsights'] = []
  const { business, localStats, samples } = metrics

  // Extract keywords from review samples
  const allText = [...samples.yourReviews, ...samples.competitorReviews].join(' ').toLowerCase()

  if (allText.includes('service') || allText.includes('staff') || allText.includes('friendly')) {
    themes.push({
      theme: 'Service Quality',
      you: 'Service quality and staff interactions are mentioned in your reviews',
      competitors: localStats.competitorCount > 0 ? 'Service quality is a common theme for competitors' : 'Not enough competitor data available',
    })
  }

  if (allText.includes('price') || allText.includes('cost') || allText.includes('value')) {
    themes.push({
      theme: 'Pricing & Value',
      you: 'Pricing and value for money are discussed in your reviews',
      competitors: localStats.competitorCount > 0 ? 'Pricing is frequently mentioned for competitors' : 'Not enough competitor data available',
    })
  }

  if (allText.includes('time') || allText.includes('wait') || allText.includes('fast') || allText.includes('quick')) {
    themes.push({
      theme: 'Response Time',
      you: 'Response time and speed of service appear in your reviews',
      competitors: localStats.competitorCount > 0 ? 'Response time varies among competitors' : 'Not enough competitor data available',
    })
  }

  // Always add at least one generic theme
  if (themes.length === 0) {
    themes.push({
      theme: 'Overall Experience',
      you: `Your ${business.avgRating.toFixed(1)}-star rating indicates customers generally have a positive experience`,
      competitors: localStats.competitorCount > 0 ? `Competitors average ${localStats.avgCompetitorRating.toFixed(1)} stars in your area` : 'Not enough competitor data available',
    })
  }

  return themes
}

function generateFallbackActionPlan(metrics: GbpAnalysisMetrics): string[] {
  const actions: string[] = []

  if (metrics.business.negativeReviews > 0) {
    actions.push('Respond to all recent negative reviews within 24 hours')
  }

  if (metrics.business.totalReviews < 20) {
    actions.push('Encourage satisfied customers to leave reviews to build social proof')
  }

  actions.push('Address common complaints mentioned in reviews')
  actions.push('Monitor competitor performance and adjust strategy accordingly')

  return actions.slice(0, 5) // Max 5 actions
}

// ============================================================================
// Metrics Builder
// ============================================================================

/**
 * Build GBP analysis metrics from Supabase data
 */
export async function buildGbpMetricsForLocation(
  supabase: SupabaseClient,
  userId: string,
  locationId: string
): Promise<GbpAnalysisMetrics> {
  console.log('[GBP AI Analysis] Building metrics for location:', locationId)

  // Fetch location
  const { data: location, error: locationError } = await supabase
    .from('business_locations')
    .select('id, name, formatted_address, category')
    .eq('id', locationId)
    .eq('user_id', userId)
    .single()

  if (locationError || !location) {
    throw new Error('Location not found or access denied')
  }

  // Extract primary category (first part before comma)
  const primaryCategory = location.category
    ? location.category.split(',')[0].trim()
    : 'business'

  // Extract location label from formatted_address (city/area)
  let locationLabel = 'your area'
  if (location.formatted_address) {
    // Try to extract city/area from address (usually second-to-last or last part)
    const parts = location.formatted_address.split(',').map((p: string) => p.trim())
    if (parts.length >= 2) {
      locationLabel = parts[parts.length - 2] || parts[parts.length - 1] || 'your area'
    } else {
      locationLabel = parts[0] || 'your area'
    }
  }

  // Fetch insights
  const { data: insights, error: insightsError } = await supabase
    .from('business_insights')
    .select('gbp_avg_rating, gbp_review_count, review_sentiment_summary, apify_competitors')
    .eq('location_id', locationId)
    .eq('source', 'google')
    .single()

  if (insightsError || !insights) {
    throw new Error('No insights data available. Please connect your Google Business Profile first.')
  }

  // Fetch our reviews
  const { data: yourReviews } = await supabase
    .from('business_reviews')
    .select('rating, review_text, published_at')
    .eq('location_id', locationId)
    .eq('source', 'gbp')
    .order('published_at', { ascending: false })
    .limit(40)

  // Fetch competitor reviews
  const { data: competitorReviews } = await supabase
    .from('business_reviews')
    .select('rating, review_text, published_at')
    .eq('location_id', locationId)
    .eq('source', 'apify')
    .order('published_at', { ascending: false })
    .limit(80)

  // Compute our stats
  const yourTotalReviews = insights.gbp_review_count || 0
  const yourAvgRating = insights.gbp_avg_rating || 0
  const yourPositiveCount = yourReviews?.filter(r => r.rating && r.rating >= 4).length || 0
  const yourNegativeCount = yourReviews?.filter(r => r.rating && r.rating <= 3).length || 0
  const yourNegativeShare = yourTotalReviews > 0 ? yourNegativeCount / yourTotalReviews : 0

  // Extract competitor data from apify_competitors
  const competitors = (insights.apify_competitors as any)?.competitors || []
  const competitorCount = competitors.length

  let avgCompetitorRating = 0
  let bestCompetitorRating = 0
  let avgCompetitorReviews = 0
  let avgCompetitorNegativeShare = 0

  if (competitorCount > 0) {
    const competitorRatings: number[] = []
    const competitorReviewCounts: number[] = []
    const competitorNegativeShares: number[] = []

    competitors.forEach((comp: any) => {
      if (comp.avgRating) {
        competitorRatings.push(comp.avgRating)
        bestCompetitorRating = Math.max(bestCompetitorRating, comp.avgRating)
      }
      if (comp.reviewsCount) {
        competitorReviewCounts.push(comp.reviewsCount)
      }
      // Calculate negative share from reviews if available
      if (comp.reviews && Array.isArray(comp.reviews)) {
        const negativeCount = comp.reviews.filter((r: any) => r.rating && r.rating <= 3).length
        const total = comp.reviews.length
        if (total > 0) {
          competitorNegativeShares.push(negativeCount / total)
        }
      }
    })

    avgCompetitorRating = competitorRatings.length > 0
      ? competitorRatings.reduce((a, b) => a + b, 0) / competitorRatings.length
      : 0
    avgCompetitorReviews = competitorReviewCounts.length > 0
      ? competitorReviewCounts.reduce((a, b) => a + b, 0) / competitorReviewCounts.length
      : 0
    avgCompetitorNegativeShare = competitorNegativeShares.length > 0
      ? competitorNegativeShares.reduce((a, b) => a + b, 0) / competitorNegativeShares.length
      : 0
  }

  // Calculate review count percentile
  const allReviewCounts = competitorCount > 0
    ? [yourTotalReviews, ...competitors.map((c: any) => c.reviewsCount || 0)]
    : [yourTotalReviews]
  const sortedCounts = [...allReviewCounts].sort((a, b) => a - b)
  const yourIndex = sortedCounts.indexOf(yourTotalReviews)
  const reviewCountPercentile = sortedCounts.length > 1 ? yourIndex / (sortedCounts.length - 1) : 0.5

  // Build review samples (truncate to reasonable length)
  const truncateText = (text: string | null, maxLength: number = 200): string => {
    if (!text) return ''
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text
  }

  const yourReviewSamples = (yourReviews || [])
    .filter(r => r.review_text && r.review_text.trim().length > 0)
    .slice(0, 20)
    .map(r => truncateText(r.review_text || '', 200))

  const competitorReviewSamples = (competitorReviews || [])
    .filter(r => r.review_text && r.review_text.trim().length > 0)
    .slice(0, 50)
    .map(r => truncateText(r.review_text || '', 200))

  console.log('[GBP AI Analysis] Review samples prepared:', {
    yourReviews: yourReviewSamples.length,
    competitorReviews: competitorReviewSamples.length,
    competitorReviewSample: competitorReviewSamples.slice(0, 2), // Log first 2 for debugging
  })

  return {
    business: {
      name: location.name,
      category: primaryCategory,
      locationLabel,
      avgRating: yourAvgRating,
      totalReviews: yourTotalReviews,
      positiveReviews: yourPositiveCount,
      negativeReviews: yourNegativeCount,
    },
    localStats: {
      competitorCount,
      avgCompetitorRating,
      bestCompetitorRating,
      avgCompetitorReviews,
      reviewCountPercentile,
      negativeShare: yourNegativeShare,
      avgCompetitorNegativeShare,
    },
    samples: {
      yourReviews: yourReviewSamples,
      competitorReviews: competitorReviewSamples,
    },
  }
}

