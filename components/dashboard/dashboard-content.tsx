'use client'

import { MetricsCards } from './metrics-cards'
import { NextStepsChecklist } from './next-steps-checklist'

interface DashboardContentProps {
  firstName: string
  business: {
    name: string
    formatted_address: string | null
    rating: number | null
    review_count: number | null
    category: string | null
    website: string | null
  }
  enabledTools: string[]
  connectedProviders: string[]
}

export function DashboardContent({
  firstName,
  business,
  enabledTools,
  connectedProviders,
}: DashboardContentProps) {
  return (
    <>
      {/* HERO - Full width grey background */}
      <section className="relative w-full bg-[#F1F3F4] border-b border-slate-200 overflow-hidden">

        {/* Inner content container - centered and constrained */}
        <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 py-8">
          <header className="mb-5 pt-12">
            <h1 className="tracking-tight text-slate-900" style={{ fontFamily: 'var(--font-google-sans)', fontSize: '36px', fontWeight: 400 }}>
              Welcome, {firstName}
            </h1>
            <p className="mt-1 text-sm text-slate-600" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
              Here's how {business.name || 'your business'} is doing this week.
            </p>
          </header>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MetricsCards
              rating={business.rating}
              reviewCount={business.review_count}
            />
          </div>
        </div>

        {/* Decorative background pattern */}
        <div className="pointer-events-none absolute inset-0 hidden md:block z-0">
          {/* Top-left cluster, away from heading */}
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

          {/* High center cluster, above heading zone */}
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

          {/* Lower-right mini cluster, outside text/cards area */}
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
      </section>

      {/* MAIN CONTENT BELOW - white background */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="space-y-6 py-8">
          {/* Next Steps Checklist */}
          <NextStepsChecklist
            enabledTools={enabledTools}
            connectedProviders={connectedProviders}
          />
        </div>
      </div>
    </>
  )
}

