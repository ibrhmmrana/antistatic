'use client'

import type { FacebookSignal } from '@/lib/social/facebook-signals'

interface BigUnlockCardProps {
  signal: FacebookSignal
}

export function BigUnlockCard({ signal }: BigUnlockCardProps) {
  return (
    <div className="rounded-xl border-2 border-slate-300 bg-gradient-to-br from-blue-50 to-indigo-50 p-6 shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
          Your biggest missed opportunity
        </h3>
        <p className="text-base text-slate-700 leading-relaxed" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
          {signal.summary}
        </p>
      </div>
      
      <div className="space-y-2">
        {signal.proofBullets.map((bullet, idx) => (
          <div key={idx} className="flex items-start gap-3 text-sm">
            <span className="text-slate-400 mt-0.5">•</span>
            <div className="flex-1">
              <span className="font-semibold text-slate-900" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                {bullet.label}:
              </span>
              <span className="text-slate-700 ml-2" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                {typeof bullet.value === 'number' ? bullet.value.toLocaleString() : bullet.value}
              </span>
              <span className="text-slate-500 ml-2 italic" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                ({bullet.meaning})
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

