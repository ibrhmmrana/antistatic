/**
 * Mock data for Social Studio v2
 * Structured for real API integration later
 */

export type Platform = 'instagram' | 'facebook' | 'linkedin' | 'tiktok' | 'google_business'
export type AccountStatus = 'connected' | 'expired' | 'missing_permissions' | 'needs_reauth'
export type PostStatus = 'draft' | 'scheduled' | 'published'
export type MediaType = 'image' | 'video'
export type PostPillar = 'proof' | 'offer' | 'education' | 'culture'
export type Objective = 'clicks' | 'calls' | 'visits' | 'awareness'
export type CadenceStatus = 'on_track' | 'behind' | 'ahead'

export interface SocialAccount {
  id: string
  platform: Platform
  handle: string
  status: AccountStatus
  lastSyncAt: string | null
  businessLocationId: string
}

export interface SocialPostVariant {
  platform: Platform
  caption: string
  linkUrl?: string
  utmSource?: string
  utmCampaign?: string
  utmMedium?: string
}

export interface SocialPost {
  id: string
  title: string
  mediaType: MediaType
  mediaUrl: string
  variants: SocialPostVariant[]
  status: PostStatus
  scheduledAt?: string
  publishedAt?: string
  pillar?: PostPillar
  tags: string[]
  objective?: Objective
  metrics?: PostMetric
  createdAt: string
  updatedAt: string
}

export interface PostMetric {
  impressions: number
  engagementRate: number
  clicks: number
  calls: number
  visits: number
  saves: number
  comments: number
  shares: number
  // Why it worked
  topFormat?: string
  topTopic?: string
  topCTA?: string
}

export interface ObjectiveMetric {
  objective: Objective
  clicks?: number
  calls?: number
  visits?: number
  impressions?: number
  period: string // 'this_week' | 'last_week' | 'last_14_days'
}

export interface CadenceTarget {
  platform: Platform
  targetPerWeek: number
  scheduledCount: number
  publishedCount: number
  status: CadenceStatus
}

export interface QueueItem {
  id: string
  title: string
  caption: string
  mediaType: MediaType
  mediaUrl: string
  pillar: PostPillar
  tags: string[]
  isEvergreen: boolean
}

export interface PrescriptionAction {
  id: string
  type: 'auto_fill' | 'generate_offers' | 'create_from_keyword' | 'repurpose' | 'fix_cadence'
  title: string
  description: string
  cta: string
  deepLink?: string
  prefill?: Record<string, any>
}

export interface ServiceCoverage {
  serviceName: string
  mentioned: boolean
  lastMentioned?: string
}

// Mock data
export const mockSocialAccounts: SocialAccount[] = [
  {
    id: '1',
    platform: 'instagram',
    handle: '@yourbusiness',
    status: 'connected',
    lastSyncAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    businessLocationId: 'loc1',
  },
  {
    id: '2',
    platform: 'facebook',
    handle: 'Your Business Page',
    status: 'connected',
    lastSyncAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    businessLocationId: 'loc1',
  },
  {
    id: '3',
    platform: 'google_business',
    handle: 'Your Business',
    status: 'connected',
    lastSyncAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    businessLocationId: 'loc1',
  },
]

