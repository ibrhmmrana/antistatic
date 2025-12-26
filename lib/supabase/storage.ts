import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { Database } from './database.types'

/**
 * Create a Supabase client with service role key for storage operations
 * This bypasses RLS and is safe to use server-side only
 */
export function createStorageClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey) {
    // Fallback to anon key if service role not available
    // This will work if storage policies are set up correctly
    return createSupabaseClient<Database>(
      supabaseUrl,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }

  return createSupabaseClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}


