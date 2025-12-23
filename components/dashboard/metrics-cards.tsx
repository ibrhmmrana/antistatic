'use client'

import Link from 'next/link'
import StarIcon from '@mui/icons-material/Star'
import ForumIcon from '@mui/icons-material/Forum'
import CampaignIcon from '@mui/icons-material/Campaign'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'

interface MetricsCardsProps {
  rating: number | null
  reviewCount: number | null
}

interface MetricCard {
  title: string
  value: string
  subtext: string
  chip?: {
    label: string
    value: string
  }
  cta: {
    label: string
    href: string
  }
  icon: React.ReactNode
}

export function MetricsCards({ rating, reviewCount }: MetricsCardsProps) {
  // TODO: Replace with real data once integrations are wired up
  const metrics: MetricCard[] = [
    {
      title: 'Reviews',
      value: rating ? `${rating.toFixed(1)}` : '—',
      subtext: 'Average rating on Google',
      chip: {
        label: 'New reviews (last 30 days):',
        value: '0', // TODO: Get from reviews API
      },
      cta: {
        label: 'View reviews',
        href: '/reviews',
      },
      icon: <StarIcon sx={{ fontSize: 24, color: '#fbbf24' }} />,
    },
    {
      title: 'Inbox',
      value: '0', // TODO: Get from messaging API
      subtext: 'Open conversations across reviews & messages',
      cta: {
        label: 'Open inbox',
        href: '/messaging',
      },
      icon: <ForumIcon sx={{ fontSize: 24, color: '#1a73e8' }} />,
    },
    {
      title: 'Social',
      value: '0', // TODO: Get from social API
      subtext: 'Scheduled or published AI posts (this week)',
      cta: {
        label: 'Go to Social',
        href: '/social',
      },
      icon: <CampaignIcon sx={{ fontSize: 24, color: '#34a853' }} />,
    },
  ]

  return (
    <>
      {metrics.map((metric) => (
        <div
          key={metric.title}
          className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2">
              {metric.icon}
              <h3 className="text-sm font-medium text-[var(--google-grey-700)]" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                {metric.title}
              </h3>
            </div>
          </div>

          <div className="mb-3">
            <div className="text-3xl font-medium text-[var(--google-grey-900)] mb-1" style={{ fontFamily: 'var(--font-google-sans)' }}>
              {metric.value}
            </div>
            <p className="text-sm text-[var(--google-grey-600)]" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
              {metric.subtext}
            </p>
          </div>

          {metric.chip && (
            <div className="mb-4 pb-4 border-b border-[var(--google-grey-200)]">
              <div className="text-xs text-[var(--google-grey-600)] mb-1" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                {metric.chip.label}
              </div>
              <div className="text-lg font-medium text-[var(--google-grey-900)]" style={{ fontFamily: 'var(--font-google-sans)' }}>
                {metric.chip.value}
              </div>
            </div>
          )}

          <Link
            href={metric.cta.href}
            className="inline-flex items-center gap-1 text-sm font-medium text-[#1a73e8] hover:underline"
            style={{ fontFamily: 'var(--font-roboto-stack)' }}
          >
            {metric.cta.label}
            <ArrowForwardIcon sx={{ fontSize: 16 }} />
          </Link>
        </div>
      ))}
    </>
  )
}

