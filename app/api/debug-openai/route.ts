import { NextResponse } from 'next/server'
import { openai } from '@/lib/openai'

/**
 * GET /api/debug-openai
 * 
 * Debug route to test gpt-5-mini Responses API
 * No authentication required (dev only)
 */
export async function GET() {
  try {
    console.log('[Debug OpenAI] Testing gpt-5-mini...')

    const response = await openai.responses.create({
      model: 'gpt-5-mini',
      input: "Say 'Antistatic test OK' in 3 words.",
      text: {
        format: { type: 'json_object' },
      },
    })

    console.log('[Debug OpenAI] Raw response:', JSON.stringify(response, null, 2))

    const message = response.output_text || (response as any).output?.[0]?.text || response.text || 'No output text found'

    return NextResponse.json({
      ok: true,
      message,
    })
  } catch (error: any) {
    console.error('[Debug OpenAI] Error:', {
      status: error.status,
      message: error.message,
      responseData: error.response?.data,
    })

    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'Unknown error',
        status: error.status ?? 500,
        details: error.response?.data,
      },
      { status: error.status ?? 500 }
    )
  }
}

