'use client'

import Link from 'next/link'

const cardBase =
  'rounded-lg border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between min-h-[170px]'

export function PlanCard() {
  // TODO: Wire up to real billing data
  const locationsConnected = 1 // Placeholder
  const trialDaysRemaining = 14 // Placeholder

  return (
    <div className={cardBase}>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
          Your Antistatic plan
        </p>
        <h2 className="mt-2 text-sm font-semibold text-slate-900" style={{ fontFamily: 'var(--font-google-sans)' }}>
          You're in Free Trial
        </h2>
        <p className="mt-2 text-xs text-slate-600" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
          {locationsConnected} of 3 locations connected • Trial ends in {trialDaysRemaining} days
        </p>
      </div>
      <div className="mt-4 flex gap-3 text-xs">
        <Link
          href="/settings/billing"
          className="rounded-full bg-sky-600 px-3 py-1 font-medium text-white hover:bg-sky-700 transition-colors"
          style={{ fontFamily: 'var(--font-roboto-stack)' }}
        >
          Manage billing
        </Link>
        <Link
          href="/settings/billing"
          className="font-medium text-sky-700 hover:underline"
          style={{ fontFamily: 'var(--font-roboto-stack)' }}
        >
          Change plan
        </Link>
      </div>
    </div>
  )
}

