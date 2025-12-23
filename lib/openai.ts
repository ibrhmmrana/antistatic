/**
 * OpenAI Client
 * 
 * Singleton client for OpenAI API (server-side only)
 */

import OpenAI from 'openai'

if (!process.env.OPENAI_API_KEY) {
  console.error('[OpenAI] OPENAI_API_KEY environment variable is not set')
  throw new Error('OPENAI_API_KEY is not set')
}

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  organization: process.env.OPENAI_ORG_ID,
  baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
})

