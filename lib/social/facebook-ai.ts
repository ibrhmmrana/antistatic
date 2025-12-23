/**
 * Facebook AI Analysis
 * 
 * Generates AI analysis for Facebook Pages using OpenAI GPT-5-mini
 */

import { openai } from '@/lib/openai'
import { z } from 'zod'
import type { FacebookMetrics, FacebookAiAnalysis } from './facebook-types'

// Zod schema for AI response validation
const FacebookPrescriptionSchema = z.object({
  moduleId: z.enum(['SOCIAL_STUDIO', 'INSIGHTS_LAB', 'PROFILE_MANAGER', 'REPUTATION_HUB']),
  moduleName: z.string(),
  tooltipBullets: z.array(z.string()).min(3).max(6),
})

const FacebookDiagnosticCardSchema = z.object({
  id: z.enum(['cadence', 'engagement', 'formats', 'captions', 'next_steps']),
  title: z.string(),
  status: z.enum(['good', 'needs_attention', 'no_data']),
  diagnosis: z.string(),
  whyItMatters: z.string(),
  recommendedActions: z.array(z.string()).min(2).max(5),
  prescription: FacebookPrescriptionSchema.optional(),
})

const FacebookAiAnalysisSchema = z.object({
  overallScore: z.number().min(0).max(100),
  summary: z.string(),
  keyFindings: z.array(z.string()).min(3).max(6),
  cards: z.array(FacebookDiagnosticCardSchema),
  contentPillars: z.array(
    z.object({
      name: z.string(),
      rationale: z.string(),
    })
  ),
  next7DaysPlan: z.array(z.string()),
})

// Module tooltip bullets (from requirements)
const MODULE_TOOLTIPS: Record<string, string[]> = {
  SOCIAL_STUDIO: [
    'Content calendar + posting reminders',
    'AI caption + creative ideas',
    'Reels/photo templates tailored to your niche',
    'Best-time-to-post suggestions',
  ],
  INSIGHTS_LAB: [
    'Track engagement trends weekly',
    'Identify what formats drive results',
    'Test 2 content angles and compare',
    '"Top posts" breakdown and learnings',
  ],
  PROFILE_MANAGER: [
    'Page completeness checklist (cover, about, hours, CTA button)',
    'Consistency across platforms',
    'Trust signals for new visitors',
  ],
  REPUTATION_HUB: [
    'Monitor & respond to reviews quickly',
    'Sentiment + recurring complaint themes',
    'Review request workflows',
  ],
}

/**
 * Generate Facebook AI analysis
 */
