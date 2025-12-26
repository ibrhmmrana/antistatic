'use client'

import { useState, useEffect } from 'react'
import { OverviewMetricCard } from './OverviewMetricCard'
import type { OverviewMetrics } from '@/lib/dashboard/get-overview-metrics'

interface TimePeriodMetricCardProps {
  title: string
  icon: React.ReactNode
  metricType: 'listings' | 'impressions' | 'callsAndWebsite' | 'reviews'
  businessLocationId: string
  initialData: {
    primary: string | number
    primaryLabel?: string
    delta?: {
      value: number
      label: string
    }
    secondaryMetric?: {
      value: string | number
      label: string
      delta?: {
        value: number
        label: string
      }
    }
    rating?: number
    chart?: {
      type: 'sparkline' | 'bars' | 'line' | 'barsWithLabels' | 'ratingLine'
      data: Array<{ x: string; y: number }>
      color?: string
      timePeriod?: number
    }
  }
  locked?: boolean
  lockedReason?: string
  titleTooltip?: string // Tooltip text to show on hover of the title
}

const TIME_PERIOD_OPTIONS = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
]

export function TimePeriodMetricCard({
  title,
  icon,
  metricType,
  businessLocationId,
  initialData,
  locked,
  lockedReason,
  titleTooltip,
}: TimePeriodMetricCardProps) {
  const [timePeriod, setTimePeriod] = useState('7')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(initialData)

  useEffect(() => {
    const fetchMetrics = async () => {
      if (locked) return

      setLoading(true)
      try {
        const response = await fetch(
          `/api/dashboard/metrics?businessLocationId=${businessLocationId}&timePeriod=${timePeriod}&metricType=${metricType}`
        )

        if (!response.ok) {
          console.error('[TimePeriodMetricCard] Failed to fetch metrics')
          return
        }

        const result = await response.json()
        
        // Extract the relevant metric data based on metricType
        if (metricType === 'listings') {
          const listings = result.metrics?.listings
          if (listings) {
            setData({
              primary: listings.directions7d || 0,
              primaryLabel: `direction requests (${timePeriod} days)`,
              delta: listings.directions7dPrev !== undefined
                ? {
                    value: listings.directions7dPrev,
                    label: 'requests',
                  }
                : undefined,
              chart: listings.series7d && listings.series7d.length > 0 ? {
                type: 'barsWithLabels' as const,
                data: listings.series7d,
                color: '#34a853',
                timePeriod: parseInt(timePeriod, 10),
              } : undefined,
            })
          }
        } else if (metricType === 'impressions') {
          const impressions = result.metrics?.impressions
          if (impressions) {
            setData({
              primary: (impressions.impressions7d ?? 0).toLocaleString(),
              primaryLabel: `impressions (${timePeriod} days)`,
              delta: impressions.impressions7dPrev !== undefined
                ? {
                    value: impressions.impressions7dPrev,
                    label: 'impressions',
                  }
                : undefined,
              chart: impressions.series7d && impressions.series7d.length > 0 ? {
                type: 'barsWithLabels' as const,
                data: impressions.series7d,
                color: '#4285f4',
                timePeriod: parseInt(timePeriod, 10),
              } : undefined,
            })
          }
        } else if (metricType === 'callsAndWebsite') {
          const callsAndWebsite = result.metrics?.callsAndWebsite
          if (callsAndWebsite) {
            setData({
              primary: (callsAndWebsite.calls7d ?? 0).toLocaleString(),
              primaryLabel: `calls (${timePeriod} days)`,
              delta: callsAndWebsite.calls7dPrev !== undefined
                ? {
                    value: callsAndWebsite.calls7dPrev,
                    label: 'calls',
                  }
                : undefined,
              secondaryMetric: {
                value: (callsAndWebsite.websiteClicks7d ?? 0).toLocaleString(),
                label: `website visits (${timePeriod} days)`,
                delta: callsAndWebsite.websiteClicks7dPrev !== undefined
                  ? {
                      value: callsAndWebsite.websiteClicks7dPrev,
                      label: 'visits',
                    }
                  : undefined,
              },
            })
          }
        } else if (metricType === 'reviews') {
          const reviews = result.metrics?.reviews
          if (reviews) {
            setData({
              primary: (reviews.reviews7d ?? 0).toLocaleString(),
              primaryLabel: `reviews (${timePeriod} days)`,
              delta: reviews.reviews7dPrev !== undefined
                ? {
                    value: reviews.reviews7dPrev,
                    label: 'reviews',
                  }
                : undefined,
              rating: reviews.overallRating > 0 ? reviews.overallRating : undefined,
              chart: reviews.series7d && reviews.series7d.length > 0 ? {
                type: 'barsWithLabels' as const,
                data: reviews.series7d,
                color: '#fbbf24',
                timePeriod: parseInt(timePeriod, 10),
              } : undefined,
            })
          }
        }
      } catch (error) {
        console.error('[TimePeriodMetricCard] Error fetching metrics:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchMetrics()
  }, [timePeriod, businessLocationId, metricType, locked])

  return (
    <OverviewMetricCard
      title={title}
      icon={icon}
      primary={data.primary}
      primaryLabel={data.primaryLabel}
      delta={data.delta}
      secondaryMetric={data.secondaryMetric}
      rating={data.rating}
      chart={data.chart ? {
        ...data.chart,
        timePeriod: parseInt(timePeriod, 10), // Pass time period to chart
      } : undefined}
      timePeriodOptions={TIME_PERIOD_OPTIONS}
      onTimePeriodChange={setTimePeriod}
      locked={locked}
      lockedReason={lockedReason}
      titleTooltip={titleTooltip}
      loading={loading}
    />
  )
}

