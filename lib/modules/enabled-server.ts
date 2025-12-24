/**
 * Server-side resolver for enabled tools
 * Use this in server components only
 */

import { createClient } from '@/lib/supabase/server'
import { type ModuleKey, isModuleKey } from '@/lib/onboarding/module-registry'

/**
 * Server-side resolver for enabled tools
 * Use this in server components
 */
export async function getEnabledToolsServer(): Promise<ModuleKey[]> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return ['reputation_hub'] // Default
    }

    // Get primary business location
    const businessResult = await supabase
      .from('business_locations')
      .select('enabled_tools')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const business = businessResult.data

    // If enabled_tools exists and is not empty, return it
    if (business?.enabled_tools && Array.isArray(business.enabled_tools) && business.enabled_tools.length > 0) {
      const validTools = (business.enabled_tools as string[]).filter(isModuleKey) as ModuleKey[]
      if (validTools.length > 0) {
        return validTools
      }
    }

    // No fallback on server-side (can't access localStorage)
    return []
  } catch (error) {
    console.error('[Enabled Tools Server] Error:', error)
    return ['reputation_hub'] // Default on error
  }
}

