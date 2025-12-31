'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { ArrowBack as ArrowBackIcon, Lock as LockIcon } from '@mui/icons-material'
import { getPrescribedModules, storePrescribedModules, normalizePrescribedModules } from '@/lib/onboarding/prescriptions'
import { MODULES, getAllModuleKeys, getModuleInfo, isModuleKey, type ModuleKey } from '@/lib/onboarding/module-registry'
import { Database } from '@/lib/supabase/database.types'

type BusinessLocationUpdate = Database['public']['Tables']['business_locations']['Update']
type ProfileUpdate = Database['public']['Tables']['profiles']['Update']

interface ToolSelectionProps {
  userName?: string
  savedTools?: string[] | null
  locationId: string
}

export function ToolSelection({ userName = 'there', savedTools, locationId }: ToolSelectionProps) {
  // State: separate prescribed from optional selections
  const [prescribedModules, setPrescribedModules] = useState<ModuleKey[]>([])
  const [optionalSelected, setOptionalSelected] = useState<ModuleKey[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [goingBack, setGoingBack] = useState(false)
  const [buildOwnSolution, setBuildOwnSolution] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // Initialize prescribed modules and optional selections
  useEffect(() => {
    async function initialize() {
      // Step 1: Load prescribed modules (already normalized from localStorage or API)
      let prescribed = getPrescribedModules()
      
      if (prescribed.length === 0) {
        // Fetch from API if not in localStorage
        if (!locationId) {
          console.error('[Tool Selection] locationId is undefined - cannot fetch prescriptions')
        } else {
          try {
            const response = await fetch(`/api/onboarding/prescriptions?locationId=${locationId}`)
            
            if (!response.ok) {
              console.error('[Tool Selection] Failed to fetch prescriptions:', response.status, response.statusText)
            } else {
              const data = await response.json()
              
              // Accept multiple response shapes for tolerance
              let rawPrescribed: unknown = null
              if (data.success && data.prescribedModules) {
                rawPrescribed = data.prescribedModules
              } else if (data.prescribedModules) {
                rawPrescribed = data.prescribedModules
              } else if (Array.isArray(data)) {
                rawPrescribed = data
              }
              
              if (rawPrescribed) {
                // API returns normalized ModuleKey[], but double-check with normalizePrescribedModules
                prescribed = normalizePrescribedModules(rawPrescribed)
                
                // Only store if non-empty (don't overwrite existing with empty)
                if (prescribed.length > 0) {
                  setPrescribedModules(prescribed)
                  storePrescribedModules(prescribed)
                }
              }
            }
          } catch (err) {
            console.error('[Tool Selection] Error fetching prescriptions:', err)
          }
        }
      } else {
        setPrescribedModules(prescribed)
        console.log('[Tool Selection] Loaded prescriptions from localStorage:', prescribed)
      }

      // Step 2: Load optional selections (savedSelected minus prescribedModules)
      let optional: ModuleKey[] = []
      
      // Try localStorage first
      const savedLocalTools = localStorage.getItem('onboarding_tools_data')
      if (savedLocalTools) {
        try {
          const parsed = JSON.parse(savedLocalTools)
          if (parsed.selectedTools && Array.isArray(parsed.selectedTools)) {
            // Normalize and filter out prescribed modules
            const normalized = normalizePrescribedModules(parsed.selectedTools)
            optional = normalized.filter(key => !prescribed.includes(key))
          }
        } catch (err) {
          console.error('Failed to restore saved tools:', err)
        }
      }
      
      // Fall back to savedTools from database
      if (optional.length === 0 && savedTools && savedTools.length > 0) {
        const normalized = normalizePrescribedModules(savedTools)
        optional = normalized.filter(key => !prescribed.includes(key))
      }
      
      // Step 3: Default fallback if no prescriptions and no optional selections
      if (prescribed.length === 0 && optional.length === 0) {
        optional = ['reputation_hub'].filter(isModuleKey)
      }
      
      // Pre-select prescribed modules (they can be deselected if user builds own solution)
      // Combine prescribed and optional for initial selection
      const initialSelection = Array.from(new Set([...prescribed, ...optional]))
      setOptionalSelected(initialSelection)
    }
    
    initialize()
  }, [savedTools, locationId])

  // Save optional selections to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('onboarding_tools_data', JSON.stringify({ selectedTools: optionalSelected }))
  }, [optionalSelected])

  // Handlers
  const toggleOptionalTool = (toolId: ModuleKey) => {
    // When building own solution, allow toggling any module
    // Otherwise, prevent toggling prescribed modules
    if (!buildOwnSolution && prescribedModules.includes(toolId)) {
      return
    }
    
    setOptionalSelected((prev) => {
      if (prev.includes(toolId)) {
        return prev.filter((id) => id !== toolId)
      } else {
        return [...prev, toolId]
      }
    })
  }

  const handleContinue = async () => {
    // Combine prescribed and optional, ensuring uniqueness
    // If building own solution, only use optionalSelected
    const finalTools = buildOwnSolution
      ? Array.from(new Set(optionalSelected))
      : Array.from(new Set([...prescribedModules, ...optionalSelected]))
    
    if (finalTools.length === 0) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        throw new Error('User not authenticated')
      }

      // Save to database as snake_case ModuleKey[] only
      const locationUpdateData: BusinessLocationUpdate = {
        enabled_tools: finalTools,
      }
      const { error: updateError } = await (supabase as any)
        .from('business_locations')
        .update(locationUpdateData)
        .eq('id', locationId)

      if (updateError) {
        throw updateError
      }

      // Clear onboarding localStorage data
      localStorage.removeItem('onboarding_business_data')
      localStorage.removeItem('onboarding_tools_data')
      localStorage.removeItem('onboarding_prescribed_modules')

      // Redirect to review request step (don't mark onboarding as completed yet)
      router.push('/onboarding/review')
    } catch (err: any) {
      console.error('Failed to save tools:', err)
      setError(err.message || 'Failed to save tool selection')
      setLoading(false)
    }
  }

  const handleBack = () => {
    setGoingBack(true)
    router.push('/onboarding/analysis?allowBack=true')
  }

  // Compute available modules
  const { availablePrescribed, availableOptional, hasPrescriptions } = useMemo(() => {
    const allModuleKeys = getAllModuleKeys()
    
    // Filter out coming soon modules
    const availableModuleKeys = allModuleKeys.filter((key) => {
      const module = getModuleInfo(key)
      return !module.comingSoon
    })
    
    // If building own solution, treat all as optional (no prescribed)
    if (buildOwnSolution) {
      return {
        availablePrescribed: [],
        availableOptional: availableModuleKeys,
        hasPrescriptions: false,
      }
    }
    
    // Filter prescribed modules to only include those in our registry and not coming soon
    const prescribed: ModuleKey[] = prescribedModules.filter(isModuleKey).filter((key) => {
      const module = getModuleInfo(key)
      return !module.comingSoon
    })
    
    // Optional modules = all available modules minus prescribed
    const optional: ModuleKey[] = availableModuleKeys.filter((key) => !prescribed.includes(key))


    return {
      availablePrescribed: prescribed,
      availableOptional: optional,
      hasPrescriptions: prescribed.length > 0, // Use availablePrescribed length, not raw state
    }
  }, [prescribedModules, buildOwnSolution])


  // Render
  // Ensure this component always returns properly styled JSX (no early returns that skip styling)
  return (
    <div className="onboarding-page">
      <button
        onClick={handleBack}
        disabled={goingBack}
        className="flex items-center gap-2 text-[var(--google-grey-600)] hover:text-[var(--google-grey-900)] mb-6 transition-all duration-150 active:scale-95 active:opacity-70 disabled:opacity-70 disabled:cursor-not-allowed"
        style={{ fontFamily: 'var(--font-roboto-stack)' }}
      >
        <ArrowBackIcon sx={{ fontSize: 20 }} />
        <span className="text-sm font-medium">{goingBack ? 'Going back...' : 'Back'}</span>
      </button>

      <h1 className="text-2xl lg:text-3xl font-medium mb-3 text-[var(--google-grey-900)]" style={{ fontFamily: 'var(--font-google-sans)' }}>
        {buildOwnSolution ? 'Your setup' : (hasPrescriptions ? 'Your recommended setup' : 'Your setup')}
      </h1>
      <p className="text-base text-[var(--google-grey-600)] mb-8" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
        {buildOwnSolution
          ? 'Deselect any tools you don\'t want. You can change this later in Settings → Tools.'
          : (hasPrescriptions
            ? 'Based on your channel diagnosis, we\'ve selected the tools that will move the needle first.'
            : 'Pick what you\'d like to start with. You can change this later in Settings → Tools.')}
      </p>

      <div className="space-y-8">
        {/* Prescribed Modules Section */}
            {!buildOwnSolution && hasPrescriptions && availablePrescribed.length > 0 && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {availablePrescribed.map((moduleKey) => {
                const module = getModuleInfo(moduleKey)
                return (
                  <div
                    key={moduleKey}
                    className="w-full p-5 rounded-lg border-2 border-[#1565B4] bg-[#EDF5FD] relative cursor-default"
                  >
                    <div className="flex items-start gap-3">
                      {/* Locked checkbox indicator - always checked, disabled */}
                      <div className="mt-0.5 w-5 h-5 rounded border-2 border-[#1565B4] bg-[#1565B4] flex items-center justify-center flex-shrink-0">
                        <LockIcon sx={{ fontSize: 12, color: 'white' }} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-semibold text-[var(--google-grey-900)]" style={{ fontFamily: 'var(--font-google-sans)' }}>
                            {module.name}
                          </h3>
                          <span className="text-xs font-medium text-[var(--google-grey-600)] px-2 py-0.5 rounded bg-[var(--google-grey-100)]" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                            {module.category}
                          </span>
                          <span
                            className="text-xs font-medium text-[#1565B4] px-2 py-0.5 rounded-full bg-blue-100 border border-blue-200 flex items-center gap-1"
                            style={{ fontFamily: 'var(--font-roboto-stack)' }}
                            title="Included from your Channel Analysis"
                          >
                            <LockIcon sx={{ fontSize: 10 }} />
                            Included
                          </span>
                        </div>
                        <ul className="space-y-1.5 mt-2">
                          {module.bullets.map((bullet, idx) => {
                            // Strip leading "• " if present to avoid double bullets
                            const cleanBullet = bullet.replace(/^•\s*/, '')
                            return (
                              <li key={idx} className="text-sm text-[var(--google-grey-700)] flex items-start gap-2" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                <span className="text-[#1565B4] mt-1">•</span>
                                <span>{cleanBullet}</span>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Optional Modules Section */}
        {(buildOwnSolution ? availableOptional.length > 0 : availableOptional.length > 0) && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-[var(--google-grey-900)] mb-1" style={{ fontFamily: 'var(--font-google-sans)' }}>
                {buildOwnSolution ? 'Choose your tools' : 'Add more tools (optional)'}
              </h2>
              <p className="text-sm text-[var(--google-grey-600)]" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                You can always add/remove tools later in Settings → Tools.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {availableOptional.map((moduleKey) => {
                const module = getModuleInfo(moduleKey)
                const isSelected = optionalSelected.includes(moduleKey)
                return (
                  <button
                    key={moduleKey}
                    onClick={() => toggleOptionalTool(moduleKey)}
                    className={`w-full text-left p-5 rounded-lg border-2 transition-all ${
                      isSelected
                        ? 'border-[#1565B4] bg-[#EDF5FD]'
                        : 'border-[var(--google-grey-300)] bg-white hover:border-[var(--google-grey-400)]'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                          isSelected
                            ? 'border-[#1565B4] bg-[#1565B4]'
                            : 'border-[var(--google-grey-400)] bg-white'
                        }`}
                      >
                        {isSelected && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-[var(--google-grey-900)]" style={{ fontFamily: 'var(--font-google-sans)' }}>
                            {module.name}
                          </h3>
                          <span className="text-xs font-medium text-[var(--google-grey-600)] px-2 py-0.5 rounded bg-[var(--google-grey-100)]" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                            {module.category}
                          </span>
                        </div>
                        <ul className="space-y-1.5 mt-2">
                          {module.bullets.map((bullet, idx) => {
                            // Strip leading "• " if present to avoid double bullets
                            const cleanBullet = bullet.replace(/^•\s*/, '')
                            return (
                              <li key={idx} className="text-sm text-[var(--google-grey-700)] flex items-start gap-2" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                <span className="text-[#1565B4] mt-1">•</span>
                                <span>{cleanBullet}</span>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* No optional modules message (only if no prescriptions) */}
        {!hasPrescriptions && availableOptional.length === 0 && (
          <div className="rounded-lg bg-slate-100 border border-slate-200 p-4">
            <p className="text-sm text-slate-700" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
              No tools available. Please contact support.
            </p>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200">
            <p className="text-sm text-red-700" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
              {error}
            </p>
          </div>
        )}

        <div className="mt-6 relative">
          <Button
            variant="primary"
            size="md"
            onClick={handleContinue}
            disabled={(buildOwnSolution ? optionalSelected.length === 0 : (prescribedModules.length === 0 && optionalSelected.length === 0)) || loading}
          >
            {loading ? 'Loading...' : 'Continue'}
          </Button>
          {hasPrescriptions && !buildOwnSolution && (
            <button
              onClick={() => {
                // When switching to build own solution, ensure prescribed modules are in optionalSelected
                setOptionalSelected((prev) => {
                  const combined = Array.from(new Set([...prescribedModules, ...prev]))
                  return combined
                })
                setBuildOwnSolution(true)
              }}
              className="absolute right-0 top-0 text-sm text-[var(--google-grey-600)] hover:text-[var(--google-grey-900)] underline transition-colors"
              style={{ fontFamily: 'var(--font-roboto-stack)' }}
            >
              Build your own solution
            </button>
          )}
        </div>

      </div>
    </div>
  )
}
