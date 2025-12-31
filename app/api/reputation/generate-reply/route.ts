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
    text: z.string().optional(), // Made optional to support rating-only reviews
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
* If review is short/vague or rating-only: keep reply appropriate to the rating and acknowledge the rating itself.
* CRITICAL: When generating multiple variations, each must be COMPLETELY DIFFERENT in style, structure, perspective, and wording. Do not reuse similar phrases or structures across variations.

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
    const hasText = review.text && review.text.trim().length > 0
    const reviewTextDisplay = hasText ? review.text : '(No comment provided - rating only)'
    
    const userMessage = `Review details:
Rating: ${review.rating || 'Not specified'}/5
Reviewer: ${review.authorName || 'Anonymous'}
Review text: ${reviewTextDisplay}
${review.createdAt ? `Posted: ${review.createdAt}` : ''}

Selected tone: ${tone}
Selected length: ${length}

Write a reply that matches the tone and length. Use the business context above. If the review is negative (rating <= 3), include contact information (phone/website) ONLY if available in the business context.
${!hasText ? 'Since this is a rating-only review with no written comment, focus on acknowledging their rating and expressing appreciation (if positive) or concern and willingness to help (if negative).' : ''}`

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
    // Each variation has a completely different approach, structure, and style
    const variationInstructions = [
      {
        approach: `VARIATION 1 - PERSONAL & CONVERSATIONAL:
- Write in FIRST PERSON ("I", "my", "me") as if the business owner is personally responding
- Use a warm, friendly, conversational tone - like talking to a friend
- Start with a personal acknowledgment (e.g., "Thank you so much, [Name]!" or "Hi [Name], I really appreciate...")
- Include personal touches and genuine emotion
- Keep it natural and human, avoid corporate language
- End with a personal invitation or connection`,
        temperature: 0.9,
        style: 'personal',
      },
      {
        approach: `VARIATION 2 - PROFESSIONAL & STRUCTURED:
- Write in THIRD PERSON or use "we" representing the business as an entity
- Use formal, professional language with clear structure
- Start with a formal acknowledgment (e.g., "Thank you for your feedback, [Name]." or "We appreciate you taking the time...")
- Include specific business commitments or actions
- Use structured sentences and professional terminology
- End with a professional closing and contact information if negative`,
        temperature: 0.6,
        style: 'professional',
      },
      {
        approach: `VARIATION 3 - BRIEF & DIRECT:
- Write in SECOND PERSON addressing the reviewer directly ("You", "Your")
- Keep it SHORT - maximum 2-3 sentences, be concise and to the point
- Start directly with the main message (e.g., "Thanks, [Name]!" or "[Name], we're sorry to hear...")
- Focus on the essential message only - no extra fluff
- Use simple, direct language
- End quickly with a brief call to action or thank you`,
        temperature: 0.7,
        style: 'brief',
      },
    ]

    const generateVariation = async (variationIndex: number, instruction: typeof variationInstructions[0]): Promise<string> => {
      const variationUserMessage = `${userMessage}

CRITICAL: Generate a reply that follows EXACTLY this style and approach:
${instruction.approach}

This must be COMPLETELY DIFFERENT from the other variations:
- Use different sentence structure and length
- Use different opening phrases
- Use different vocabulary and tone
- Use different perspective (first person vs third person vs second person)
- Use different closing style

Do NOT use similar phrases, words, or structure as the other variations. Be creative and make this unique.`

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
        max_tokens: instruction.style === 'brief' ? 200 : 500, // Shorter for brief variation
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

    // Remove near-duplicates (keep first occurrence) - stricter similarity check
    const uniqueVariations: string[] = []
    for (const variation of variations) {
      const normalized = variation.trim().toLowerCase().replace(/\s+/g, ' ')
      const isDuplicate = uniqueVariations.some((existing) => {
        const existingNormalized = existing.trim().toLowerCase().replace(/\s+/g, ' ')
        // Stricter similarity check - more than 60% word overlap is considered duplicate
        const words1 = normalized.split(' ').filter(w => w.length > 2) // Ignore short words
        const words2 = existingNormalized.split(' ').filter(w => w.length > 2)
        const commonWords = words1.filter((w) => words2.includes(w)).length
        const similarity = commonWords / Math.max(words1.length, words2.length)
        return similarity > 0.6 // Stricter threshold
      })

      if (!isDuplicate) {
        uniqueVariations.push(variation)
      }
    }

    // If we have fewer than 3 unique variations, generate more with completely different approaches
    let retryCount = 0
    while (uniqueVariations.length < 3 && retryCount < 5) {
      try {
        const retryIndex = uniqueVariations.length
        const retryStyles = [
          {
            approach: `VARIATION - ENTHUSIASTIC & ENERGETIC:
- Use exclamation marks and enthusiastic language
- Be very upbeat and positive
- Use action words and dynamic phrasing
- Keep it energetic and engaging`,
            temperature: 1.0,
          },
          {
            approach: `VARIATION - EMPATHETIC & DETAILED:
- Show deep understanding and empathy
- Include more details and explanations
- Use longer, more descriptive sentences
- Focus on emotional connection`,
            temperature: 0.85,
          },
          {
            approach: `VARIATION - CASUAL & FRIENDLY:
- Use casual, everyday language
- Be relaxed and informal
- Use contractions and friendly expressions
- Keep it light and approachable`,
            temperature: 0.95,
          },
        ]
        const retryInstruction = retryStyles[retryIndex % retryStyles.length]
        const additionalVariation = await generateVariation(retryIndex, retryInstruction)
        const normalized = additionalVariation.trim().toLowerCase().replace(/\s+/g, ' ')
        const isDuplicate = uniqueVariations.some((existing) => {
          const existingNormalized = existing.trim().toLowerCase().replace(/\s+/g, ' ')
          const words1 = normalized.split(' ').filter(w => w.length > 2)
          const words2 = existingNormalized.split(' ').filter(w => w.length > 2)
          const commonWords = words1.filter((w) => words2.includes(w)).length
          const similarity = commonWords / Math.max(words1.length, words2.length)
          return similarity > 0.6
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
