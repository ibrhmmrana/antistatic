'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import LocalPharmacyIcon from '@mui/icons-material/LocalPharmacy'
import { getModules, type AntistaticModuleId } from '@/lib/modules/catalog'
import type { FacebookPrescription } from '@/lib/social/facebook-signals'

interface PrescriptionCardProps {
  prescription: FacebookPrescription
}

const moduleIdMap: Record<string, AntistaticModuleId> = {
  SOCIAL_STUDIO: 'socialStudio',
  INSIGHTS_LAB: 'insightsLab',
  PROFILE_MANAGER: 'profileManager',
  REPUTATION_HUB: 'reputationHub',
}

export function PrescriptionCard({ prescription }: PrescriptionCardProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, right: 0 })

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setTooltipPosition({
      top: rect.top - 8,
      right: window.innerWidth - rect.right,
    })
    setShowTooltip(true)
  }

  const handleMouseLeave = () => {
    setShowTooltip(false)
  }

  const antistaticModuleId = moduleIdMap[prescription.moduleId]
  const modules = antistaticModuleId ? getModules([antistaticModuleId]) : []
  const module = modules[0]

  const getModuleRoute = () => {
    switch (prescription.moduleId) {
      case 'SOCIAL_STUDIO':
        return '/social/studio'
      case 'INSIGHTS_LAB':
        return '/insights/lab'
      case 'PROFILE_MANAGER':
        return '/profile/manager'
      case 'REPUTATION_HUB':
        return '/reputation/hub'
      default:
        return '/dashboard'
    }
  }

  return (
    <>
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1">
            <div
              className="inline-flex items-center gap-2 rounded-full border-2 border-purple-500 bg-purple-50 px-3 py-1.5 text-sm font-semibold text-purple-700 cursor-help relative mb-3"
              style={{ fontFamily: 'var(--font-roboto-stack)' }}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              {LocalPharmacyIcon && <LocalPharmacyIcon sx={{ fontSize: 16 }} />}
              <span>{prescription.moduleName}</span>
            </div>
            <h4 className="text-base font-semibold text-slate-900 mb-2" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
              {prescription.outcome}
            </h4>
            <p className="text-sm text-slate-600" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
              {prescription.triggerEvidence}
            </p>
          </div>
        </div>
        
        <a
          href={getModuleRoute()}
          className="inline-flex items-center justify-center w-full px-4 py-2.5 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 transition-colors"
          style={{ fontFamily: 'var(--font-roboto-stack)' }}
        >
          Activate {prescription.moduleName}
        </a>
      </div>

      {showTooltip && typeof window !== 'undefined' && document?.body &&
        createPortal(
          <div
            className="fixed z-[9999] bg-white border border-slate-200 rounded-lg shadow-lg p-3 max-w-xs"
            style={{
              top: `${tooltipPosition.top}px`,
              right: `${tooltipPosition.right}px`,
              transform: 'translateY(-100%)',
              fontFamily: 'var(--font-roboto-stack)',
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <p className="text-sm font-semibold text-slate-900 mb-2">{prescription.moduleName}</p>
            <ul className="space-y-1.5">
              {prescription.tooltipBullets.map((bullet, idx) => (
                <li key={idx} className="text-xs text-slate-700 flex items-start gap-2">
                  <span className="text-slate-400 mt-0.5">•</span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </div>,
          document.body
        )}
    </>
  )
}


