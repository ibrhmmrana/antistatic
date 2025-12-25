import { NextRequest, NextResponse } from 'next/server'
import { openai } from '@/lib/openai'
import { getBusinessContext } from '@/lib/reputation/business-context'
import { z } from 'zod'

const requestSchema = z.object({
  locationId: z.string().uuid(),
  review: z.object({
    reviewId: z.string().optional(),
    authorName: z.string().optional(),
    rating: z.number().int().min(1).max(5).optional(),
    text: z.string().min(1),
    createdAt: z.string().optional(),
    platform: z.enum(['google']).optional(),
  }),
  tone: z.enum(['Warm', 'Professional', 'Apologetic', 'Friendly', 'Short & direct']),
  length: z.enum(['Short', 'Medium', 'Long']),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validationResult = requestSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request payload', details: validationResult.error.errors },
        { status: 400 }
      )
    }

    const { locationId, review, tone, length } = validationResult.data

    // Get business context
    const businessContext = await getBusinessContext(locationId)

    // Build context string for prompt
    const contextParts: string[] = []
    contextParts.push(`Business name: ${businessContext.businessName}`)
    if (businessContext.primaryCategory) {
      contextParts.push(`Primary category: ${businessContext.primaryCategory}`)
    }
    if (businessContext.city) {
      contextParts.push(`Location/city: ${businessContext.city}`)
    }
    if (businessContext.address) {
      contextParts.push(`Address: ${businessContext.address}`)
    }
    if (businessContext.phone) {
      contextParts.push(`Phone: ${businessContext.phone}`)
    }
    if (businessContext.website) {
      contextParts.push(`Website: ${businessContext.website}`)
    }
    if (businessContext.hoursSummary) {
      contextParts.push(`Hours summary: ${businessContext.hoursSummary}`)
    }
    if (businessContext.serviceHighlights && businessContext.serviceHighlights.length > 0) {
      contextParts.push(`Service highlights: ${businessContext.serviceHighlights.join(', ')}`)
    }

    const businessContextStr = contextParts.join('\n')

    // Build system prompt
    const systemPrompt = `You are writing a public reply to a Google review on behalf of a business.
Rules:

* Output **ONLY** the final reply text. No headings, no quotes, no bullet points, no "AI suggestions".
* Never use placeholders like \`{businessName}\` or \`{name}\`. If a field is missing, write naturally without it.
* Never mention Antistatic or any software/tool.
* Keep it human, specific, and not repetitive.
* Do not claim actions you can't verify (refund issued, manager called, etc).
* Don't ask for personal info publicly.
* If negative: apologize, acknowledge the issue, briefly state intent to fix, invite them to contact the business offline (use phone/website if available), and keep it calm.
* If positive: thank them, mirror a specific detail from the review, reinforce trust, invite them back.
* If review is short/vague: keep reply short and warm.

Tone handling:

* Warm = friendly, appreciative, conversational, not too formal.
* Professional = polite, concise, businesslike.
* Apologetic = empathetic, calm, resolution-focused.
* Friendly = upbeat, casual but still respectful.
* Short & direct = minimal words, no fluff.

Length handling:

* Short = 1–2 sentences
* Medium = 3–5 sentences
* Long = 6–9 sentences (only if it stays natural)

Business context (use when relevant):
${businessContextStr}`

    // Build user message
    const userMessage = `Review details:
Rating: ${review.rating || 'Not specified'}/5
Reviewer: ${review.authorName || 'Anonymous'}
Review text: ${review.text}
${review.createdAt ? `Posted: ${review.createdAt}` : ''}

Selected tone: ${tone}
Selected length: ${length}

Write a reply that matches the tone and length. Use the business context above. If the review is negative (rating <= 3), include contact information (phone/website) ONLY if available in the business context.`

    console.log('[Generate Reply] Calling OpenAI', {
      locationId,
      reviewId: review.reviewId,
      rating: review.rating,
      tone,
      length,
      hasBusinessName: !!businessContext.businessName,
      hasPhone: !!businessContext.phone,
      hasWebsite: !!businessContext.website,
    })

    // Generate 3 distinctly different variations
    // Each variation has a different approach/style
    const variationInstructions = [
      {
        approach: 'Focus on empathy and personal connection. Use "I" statements and be warm and understanding.',
        temperature: 0.8,
      },
      {
        approach: 'Focus on professionalism and action. Be direct about what you\'ll do to resolve the issue. Use "we" statements.',
        temperature: 0.7,
      },
      {
        approach: 'Focus on appreciation and future improvement. Emphasize learning from feedback and commitment to better service.',
        temperature: 0.9,
      },
    ]

    const generateVariation = async (variationIndex: number, instruction: typeof variationInstructions[0]): Promise<string> => {
      const variationUserMessage = `${userMessage}

IMPORTANT: Generate a reply with this specific approach:
${instruction.approach}

Make this variation distinctly different from the others. Use different phrasing, structure, and emphasis.`

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: variationUserMessage,
          },
        ],
        temperature: instruction.temperature,
        max_tokens: 500,
      })

      if (!completion.choices || completion.choices.length === 0) {
        throw new Error('OpenAI API returned no choices')
      }

      const reply = completion.choices[0]?.message?.content?.trim()
      if (!reply) {
        throw new Error('OpenAI response did not contain reply text')
      }

      // Validate reply doesn't contain placeholders
      if (reply.includes('{') || reply.includes('}')) {
        console.warn(`[Generate Reply] Variation ${variationIndex + 1} contains placeholder-like text`)
      }

      return reply
    }

    // Generate 3 variations in parallel with different approaches
    const variations = await Promise.all(
      variationInstructions.map((instruction, index) => generateVariation(index, instruction))
    )

    // Remove near-duplicates (keep first occurrence)
    const uniqueVariations: string[] = []
    for (const variation of variations) {
      const normalized = variation.trim().toLowerCase().replace(/\s+/g, ' ')
      const isDuplicate = uniqueVariations.some((existing) => {
        const existingNormalized = existing.trim().toLowerCase().replace(/\s+/g, ' ')
        // Check if they're too similar (more than 80% word overlap)
        const words1 = normalized.split(' ')
        const words2 = existingNormalized.split(' ')
        const commonWords = words1.filter((w) => words2.includes(w)).length
        const similarity = commonWords / Math.max(words1.length, words2.length)
        return similarity > 0.8
      })

      if (!isDuplicate) {
        uniqueVariations.push(variation)
      }
    }

    // If we have fewer than 3 unique variations, generate more with different approaches
    let retryCount = 0
    while (uniqueVariations.length < 3 && retryCount < 3) {
      try {
        const retryIndex = uniqueVariations.length
        const retryInstruction = {
          approach: `Use a completely different style. ${retryIndex === 1 ? 'Be more concise and solution-focused.' : 'Be more detailed and explanatory.'}`,
          temperature: 0.85,
        }
        const additionalVariation = await generateVariation(retryIndex, retryInstruction)
        const normalized = additionalVariation.trim().toLowerCase().replace(/\s+/g, ' ')
        const isDuplicate = uniqueVariations.some((existing) => {
          const existingNormalized = existing.trim().toLowerCase().replace(/\s+/g, ' ')
          const words1 = normalized.split(' ')
          const words2 = existingNormalized.split(' ')
          const commonWords = words1.filter((w) => words2.includes(w)).length
          const similarity = commonWords / Math.max(words1.length, words2.length)
          return similarity > 0.8
        })

        if (!isDuplicate) {
          uniqueVariations.push(additionalVariation)
        }
        retryCount++
      } catch (error) {
        console.warn('[Generate Reply] Failed to generate additional variation:', error)
        break
      }
    }

    console.log('[Generate Reply] Successfully generated reply variations', {
      locationId,
      reviewId: review.reviewId,
      variationCount: uniqueVariations.length,
      success: true,
    })

    return NextResponse.json({ success: true, replies: uniqueVariations })
  } catch (error: any) {
    console.error('[Generate Reply API] Error:', {
      error: error.message,
      stack: error.stack,
    })
    return NextResponse.json(
      { error: error.message || 'Internal server error', success: false },
      { status: 500 }
    )
  }
}