export const mockPosts: SocialPost[] = [
  {
    id: '1',
    title: 'New Product Launch',
    mediaType: 'image',
    mediaUrl: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800',
    variants: [
      {
        platform: 'instagram',
        caption: 'Excited to announce our latest product! 🎉 Check it out now.',
        linkUrl: 'https://example.com/product',
        utmSource: 'instagram',
        utmCampaign: 'product_launch',
        utmMedium: 'social',
      },
      {
        platform: 'facebook',
        caption: 'We\'re thrilled to introduce our newest product! Learn more.',
        linkUrl: 'https://example.com/product',
        utmSource: 'facebook',
        utmCampaign: 'product_launch',
        utmMedium: 'social',
      },
    ],
    status: 'published',
    publishedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    pillar: 'offer',
    tags: ['Product', 'Launch', 'Announcement'],
    objective: 'clicks',
    metrics: {
      impressions: 12500,
      engagementRate: 4.2,
      clicks: 342,
      calls: 12,
      visits: 8,
      saves: 89,
      comments: 45,
      shares: 23,
      topFormat: 'Image',
      topTopic: 'Product',
      topCTA: 'Learn More',
    },
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '2',
    title: 'Customer Success Story',
    mediaType: 'image',
    mediaUrl: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=800',
    variants: [
      {
        platform: 'instagram',
        caption: 'Hear from Sarah about her experience with us! 💬 "Best service ever!"',
      },
    ],
    status: 'published',
    publishedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    pillar: 'proof',
    tags: ['Testimonial', 'Customer', 'Proof'],
    objective: 'awareness',
    metrics: {
      impressions: 8900,
      engagementRate: 5.8,
      clicks: 198,
      calls: 5,
      visits: 3,
      saves: 156,
      comments: 67,
      shares: 34,
      topFormat: 'Image',
      topTopic: 'Testimonial',
      topCTA: 'None',
    },
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '3',
    title: 'Weekly Tips',
    mediaType: 'image',
    mediaUrl: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800',
    variants: [
      {
        platform: 'linkedin',
        caption: '5 ways to improve your workflow this week 📈',
      },
      {
        platform: 'facebook',
        caption: 'Here are 5 practical tips to boost your productivity this week.',
      },
    ],
    status: 'published',
    publishedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    pillar: 'education',
    tags: ['Education', 'Tips', 'Workflow'],
    objective: 'clicks',
    metrics: {
      impressions: 15200,
      engagementRate: 3.5,
      clicks: 421,
      calls: 8,
      visits: 15,
      saves: 78,
      comments: 34,
      shares: 19,
      topFormat: 'Image',
      topTopic: 'Education',
      topCTA: 'Read More',
    },
    createdAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '4',
    title: 'Behind the Scenes',
    mediaType: 'video',
    mediaUrl: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800',
    variants: [
      {
        platform: 'instagram',
        caption: 'A day in the life of our team 🎬',
      },
    ],
    status: 'scheduled',
    scheduledAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    pillar: 'culture',
    tags: ['Culture', 'Team', 'BehindScenes'],
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '5',
    title: 'Holiday Special',
    mediaType: 'image',
    mediaUrl: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800',
    variants: [
      {
        platform: 'instagram',
        caption: 'Special offer this weekend only! 🎁',
        linkUrl: 'https://example.com/offer',
        utmSource: 'instagram',
        utmCampaign: 'holiday_special',
        utmMedium: 'social',
      },
      {
        platform: 'facebook',
        caption: 'Limited time offer - this weekend only!',
        linkUrl: 'https://example.com/offer',
        utmSource: 'facebook',
        utmCampaign: 'holiday_special',
        utmMedium: 'social',
      },
    ],
    status: 'draft',
    pillar: 'offer',
    tags: ['Offer', 'Promotion', 'Holiday'],
    objective: 'clicks',
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
]

export const mockCadenceTargets: CadenceTarget[] = [
  {
    platform: 'instagram',
    targetPerWeek: 5,
    scheduledCount: 2,
    publishedCount: 3,
    status: 'on_track',
  },
  {
    platform: 'facebook',
    targetPerWeek: 3,
    scheduledCount: 1,
    publishedCount: 2,
    status: 'on_track',
  },
  {
    platform: 'google_business',
    targetPerWeek: 2,
    scheduledCount: 0,
    publishedCount: 1,
    status: 'behind',
  },
]

export const mockQueueItems: QueueItem[] = [
  {
    id: 'q1',
    title: 'Company Values',
    caption: 'Our core values guide everything we do. Learn what drives us.',
    mediaType: 'image',
    mediaUrl: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=400',
    pillar: 'culture',
    tags: ['Culture', 'Values'],
    isEvergreen: true,
  },
  {
    id: 'q2',
    title: 'How We Help',
    caption: 'Discover how we solve problems for our customers every day.',
    mediaType: 'image',
    mediaUrl: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=400',
    pillar: 'proof',
    tags: ['Service', 'Value'],
    isEvergreen: true,
  },
  {
    id: 'q3',
    title: 'Team Spotlight',
    caption: 'Meet the amazing people behind our success.',
    mediaType: 'image',
    mediaUrl: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400',
    pillar: 'culture',
    tags: ['Team', 'Culture'],
    isEvergreen: true,
  },
]

export const mockPrescriptionActions: PrescriptionAction[] = [
  {
    id: 'p1',
    type: 'auto_fill',
    title: 'You\'re behind on posting',
    description: 'Auto-fill the next 7 days with posts from your queue',
    cta: 'Auto-fill week',
    deepLink: '/social-studio?tab=planner&action=auto_fill',
  },
  {
    id: 'p2',
    type: 'generate_offers',
    title: 'Your clicks come from Offer posts',
    description: 'Generate 2 new Offer posts to drive more traffic',
    cta: 'Generate Offers',
    deepLink: '/social-studio?tab=create&pillar=offer',
  },
  {
    id: 'p3',
    type: 'create_from_keyword',
    title: 'GBP search term "computer repair" rising',
    description: 'Create a post aligned to this trending search',
    cta: 'Create Post',
    deepLink: '/social-studio?tab=create&keyword=computer+repair',
  },
]

export const mockServiceCoverage: ServiceCoverage[] = [
  { serviceName: 'Computer Repair', mentioned: true, lastMentioned: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
  { serviceName: 'Data Recovery', mentioned: true, lastMentioned: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() },
  { serviceName: 'Network Setup', mentioned: false },
  { serviceName: 'Virus Removal', mentioned: false },
  { serviceName: 'Hardware Upgrade', mentioned: false },
  { serviceName: 'Software Installation', mentioned: false },
]

export const mockObjectiveMetrics: ObjectiveMetric[] = [
  {
    objective: 'clicks',
    clicks: 961,
    impressions: 36600,
    period: 'this_week',
  },
  {
    objective: 'calls',
    calls: 25,
    period: 'this_week',
  },
  {
    objective: 'visits',
    visits: 26,
    period: 'this_week',
  },
  {
    objective: 'awareness',
    impressions: 36600,
    period: 'this_week',
  },
]

// Helper functions
export function getTopPosts(posts: SocialPost[], limit: number = 5): SocialPost[] {
  return posts
    .filter(p => p.status === 'published' && p.metrics)
    .sort((a, b) => (b.metrics?.clicks || 0) - (a.metrics?.clicks || 0))
    .slice(0, limit)
}

export function getScheduledPostsForWeek(posts: SocialPost[]): SocialPost[] {
  const now = new Date()
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  return posts
    .filter(p => p.status === 'scheduled' && p.scheduledAt)
    .filter(p => {
      const scheduled = new Date(p.scheduledAt!)
      return scheduled >= now && scheduled <= weekFromNow
    })
    .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime())
}

export function getPostsByDateRange(posts: SocialPost[], days: number): SocialPost[] {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  return posts.filter(p => {
    if (p.publishedAt) {
      return new Date(p.publishedAt) >= cutoff
    }
    return false
  })
}

export function getCadenceStatus(targets: CadenceTarget[]): CadenceStatus {
  const totalScheduled = targets.reduce((sum, t) => sum + t.scheduledCount, 0)
  const totalTarget = targets.reduce((sum, t) => sum + t.targetPerWeek, 0)
  const progress = totalScheduled / totalTarget
  if (progress >= 1) return 'ahead'
  if (progress >= 0.8) return 'on_track'
  return 'behind'
}

export function getTotalOutcomes(metrics: ObjectiveMetric[]): { clicks: number; calls: number; visits: number } {
  return {
    clicks: metrics.find(m => m.objective === 'clicks')?.clicks || 0,
    calls: metrics.find(m => m.objective === 'calls')?.calls || 0,
    visits: metrics.find(m => m.objective === 'visits')?.visits || 0,
  }
}
