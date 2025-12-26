'use client'

import { ReactNode } from 'react'

interface OnboardingLayoutProps {
  children: ReactNode
  currentStep?: 'business' | 'connect' | 'analysis' | 'tools' | 'review'
}

export function OnboardingLayout({
  children,
  currentStep = 'business',
}: OnboardingLayoutProps) {
  return (
    <div className="min-h-screen bg-[var(--google-grey-50)] flex">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-[var(--google-grey-200)] p-6 fixed top-0 left-0 h-screen overflow-y-auto z-10">
        <div className="text-sm font-medium text-[var(--google-grey-700)] mb-6" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
          Setup
        </div>
        <div className="space-y-1">
          <div className="text-xs font-medium text-[var(--google-grey-500)] mb-2" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
            Account
          </div>
          <div
            className={`px-3 py-2 rounded text-sm font-medium flex items-center gap-2 ${
              currentStep === 'business'
                ? 'bg-[#EDF5FD] text-[#3277DD]'
                : currentStep === 'connect' || currentStep === 'analysis' || currentStep === 'tools' || currentStep === 'review'
                ? 'text-[var(--google-grey-700)]'
                : 'text-[var(--google-grey-700)]'
            }`}
            style={{ fontFamily: 'var(--font-roboto-stack)' }}
          >
            {(currentStep === 'connect' || currentStep === 'analysis' || currentStep === 'tools' || currentStep === 'review') && (
              <span className="text-green-600 text-sm font-medium">✓</span>
            )}
            Business info
          </div>
          <div
            className={`px-3 py-2 rounded text-sm font-medium flex items-center gap-2 ${
              currentStep === 'connect'
                ? 'bg-[#EDF5FD] text-[#3277DD]'
                : currentStep === 'analysis' || currentStep === 'tools' || currentStep === 'review'
                ? 'text-[var(--google-grey-700)]'
                : 'text-[var(--google-grey-700)]'
            }`}
            style={{ fontFamily: 'var(--font-roboto-stack)' }}
          >
            {(currentStep === 'analysis' || currentStep === 'tools' || currentStep === 'review') && (
              <span className="text-green-600 text-sm font-medium">✓</span>
            )}
            Connect channels
          </div>
          <div
            className={`px-3 py-2 rounded text-sm font-medium flex items-center gap-2 ${
              currentStep === 'analysis'
                ? 'bg-[#EDF5FD] text-[#3277DD]'
                : currentStep === 'tools' || currentStep === 'review'
                ? 'text-[var(--google-grey-700)]'
                : 'text-[var(--google-grey-700)]'
            }`}
            style={{ fontFamily: 'var(--font-roboto-stack)' }}
          >
            {(currentStep === 'tools' || currentStep === 'review') && (
              <span className="text-green-600 text-sm font-medium">✓</span>
            )}
            Channel Analysis
          </div>
          <div
            className={`px-3 py-2 rounded text-sm font-medium flex items-center gap-2 ${
              currentStep === 'tools'
                ? 'bg-[#EDF5FD] text-[#3277DD]'
                : currentStep === 'review'
                ? 'text-[var(--google-grey-700)]'
                : 'text-[var(--google-grey-700)]'
            }`}
            style={{ fontFamily: 'var(--font-roboto-stack)' }}
          >
            {currentStep === 'review' && (
              <span className="text-green-600 text-sm font-medium">✓</span>
            )}
            Your setup
          </div>
          <div
            className={`px-3 py-2 rounded text-sm font-medium ${
              currentStep === 'review'
                ? 'bg-[#EDF5FD] text-[#3277DD]'
                : 'text-[var(--google-grey-700)]'
            }`}
            style={{ fontFamily: 'var(--font-roboto-stack)' }}
          >
            Try review request
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-8 lg:p-12 ml-64">
        {children}
      </div>
    </div>
  )
}

