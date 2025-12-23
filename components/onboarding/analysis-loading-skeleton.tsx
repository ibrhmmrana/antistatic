'use client'

/**
 * Loading skeleton for analysis sections
 * Shows animated placeholders while analysis data is being fetched
 */
export function AnalysisLoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="space-y-3">
        <div className="h-8 bg-slate-200 rounded-lg w-3/4"></div>
        <div className="h-4 bg-slate-200 rounded w-1/2"></div>
      </div>

      {/* Metrics/KPI cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="h-4 bg-slate-200 rounded w-2/3 mb-2"></div>
            <div className="h-8 bg-slate-200 rounded w-1/2 mb-1"></div>
            <div className="h-3 bg-slate-200 rounded w-1/3"></div>
          </div>
        ))}
      </div>

      {/* Content cards skeleton */}
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-lg border border-slate-200 p-6">
            <div className="h-6 bg-slate-200 rounded w-2/3 mb-4"></div>
            <div className="space-y-2 mb-4">
              <div className="h-4 bg-slate-200 rounded w-full"></div>
              <div className="h-4 bg-slate-200 rounded w-5/6"></div>
              <div className="h-4 bg-slate-200 rounded w-4/6"></div>
            </div>
            <div className="flex gap-2">
              <div className="h-6 bg-slate-200 rounded-full w-24"></div>
              <div className="h-6 bg-slate-200 rounded-full w-24"></div>
            </div>
          </div>
        ))}
      </div>

      {/* Chart placeholder skeleton */}
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <div className="h-6 bg-slate-200 rounded w-1/3 mb-4"></div>
        <div className="h-64 bg-slate-100 rounded"></div>
      </div>
    </div>
  )
}

