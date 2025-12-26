/**
 * Module Registry for Onboarding
 * 
 * Central registry of all available modules with metadata for the Choose Tools step
 */

export type ModuleKey = 
  | 'reputation_hub'
  | 'social_studio'
  | 'competitor_radar'
  | 'insights_lab'
  | 'profile_manager'
  | 'influencer_hub'

export interface ModuleInfo {
  key: ModuleKey
  name: string
  tagline: string
  bullets: string[]
  category: string
  comingSoon?: boolean // If true, module is not yet available
}

export const MODULES: Record<ModuleKey, ModuleInfo> = {
  reputation_hub: {
    key: 'reputation_hub',
    name: 'Reputation Hub',
    tagline: 'Reviews & messaging',
    category: 'Reviews & messaging',
    bullets: [
      'Monitor Google reviews and messages in one inbox',
      'Get AI-suggested replies in your brand\'s tone',
      'Request new reviews via SMS, WhatsApp, or email',
    ],
  },
  social_studio: {
    key: 'social_studio',
    name: 'Social Studio',
    tagline: 'Content & scheduling',
    category: 'Content & scheduling',
    bullets: [
      'Turn ideas or links into ready-to-post content with AI',
      'Schedule posts to multiple social channels from one calendar',
      'Keep basic track of reach and engagement across channels',
    ],
  },
  competitor_radar: {
    key: 'competitor_radar',
    name: 'Competitor Radar',
    tagline: 'Watchlist & alerts',
    category: 'Watchlist & alerts',
    bullets: [
      'Add competitors to a simple watchlist',
      'Get alerts when they spike in reviews or post high-performing content',
      'Compare ratings and review volume at a glance',
    ],
  },
  insights_lab: {
    key: 'insights_lab',
    name: 'Insights Lab',
    tagline: 'Analytics & reports',
    category: 'Analytics & reports',
    comingSoon: true,
    bullets: [
      'Cross-channel performance and sentiment view',
      'Simple reports you can share with your team or clients',
      'Track experiments and measure what drives results',
    ],
  },
  profile_manager: {
    key: 'profile_manager',
    name: 'Profile Manager',
    tagline: 'Business info',
    category: 'Business info',
    comingSoon: true,
    bullets: [
      'Keep your Google Business Profile info accurate and complete',
      'Catch broken links, bad hours, or missing profiles',
      'Ensure consistency across directories',
    ],
  },
  influencer_hub: {
    key: 'influencer_hub',
    name: 'Influencer Hub',
    tagline: 'Creator partnerships',
    category: 'Creator partnerships',
    bullets: [
      'Identify local creators who can vouch for your business',
      'Support campaigns for UGC, testimonials, and review boosts',
      'Track which creators move the needle for engagement',
    ],
  },
}

/**
 * Get all available module keys
 */
export function getAllModuleKeys(): ModuleKey[] {
  return Object.keys(MODULES) as ModuleKey[]
}

/**
 * Get module info by key
 */
export function getModuleInfo(key: ModuleKey): ModuleInfo {
  return MODULES[key]
}

/**
 * Get multiple modules by keys
 */
export function getModulesInfo(keys: ModuleKey[]): ModuleInfo[] {
  return keys.map(key => MODULES[key]).filter(Boolean)
}

/**
 * Type guard to check if a string is a valid ModuleKey
 */
export function isModuleKey(value: string): value is ModuleKey {
  return value in MODULES
}

