/**
 * Navigation configuration for dashboard sidebar
 * Maps modules to their routes and metadata
 */

import { type ModuleKey, MODULES } from '@/lib/onboarding/module-registry'

export interface NavItemConfig {
  key: string
  label: string
  href: string
  iconName: string // Name of the icon component to import
  moduleKey?: ModuleKey // undefined for always-enabled items
  description?: string
  unlockHint: string
  alwaysEnabled?: boolean
}

/**
 * Get comprehensive module description for tooltips
 */
function getModuleDescription(moduleKey: ModuleKey): string {
  const module = MODULES[moduleKey]
  if (!module) return 'Module not found'
  
  // Return comprehensive descriptions based on module
  const descriptions: Record<ModuleKey, string> = {
    reputation_hub: 'Monitor and reply to Google reviews and messages in one inbox. Get AI-suggested replies in your brand\'s tone and request new reviews via SMS, WhatsApp, or email.',
    social_studio: 'Turn ideas or links into ready-to-post content with AI. Schedule posts to multiple social channels from one calendar and track reach and engagement across channels.',
    competitor_radar: 'Add competitors to a watchlist and get alerts when they spike in reviews or post high-performing content. Compare ratings and review volume at a glance.',
    insights_lab: 'Get a cross-channel performance and sentiment view. Create simple reports you can share with your team or clients and track experiments to measure what drives results.',
    profile_manager: 'Keep your Google Business Profile info accurate and complete. Catch broken links, bad hours, or missing profiles and ensure consistency across directories.',
    influencer_hub: 'Identify local creators who can vouch for your business. Support campaigns for user-generated content, testimonials, and review boosts. Track which creators move the needle for engagement.',
  }
  
  return descriptions[moduleKey] || module.tagline || module.bullets[0] || 'Module description'
}

/**
 * Canonical navigation configuration
 * This is the single source of truth for sidebar items
 * Note: Icons are referenced by name and imported in the component that uses them
 */
export const NAV_ITEMS: NavItemConfig[] = [
  {
    key: 'overview',
    label: 'Overview',
    href: '/dashboard',
    iconName: 'DashboardOutlined',
    alwaysEnabled: true,
    unlockHint: '', // Not applicable
  },
  {
    key: 'reputation_hub',
    label: 'Reputation Hub',
    href: '/reputation',
    iconName: 'ReviewsOutlined',
    moduleKey: 'reputation_hub',
    description: getModuleDescription('reputation_hub'),
    unlockHint: 'Go to Settings → Tools to enable it.',
  },
  {
    key: 'competitor_radar',
    label: 'Competitor Radar',
    href: '/competitors',
    iconName: 'BoltOutlined',
    moduleKey: 'competitor_radar',
    description: getModuleDescription('competitor_radar'),
    unlockHint: 'Go to Settings → Tools to enable it.',
  },
  {
    key: 'social_studio',
    label: 'Social Studio',
    href: '/social-studio',
    iconName: 'CampaignOutlined',
    moduleKey: 'social_studio',
    description: getModuleDescription('social_studio'),
    unlockHint: 'Go to Settings → Tools to enable it.',
  },
  {
    key: 'influencer_hub',
    label: 'Creator Hub',
    href: '/creators', // Route may not exist yet
    iconName: 'PeopleOutlined',
    moduleKey: 'influencer_hub',
    description: getModuleDescription('influencer_hub'),
    unlockHint: 'Go to Settings → Tools to enable it.',
  },
  {
    key: 'marketplace',
    label: 'Marketplace',
    href: '/marketplace',
    iconName: 'StoreOutlined',
    alwaysEnabled: true,
    unlockHint: '', // Not applicable
  },
]

/**
 * Get nav items that require a specific module
 */
export function getNavItemsByModule(moduleKey: ModuleKey): NavItemConfig[] {
  return NAV_ITEMS.filter(item => item.moduleKey === moduleKey)
}

/**
 * Check if a nav item is enabled based on enabled tools
 */
export function isNavItemEnabled(item: NavItemConfig, enabledTools: ModuleKey[]): boolean {
  if (item.alwaysEnabled) return true
  if (!item.moduleKey) return true
  return enabledTools.includes(item.moduleKey)
}

