'use client'

import { useEffect } from 'react'
import { refreshSessionSingleton } from '@/lib/auth/session-refresh-manager'

// Module-scope flag to ensure listeners are installed only once globally
let listenersInstalled = false
let globalIntervalRef: NodeJS.Timeout | null = null
let globalVisibilityHandler: (() => void) | null = null
let globalFocusHandler: (() => void) | null = null

/**
 * Hook to automatically refresh the session periodically to keep it alive
 * Uses the global refreshSessionSingleton to prevent concurrent refresh attempts
 * 
 * This hook can be called from multiple components, but listeners are installed only once globally.
 * All instances share the same interval and event listeners.
 */
export function useSessionRefresh() {
  useEffect(() => {
    // Install global listeners only once
    if (!listenersInstalled) {
      listenersInstalled = true
      
      console.log('[Session Refresh Hook] Installing global listeners (first instance)')
      
      // Set up periodic refresh every 15 minutes
      globalIntervalRef = setInterval(() => {
        refreshSessionSingleton('periodic-interval')
      }, 15 * 60 * 1000)
      
      // Also refresh on visibility change (when user returns to tab)
      globalVisibilityHandler = () => {
        if (!document.hidden) {
          refreshSessionSingleton('visibility-change')
        }
      }
      document.addEventListener('visibilitychange', globalVisibilityHandler)
      
      // Also refresh on focus (when user returns to window)
      globalFocusHandler = () => {
        refreshSessionSingleton('window-focus')
      }
      window.addEventListener('focus', globalFocusHandler)
      
      // Initial refresh on first mount (only once globally)
      refreshSessionSingleton('initial-mount')
      
      console.log('[Session Refresh Hook] Global listeners installed successfully')
    } else {
      console.log('[Session Refresh Hook] Listeners already installed, skipping (this is normal if hook is called from multiple components)')
    }
    
    return () => {
      // Note: We don't clean up global listeners here because they should persist
      // across component unmounts. The global listeners will persist for the app lifetime.
      // If we need to clean them up, it should be done on app unmount, not component unmount.
    }
  }, []) // Empty deps - only run once per hook instance
}

