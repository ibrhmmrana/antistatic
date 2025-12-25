'use client'

import { useState } from 'react'
import { ModuleGate } from '@/components/modules/ModuleGate'
import { RespondTab } from './RespondTab'
import { GenerateTab } from './GenerateTab'
import { LearnTab } from './LearnTab'

interface ReputationHubPageProps {
  businessLocationId: string
  businessName: string
}

export function ReputationHubPage({ businessLocationId, businessName }: ReputationHubPageProps) {
  const [activeTab, setActiveTab] = useState<'respond' | 'generate' | 'learn'>('respond')

  return (
    <ModuleGate requiredModule="reputation_hub">
      <div className="h-screen overflow-hidden flex flex-col bg-white -mt-14 md:-mt-16 pt-14 md:pt-16">
        {/* Header + Tabs - Fixed height, no scroll with decorative background */}
        <div className="shrink-0 relative bg-[#F1F3F4] border-b border-slate-200 overflow-hidden">
          {/* Decorative background pattern */}
          <div className="pointer-events-none absolute inset-0 hidden md:block z-0">
            {/* Top-left cluster */}
            <div className="absolute left-10 top-6 flex flex-col gap-3">
              <span
                className="h-7 w-9 bg-[#34A853] opacity-80"
                style={{ borderRadius: '60% 40% 55% 45% / 55% 45% 60% 40%' }}
              />
              <span
                className="h-3 w-5 bg-[#EA4335] opacity-85 translate-x-4"
                style={{ borderRadius: '70% 30% 60% 40% / 60% 40% 40% 60%' }}
              />
            </div>

            {/* High center cluster */}
            <div className="absolute left-1/2 -translate-x-1/2 top-2 flex flex-col items-center gap-2">
              <span
                className="h-8 w-11 bg-[#4285F4] opacity-60"
                style={{ borderRadius: '55% 45% 65% 35% / 50% 60% 40% 50%' }}
              />
              <span
                className="h-4 w-6 bg-[#FBBC05] opacity-90 -translate-x-4"
                style={{ borderRadius: '65% 35% 45% 55% / 55% 45% 50% 50%' }}
              />
            </div>

            {/* Right cluster with diamond + blob */}
            <div className="absolute right-12 top-10 flex flex-col items-end gap-3">
              <svg
                viewBox="0 0 120 80"
                className="h-20 w-20 text-[#4285F4] opacity-70"
                aria-hidden="true"
              >
                <polygon
                  points="60,5 110,40 60,75 10,40"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray="4 4"
                />
              </svg>
              <span
                className="h-6 w-8 bg-[#34A853] opacity-90 -translate-y-2 translate-x-3"
                style={{ borderRadius: '50% 60% 45% 55% / 60% 40% 55% 45%' }}
              />
            </div>

            {/* Lower-right mini cluster */}
            <div className="absolute right-32 bottom-6 flex gap-3">
              <span
                className="h-3 w-4 bg-[#EA4335] opacity-70 translate-y-2"
                style={{ borderRadius: '65% 35% 60% 40% / 50% 50% 45% 55%' }}
              />
              <span
                className="h-5 w-7 bg-[#4285F4] opacity-40"
                style={{ borderRadius: '55% 45% 50% 50% / 60% 40% 55% 45%' }}
              />
            </div>
          </div>

          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-6">
            <h1 className="text-2xl font-semibold text-slate-900 mb-6" style={{ fontFamily: 'var(--font-google-sans)' }}>
              Reputation Hub
            </h1>
            
            {/* Tabs */}
            <div className="flex gap-1">
              <button
                onClick={() => setActiveTab('respond')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'respond'
                    ? 'text-[#1a73e8] border-b-2 border-[#1a73e8]'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                style={{ fontFamily: 'var(--font-google-sans)' }}
              >
                Respond
              </button>
              <button
                onClick={() => setActiveTab('generate')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'generate'
                    ? 'text-[#1a73e8] border-b-2 border-[#1a73e8]'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                style={{ fontFamily: 'var(--font-google-sans)' }}
              >
                Generate
              </button>
              <button
                onClick={() => setActiveTab('learn')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'learn'
                    ? 'text-[#1a73e8] border-b-2 border-[#1a73e8]'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                style={{ fontFamily: 'var(--font-google-sans)' }}
              >
                Learn
              </button>
            </div>
          </div>
        </div>

        {/* Tab Content - Flex-1, fills remaining space, scrolls internally */}
        <div className="flex-1 min-h-0 overflow-hidden bg-white">
          <div className="h-full max-w-7xl mx-auto px-4 sm:px-6 py-6">
            {activeTab === 'respond' && <RespondTab businessLocationId={businessLocationId} businessName={businessName} />}
            {activeTab === 'generate' && <GenerateTab businessLocationId={businessLocationId} />}
            {activeTab === 'learn' && <LearnTab businessLocationId={businessLocationId} />}
          </div>
        </div>
      </div>
    </ModuleGate>
  )
}

