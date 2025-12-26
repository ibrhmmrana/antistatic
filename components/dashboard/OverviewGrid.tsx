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
  // Google Maps (listings) is a basic GBP metric, always available
  const listingsEnabled = true
  // Impressions is a basic GBP metric, always available
  const newLeadsEnabled = true

  // Row 2: Inbox | Social | Visibility
  const inboxEnabled = isModuleEnabled('reputation_hub') // Same as reviews
  const socialEnabled = isModuleEnabled('social_studio')
  // Engagement is a basic social metric, always available if social is enabled
  const visibilityEnabled = isModuleEnabled('social_studio')

  const reviewsModule = getModuleInfo('reputation_hub')
  const socialModule = getModuleInfo('social_studio')

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 auto-rows-fr">
      {/* Row 1, Col 1: Reviews */}
      <TimePeriodMetricCard
        title="Reviews"
        icon={<StarIcon sx={{ fontSize: 20, color: '#fbbf24' }} />}
        metricType="reviews"
        businessLocationId={businessLocationId}
        initialData={{
          primary: (overviewMetrics.reviews.newReviews7d ?? 0).toLocaleString(),
          primaryLabel: 'reviews (7 days)',
          rating: overviewMetrics.reviews.ratingAvg > 0 ? overviewMetrics.reviews.ratingAvg : undefined,
          chart: {
            type: 'barsWithLabels',
            data: [], // Will be populated by API based on selected time period
            color: '#fbbf24',
            timePeriod: 7,
          },
        }}
        locked={!reviewsEnabled}
        lockedReason={`${reviewsModule.tagline}. ${reviewsModule.bullets[0]}`}
        titleTooltip="Total number of customer reviews received on your Google Business Profile for the selected time period."
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
          delta: overviewMetrics.listings.directions7dPrev !== undefined
            ? {
                value: overviewMetrics.listings.directions7dPrev,
                label: 'requests',
              }
            : undefined,
          chart: {
            type: 'barsWithLabels',
            data: overviewMetrics.listings.series7d,
            color: '#34a853',
          },
        }}
        locked={false}
        titleTooltip="Number of times customers requested directions to your business location through Google Maps for the selected time period."
      />

      {/* Row 1, Col 3: Impressions */}
      <TimePeriodMetricCard
        title="Impressions"
        icon={<VisibilityIcon sx={{ fontSize: 20, color: '#4285f4' }} />}
        metricType="impressions"
        businessLocationId={businessLocationId}
        initialData={{
          primary: (overviewMetrics.impressions.impressions7d ?? 0).toLocaleString(),
          primaryLabel: 'impressions (this week)',
          delta: overviewMetrics.impressions.impressions7dPrev !== undefined
            ? {
                value: overviewMetrics.impressions.impressions7dPrev,
                label: 'impressions',
              }
            : undefined,
          chart: {
            type: 'barsWithLabels',
            data: overviewMetrics.impressions.series7d,
            color: '#4285f4',
          },
        }}
        locked={false}
        titleTooltip="Total number of times your business appeared in Google search results and Maps for the selected time period, regardless of whether users clicked on it."
      />

      {/* Row 2, Col 1: Calls & Website */}
      <TimePeriodMetricCard
        title="Calls & Website"
        icon={<ForumIcon sx={{ fontSize: 20, color: '#1a73e8' }} />}
        metricType="callsAndWebsite"
        businessLocationId={businessLocationId}
        initialData={{
          primary: (overviewMetrics.callsAndWebsite.calls7d ?? 0).toLocaleString(),
          primaryLabel: 'calls (this week)',
          delta: overviewMetrics.callsAndWebsite.calls7dPrev !== undefined
            ? {
                value: overviewMetrics.callsAndWebsite.calls7dPrev,
                label: 'calls',
              }
            : undefined,
          secondaryMetric: {
            value: (overviewMetrics.callsAndWebsite.websiteClicks7d ?? 0).toLocaleString(),
            label: 'website visits (this week)',
            delta:
              overviewMetrics.callsAndWebsite.websiteClicks7dPrev !== undefined
                ? {
                    value: overviewMetrics.callsAndWebsite.websiteClicks7dPrev,
                    label: 'visits',
                  }
                : undefined,
          },
        }}
        locked={!inboxEnabled}
        lockedReason={`${reviewsModule.tagline}. ${reviewsModule.bullets[0]}`}
        titleTooltip="Number of phone calls made directly from your Google Business Profile and clicks to your website for the selected time period."
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
        titleTooltip="Total number of posts published across your connected social media channels (Facebook, Instagram, LinkedIn, TikTok) in the past 7 days."
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
        lockedReason={visibilityEnabled ? undefined : `${socialModule.tagline}. ${socialModule.bullets[0]}`}
        titleTooltip="Total engagement (likes and comments) received on your social media posts across all connected channels in the past 7 days."
      />
    </div>
  )
}