export async function generateFacebookAnalysis(
  metrics: FacebookMetrics,
  topPosts: Array<{ url: string; text: string | null; likes: number; comments: number; shares: number }>
): Promise<FacebookAiAnalysis> {
  console.log('[Facebook AI] Generating analysis with gpt-5-mini...')

  const systemPrompt = `You are a social media doctor analyzing a Facebook Page for a local business.

You receive computed metrics and sample posts. Your job is to diagnose issues and prescribe solutions.

STYLE RULES:
- Write at grade 7 reading level
- Use short, clear sentences
- Avoid jargon: "cadence", "amplify", "holistic", "optimize", "leverage"
- Talk directly to the business owner as "you"
- Use plain language numbers: "3 posts a week" not ratios

Return ONLY valid JSON matching the exact schema provided.`

  const userPrompt = `You are analyzing a Facebook Page for a local business.

COMPUTED METRICS:
${JSON.stringify(metrics, null, 2)}

TOP POSTS (for context):
${JSON.stringify(topPosts.slice(0, 3), null, 2)}

SAMPLE CAPTIONS (up to 10 with engagement):
${JSON.stringify(
    topPosts
      .filter((p) => p.text && p.text.trim().length > 0)
      .slice(0, 10)
      .map((p) => ({
        text: p.text?.substring(0, 200),
        engagement: p.likes + p.comments + p.shares,
      })),
    null,
    2
  )}

TASKS:

1. "overallScore" (0-100)
   - Consider posting frequency, engagement, format mix, caption quality
   - 80-100: Strong presence, consistent posting, good engagement
   - 60-79: Good but has room for improvement
   - 40-59: Needs attention in multiple areas
   - 0-39: Significant gaps

2. "summary" (1-2 sentences)
   - Overall assessment in plain language
   - Example: "You post about 2 times a week. Your best posts get 50+ likes and comments. Videos tend to get more engagement than photos."

3. "keyFindings" (3-6 bullets)
   - Most important insights
   - Each bullet: 1 sentence, clear and actionable

4. "cards" (array of diagnostic cards)
   - Must include cards for: cadence, engagement, formats, captions, next_steps
   - Each card:
     - "id": one of "cadence", "engagement", "formats", "captions", "next_steps"
     - "title": short title (e.g., "Posting Frequency", "Engagement Rate")
     - "status": "good" | "needs_attention" | "no_data" (match metrics.consistencyFlags where applicable)
     - "diagnosis": plain language explanation (doctor tone, 2-3 sentences)
     - "whyItMatters": 1 sentence explaining impact
     - "recommendedActions": 2-5 concrete actions
     - "prescription": ONLY include if status = "needs_attention" AND the problem clearly maps to a module
       - moduleId: "SOCIAL_STUDIO" (content, posting, creative)
       - moduleId: "INSIGHTS_LAB" (measure performance, experiments)
       - moduleId: "PROFILE_MANAGER" (page completeness - only if we can infer missing basics, be conservative)
       - moduleId: "REPUTATION_HUB" (generally NOT from posts alone, only if clear community management gaps)
     - moduleName: friendly name (e.g., "Social Studio")
     - tooltipBullets: 3-6 bullets explaining what the module does

5. "contentPillars" (2-4 pillars)
   - Suggested content themes based on what works
   - Each: { name: string, rationale: string }

6. "next7DaysPlan" (3-7 concrete ideas)
   - Specific posting ideas for the next week
   - Be concrete: "Post a behind-the-scenes photo of your kitchen" not "Post more content"

PRESCRIPTION RULES:
- Only prescribe when status = "needs_attention" AND confidence is decent
- Most Facebook issues map to SOCIAL_STUDIO or INSIGHTS_LAB
- PROFILE_MANAGER: only if we can infer missing page basics (be conservative)
- REPUTATION_HUB: generally NOT from posts alone (default no)

Return ONLY valid JSON with this exact structure:
{
  "overallScore": number,
  "summary": string,
  "keyFindings": string[],
  "cards": [
    {
      "id": "cadence" | "engagement" | "formats" | "captions" | "next_steps",
      "title": string,
      "status": "good" | "needs_attention" | "no_data",
      "diagnosis": string,
      "whyItMatters": string,
      "recommendedActions": string[],
      "prescription": {
        "moduleId": "SOCIAL_STUDIO" | "INSIGHTS_LAB" | "PROFILE_MANAGER" | "REPUTATION_HUB",
        "moduleName": string,
        "tooltipBullets": string[]
      } (optional, only if status = "needs_attention")
    }
  ],
  "contentPillars": [
    {
      "name": string,
      "rationale": string
    }
  ],
  "next7DaysPlan": string[]
}`

  try {
    console.log('[Facebook AI] Calling OpenAI with model: gpt-5-mini')
    console.log('[Facebook AI] Input data summary:', {
      totalPosts: metrics.totalPosts,
      postsPerWeek: metrics.postingCadence.postsPerWeek,
      avgEngagement: metrics.engagement.avgEngagement,
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
      max_completion_tokens: 4000,
    })

    console.log('[Facebook AI] OpenAI response received:', {
      id: completion.id,
      model: completion.model,
      choicesCount: completion.choices?.length,
      finishReason: completion.choices?.[0]?.finish_reason,
    })

    if (!completion.choices || completion.choices.length === 0) {
      throw new Error('OpenAI API returned no choices in response')
    }

    const firstChoice = completion.choices[0]
    if (!firstChoice.message) {
      throw new Error('OpenAI API returned no message in response')
    }

    const content = firstChoice.message.content
    if (!content) {
      if (firstChoice.finish_reason === 'length') {
        throw new Error('OpenAI response was truncated due to token limit.')
      }
      throw new Error(`OpenAI response did not contain content. Finish reason: ${firstChoice.finish_reason || 'unknown'}`)
    }

    const parsed = JSON.parse(content)

    // Validate with Zod
    const validated = FacebookAiAnalysisSchema.parse(parsed)

    // Ensure all required cards are present
    const requiredCardIds: Array<'cadence' | 'engagement' | 'formats' | 'captions' | 'next_steps'> = [
      'cadence',
      'engagement',
      'formats',
      'captions',
      'next_steps',
    ]
    const cardIds = validated.cards.map((c) => c.id)
    const missingCards = requiredCardIds.filter((id) => !cardIds.includes(id))

    if (missingCards.length > 0) {
      console.warn('[Facebook AI] Missing required cards, adding defaults:', missingCards)
      // Add default cards for missing ones
      for (const id of missingCards) {
        validated.cards.push({
          id,
          title: id === 'cadence' ? 'Posting Frequency' : id === 'engagement' ? 'Engagement Rate' : id === 'formats' ? 'Content Format Mix' : id === 'captions' ? 'Caption Quality' : 'Next Steps',
          status: 'no_data',
          diagnosis: 'Not enough data to analyze this area.',
          whyItMatters: 'This metric helps understand your Facebook presence.',
          recommendedActions: ['Gather more data', 'Continue posting consistently'],
        })
      }
    }

    // Enhance prescriptions with tooltip bullets from our catalog
    validated.cards.forEach((card) => {
      if (card.prescription) {
        const moduleTooltips = MODULE_TOOLTIPS[card.prescription.moduleId]
        if (moduleTooltips) {
          card.prescription.tooltipBullets = moduleTooltips
        }
      }
    })

    console.log('[Facebook AI] Analysis generated successfully')
    return validated
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      console.error('[Facebook AI] Zod validation error:', error.errors)
      throw new Error(`AI response validation failed: ${error.errors.map((e) => e.message).join(', ')}`)
    }
    console.error('[Facebook AI] Error generating analysis:', error)
    throw new Error(`Failed to generate Facebook analysis: ${error.message}`)
  }
}

