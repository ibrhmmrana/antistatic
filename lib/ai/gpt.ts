/**
 * GPT AI Helpers
 * 
 * Functions for generating AI analysis using OpenAI Chat Completions API
 */

import { openai } from '@/lib/openai'
import { GBPAnalysisInput, GBPWeaknessAnalysisResult } from './types'
import { AntistaticModuleId } from '@/lib/modules/catalog'

/**
 * Generate GBP weakness-focused analysis comparing business to competitors
 */
export async function generateGBPWeaknessAnalysis(
  input: GBPAnalysisInput
): Promise<GBPWeaknessAnalysisResult> {
  console.log('[GBP AI] Generating weakness analysis with gpt-5-mini...')

  const systemPrompt = `You are an AI reputation analyst for local businesses. You receive structured review metrics for one business and its nearby competitors. Your job is to focus on the business's **weaknesses** compared to named competitors.

You must:
- Write 1–2 short sentences summarising **what positive reviews praise** and **what negative reviews complain about**.
- Identify 3–5 clear themes (like staff friendliness, cleanliness, service quality, pricing, waiting time). For each theme, describe what the business does badly or less well, then name a competitor that reviews say is doing better on that same theme. Use the competitor's name explicitly.
- For each theme, recommend at most one or two product modules that would help address the weakness.

Available modules and when to use them:
- "reputationHub": Problems with reviews, sentiment, unhappy customers, needing more or better reviews, reply quality, or review volume.
- "profileManager": Issues with Google Business Profile accuracy, categories, address, hours, confusing or missing info, or overall listing completeness.
- "socialStudio": Issues related to social presence, engagement, content cadence, or needing better social posting and content creation.
- "insightsLab": When the business needs deeper ongoing insight into patterns, trends, anomalies, or wants regular analysis, dashboards, or reports.
- "competitorTracker": When specific competitors are clearly doing better and the business should track their reviews, activity or moves over time.
- "influencerHub": When the business needs more social proof, UGC, or fresh positive reviews and could benefit from local advocates and creators.

For each theme, return 0–2 of these module IDs in a "prescribedModules" array. Only recommend a module when it clearly fits the described problem. Do NOT recommend every module.

Be very concise, concrete, and based only on the input data. Never invent numbers. Focus on "here's where you're losing to X".

Return ONLY valid JSON with this exact structure:
{
  "headerSummary": {
    "line1": "Business name, Location",
    "line2": "X reviews • Y positive • Z negative"
  },
  "positiveSummary": "short sentence about what positive reviews say",
  "negativeSummary": "short sentence about what negative reviews complain about (focus on weaknesses)",
  "themes": [
    {
      "theme": "Theme name",
      "you": "what you're doing badly/weakly",
      "competitorName": "Competitor name",
      "competitor": "what competitor is doing better",
      "prescribedModules": ["reputationHub"] // Optional: 0-2 module IDs from the list above
    }
  ]
}`

  const userPrompt = `Analyze this business data and produce the weakness-focused analysis:

${JSON.stringify(input, null, 2)}

Return JSON with the structure specified above.`

  try {
    console.log('[GBP AI] Calling OpenAI with model: gpt-5-mini')
    console.log('[GBP AI] Input data summary:', {
      businessName: input.business.name,
      totalReviews: input.business.totalReviews,
      competitorCount: input.competitors.length,
      yourReviewSamples: input.yourReviews.length,
      competitorReviewSamples: input.competitorReviews.length,
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
      max_completion_tokens: 4000, // Increased to prevent truncation
    })

    console.log('[GBP AI] OpenAI response received:', {
      id: completion.id,
      model: completion.model,
      choicesCount: completion.choices?.length,
      finishReason: completion.choices?.[0]?.finish_reason,
      hasContent: !!completion.choices?.[0]?.message?.content,
    })

    // Check for API errors in the response
    if (!completion.choices || completion.choices.length === 0) {
      console.error('[GBP AI] No choices in response:', completion)
      throw new Error('OpenAI API returned no choices in response')
    }

    const firstChoice = completion.choices[0]
    if (!firstChoice.message) {
      console.error('[GBP AI] No message in first choice:', firstChoice)
      throw new Error('OpenAI API returned no message in response')
    }

    const content = firstChoice.message.content
    if (!content) {
      console.error('[GBP AI] Response structure details:', {
        choicesLength: completion.choices?.length,
        firstChoice: firstChoice,
        message: firstChoice.message,
        finishReason: firstChoice.finish_reason,
        fullResponse: JSON.stringify(completion, null, 2),
      })
      
      // Provide more helpful error message for length issues
      if (firstChoice.finish_reason === 'length') {
        throw new Error('OpenAI response was truncated due to token limit. The analysis may be incomplete. Please try again or reduce the amount of review data.')
      }
      
      throw new Error(`OpenAI response did not contain content. Finish reason: ${firstChoice.finish_reason || 'unknown'}`)
    }

    const parsed = JSON.parse(content) as Partial<GBPWeaknessAnalysisResult>

    // Validate and ensure required fields
    if (!parsed.headerSummary || !parsed.positiveSummary || !parsed.negativeSummary || !Array.isArray(parsed.themes)) {
      throw new Error('OpenAI response missing required fields')
    }

    // Validate and map themes with prescribedModules
    const validModuleIds: AntistaticModuleId[] = [
      'reputationHub',
      'profileManager',
      'socialStudio',
      'insightsLab',
      'competitorTracker',
      'influencerHub',
    ]

    const themes = parsed.themes.slice(0, 5).map((theme: any) => ({
      theme: theme.theme || '',
      you: theme.you || '',
      competitorName: theme.competitorName || '',
      competitor: theme.competitor || '',
      prescribedModules: Array.isArray(theme.prescribedModules)
        ? theme.prescribedModules.filter((id: string) => validModuleIds.includes(id as AntistaticModuleId)).slice(0, 2) // Max 2 modules per theme
        : [],
    }))

    const result: GBPWeaknessAnalysisResult = {
      headerSummary: {
        line1: parsed.headerSummary.line1 || '',
        line2: parsed.headerSummary.line2 || '',
      },
      positiveSummary: parsed.positiveSummary,
      negativeSummary: parsed.negativeSummary,
      themes,
    }

    console.log('[GBP AI] Weakness analysis generated successfully')
    return result
  } catch (error: any) {
    console.error('[GBP AI Prescription] Error generating weakness analysis:', error)
    throw new Error(`Failed to generate analysis: ${error.message}`)
  }
}

