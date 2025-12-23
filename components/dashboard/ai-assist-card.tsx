'use client'

import Link from 'next/link'

const cardBase =
  'rounded-lg border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between min-h-[170px]'

export function AiAssistCard() {
  return (
    <div className={cardBase}>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
          Antistatic AI
        </p>
        <h2 className="mt-2 text-sm font-semibold text-slate-900" style={{ fontFamily: 'var(--font-google-sans)' }}>
          Let AI handle the busywork
        </h2>
        <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-slate-600" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
          <li>Auto-reply to new reviews</li>
          <li>Draft social posts for your channels</li>
          <li>Set alerts for competitors and key topics</li>
        </ul>
      </div>
      <Link
        href="/automations"
        className="mt-4 inline-flex items-center self-start rounded-full bg-sky-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-sky-700 transition-colors"
        style={{ fontFamily: 'var(--font-roboto-stack)' }}
      >
        Open automations
      </Link>
    </div>
  )
}

