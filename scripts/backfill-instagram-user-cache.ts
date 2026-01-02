/**
 * Backfill script for instagram_user_cache
 * 
 * Fixes ig_account_id for rows with MIGRATION_PLACEHOLDER
 * by extracting recipientIgAccountId from raw JSON
 * 
 * Usage: pnpm ts-node scripts/backfill-instagram-user-cache.ts
 */

import { createClient } from '@supabase/supabase-js'

// Load env vars manually (for ts-node)
if (typeof process !== 'undefined' && process.env) {
  // Environment variables should already be loaded by the shell
  // If running via ts-node, ensure .env.local is loaded by the caller
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!serviceRoleKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is required')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

async function backfillIgAccountIds() {
  console.log('[Backfill] Starting ig_account_id backfill...')
  
  // Find rows with MIGRATION_PLACEHOLDER
  const { data: rows, error: selectError } = await (supabase
    .from('instagram_user_cache') as any)
    .select('ig_user_id, ig_account_id, raw')
    .eq('ig_account_id', 'MIGRATION_PLACEHOLDER')
  
  if (selectError) {
    console.error('[Backfill] Error selecting rows:', selectError)
    return
  }
  
  if (!rows || rows.length === 0) {
    console.log('[Backfill] No rows with MIGRATION_PLACEHOLDER found')
    return
  }
  
  console.log(`[Backfill] Found ${rows.length} rows to process`)
  
  let fixed = 0
  let failed = 0
  
  for (const row of rows) {
    try {
      // Try to extract recipientIgAccountId from raw JSON
      let recipientIgAccountId: string | null = null
      
      if (row.raw) {
        if (typeof row.raw === 'string') {
          try {
            const parsed = JSON.parse(row.raw)
            recipientIgAccountId = parsed.recipientIgAccountId || null
          } catch {
            // Not valid JSON, skip
          }
        } else if (typeof row.raw === 'object') {
          recipientIgAccountId = row.raw.recipientIgAccountId || null
        }
      }
      
      if (!recipientIgAccountId) {
        console.log(`[Backfill] No recipientIgAccountId found for ig_user_id: ${row.ig_user_id}`)
        failed++
        continue
      }
      
      // Update the row
      const { error: updateError } = await (supabase
        .from('instagram_user_cache') as any)
        .update({ ig_account_id: recipientIgAccountId })
        .eq('ig_user_id', row.ig_user_id)
        .eq('ig_account_id', 'MIGRATION_PLACEHOLDER')
      
      if (updateError) {
        console.error(`[Backfill] Error updating row ${row.ig_user_id}:`, updateError)
        failed++
      } else {
        console.log(`[Backfill] Fixed ig_user_id: ${row.ig_user_id} -> ig_account_id: ${recipientIgAccountId}`)
        fixed++
      }
    } catch (error: any) {
      console.error(`[Backfill] Exception processing row ${row.ig_user_id}:`, error)
      failed++
    }
  }
  
  console.log(`[Backfill] Complete: ${fixed} fixed, ${failed} failed`)
}

backfillIgAccountIds()
  .then(() => {
    console.log('[Backfill] Done')
    process.exit(0)
  })
  .catch((error) => {
    console.error('[Backfill] Fatal error:', error)
    process.exit(1)
  })

