/**
 * Environment variable type definitions
 */

declare namespace NodeJS {
  interface ProcessEnv {
    // Supabase
    NEXT_PUBLIC_SUPABASE_URL: string
    NEXT_PUBLIC_SUPABASE_ANON_KEY: string

    // Google APIs
    GOOGLE_PLACES_API_KEY?: string
    GOOGLE_MAPS_API_KEY?: string
    GBP_CLIENT_ID?: string
    GBP_CLIENT_SECRET?: string

    // OpenAI
    OPENAI_API_KEY: string
    OPENAI_ORG_ID?: string
    OPENAI_BASE_URL?: string

    // Apify
    APIFY_API_TOKEN?: string
  }
}


