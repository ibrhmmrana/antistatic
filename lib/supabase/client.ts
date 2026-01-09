'use client'

import { createBrowserClient } from '@supabase/ssr'
import { Database } from './database.types'

// Singleton Supabase client instance
let supabaseClient: ReturnType<typeof createBrowserClient<Database>> | null = null

/**
 * Get or create the singleton Supabase client instance
 * This ensures all components use the same client instance
 * 
 * NOTE: This is CLIENT-ONLY. For server-side code, use lib/supabase/server.ts
 */
export function createClient() {
  if (!supabaseClient) {
    supabaseClient = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        // Use localStorage for session persistence (survives page refreshes)
        // Session will persist until browser is closed (localStorage is cleared on browser close in most cases)
        // or until the session expires naturally
        auth: {
          persistSession: true,
          storage: typeof window !== 'undefined' ? window.localStorage : undefined,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'pkce',
        },
      }
    )
  }
  return supabaseClient
}

