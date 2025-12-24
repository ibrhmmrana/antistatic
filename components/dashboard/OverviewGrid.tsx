'use client'

import { OverviewMetricCard } from './OverviewMetricCard'
import { TimePeriodMetricCard } from './TimePeriodMetricCard'
import StarIcon from '@mui/icons-material/Star'
import PinDropIcon from '@mui/icons-material/PinDrop'
import ForumIcon from '@mui/icons-material/Forum'
import CampaignIcon from '@mui/icons-material/Campaign'
import VisibilityIcon from '@mui/icons-material/Visibility'
import ThumbUpIcon from '@mui/icons-material/ThumbUp'
import { type OverviewMetrics } from '@/lib/dashboard/get-overview-metrics'
import { type ModuleKey } from '@/lib/onboarding/module-registry'
import { getModuleInfo } from '@/lib/onboarding/module-registry'

interface OverviewGridProps {
  overviewMetrics: OverviewMetrics
  enabledTools: ModuleKey[]
  businessLocationId: string
}

export function OverviewGrid({ overviewMetrics, enabledTools, businessLocationId }: OverviewGridProps) {
  const isModuleEnabled = (moduleKey: ModuleKey) => enabledTools.includes(moduleKey)

  // Row 1: Reviews | Listings | New Leads
  const reviewsEnabled = isModuleEnabled('reputation_hub')
  const listingsEnabled = isModuleEnabled('profile_manager')
  const newLeadsEnabled = isModuleEnabled('insights_lab')

  // Row 2: Inbox | Social | Visibility
  const inboxEnabled = isModuleEnabled('reputation_hub') // Same as reviews
  const socialEnabled = isModuleEnabled('social_studio')
  const visibilityEnabled = isModuleEnabled('insights_lab')

  const reviewsModule = getModuleInfo('reputation_hub')
  const listingsModule = getModuleInfo('profile_manager')
  const insightsModule = getModuleInfo('insights_lab')
  const socialModule = getModuleInfo('social_studio')

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 auto-rows-fr">
      {/* Row 1, Col 1: Reviews */}
      <OverviewMetricCard
        title="Reviews"
        icon={<StarIcon sx={{ fontSize: 20, color: '#fbbf24' }} />}
        primary={overviewMetrics.reviews.ratingAvg > 0 ? overviewMetrics.reviews.ratingAvg.toFixed(1) : '—'}
        primaryLabel="overall rating"
        delta={
          overviewMetrics.reviews.deltaRating !== undefined
            ? {
                value: overviewMetrics.reviews.deltaRating,
                label: 'stars in past week',
              }
            : undefined
        }
        chart={{
          type: 'ratingLine',
          data: overviewMetrics.reviews.series7d,
          color: '#fbbf24',
        }}
        locked={!reviewsEnabled}
        lockedReason={`${reviewsModule.tagline}. ${reviewsModule.bullets[0]}`}
      />

      {/* Row 1, Col 2: Google Maps */}
      <TimePeriodMetricCard
        title="Google Maps"
        icon={<PinDropIcon sx={{ fontSize: 20, color: '#34a853' }} />}
        metricType="listings"
        businessLocationId={businessLocationId}
        initialData={{
          primary: overviewMetrics.listings.directions7d,
          primaryLabel: 'direction requests (this week)',
          delta: overviewMetrics.listings.deltaDirections !== undefined
            ? {
                value: overviewMetrics.listings.deltaDirections,
                label: 'requests vs last week',
              }
            : undefined,
          chart: {
            type: 'barsWithLabels',
            data: overviewMetrics.listings.series7d,
            color: '#34a853',
          },
        }}
        locked={!listingsEnabled}
        lockedReason={`${listingsModule.tagline}. ${listingsModule.bullets[0]}`}
      />

      {/* Row 1, Col 3: Impressions */}
      <TimePeriodMetricCard
        title="Impressions"
        icon={<VisibilityIcon sx={{ fontSize: 20, color: '#4285f4' }} />}
        metricType="impressions"
        businessLocationId={businessLocationId}
        initialData={{
          primary: overviewMetrics.impressions.impressions7d > 0 ? overviewMetrics.impressions.impressions7d.toLocaleString() : '—',
          primaryLabel: 'impressions (this week)',
          delta: overviewMetrics.impressions.deltaImpressions !== undefined
            ? {
                value: overviewMetrics.impressions.deltaImpressions,
                label: 'impressions vs last week',
              }
            : undefined,
          chart: {
            type: 'barsWithLabels',
            data: overviewMetrics.impressions.series7d,
            color: '#4285f4',
          },
        }}
        locked={!newLeadsEnabled}
        lockedReason={`${insightsModule.tagline}. ${insightsModule.bullets[0]}`}
      />

      {/* Row 2, Col 1: Calls & Website */}
      <TimePeriodMetricCard
        title="Calls & Website"
        icon={<ForumIcon sx={{ fontSize: 20, color: '#1a73e8' }} />}
        metricType="callsAndWebsite"
        businessLocationId={businessLocationId}
        initialData={{
          primary: overviewMetrics.callsAndWebsite.calls7d > 0 ? overviewMetrics.callsAndWebsite.calls7d.toLocaleString() : '—',
          primaryLabel: 'calls (this week)',
          delta: overviewMetrics.callsAndWebsite.deltaCalls !== undefined
            ? {
                value: overviewMetrics.callsAndWebsite.deltaCalls,
                label: 'calls vs last week',
              }
            : undefined,
          secondaryMetric: {
            value: overviewMetrics.callsAndWebsite.websiteClicks7d > 0 ? overviewMetrics.callsAndWebsite.websiteClicks7d.toLocaleString() : '—',
            label: 'website visits (this week)',
            delta:
              overviewMetrics.callsAndWebsite.deltaWebsite !== undefined
                ? {
                    value: overviewMetrics.callsAndWebsite.deltaWebsite,
                    label: 'visits vs last week',
                  }
                : undefined,
          },
        }}
        locked={!inboxEnabled}
        lockedReason={`${reviewsModule.tagline}. ${reviewsModule.bullets[0]}`}
      />

      {/* Row 2, Col 2: Social */}
      <OverviewMetricCard
        title="Social"
        icon={<CampaignIcon sx={{ fontSize: 20, color: '#fbbf24' }} />}
        primary={overviewMetrics.social.posts7d > 0 ? overviewMetrics.social.posts7d.toLocaleString() : '0'}
        primaryLabel="posts (this week)"
        channelIcons={overviewMetrics.social.analyzedChannels}
        locked={!socialEnabled}
        lockedReason={`${socialModule.tagline}. ${socialModule.bullets[0]}`}
      />

      {/* Row 2, Col 3: Engagement */}
      <OverviewMetricCard
        title="Engagement"
        icon={<ThumbUpIcon sx={{ fontSize: 20, color: '#34a853' }} />}
        primary={overviewMetrics.visibility.likes7d > 0 ? overviewMetrics.visibility.likes7d.toLocaleString() : '0'}
        primaryLabel="likes (this week)"
        secondaryMetric={{
          value: overviewMetrics.visibility.comments7d > 0 ? overviewMetrics.visibility.comments7d.toLocaleString() : '0',
          label: 'comments (this week)',
        }}
        channelIcons={overviewMetrics.visibility.analyzedChannels}
        locked={!visibilityEnabled}
        lockedReason={`${insightsModule.tagline}. ${insightsModule.bullets[0]}`}
      />
    </div>
  )
}

