import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { type ModuleKey, isModuleKey } from '@/lib/onboarding/module-registry'
import { Database } from '@/lib/supabase/database.types'

type BusinessLocation = Database['public']['Tables']['business_locations']['Row']
type BusinessLocationSelect = Pick<BusinessLocation, 'enabled_tools'>

/**
 * GET /api/me/enabled-tools
 * Returns the enabled tools for the current user's primary business location
 * Falls back to prescribed modules from localStorage if enabled_tools is empty
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get primary business location (most recent)
    const businessResult = await supabase
      .from('business_locations')
      .select('enabled_tools')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const business = businessResult.data as BusinessLocationSelect | null

    // If enabled_tools exists and is not empty, return it
    if (business?.enabled_tools && Array.isArray(business.enabled_tools) && business.enabled_tools.length > 0) {
      // Validate and filter to only valid ModuleKeys
      const validTools = (business.enabled_tools as string[]).filter(isModuleKey) as ModuleKey[]
      return NextResponse.json({ enabledTools: validTools })
    }

    // Fallback: return empty array (client can check localStorage if needed)
    // We don't access localStorage in server-side API routes
    return NextResponse.json({ enabledTools: [] })
  } catch (error: any) {
    console.error('[Enabled Tools API] Error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

