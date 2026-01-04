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
  topic: z.string().min(1),
  includeEmojis: z.boolean().default(true),
  includeHashtags: z.boolean().default(true),
  includeImageSuggestions: z.boolean().default(false),
})

export async function POST(request: NextRequest) {
  let topic = '' // Declare in outer scope for error handler
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

    const { businessLocationId, platform, topic: validatedTopic, includeEmojis, includeHashtags, includeImageSuggestions } =
      validationResult.data
    topic = validatedTopic // Assign to outer scope variable

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

    // Build platform-specific guidance
    const platformGuidance: Record<string, string> = {
      instagram: 'Write for Instagram: use line breaks, emojis are common, hashtags are important, keep it engaging and visual. Max ~2200 characters.',
      facebook: 'Write for Facebook: conversational, can be longer, emojis optional, hashtags less common. Max ~5000 characters.',
      google_business: 'Write for Google Business Profile: professional, concise, focus on local relevance. Max ~1500 characters.',
      linkedin: 'Write for LinkedIn: professional tone, industry-focused, no emojis unless very sparing. Max ~3000 characters.',
      tiktok: 'Write for TikTok: short, punchy, trending language, emojis encouraged. Max ~300 characters.',
    }

    const platformNote = platform ? platformGuidance[platform] || '' : 'Write for social media (adaptable to multiple platforms).'

    // Build system prompt
    const systemPrompt = `You are a social media copywriter for local businesses. Write engaging, authentic captions that drive real business outcomes (calls, visits, website clicks).

Business context:
- Name: ${context.business.name}
- Category: ${context.business.primaryCategory || 'Local business'}
- Location: ${context.business.city || context.business.address || 'Local area'}
${context.business.phone ? `- Phone: ${context.business.phone}` : ''}
${context.business.website ? `- Website: ${context.business.website}` : ''}
${context.business.hours ? `- Hours: ${context.business.hours}` : ''}

${context.reviews.recentHighlights.length > 0
  ? `What customers say (use as proof points):
${context.reviews.recentHighlights.slice(0, 3).map((r: any) => `- "${r.text.substring(0, 150)}" (${r.rating}/5)`).join('\n')}`
  : ''}

${context.localSEO.topSearchTerms.length > 0
  ? `What customers search for (naturally incorporate): ${context.localSEO.topSearchTerms.slice(0, 10).join(', ')}`
  : ''}

${context.aiAnalysis.gbp?.positiveSummary
  ? `What customers love: ${context.aiAnalysis.gbp.positiveSummary}`
  : ''}

${context.aiAnalysis.instagram?.whatWorks && context.aiAnalysis.instagram.whatWorks.length > 0
  ? `What works on Instagram: ${context.aiAnalysis.instagram.whatWorks.join('; ')}`
  : ''}

CRITICAL RULES:
- Write in the business owner's voice (first person "we" or "I" is fine)
- Be specific to THIS business (use real details from context)
- No unverifiable claims (don't say "best in town" unless reviews say it)
- No medical/legal promises
- No pricing unless explicitly provided in context
- Keep it authentic and human (not corporate jargon)
- ${includeEmojis ? 'Use 2-4 relevant emojis naturally throughout' : 'No emojis'}
- ${includeHashtags ? 'Include 5-10 relevant hashtags at the end' : 'No hashtags'}
- ${platformNote}

Topic to write about: "${topic}"

Return ONLY valid JSON with this structure:
{
  "topic": "the topic title",
  "caption": "the full caption text (with line breaks as \\n)",
  "hashtags": ["hashtag1", "hashtag2"],
  "imageSuggestions": ["suggestion 1", "suggestion 2"],
  "cta": {
    "type": "call|whatsapp|book|visit|directions|website|none",
    "text": "CTA text (e.g., 'Call us today!' or 'Visit our website')"
  }
}`

    const userPrompt = `Write a ${platform || 'social media'} caption about: "${topic}"

${includeImageSuggestions ? 'Also suggest 2-3 image ideas that would work well with this caption.' : ''}`

    console.log('[Generate Caption AI] Calling OpenAI', {
      businessLocationId,
      platform,
      topic,
      includeEmojis,
      includeHashtags,
      includeImageSuggestions,
    })

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
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
      console.error('[Generate Caption AI] No choices in response:', completion)
      throw new Error('OpenAI API returned no choices')
    }

    const choice = completion.choices[0]
    const finishReason = choice.finish_reason
    
    // Log finish reason for debugging
    if (finishReason !== 'stop') {
      console.warn('[Generate Caption AI] Unusual finish_reason:', finishReason, {
        model: completion.model,
        usage: completion.usage,
      })
    }

    // Handle different finish reasons
    if (finishReason === 'length') {
      console.warn('[Generate Caption AI] Response was truncated due to token limit')
      // Continue processing - partial response is better than nothing
    } else if (finishReason === 'content_filter') {
      throw new Error('OpenAI content filter blocked the response. Please try a different topic.')
    } else if (finishReason !== 'stop') {
      console.warn('[Generate Caption AI] Unexpected finish_reason:', finishReason)
    }

    const content = choice.message?.content
    if (!content || content.trim().length === 0) {
      console.error('[Generate Caption AI] Empty content in response:', {
        finish_reason: finishReason,
        message: choice.message,
        fullResponse: JSON.stringify(completion, null, 2),
      })
      throw new Error('OpenAI response did not contain content')
    }

    const parsed = JSON.parse(content) as {
      topic?: string
      caption?: string
      hashtags?: string[]
      imageSuggestions?: string[]
      cta?: { type: string; text: string }
    }

    // Validate and clean response
    const validCtaTypes = ['call', 'whatsapp', 'book', 'visit', 'directions', 'website', 'none']
    const ctaType = parsed.cta?.type && validCtaTypes.includes(parsed.cta.type.toLowerCase())
      ? parsed.cta.type.toLowerCase()
      : 'none'

    const result = {
      topic: parsed.topic || topic,
      caption: (parsed.caption || '').replace(/\\n/g, '\n'),
      hashtags: includeHashtags && Array.isArray(parsed.hashtags) ? parsed.hashtags.slice(0, 10) : [],
      imageSuggestions: includeImageSuggestions && Array.isArray(parsed.imageSuggestions)
        ? parsed.imageSuggestions.slice(0, 3)
        : [],
      cta: {
        type: ctaType,
        text: parsed.cta?.text || (ctaType !== 'none' ? 'Learn more' : ''),
      },
    }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[Generate Caption AI] Error:', error)
    
    return NextResponse.json(
      {
        error: error.message || 'Failed to generate caption',
        topic: topic || 'this topic',
        caption: `We're excited to share ${topic ? topic.toLowerCase() : 'this topic'} with you! Stay tuned for more updates.`,
        hashtags: [],
        imageSuggestions: [],
        cta: { type: 'none', text: '' },
      },
      { status: 500 }
    )
  }
}

