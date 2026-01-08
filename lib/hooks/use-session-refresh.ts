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
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-session-refresh.ts:15',message:'Session refresh started',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-session-refresh.ts:18',message:'getSession result',data:{hasSession:!!session,sessionExpiresAt:session?.expires_at,hasError:!!sessionError,errorMessage:sessionError?.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
        if (session) {
          // Refresh the session to extend its lifetime
          const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession(session)
          
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-session-refresh.ts:24',message:'refreshSession result',data:{hasNewSession:!!refreshData?.session,newSessionExpiresAt:refreshData?.session?.expires_at,hasError:!!refreshError,errorMessage:refreshError?.message,errorCode:refreshError?.code},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          
          // After refreshing the session in localStorage, trigger a request that goes through middleware
          // This ensures cookies are updated with the refreshed session
          // Use a lightweight endpoint that just checks auth (middleware will refresh and set cookies)
          if (refreshData?.session && !refreshError) {
            try {
              // Make a request to an API endpoint that goes through middleware
              // This ensures the refreshed session in localStorage gets synced to cookies
              await fetch('/api/auth/check', {
                method: 'GET',
                credentials: 'include',
                cache: 'no-store',
              }).catch(() => {
                // Ignore errors - this is just to trigger middleware cookie update
              })
            } catch (error) {
              // Ignore errors - this is just to trigger middleware cookie update
            }
          }
          
          console.log('[Session Refresh] Session refreshed successfully')
        } else {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-session-refresh.ts:30',message:'No session to refresh',data:{sessionError:sessionError?.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
        }
      } catch (error: any) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-session-refresh.ts:34',message:'Session refresh exception',data:{errorMessage:error?.message,errorType:error?.constructor?.name},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
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

