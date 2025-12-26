/**
 * Prescription Collection and Management
 * 
 * Collects prescribed modules from Channel Analysis and persists them for the Choose Tools step
 */

import type { AntistaticModuleId } from '@/lib/modules/catalog'
import { isModuleKey, type ModuleKey } from '@/lib/onboarding/module-registry'

/**
 * Map module IDs from various formats to the standard snake_case format used in tool selection
 */
export function normalizeModuleId(moduleId: string): string {
  // Map from various formats to snake_case
  const moduleMap: Record<string, string> = {
    // CamelCase to snake_case
    'reputationHub': 'reputation_hub',
    'socialStudio': 'social_studio',
    'insightsLab': 'insights_lab',
    'profileManager': 'profile_manager',
    'competitorTracker': 'competitor_radar', // Note: tool selection uses 'competitor_radar'
    'competitorRadar': 'competitor_radar',
    'influencerHub': 'influencer_hub',
    // Display names to snake_case
    'Reputation Hub': 'reputation_hub',
    'Social Studio': 'social_studio',
    'Insights Lab': 'insights_lab',
    'Profile Manager': 'profile_manager',
    'Competitor Radar': 'competitor_radar',
    'Influencer Hub': 'influencer_hub',
    // Uppercase constants
    'REPUTATION_HUB': 'reputation_hub',
    'SOCIAL_STUDIO': 'social_studio',
    'INSIGHTS_LAB': 'insights_lab',
    'PROFILE_MANAGER': 'profile_manager',
    'COMPETITOR_RADAR': 'competitor_radar',
    'INFLUENCER_HUB': 'influencer_hub',
  }
  
  // If exact match in map, return it
  if (moduleId in moduleMap) {
    return moduleMap[moduleId]
  }
  
  // Try camelCase to snake_case conversion
  const snakeCase = moduleId.replace(/([A-Z])/g, '_$1').toLowerCase()
  if (snakeCase in moduleMap || isModuleKey(snakeCase)) {
    return snakeCase
  }
  
  // Fallback: lowercase and try direct match
  const lower = moduleId.toLowerCase()
  if (isModuleKey(lower)) {
    return lower
  }
  
  // Last resort: convert camelCase to snake_case
  return moduleId.replace(/([A-Z])/g, '_$1').toLowerCase()
}

/**
 * Deep scan object/array for prescription-related keys
 * Recursively searches for: prescribedModules, solutions, moduleId, module_id, prescription
 */
function deepScanForPrescriptions(obj: any, depth: number = 0, maxDepth: number = 8): string[] {
  if (depth > maxDepth || obj === null || obj === undefined) {
    return []
  }
  
  const found: string[] = []
  
  if (Array.isArray(obj)) {
    for (const item of obj) {
      found.push(...deepScanForPrescriptions(item, depth + 1, maxDepth))
    }
  } else if (typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase()
      
      // Check if this key suggests prescription data
      if (lowerKey.includes('prescribed') || lowerKey.includes('module') || lowerKey.includes('solution')) {
        if (Array.isArray(value)) {
          // Collect all string values from array
          value.forEach((v: any) => {
            if (typeof v === 'string') {
              found.push(v)
            } else if (typeof v === 'object' && v !== null) {
              // If it's an object, check for moduleId/module_id
              if (v.moduleId && typeof v.moduleId === 'string') {
                found.push(v.moduleId)
              }
              if (v.module_id && typeof v.module_id === 'string') {
                found.push(v.module_id)
              }
            }
          })
        } else if (typeof value === 'string') {
          found.push(value)
        } else if (typeof value === 'object' && value !== null) {
          // Recursively scan nested objects
          found.push(...deepScanForPrescriptions(value, depth + 1, maxDepth))
        }
      } else {
        // Recursively scan other properties
        found.push(...deepScanForPrescriptions(value, depth + 1, maxDepth))
      }
    }
  }
  
  return found
}

/**
 * Normalize and validate an array of prescribed modules
 * Returns only valid ModuleKey[] in snake_case format
 * Supports deep scanning as fallback if raw is not an array
 */
