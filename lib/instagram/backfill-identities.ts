/**
 * Instagram Identity Backfill
 * 
 * Backfills username and profile_pic for instagram_user_cache rows
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/lib/supabase/database.types'
import { resolveMessagingUserProfile } from './messaging-user-profile'
import { getInstagramAccessTokenForAccount, InstagramAuthError } from './tokens'

/**
 * Create service role Supabase client
 */
function createServiceRoleClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
  }

  return createSupabaseClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

/**
 * Backfill identities for an Instagram account
 * 
 * @param igAccountId - The Instagram account ID
 * @param businessLocationId - The business location ID (for resolveMessagingUserProfile)
 * @returns Summary of processed/updated/failed rows
 */
export async function backfillInstagramIdentities(
  igAccountId: string,
  businessLocationId: string
): Promise<{
  processed: number
  updated: number
  failed: number
  errors: string[]
}> {
  const supabase = createServiceRoleClient()
  const errors: string[] = []
  let processed = 0
  let updated = 0
  let failed = 0

  try {
    // Check token first
    try {
      await getInstagramAccessTokenForAccount(igAccountId)
    } catch (error: any) {
      if (error instanceof InstagramAuthError) {
        throw error
      }
      throw new Error(`Failed to get access token: ${error.message}`)
    }

    // Find rows that need identity backfill
    const { data: rows, error: selectError } = await (supabase
      .from('instagram_user_cache') as any)
      .select('ig_user_id, username, profile_pic, fail_count, last_failed_at')
      .eq('ig_account_id', igAccountId)
      .or('username.is.null,profile_pic.is.null')
      .limit(100) // Limit to avoid overwhelming the API

    if (selectError) {
      throw new Error(`Failed to select rows: ${selectError.message}`)
    }

    if (!rows || rows.length === 0) {
      console.log('[Identity Backfill] No rows need backfilling')
      return { processed: 0, updated: 0, failed: 0, errors: [] }
    }

    console.log(`[Identity Backfill] Found ${rows.length} rows to process`)

    // Process each row
    for (const row of rows) {
      processed++
      
      try {
        // Skip if in cooldown (fail_count >= 3 and last_failed_at < 15 min ago)
        if (row.fail_count >= 3 && row.last_failed_at) {
          const lastFailed = new Date(row.last_failed_at)
          const now = new Date()
          const minutesSinceFailure = (now.getTime() - lastFailed.getTime()) / (1000 * 60)
          
          if (minutesSinceFailure < 15) {
            console.log(`[Identity Backfill] Skipping ${row.ig_user_id} (in cooldown)`)
            continue
          }
        }

        // Resolve profile
        const result = await resolveMessagingUserProfile(
          businessLocationId,
          igAccountId,
          row.ig_user_id
        )

        if (result && (result.username || result.name || result.profile_pic)) {
          // Check if we actually updated something
          const hadData = row.username || row.profile_pic
          const nowHasData = result.username || result.name || result.profile_pic
          
          if (!hadData && nowHasData) {
            updated++
            console.log(`[Identity Backfill] Updated ${row.ig_user_id}:`, {
              username: result.username,
              name: result.name,
              hasProfilePic: !!result.profile_pic,
            })
          }
        } else {
          failed++
          errors.push(`Failed to resolve ${row.ig_user_id}: No data returned`)
        }
      } catch (error: any) {
        failed++
        const errorMsg = `Failed to resolve ${row.ig_user_id}: ${error.message}`
        errors.push(errorMsg)
        console.error(`[Identity Backfill] ${errorMsg}`)
        
        // If it's an auth error, stop processing
        if (error instanceof InstagramAuthError) {
          throw error
        }
      }
    }

    return {
      processed,
      updated,
      failed,
      errors: errors.slice(0, 10), // Limit error messages
    }
  } catch (error: any) {
    if (error instanceof InstagramAuthError) {
      throw error
    }
    throw new Error(`Backfill failed: ${error.message}`)
  }
}

