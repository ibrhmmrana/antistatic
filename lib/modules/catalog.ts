/**
 * Antistatic Modules Catalog
 * 
 * Central configuration for all Antistatic modules with metadata for prescriptions
 */

export type AntistaticModuleId =
  | 'reputationHub'
  | 'profileManager'
  | 'socialStudio'
  | 'insightsLab'
  | 'competitorTracker'
  | 'influencerHub'

export interface AntistaticModule {
  id: AntistaticModuleId
  label: string
  shortLabel?: string
  colorClass: string // Tailwind classes for pill background/border
  textColorClass: string // Tailwind for text/icon
  tooltipTitle: string
  tooltipBullets: string[]
}

export const ANTISTATIC_MODULES: Record<AntistaticModuleId, AntistaticModule> = {
  reputationHub: {
    id: 'reputationHub',
    label: 'Reputation Hub',
    shortLabel: 'Reputation Hub',
    colorClass: 'bg-blue-50 border-blue-200',
    textColorClass: 'text-blue-700',
    tooltipTitle: 'Reputation Hub',
    tooltipBullets: [
      'Pulls in all your reviews from Google (and later other platforms)',
      'Classifies sentiment so you instantly see what\'s good vs bad',
      'Helps you reply with AI-suggested responses that still sound like you',
      'Lets you send WhatsApp review requests to boost fresh 5★ reviews',
    ],
  },
  profileManager: {
    id: 'profileManager',
    label: 'Profile Manager',
    shortLabel: 'Profile Manager',
    colorClass: 'bg-indigo-50 border-indigo-200',
    textColorClass: 'text-indigo-700',
    tooltipTitle: 'Profile Manager',
    tooltipBullets: [
      'Shows your live Google Business Profile data (name, address, hours, etc.)',
      'Flags missing, inconsistent, or risky info that could confuse customers',
      'Highlights category choices and how they impact search visibility',
      'Prepares your profile to sync later with other listing sites',
    ],
  },
  socialStudio: {
    id: 'socialStudio',
    label: 'Social Studio',
    shortLabel: 'Social Studio',
    colorClass: 'bg-purple-50 border-purple-200',
    textColorClass: 'text-purple-700',
    tooltipTitle: 'Social Studio',
    tooltipBullets: [
      'Connects your main social accounts into one dashboard',
      'Shows which posts actually drive engagement and clicks',
      'Lets you generate new post ideas and captions with AI',
      'Helps you keep a consistent presence without posting manually every day',
    ],
  },
  insightsLab: {
    id: 'insightsLab',
    label: 'Insights Lab',
    shortLabel: 'Insights Lab',
    colorClass: 'bg-teal-50 border-teal-200',
    textColorClass: 'text-teal-700',
    tooltipTitle: 'Insights Lab',
    tooltipBullets: [
      'Turns your reviews, profile data, and social metrics into plain-language insights',
      'Surfaces patterns: common complaints, hidden strengths, and sudden changes',
      'Compares you to local competitors where we have data',
      'Generates short, sharable reports you can use with your team or clients',
    ],
  },
  competitorTracker: {
    id: 'competitorTracker',
    label: 'Competitor Radar',
    shortLabel: 'Competitor Radar',
    colorClass: 'bg-orange-50 border-orange-200',
    textColorClass: 'text-orange-700',
    tooltipTitle: 'Competitor Radar',
    tooltipBullets: [
      'Lets you "follow" specific competitors in your area',
      'Alerts you when they get new reviews (especially very positive or very negative ones)',
      'Notifies you when they post on social or start trending',
      'Shows side-by-side comparisons so you can see where they\'re beating you',
    ],
  },
  influencerHub: {
    id: 'influencerHub',
    label: 'Influencer Hub',
    shortLabel: 'Influencer Hub',
    colorClass: 'bg-pink-50 border-pink-200',
    textColorClass: 'text-pink-700',
    tooltipTitle: 'Influencer Hub',
    tooltipBullets: [
      'Helps you identify local creators and regulars who can vouch for your business',
      'Supports campaigns for UGC, testimonials, ads, and review boosts',
      'Suggests AI-drafted briefs and outreach messages you can send them',
      'Tracks which creators actually move the needle for reviews and engagement',
    ],
  },
}

/**
 * Get module by ID
 */
export function getModule(id: AntistaticModuleId): AntistaticModule {
  return ANTISTATIC_MODULES[id]
}

/**
 * Get multiple modules by IDs
 * Filters out coming soon modules (insightsLab and profileManager)
 */
export function getModules(ids: AntistaticModuleId[]): AntistaticModule[] {
  return ids
    .filter((id) => id !== 'insightsLab' && id !== 'profileManager')
    .map(id => ANTISTATIC_MODULES[id])
    .filter(Boolean)
}

