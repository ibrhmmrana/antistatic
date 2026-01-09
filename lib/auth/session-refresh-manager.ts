'use client'

import { createClient } from '@/lib/supabase/client'

// Module-scope singleton state
let inFlight: Promise<void> | null = null
let lastRefreshTime = 0
const MIN_GAP_MS = 5000 // 5 seconds minimum between refresh attempts
const EXPIRY_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes before expiry

// Singleton Supabase client instance
let supabaseClient: ReturnType<typeof createClient> | null = null

function getSupabaseClient() {
  if (!supabaseClient) {
    supabaseClient = createClient()
  }
  return supabaseClient
}

/**
 * Global session refresh singleton with mutex protection
 * Ensures only one refresh happens at a time, even across multiple components
 * 
 * @param reason - Optional reason for the refresh (for logging)
 * @returns Promise that resolves when refresh completes (or is skipped)
 */
export async function refreshSessionSingleton(reason?: string): Promise<void> {
  const now = Date.now()
  
  // Debounce: skip if we just refreshed recently
  if (now - lastRefreshTime < MIN_GAP_MS) {
    console.log(`[Session Refresh Manager] Skipping refresh (too soon): ${reason || 'unknown'}`)
    return
  }
  
  // If a refresh is already in flight, wait for it
  if (inFlight) {
    console.log(`[Session Refresh Manager] Refresh already in flight, waiting: ${reason || 'unknown'}`)
    await inFlight
    return
  }
  
  // Start new refresh
  inFlight = (async () => {
    try {
      const supabase = getSupabaseClient()
      
      console.log(`[Session Refresh Manager] Starting refresh: ${reason || 'unknown'}`)
      
      // Get current session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError) {
        console.error('[Session Refresh Manager] Error getting session:', sessionError)
        return
      }
      
      if (!session) {
        console.log('[Session Refresh Manager] No session to refresh')
        return
      }
      
      // Check if session is close to expiry (within 5 minutes)
      const expiresAt = session.expires_at ? session.expires_at * 1000 : 0
      const timeUntilExpiry = expiresAt - now
      
      if (timeUntilExpiry > EXPIRY_THRESHOLD_MS) {
        console.log(`[Session Refresh Manager] Session not close to expiry (${Math.round(timeUntilExpiry / 1000 / 60)} minutes remaining), skipping refresh`)
        return
      }
      
      console.log(`[Session Refresh Manager] Session expires in ${Math.round(timeUntilExpiry / 1000 / 60)} minutes, refreshing...`)
      
      // Attempt to refresh the session
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession(session)
      
      if (refreshError) {
        // Handle "refresh_token_already_used" error gracefully
        if (refreshError.message?.includes('refresh_token_already_used') || refreshError.code === 'refresh_token_already_used') {
          console.warn('[Session Refresh Manager] Refresh token already used, attempting to get fresh session...')
          
          // Try to get a fresh session - another instance may have already refreshed it
          const { data: { session: newSession }, error: getSessionError } = await supabase.auth.getSession()
          
          if (getSessionError || !newSession) {
            console.error('[Session Refresh Manager] Failed to get fresh session after token reuse error:', getSessionError)
            // DO NOT sign out - let the user continue with their current session
            return
          }
          
          console.log('[Session Refresh Manager] Successfully retrieved fresh session after token reuse')
          lastRefreshTime = now
          
          // Sync cookies via middleware
          try {
            await fetch('/api/auth/check', {
              method: 'GET',
              credentials: 'include',
              cache: 'no-store',
            }).catch(() => {
              // Ignore errors - this is just to trigger middleware cookie update
            })
          } catch (error) {
            // Ignore errors
          }
          
          return
        }
        
        console.error('[Session Refresh Manager] Error refreshing session:', refreshError)
        return
      }
      
      if (refreshData?.session) {
        console.log('[Session Refresh Manager] Session refreshed successfully')
        lastRefreshTime = now
        
        // Sync cookies via middleware
        try {
          await fetch('/api/auth/check', {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store',
          }).catch(() => {
            // Ignore errors - this is just to trigger middleware cookie update
          })
        } catch (error) {
          // Ignore errors
        }
      } else {
        console.warn('[Session Refresh Manager] Refresh succeeded but no new session returned')
      }
    } catch (error: any) {
      console.error('[Session Refresh Manager] Exception during refresh:', error)
    } finally {
      // Clear in-flight flag
      inFlight = null
    }
  })()
  
  // Wait for the refresh to complete
  await inFlight
}