export function normalizePrescribedModules(raw: unknown): ModuleKey[] {
  // If not an array, try deep scan if it's an object
  if (!Array.isArray(raw)) {
    if (typeof raw === 'object' && raw !== null) {
      // Deep scan for prescriptions
      const scanned = deepScanForPrescriptions(raw)
      if (scanned.length > 0) {
        // Recursively normalize the scanned results
        return normalizePrescribedModules(scanned)
      }
    }
    return []
  }
  
  // Normalize each entry and filter to valid ModuleKeys
  const normalized = new Set<ModuleKey>()
  
  for (const item of raw) {
    if (typeof item !== 'string') {
      continue
    }
    
    const normalizedId = normalizeModuleId(item)
    if (isModuleKey(normalizedId)) {
      normalized.add(normalizedId)
    }
  }
  
  // Filter out coming soon modules
  const filtered = Array.from(normalized).filter(
    (key) => key !== 'insights_lab' && key !== 'profile_manager'
  )
  
  return filtered
}

/**
 * Collect prescribed modules from all Channel Analysis data
 * This should be called when Channel Analysis completes
 */
export function collectPrescribedModules(): string[] {
  const prescribed: Set<string> = new Set()
  
  try {
    // Collect from Instagram analysis
    const instagramData = localStorage.getItem('onboarding_instagram_analysis')
    if (instagramData) {
      const parsed = JSON.parse(instagramData)
      if (parsed.mainRisks && Array.isArray(parsed.mainRisks)) {
        parsed.mainRisks.forEach((risk: any) => {
          if (risk.prescribedModules && Array.isArray(risk.prescribedModules)) {
            risk.prescribedModules.forEach((module: string) => {
              const normalized = normalizeModuleId(module)
              if (normalized) prescribed.add(normalized)
            })
          }
        })
      }
    }
    
    // Collect from Facebook analysis
    const facebookData = localStorage.getItem('onboarding_facebook_analysis')
    if (facebookData) {
      const parsed = JSON.parse(facebookData)
      // Facebook uses opportunities with solutions array
      if (parsed.opportunities && Array.isArray(parsed.opportunities)) {
        parsed.opportunities.forEach((opp: any) => {
          if (opp.solutions && Array.isArray(opp.solutions)) {
            opp.solutions.forEach((module: string) => {
              const normalized = normalizeModuleId(module)
              if (normalized) prescribed.add(normalized)
            })
          }
        })
      }
      // Also check cards for prescriptions
      if (parsed.cards && Array.isArray(parsed.cards)) {
        parsed.cards.forEach((card: any) => {
          if (card.prescription && card.prescription.moduleId) {
            const normalized = normalizeModuleId(card.prescription.moduleId)
            if (normalized) prescribed.add(normalized)
          }
        })
      }
    }
    
    // Collect from GBP analysis
    const gbpData = localStorage.getItem('onboarding_gbp_analysis')
    if (gbpData) {
      const parsed = JSON.parse(gbpData)
      if (parsed.themes && Array.isArray(parsed.themes)) {
        parsed.themes.forEach((theme: any) => {
          if (theme.prescribedModules && Array.isArray(theme.prescribedModules)) {
            theme.prescribedModules.forEach((module: string) => {
              const normalized = normalizeModuleId(module)
              if (normalized) prescribed.add(normalized)
            })
          }
        })
      }
    }
  } catch (error) {
    console.error('[Prescriptions] Error collecting prescribed modules:', error)
  }
  
  return Array.from(prescribed)
}

/**
 * Store prescribed modules in localStorage for the Choose Tools step
 * Only stores normalized ModuleKey[] (snake_case)
 */
export function storePrescribedModules(modules: ModuleKey[]): void {
  try {
    // Ensure all modules are valid ModuleKeys
    const validModules = modules.filter(isModuleKey)
    localStorage.setItem('onboarding_prescribed_modules', JSON.stringify(validModules))
  } catch (error) {
    console.error('[Prescriptions] Error storing prescribed modules:', error)
  }
}

/**
 * Get prescribed modules from localStorage
 * Returns normalized ModuleKey[] (snake_case) only
 */
export function getPrescribedModules(): ModuleKey[] {
  try {
    const stored = localStorage.getItem('onboarding_prescribed_modules')
    if (stored) {
      const parsed = JSON.parse(stored)
      // Normalize and validate the stored data
      return normalizePrescribedModules(parsed)
    }
  } catch (error) {
    console.error('[Prescriptions] Error reading prescribed modules:', error)
  }
  return []
}

/**
 * Clear prescribed modules (e.g., on onboarding completion)
 */
export function clearPrescribedModules(): void {
  try {
    localStorage.removeItem('onboarding_prescribed_modules')
    localStorage.removeItem('onboarding_instagram_analysis')
    localStorage.removeItem('onboarding_facebook_analysis')
    localStorage.removeItem('onboarding_gbp_analysis')
  } catch (error) {
    console.error('[Prescriptions] Error clearing prescribed modules:', error)
  }
}

