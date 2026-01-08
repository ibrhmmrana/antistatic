'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Hook to automatically refresh the session periodically to keep it alive
 * Refreshes every 30 minutes (before typical 1-hour session expiration)
 */
export function useSessionRefresh() {
  const supabase = createClient()
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const refreshSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          // Refresh the session to extend its lifetime
          await supabase.auth.refreshSession(session)
          console.log('[Session Refresh] Session refreshed successfully')
        }
      } catch (error) {
        console.error('[Session Refresh] Failed to refresh session:', error)
      }
    }

    // Refresh immediately on mount
    refreshSession()

    // Set up periodic refresh every 15 minutes (900000 ms)
    // This ensures the session is refreshed well before it expires (typically 1 hour)
    // More frequent refresh prevents logout during inactivity
    intervalRef.current = setInterval(refreshSession, 15 * 60 * 1000)

    // Also refresh on visibility change (when user returns to tab)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        refreshSession()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Also refresh on focus (when user returns to window)
    const handleFocus = () => {
      refreshSession()
    }
    window.addEventListener('focus', handleFocus)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [supabase])
}

