'use client'

import Link from 'next/link'

const cardBase =
  'rounded-lg border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between min-h-[170px]'

interface BusinessSummaryCardProps {
  businessName: string
  rating: number | null
  connectedProviders: string[]
}

export function BusinessSummaryCard({
  businessName,
  rating,
  connectedProviders,
}: BusinessSummaryCardProps) {
  const locationsCount = 1 // TODO: Get from database
  const connectedChannels = connectedProviders
    .map((p) => {
      if (p === 'google_gbp') return 'Google'
      if (p === 'linkedin') return 'LinkedIn'
      return null
    })
    .filter(Boolean) as string[]

  return (
    <div className={cardBase}>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
          Your business
        </p>
        <h2 className="mt-2 text-sm font-semibold text-slate-900" style={{ fontFamily: 'var(--font-google-sans)' }}>
          {businessName}
        </h2>
        <dl className="mt-3 space-y-1 text-xs text-slate-600" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
          <div className="flex justify-between">
            <dt>Locations</dt>
            <dd>{locationsCount}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Connected channels</dt>
            <dd>{connectedChannels.length > 0 ? connectedChannels.join(', ') : 'None'}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Google rating</dt>
            <dd>{rating ? `${rating.toFixed(1)}★` : '—'}</dd>
          </div>
        </dl>
      </div>
      <div className="mt-4 flex gap-3 text-xs font-medium">
        <Link
          href="/listings"
          className="text-sky-700 hover:underline"
          style={{ fontFamily: 'var(--font-roboto-stack)' }}
        >
          Manage locations
        </Link>
        <Link
          href="/settings/channels"
          className="text-sky-700 hover:underline"
          style={{ fontFamily: 'var(--font-roboto-stack)' }}
        >
          Manage channels
        </Link>
      </div>
    </div>
  )
}

