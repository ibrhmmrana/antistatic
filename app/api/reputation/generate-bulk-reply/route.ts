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
      text: z.string().optional(), // Made optional to support rating-only reviews
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
Your goal is to write personalized replies for each individual review.

Rules:
* Use placeholders like \`{businessName}\` or \`{name}\`. If a field is missing, write naturally without it.
* Never mention Antistatic or any software/tool.
* Keep it human, specific, and not repetitive.
* Do not claim actions you can't verify (refund issued, manager called, etc).
* Don't ask for personal info publicly.
* Each reply should be personalized to the specific review content, rating, and reviewer name.
* If negative (rating <= 3): apologize, acknowledge the issue, briefly state intent to fix, invite them to contact the business offline (use phone/website if available), and keep it calm.
* If positive (rating >= 4): thank them, mirror a specific detail from the review, reinforce trust, invite them back.
* Keep the reply medium length (3-5 sentences).
* IMPORTANT: Always address the reviewer by their FIRST NAME ONLY. If the reviewer's name is "Murray Legg", address them as "Murray". If the reviewer's name is "John Smith", address them as "John". Extract and use only the first name from the full name provided.

Business context (use when relevant):
${businessContextStr}`

    console.log('[Generate Bulk Reply] Generating individual replies for', reviews.length, 'reviews')

    // Generate individual reply for each review
    const replyPromises = reviews.map(async (review, index) => {
      // Extract first name from author name
      const firstName = review.authorName
        ? review.authorName.trim().split(/\s+/)[0]
        : null

      const hasText = review.text && review.text.trim().length > 0
      const reviewTextDisplay = hasText ? review.text : '(No comment provided - rating only)'
      
      const userMessage = `Review details:
Rating: ${review.rating || 'Not specified'}/5
Reviewer: ${review.authorName || 'Anonymous'}
${firstName ? `Reviewer's first name: ${firstName}` : 'Reviewer name not available'}
Review text: ${reviewTextDisplay}
${review.createdAt ? `Posted: ${review.createdAt}` : ''}

Write a personalized reply for this specific review:
1. Address the reviewer by their FIRST NAME ONLY if provided${firstName ? ` (use "${firstName}")` : ' (reviewer name not available)'}
${hasText ? '2. Reference specific details from their review' : '2. Since there is no written comment, focus on acknowledging their rating and expressing appreciation (if positive) or concern (if negative)'}
3. Match the tone to the rating (${review.rating || 'N/A'}/5)
4. Is 3-5 sentences long
5. Uses the business context above when relevant
6. If rating <= 3, include contact information (phone/website) ONLY if available in the business context
${!hasText ? '7. Since this is a rating-only review, keep the reply warm and appreciative (for positive ratings) or empathetic and solution-focused (for negative ratings)' : ''}`

      try {
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
          throw new Error(`No reply generated for review ${index + 1}`)
        }

        // Replace placeholders with actual values
        let finalReply = reply
          .replace(/{businessName}/g, businessContext.businessName || 'us')
          .replace(/{name}/g, businessContext.businessName || 'us')

        return {
          reviewId: review.reviewId || `review-${index}`,
          reply: finalReply,
          success: true,
        }
      } catch (error: any) {
        console.error(`[Generate Bulk Reply] Error generating reply for review ${index + 1}:`, error)
        return {
          reviewId: review.reviewId || `review-${index}`,
          reply: '',
          success: false,
          error: error.message || 'Failed to generate reply',
        }
      }
    })

    const replies = await Promise.all(replyPromises)

    // Check if all replies were generated successfully
    const failedReplies = replies.filter((r) => !r.success)
    if (failedReplies.length > 0) {
      console.error('[Generate Bulk Reply] Some replies failed to generate:', failedReplies)
    }

    return NextResponse.json({
      success: true,
      replies: replies.map((r) => ({
        reviewId: r.reviewId,
        reply: r.reply,
      })),
    })
  } catch (error: any) {
    console.error('[Generate Bulk Reply] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate bulk reply' },
      { status: 500 }
    )
  }
}

