/**
 * Enabled Tools Resolver
 * 
 * Resolves enabled modules for the current workspace with fallback logic:
 * 1. Prefer database: business_locations.enabled_tools
 * 2. Fallback to localStorage: onboarding_prescribed_modules (client-side only)
 * 3. Default: ['reputation_hub']
 */

import { type ModuleKey, isModuleKey } from '@/lib/onboarding/module-registry'
import { getPrescribedModules } from '@/lib/onboarding/prescriptions'

/**
 * Get enabled tools for sidebar (client-side)
 * Fetches from API and falls back to localStorage if needed
 */
export async function getEnabledToolsForSidebar(): Promise<ModuleKey[]> {
  try {
    // Try to fetch from API (server-side source of truth)
    const response = await fetch('/api/me/enabled-tools', {
      cache: 'no-store', // Always fetch fresh
    })

    if (response.ok) {
      const data = await response.json()
      if (data.enabledTools && Array.isArray(data.enabledTools) && data.enabledTools.length > 0) {
        // Validate all are ModuleKeys
        const validTools = data.enabledTools.filter(isModuleKey) as ModuleKey[]
        if (validTools.length > 0) {
          return validTools
        }
      }
    }
  } catch (error) {
    console.warn('[Enabled Tools] Failed to fetch from API, falling back to localStorage:', error)
  }

  // Fallback 1: Check localStorage for prescribed modules
  if (typeof window !== 'undefined') {
    try {
      const prescribed = getPrescribedModules()
      if (prescribed.length > 0) {
        return prescribed
      }
    } catch (error) {
      console.warn('[Enabled Tools] Failed to read from localStorage:', error)
    }
  }

  // Fallback 2: Default to reputation_hub
  return ['reputation_hub']
}

// Server-side resolver moved to enabled-server.ts to avoid bundling server code in client components

