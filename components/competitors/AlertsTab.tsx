'use client'

interface AlertsTabProps {
  businessLocationId: string
}

export function AlertsTab({ businessLocationId }: AlertsTabProps) {
  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Alerts</h2>
      <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
        <p className="text-slate-500">Alerts feature coming soon</p>
        <p className="text-sm text-slate-400 mt-2">Get notified when competitors spike in reviews or post high-performing content</p>
      </div>
    </div>
  )
}


