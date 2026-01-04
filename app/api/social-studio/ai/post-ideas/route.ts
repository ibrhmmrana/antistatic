import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAiContext } from '@/lib/social-studio/ai/context'
import { openai } from '@/lib/openai'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const requestSchema = z.object({
  businessLocationId: z.string().uuid(),
  platform: z.enum(['instagram', 'facebook', 'google_business', 'linkedin', 'tiktok']).nullable().optional(),
})

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
    const validationResult = requestSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request payload', details: validationResult.error.errors },
        { status: 400 }
      )
    }

    const { businessLocationId, platform } = validationResult.data

    // Verify user owns the business location
    const { data: location } = await supabase
      .from('business_locations')
      .select('id')
      .eq('id', businessLocationId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!location) {
      return NextResponse.json({ error: 'Business location not found' }, { status: 404 })
    }

    // Get AI context
    const context = await getAiContext(businessLocationId)

    // Build system prompt for topic suggestions
    const platformContext = platform
      ? `Generate topics specifically for ${platform}. `
      : 'Generate topics that work across multiple social platforms. '

    const systemPrompt = `You are a social media content strategist for local businesses. Your job is to suggest specific, actionable post topics that will drive engagement and business outcomes.

Business context:
- Name: ${context.business.name}
- Category: ${context.business.primaryCategory || 'Local business'}
- Location: ${context.business.city || context.business.address || 'Local area'}
${context.business.hours ? `- Hours: ${context.business.hours}` : ''}

${context.reviews.recentHighlights.length > 0 ? `Recent customer feedback highlights:
${context.reviews.recentHighlights.slice(0, 3).map((r: any) => `- ${r.rating}/5: "${r.text.substring(0, 100)}"`).join('\n')}` : ''}

${context.localSEO.topSearchTerms.length > 0 ? `What customers search for: ${context.localSEO.topSearchTerms.slice(0, 10).join(', ')}` : ''}

${context.aiAnalysis.gbp?.positiveSummary ? `What customers love: ${context.aiAnalysis.gbp.positiveSummary}` : ''}

${context.aiAnalysis.instagram?.whatWorks && context.aiAnalysis.instagram.whatWorks.length > 0
  ? `What works on Instagram: ${context.aiAnalysis.instagram.whatWorks.join('; ')}`
  : ''}

${context.competitors.length > 0
  ? `Nearby competitors: ${context.competitors.slice(0, 3).map((c: any) => c.name).join(', ')}`
  : ''}

${platformContext}

Generate 5-8 specific, actionable post topic ideas. Each topic should:
- Be specific to this business (not generic)
- Reference real customer feedback, search terms, or local context when possible
- Be actionable (something they can post about today)
- Match one of these content pillars: "proof" (customer success, reviews), "offer" (promotions, deals), "education" (tips, how-tos), "culture" (behind-the-scenes, team), or "local" (community, events, location-specific)

Return ONLY valid JSON with this structure:
{
  "topics": [
    {
      "title": "Short topic title (max 60 chars)",
      "reason": "Why this topic is relevant (1 sentence, references specific context)",
      "pillar": "proof|offer|education|culture|local"
    }
  ]
}`

    const userPrompt = `Generate ${platform ? platform : 'social media'} post topic ideas for this business.`

    console.log('[Post Ideas AI] Calling OpenAI', {
      businessLocationId,
      platform,
      hasReviews: context.reviews.recentHighlights.length > 0,
      hasSearchTerms: context.localSEO.topSearchTerms.length > 0,
      hasCompetitors: context.competitors.length > 0,
    })

    const completion = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      messages: [
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
      max_completion_tokens: 2000,
    })

    if (!completion.choices || completion.choices.length === 0) {
      throw new Error('OpenAI API returned no choices')
    }

    const content = completion.choices[0].message?.content
    if (!content) {
      throw new Error('OpenAI response did not contain content')
    }

    const parsed = JSON.parse(content) as { topics?: Array<{ title: string; reason: string; pillar: string }> }

    if (!parsed.topics || !Array.isArray(parsed.topics)) {
      throw new Error('Invalid response format: missing topics array')
    }

    // Validate and clean topics
    const validPillars = ['proof', 'offer', 'education', 'culture', 'local']
    const topics = parsed.topics
      .slice(0, 8)
      .map((t) => ({
        title: (t.title || '').substring(0, 60),
        reason: (t.reason || '').substring(0, 200),
        pillar: validPillars.includes(t.pillar?.toLowerCase()) ? t.pillar.toLowerCase() : 'local',
      }))
      .filter((t) => t.title.length > 0)

    if (topics.length === 0) {
      // Fallback topics if AI fails
      topics.push(
        {
          title: 'Share a customer success story',
          reason: 'Highlight positive customer experiences to build trust',
          pillar: 'proof',
        },
        {
          title: 'Behind the scenes at your business',
          reason: 'Show the human side of your business',
          pillar: 'culture',
        },
        {
          title: 'Tips for your customers',
          reason: 'Share helpful information related to your services',
          pillar: 'education',
        }
      )
    }

    return NextResponse.json({ topics })
  } catch (error: any) {
    console.error('[Post Ideas AI] Error:', error)
    return NextResponse.json(
      {
        error: error.message || 'Failed to generate post ideas',
        topics: [
          {
            title: 'Share a customer success story',
            reason: 'Highlight positive customer experiences',
            pillar: 'proof',
          },
          {
            title: 'Behind the scenes content',
            reason: 'Show the human side of your business',
            pillar: 'culture',
          },
        ],
      },
      { status: 500 }
    )
  }
}

