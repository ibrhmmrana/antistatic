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
            {/* Second quarter - randomized */}
            <div className="absolute left-[32%] top-4 flex flex-col gap-3">
              <span
                className="h-7 w-9 bg-[#34A853] opacity-80"
                style={{ borderRadius: '60% 40% 55% 45% / 55% 45% 60% 40%' }}
              />
              <span
                className="h-3 w-5 bg-[#EA4335] opacity-85 translate-x-4"
                style={{ borderRadius: '70% 30% 60% 40% / 60% 40% 40% 60%' }}
              />
            </div>

            {/* Second quarter - circle between blobs */}
            <div className="absolute left-[35%] top-16">
              <svg
                viewBox="0 0 100 100"
                className="h-14 w-14 text-[#34A853] opacity-45"
                aria-hidden="true"
              >
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray="5 5"
                />
              </svg>
            </div>

            {/* Second quarter - randomized */}
            <div className="absolute left-[38%] bottom-2 flex flex-col gap-2">
              <span
                className="h-4 w-6 bg-[#4285F4] opacity-55"
                style={{ borderRadius: '55% 45% 60% 40% / 50% 50% 45% 55%' }}
              />
              <span
                className="h-3 w-5 bg-[#EA4335] opacity-70 translate-x-3"
                style={{ borderRadius: '65% 35% 50% 50% / 60% 40% 55% 45%' }}
              />
            </div>

            {/* Third quarter - triangle with blobs around it */}
            <div className="absolute left-[58%] top-12">
              <svg
                viewBox="0 0 100 100"
                className="h-16 w-16 text-[#EA4335] opacity-50"
                aria-hidden="true"
              >
                <polygon
                  points="50,10 90,80 10,80"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray="3 3"
                />
              </svg>
            </div>

            {/* Blobs around triangle */}
            <div className="absolute left-[54%] top-8">
              <span
                className="h-4 w-6 bg-[#FBBC05] opacity-70"
                style={{ borderRadius: '55% 45% 60% 40% / 50% 50% 45% 55%' }}
              />
            </div>
            <div className="absolute left-[62%] top-10">
              <span
                className="h-3 w-5 bg-[#4285F4] opacity-65"
                style={{ borderRadius: '60% 40% 55% 45% / 50% 50% 60% 40%' }}
              />
            </div>
            <div className="absolute left-[56%] top-20">
              <span
                className="h-5 w-7 bg-[#34A853] opacity-60"
                style={{ borderRadius: '50% 50% 45% 55% / 60% 40% 50% 50%' }}
              />
            </div>
            <div className="absolute left-[60%] top-22">
              <span
                className="h-3 w-4 bg-[#EA4335] opacity-75"
                style={{ borderRadius: '65% 35% 50% 50% / 60% 40% 55% 45%' }}
              />
            </div>

            {/* Fourth quarter - randomized */}
            <div className="absolute left-[72%] top-20 flex gap-2">
              <span
                className="h-5 w-7 bg-[#FBBC05] opacity-75"
                style={{ borderRadius: '50% 50% 45% 55% / 60% 40% 50% 50%' }}
              />
              <span
                className="h-4 w-6 bg-[#34A853] opacity-65 -translate-y-1"
                style={{ borderRadius: '60% 40% 55% 45% / 50% 50% 60% 40%' }}
              />
            </div>

            {/* Fourth quarter - randomized */}
            <div className="absolute left-[82%] top-2 flex flex-col items-center gap-2">
              <span
                className="h-8 w-11 bg-[#4285F4] opacity-60"
                style={{ borderRadius: '55% 45% 65% 35% / 50% 60% 40% 50%' }}
              />
              <span
                className="h-4 w-6 bg-[#FBBC05] opacity-90 -translate-x-4"
                style={{ borderRadius: '65% 35% 45% 55% / 55% 45% 50% 50%' }}
              />
            </div>

            {/* Fourth quarter - randomized */}
            <div className="absolute left-[76%] top-16 flex flex-col items-end gap-3">
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

            {/* Third quarter - randomized */}
            <div className="absolute left-[65%] top-4">
              <span
                className="h-6 w-9 bg-[#FBBC05] opacity-60"
                style={{ borderRadius: '45% 55% 50% 50% / 55% 45% 60% 40%' }}
              />
            </div>

            {/* Fourth quarter - randomized */}
            <div className="absolute left-[84%] bottom-2 flex gap-3">
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

