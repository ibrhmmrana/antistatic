/**
 * OpenAI API Client
 * 
 * Simple wrapper for OpenAI Chat Completions API
 */

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatCompletionOptions {
  model?: string
  temperature?: number
  maxTokens?: number
}

export async function createChatCompletion(
  messages: ChatMessage[],
  options: ChatCompletionOptions = {}
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set')
  }

  const {
    model = 'gpt-4o-mini',
    temperature = 0.7,
    maxTokens = 2000,
  } = options

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(`OpenAI API error: ${error.error?.message || JSON.stringify(error)}`)
  }

  const data = await response.json()
  return data.choices[0]?.message?.content || ''
}




