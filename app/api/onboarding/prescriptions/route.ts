import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizePrescribedModules } from '@/lib/onboarding/prescriptions'
import type { ModuleKey } from '@/lib/onboarding/module-registry'
import { Database } from '@/lib/supabase/database.types'

type BusinessInsights = Database['public']['Tables']['business_insights']['Row']
type BusinessInsightsSelect = Pick<BusinessInsights, 'instagram_ai_analysis' | 'facebook_ai_analysis' | 'gbp_ai_analysis'>

export const dynamic = 'force-dynamic'

/**
 * GET /api/onboarding/prescriptions?locationId=xxx
 * Returns all prescribed modules for a location based on Channel Analysis
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const locationId = searchParams.get('locationId')

    if (!locationId) {
      return NextResponse.json(
        { success: false, error: 'Location ID is required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Verify location ownership
    const { data: location, error: locationError } = await supabase
      .from('business_locations')
      .select('id')
      .eq('id', locationId)
      .eq('user_id', user.id)
      .single()

    if (locationError || !location) {
      return NextResponse.json(
        { success: false, error: 'Location not found or access denied' },
        { status: 404 }
      )
    }

    const rawPrescribed: string[] = []

    // Fetch all analyses from business_insights
    // Note: Column is gbp_ai_analysis (not gbp_weakness_analysis)
    const insightsResult = await supabase
      .from('business_insights')
      .select('instagram_ai_analysis, facebook_ai_analysis, gbp_ai_analysis')
      .eq('location_id', locationId)
      .eq('source', 'google')
      .maybeSingle()

    const insights = insightsResult.data as BusinessInsightsSelect | null

    if (insights) {
      // Collect from Instagram analysis
      if (insights.instagram_ai_analysis) {
        const instagram = insights.instagram_ai_analysis as any
        if (instagram.mainRisks && Array.isArray(instagram.mainRisks)) {
          instagram.mainRisks.forEach((risk: any) => {
            if (risk.prescribedModules && Array.isArray(risk.prescribedModules)) {
              rawPrescribed.push(...risk.prescribedModules)
            }
          })
        }
      }

      // Collect from Facebook analysis
      if (insights.facebook_ai_analysis) {
        const facebook = insights.facebook_ai_analysis as any
        // Check cards for prescriptions (primary source - stored in database)
        if (facebook.cards && Array.isArray(facebook.cards)) {
          facebook.cards.forEach((card: any) => {
            if (card.prescription && card.prescription.moduleId) {
              rawPrescribed.push(card.prescription.moduleId)
            }
          })
        }
        // Also check opportunities with solutions (if transformed format exists)
        if (facebook.opportunities && Array.isArray(facebook.opportunities)) {
          facebook.opportunities.forEach((opp: any) => {
            if (opp.solutions && Array.isArray(opp.solutions)) {
              rawPrescribed.push(...opp.solutions)
            }
          })
        }
      }

      // Collect from GBP analysis
      const gbp = insights.gbp_ai_analysis as any
      if (gbp) {
        if (gbp.themes && Array.isArray(gbp.themes)) {
          gbp.themes.forEach((theme: any) => {
            if (theme.prescribedModules && Array.isArray(theme.prescribedModules)) {
              rawPrescribed.push(...theme.prescribedModules)
            }
          })
        }
      }
    }

    // Normalize and validate all prescribed modules to ModuleKey[]
    let prescribedModules = normalizePrescribedModules(rawPrescribed)
    
    // Filter out coming soon modules (Insights Lab and Profile Manager)
    prescribedModules = prescribedModules.filter(
      (module) => module !== 'insights_lab' && module !== 'profile_manager'
    )

    return NextResponse.json({
      success: true,
      prescribedModules,
    })
  } catch (error: any) {
    console.error('[Prescriptions API] Error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch prescriptions' },
      { status: 500 }
    )
  }
}

