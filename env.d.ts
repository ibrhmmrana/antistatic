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

    // WhatsApp Business API
    WHATSAPP_PHONE_NUMBER_ID?: string
    WHATSAPP_ACCESS_TOKEN?: string
    WHATSAPP_GRAPH_VERSION?: string

    // Instagram OAuth (Business Login for Instagram)
    INSTAGRAM_APP_ID?: string
    INSTAGRAM_APP_SECRET?: string
    NEXT_PUBLIC_APP_URL?: string

    // Supabase Storage
    SUPABASE_SERVICE_ROLE_KEY?: string
  }
}


