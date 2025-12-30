import { NextRequest, NextResponse } from 'next/server'
import { openai } from '@/lib/openai'
import { getBusinessContext } from '@/lib/reputation/business-context'
import { z } from 'zod'

const requestSchema = z.object({
  locationId: z.string().uuid(),
  reviews: z.array(
    z.object({
      reviewId: z.string().optional(),
      authorName: z.string().optional(),
      rating: z.number().int().min(1).max(5).optional(),
      text: z.string().min(1),
      createdAt: z.string().optional(),
      platform: z.enum(['google']).optional(),
    })
  ).min(1),
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

    const { locationId, reviews } = validationResult.data

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

    const systemPrompt = `You are a professional customer service representative writing replies to Google Business Profile reviews.
Your goal is to write ONE reply that works well for multiple reviews at once.

Rules:
* Use placeholders like \`{businessName}\` or \`{name}\`. If a field is missing, write naturally without it.
* Never mention Antistatic or any software/tool.
* Keep it human, specific, and not repetitive.
* Do not claim actions you can't verify (refund issued, manager called, etc).
* Don't ask for personal info publicly.
* The reply should be general enough to work for multiple reviews but still feel personal and authentic.
* If reviews are mixed (positive and negative), focus on a balanced, appreciative tone that acknowledges feedback.
* If reviews are mostly negative, apologize, acknowledge the issues, briefly state intent to fix, invite them to contact the business offline (use phone/website if available), and keep it calm.
* If reviews are mostly positive, thank them, acknowledge their support, reinforce trust, invite them back.
* Keep the reply medium length (3-5 sentences) to work well across different review types.

Business context (use when relevant):
${businessContextStr}`

    // Build user message with all reviews
    const reviewsSummary = reviews.map((review, index) => {
      return `Review ${index + 1}:
Rating: ${review.rating || 'Not specified'}/5
Reviewer: ${review.authorName || 'Anonymous'}
Review text: ${review.text}
${review.createdAt ? `Posted: ${review.createdAt}` : ''}`
    }).join('\n\n')

    const userMessage = `You need to write ONE reply that will be posted to ${reviews.length} review${reviews.length > 1 ? 's' : ''}.

All reviews:
${reviewsSummary}

Write a single reply that:
1. Works well for all these reviews (general enough but still feels personal)
2. Is appropriate for the mix of ratings and sentiments
3. Is 3-5 sentences long
4. Uses the business context above when relevant
5. If there are negative reviews (rating <= 3), include contact information (phone/website) ONLY if available in the business context`

    console.log('[Generate Bulk Reply] Calling OpenAI', {
      locationId,
      reviewCount: reviews.length,
      hasBusinessName: !!businessContext.businessName,
      hasPhone: !!businessContext.phone,
      hasWebsite: !!businessContext.website,
    })

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 300,
    })

    const reply = completion.choices[0]?.message?.content?.trim()

    if (!reply) {
      throw new Error('No reply generated from OpenAI')
    }

    // Replace placeholders with actual values
    let finalReply = reply
      .replace(/{businessName}/g, businessContext.businessName || 'us')
      .replace(/{name}/g, businessContext.businessName || 'us')

    return NextResponse.json({
      success: true,
      reply: finalReply,
    })
  } catch (error: any) {
    console.error('[Generate Bulk Reply] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate bulk reply' },
      { status: 500 }
    )
  }
}

