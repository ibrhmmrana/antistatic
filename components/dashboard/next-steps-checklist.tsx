'use client'

import Link from 'next/link'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'

interface NextStepsChecklistProps {
  enabledTools: string[]
  connectedProviders: string[]
}

interface ChecklistItem {
  id: string
  label: string
  isComplete: boolean
  actionHref: string
  actionLabel: string
}

export function NextStepsChecklist({
  enabledTools,
  connectedProviders,
}: NextStepsChecklistProps) {
  const items: ChecklistItem[] = [
    {
      id: 'connect_gbp',
      label: 'Connect Google Business Profile',
      isComplete: connectedProviders.includes('google_gbp'),
      actionHref: '/onboarding/connect',
      actionLabel: 'Connect',
    },
    {
      id: 'connect_linkedin',
      label: 'Connect LinkedIn',
      isComplete: connectedProviders.includes('linkedin'),
      actionHref: '/onboarding/connect',
      actionLabel: 'Connect',
    },
    {
      id: 'choose_tools',
      label: 'Choose your tools',
      isComplete: enabledTools.length > 0,
      actionHref: '/onboarding/tools',
      actionLabel: 'Manage',
    },
    {
      id: 'configure_templates',
      label: 'Configure review reply templates',
      isComplete: false, // Always false for now
      actionHref: '/settings/templates',
      actionLabel: 'Configure',
    },
    {
      id: 'invite_teammate',
      label: 'Invite a teammate',
      isComplete: false, // Always false for now
      actionHref: '/settings/team',
      actionLabel: 'Invite',
    },
  ]

  const completedCount = items.filter((item) => item.isComplete).length

  return (
    <div className="rounded-2xl bg-white shadow-sm border border-[var(--google-grey-200)] p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-[var(--google-grey-900)]" style={{ fontFamily: 'var(--font-google-sans)' }}>
          Set up Antistatic to work for you
        </h2>
        {completedCount > 0 && (
          <span className="text-sm text-[var(--google-grey-600)]" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
            {completedCount} of {items.length} completed
          </span>
        )}
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between p-3 rounded-lg hover:bg-[var(--google-grey-50)] transition-colors"
          >
            <div className="flex items-center gap-3 flex-1">
              {item.isComplete ? (
                <CheckCircleIcon sx={{ fontSize: 20, color: '#34a853' }} />
              ) : (
                <RadioButtonUncheckedIcon sx={{ fontSize: 20, color: 'var(--google-grey-400)' }} />
              )}
              <span
                className={`text-sm ${
                  item.isComplete
                    ? 'text-[var(--google-grey-600)] line-through'
                    : 'text-[var(--google-grey-900)]'
                }`}
                style={{ fontFamily: 'var(--font-roboto-stack)' }}
              >
                {item.label}
              </span>
            </div>
            <Link
              href={item.actionHref}
              className="inline-flex items-center gap-1 text-sm font-medium text-[#1a73e8] hover:underline"
              style={{ fontFamily: 'var(--font-roboto-stack)' }}
            >
              {item.actionLabel}
              <ArrowForwardIcon sx={{ fontSize: 16 }} />
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}













