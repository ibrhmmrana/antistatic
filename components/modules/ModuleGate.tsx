'use client'

import { ReactNode, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import LockIcon from '@mui/icons-material/Lock'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'
import { type ModuleKey, MODULES } from '@/lib/onboarding/module-registry'
import { getEnabledToolsForSidebar } from '@/lib/modules/enabled'

interface ModuleGateProps {
  requiredModule: ModuleKey
  children: ReactNode
}

export function ModuleGate({ requiredModule, children }: ModuleGateProps) {
  const router = useRouter()
  const [enabledTools, setEnabledTools] = useState<ModuleKey[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getEnabledToolsForSidebar()
      .then((tools) => {
        setEnabledTools(tools)
        setLoading(false)
      })
      .catch((error) => {
        console.error('[ModuleGate] Failed to fetch enabled tools:', error)
        setEnabledTools(['reputation_hub']) // Default fallback
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-slate-500">Loading...</div>
      </div>
    )
  }

  const isEnabled = enabledTools.includes(requiredModule)
  const moduleInfo = MODULES[requiredModule]

  if (!isEnabled) {
    return (
      <div className="flex items-center justify-center min-h-[400px] bg-white">
        <div className="max-w-md mx-auto text-center px-6 py-12">
          <div className="mb-6">
            <LockIcon sx={{ fontSize: 64, color: '#9aa0a6' }} />
          </div>
          <h2 className="text-2xl font-semibold text-slate-900 mb-3" style={{ fontFamily: 'var(--font-google-sans)' }}>
            Module Locked: {moduleInfo?.name || 'Module'}
          </h2>
          <div className="text-slate-600 mb-6 space-y-2" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
            <p>
              <strong>What it does:</strong> {moduleInfo?.tagline || moduleInfo?.bullets[0] || 'Module description'}
            </p>
            <p>
              <strong>Why locked:</strong> Not enabled for this workspace yet.
            </p>
            <p>
              <strong>Unlock:</strong> Go to Settings → Tools to enable this module.
            </p>
          </div>
          <Link
            href="/settings"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#1a73e8] text-white rounded-md hover:bg-[#1557b0] transition-colors"
            style={{ fontFamily: 'var(--font-google-sans)' }}
          >
            <SettingsOutlinedIcon sx={{ fontSize: 20 }} />
            Go to Settings
          </Link>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

