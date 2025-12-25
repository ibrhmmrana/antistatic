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
        {/* Header + Tabs - Fixed height, no scroll */}
        <div className="shrink-0 bg-white border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
            <h1 className="text-2xl font-semibold text-slate-900 mb-6" style={{ fontFamily: 'var(--font-google-sans)' }}>
              Reputation Hub
            </h1>
            
            {/* Tabs */}
            <div className="flex gap-1 border-b border-slate-200">
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

