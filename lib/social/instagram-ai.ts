/**
 * Instagram AI Analysis
 * 
 * Generates AI analysis for Instagram accounts using OpenAI GPT-5-mini
 */

import { openai } from '@/lib/openai'
import type { InstagramMetrics, InstagramAiAnalysis } from './instagram-types'

/**
 * Generate Instagram AI analysis
 */
export async function generateInstagramAnalysis(
  metrics: InstagramMetrics
): Promise<InstagramAiAnalysis> {
  console.log('[Instagram AI] Generating analysis with gpt-5-mini...')

  const systemPrompt = `You are analyzing a single Instagram account for a local business.

You receive a METRICS JSON object and, if available, a list of real comments.

STYLE RULES (very important):
- Write at about a grade 7 reading level.
- Use short, clear sentences. Avoid marketing jargon.
- Do NOT use words like: "cadence", "conversion path", "amplify", "holistic", "resonates", "optimize", "organic reach", "leverage".
- Never use the word "median" or phrases like "avg comments". Instead say things like "very few comments" or "almost no comments".

Return ONLY valid JSON with this exact structure:
{
  "summary": "one or two short sentences",
  "whatWorks": ["bullet sentence 1", "bullet sentence 2"],
  "risksSummary": "one short sentence",
  "mainRisks": [
    {
      "id": "slug-identifier",
      "title": "short title, max 80 chars",
      "detail": "up to 3 short sentences",
      "severity": "low" | "medium" | "high",
      "severityLabel": "Low priority" | "Medium priority" | "High priority",
      "audienceQuotes": [
        {
          "username": "optional username",
          "text": "quote text, max 120 chars"
        }
      ],
      "prescribedModules": ["Reputation Hub", "Social Studio", "Creator Hub"]
    }
  ]
}`

  const userPrompt = `You are analyzing a single Instagram account for a local business.

You receive a METRICS JSON object and, if available, a list of real comments.

METRICS JSON:
${JSON.stringify(metrics, null, 2)}

COMMENTS:
- If metrics.hasAnyComments is true:
  - You MAY use highSignalComments in your analysis.
  - Pick short quotes that sound natural.
- If metrics.hasAnyComments is false:
  - Do NOT pretend there are comments.
  - Do NOT invent quotes.
  - Focus on posting frequency, type of posts, and likes.
  - Point out that people are liking posts but not really talking in the comments.

TASKS:

1. "summary" (string)
   - One or two short sentences.
   - Mention how often they post (e.g. "You posted 15 times in the last 30 days, about 3–4 times a week.")
   - Mention likes in simple terms (e.g. "Your best post got 6,600 likes. Most posts are around 1,200 likes.")

2. "whatWorks" (string[])
   - 2 or 3 bullets.
   - Each bullet: 1 sentence, very clear.
   - Focus on simple ideas people understand: 
     examples: "Posts about your new store and behind-the-scenes photos get the most likes."

3. "risksSummary" (string)
   - One short sentence that explains the main problems or blind spots.
   - Use simple language like:
     - "Some public complaints are not answered."
     - "Many people ask questions about your branches and do not get clear answers."
     - "You get likes but almost no comments, so it is hard to build a community."

4. "mainRisks" (InstagramRiskInsight[])
   - Provide 2 to 4 risks.
   - For each risk:
     - "id": short slug, e.g. "unanswered-questions" or "viral-complaint-fries".
     - "title": max 80 characters, clear and simple, e.g. "Unanswered customer questions in comments".
     - "detail": up to 3 short sentences. Explain the problem like you would to a friend.
     - "severity": "low" | "medium" | "high".
     - "severityLabel": friendly label, e.g. "Low priority", "Medium priority", "High priority".
     - "audienceQuotes": 
         * If metrics.hasAnyComments is true:
             - Use 0–2 quotes based on real comments.
             - Each quote text must be <= 120 characters.
             - You may lightly shorten a comment but keep the meaning.
         * If metrics.hasAnyComments is false:
             - Return an empty array [].
     - "prescribedModules":
         * Choose one or more from:
           - "Reputation Hub" (reply to comments, handle complaints, fix public issues fast)
           - "Social Studio" (improve what you post, how often you post, and your captions/CTAs)
           - "Creator Hub" (use creators and UGC to grow reach and trust)
         * Only include modules that clearly fit the problem.

EXTRA RULES:
- Talk directly to the business owner as "you".
- Prefer numbers written like "15 posts" or "about 3 posts a week", not ratios or complex stats.
- If there are no comments, at least one risk should clearly say that:
  "You get likes but almost no comments, so people are not really talking to you yet."

Return ONLY valid JSON with this exact TypeScript shape:

type InstagramAiAnalysis = {
  summary: string;
  whatWorks: string[];
  risksSummary: string;
  mainRisks: {
    id: string;
    title: string;
    detail: string;
    severity: 'low' | 'medium' | 'high';
    severityLabel: string;
    audienceQuotes: { username?: string; text: string; }[];
    prescribedModules: ('Reputation Hub' | 'Social Studio' | 'Creator Hub')[];
  }[];
};`

  try {
    console.log('[Instagram AI] Calling OpenAI with model: gpt-5-mini')
    console.log('[Instagram AI] Input data summary:', {
      username: metrics.username,
      totalPosts: metrics.totalPostsAnalyzed,
      totalComments: metrics.totalCommentsAnalyzed,
      avgLikes: metrics.avgLikesPerPost,
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

    console.log('[Instagram AI] OpenAI response received:', {
      id: completion.id,
      model: completion.model,
      choicesCount: completion.choices?.length,
      finishReason: completion.choices?.[0]?.finish_reason,
      hasContent: !!completion.choices?.[0]?.message?.content,
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
        throw new Error('OpenAI response was truncated due to token limit. The analysis may be incomplete.')
      }
      throw new Error(`OpenAI response did not contain content. Finish reason: ${firstChoice.finish_reason || 'unknown'}`)
    }

    const parsed = JSON.parse(content) as Partial<InstagramAiAnalysis>

    // Validate and ensure required fields
    if (!parsed.summary || !Array.isArray(parsed.whatWorks) || !parsed.risksSummary || !Array.isArray(parsed.mainRisks)) {
      throw new Error('OpenAI response missing required fields')
    }

    // Validate and filter prescribedModules
    const validModules: Array<'Reputation Hub' | 'Social Studio' | 'Creator Hub'> = [
      'Reputation Hub',
      'Social Studio',
      'Creator Hub',
    ]

    const mainRisks = parsed.mainRisks.slice(0, 4).map((risk: any) => ({
      id: risk.id || `risk-${Date.now()}`,
      title: risk.title || '',
      detail: risk.detail || '',
      severity: (risk.severity === 'low' || risk.severity === 'medium' || risk.severity === 'high'
        ? risk.severity
        : 'medium') as 'low' | 'medium' | 'high',
      severityLabel: risk.severityLabel || (risk.severity === 'high' ? 'High priority' : risk.severity === 'medium' ? 'Medium priority' : 'Low priority'),
      audienceQuotes: Array.isArray(risk.audienceQuotes)
        ? risk.audienceQuotes
            .slice(0, 2)
            .map((q: any) => ({
              username: q.username,
              text: (q.text || '').substring(0, 120), // Ensure max 120 chars
            }))
            .filter((q: any) => q.text.length > 0)
        : [],
      prescribedModules: Array.isArray(risk.prescribedModules)
        ? risk.prescribedModules
            .filter((m: string) => validModules.includes(m as any))
            .slice(0, 2)
        : [],
    }))

    const result: InstagramAiAnalysis = {
      summary: parsed.summary,
      whatWorks: parsed.whatWorks.slice(0, 3),
      risksSummary: parsed.risksSummary,
      mainRisks,
    }

    console.log('[Instagram AI] Analysis generated successfully')
    return result
  } catch (error: any) {
    console.error('[Instagram AI] Error generating analysis:', error)
    throw new Error(`Failed to generate Instagram analysis: ${error.message}`)
  }
}

