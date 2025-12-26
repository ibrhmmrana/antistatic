'use client'

import React, { ReactNode, useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import SendIcon from '@mui/icons-material/Send'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'
import LockIcon from '@mui/icons-material/Lock'
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined'
import ReviewsOutlinedIcon from '@mui/icons-material/ReviewsOutlined'
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined'
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined'
import PinDropOutlinedIcon from '@mui/icons-material/PinDropOutlined'
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined'
import AnalyticsOutlinedIcon from '@mui/icons-material/AnalyticsOutlined'
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined'
import { AccountMenu } from '@/components/account/account-menu'
import { NAV_ITEMS, isNavItemEnabled, type NavItemConfig } from '@/lib/navigation/module-nav'
import { getEnabledToolsForSidebar } from '@/lib/modules/enabled'
import { type ModuleKey } from '@/lib/onboarding/module-registry'
import { Tooltip } from '@/components/ui/tooltip'
import { SendReviewRequestModal } from '@/components/reputation/SendReviewRequestModal'

// Icon map for dynamic icon rendering
const ICON_MAP: Record<string, React.ComponentType<{ sx?: { fontSize: number } }>> = {
  DashboardOutlined: DashboardOutlinedIcon,
  ReviewsOutlined: ReviewsOutlinedIcon,
  ForumOutlined: ForumOutlinedIcon,
  CampaignOutlined: CampaignOutlinedIcon,
  PinDropOutlined: PinDropOutlinedIcon,
  BoltOutlined: BoltOutlinedIcon,
  SettingsOutlined: SettingsOutlinedIcon,
  AnalyticsOutlined: AnalyticsOutlinedIcon,
  PeopleOutlined: PeopleOutlinedIcon,
}

interface AppShellProps {
  children: ReactNode
  userName: string
  userEmail?: string
  businessName: string | null
  businessRating: number | null
  businessReviewCount: number | null
}

// Google Cloud style NavItem component
interface NavItemProps {
  item: NavItemConfig
  active?: boolean
  enabled: boolean
  onClick?: () => void
}

function NavItem({ item, active, enabled, onClick }: NavItemProps) {
  const isLocked = !enabled && !item.alwaysEnabled
  const [isClicking, setIsClicking] = useState(false)

  // All hooks must be called before any conditional returns
  const handleLinkClick = useCallback(() => {
    if (onClick) {
      onClick()
    }
  }, [onClick])

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (isLocked) {
      e.preventDefault()
      e.stopPropagation()
      return
    }
    
    // Add clicking animation
    setIsClicking(true)
    setTimeout(() => setIsClicking(false), 150)
    
    if (onClick) {
      onClick()
    }
  }, [isLocked, onClick])

  const content = (
    <div
      className={`group/item flex items-center gap-3 px-4 group-hover:px-4 px-3 py-2.5 text-sm select-none transition-all duration-150 nav-item-link ${
        active ? 'bg-blue-50 font-bold' : 'font-light'
      } ${
        isLocked
          ? 'opacity-60 cursor-not-allowed'
          : 'cursor-pointer hover:bg-slate-100 active:scale-[0.98] active:bg-slate-200'
      } ${
        isClicking ? 'scale-[0.98] bg-slate-200' : ''
      }`}
      style={{
        fontFamily: "'Product Sans', 'Google Sans', system-ui, sans-serif",
        color: active ? '#001d35' : '#202124',
        fontWeight: active ? 700 : 300,
      }}
      onClick={handleClick}
    >
      {/* Left accent bar for active item */}
      <span
        className={`h-5 w-[3px] rounded-full flex-shrink-0 ${
          active ? 'bg-sky-500' : 'bg-transparent group-hover/item:bg-slate-300'
        }`}
      />
      {/* Icon */}
      <span
        className="flex h-5 w-5 items-center justify-center flex-shrink-0"
        style={{ color: active ? '#001d35' : '#202124' }}
      >
        {ICON_MAP[item.iconName] && React.createElement(ICON_MAP[item.iconName], { sx: { fontSize: 18 } })}
      </span>
      {/* Label - hidden when sidebar is collapsed, visible on hover */}
      <span className="truncate opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap flex-1">
        {item.label}
      </span>
      {/* Lock icon for locked items */}
      {isLocked && (
        <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex-shrink-0">
          <LockIcon sx={{ fontSize: 16, color: '#9aa0a6' }} />
        </span>
      )}
    </div>
  )

  if (isLocked) {
    const tooltipContent = (
      <div className="space-y-1.5">
        <div className="font-semibold text-white">Locked: {item.label}</div>
        <div className="text-xs text-gray-300 space-y-1">
          <div><strong>What it does:</strong> {item.description || 'Module description'}</div>
          <div><strong>Why locked:</strong> This module isn't enabled for this workspace yet.</div>
          <div><strong>Unlock:</strong> {item.unlockHint}</div>
        </div>
      </div>
    )

    // For locked items, wrap the content directly in Tooltip (no Link wrapper)
    return (
      <Tooltip content={tooltipContent} side="right">
        {content}
      </Tooltip>
    )
  }

  return (
    <Link 
      href={item.href} 
      onClick={handleLinkClick}
      className="block"
    >
      {content}
    </Link>
  )
}

export function AppShell({
  children,
  userName,
  userEmail,
  businessName: _businessName,
  businessRating: _businessRating,
  businessReviewCount: _businessReviewCount,
}: AppShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [sidebarHovered, setSidebarHovered] = useState(false)
  const [enabledTools, setEnabledTools] = useState<ModuleKey[]>([])
  const [sendReviewOpen, setSendReviewOpen] = useState(false)
  const [businessLocationId, setBusinessLocationId] = useState<string | null>(null)
  const [isNavigating, setIsNavigating] = useState(false)
  const faviconRef = useRef<HTMLLinkElement | null>(null)
  const originalFaviconRef = useRef<string | null>(null)
  const prevPathname = useRef(pathname)

  // Set up favicon loading indicator
  useEffect(() => {
    // Find or create favicon link
    const findFavicon = () => {
      let favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement
      if (!favicon) {
        favicon = document.createElement('link')
        favicon.rel = 'icon'
        document.head.appendChild(favicon)
      }
      faviconRef.current = favicon
      originalFaviconRef.current = favicon.href
      return favicon
    }
    
    findFavicon()
  }, [])

  // Update favicon when navigating
  useEffect(() => {
    if (!faviconRef.current) return

    if (isNavigating) {
      // Create an animated loading spinner favicon using SVG
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="14" fill="none" stroke="#1a73e8" stroke-width="3" stroke-linecap="round">
            <animate attributeName="stroke-dasharray" values="0 88;44 44;0 88" dur="1s" repeatCount="indefinite"/>
            <animate attributeName="stroke-dashoffset" values="0;-44;-88" dur="1s" repeatCount="indefinite"/>
          </circle>
        </svg>
      `
      const blob = new Blob([svg], { type: 'image/svg+xml' })
      const url = URL.createObjectURL(blob)
      faviconRef.current.href = url
    } else {
      // Restore original favicon
      if (originalFaviconRef.current) {
        faviconRef.current.href = originalFaviconRef.current
      }
    }
  }, [isNavigating])

  // Detect navigation start - for Next.js App Router, we detect pathname changes
  useEffect(() => {
    // Only set navigating if pathname actually changed (not on initial mount)
    if (prevPathname.current && prevPathname.current !== pathname) {
      setIsNavigating(true)
      
      // Reset after navigation completes
      const timeout = setTimeout(() => {
        setIsNavigating(false)
      }, 500)

      return () => {
        clearTimeout(timeout)
      }
    }
    prevPathname.current = pathname
  }, [pathname])

  // Fetch enabled tools and business location on mount
  useEffect(() => {
    getEnabledToolsForSidebar().then((tools) => {
      console.log('[AppShell] Enabled tools loaded:', tools)
      setEnabledTools(tools)
    }).catch((error) => {
      console.error('[AppShell] Failed to fetch enabled tools:', error)
      // Fallback to default
      setEnabledTools(['reputation_hub'])
    })

    // Fetch primary business location ID
    const fetchBusinessLocation = async () => {
      try {
        const response = await fetch('/api/business-location/primary')
        if (response.ok) {
          const data = await response.json()
          setBusinessLocationId(data.id)
        }
      } catch (error) {
        console.error('[AppShell] Failed to fetch business location:', error)
      }
    }
    fetchBusinessLocation()
  }, [])

  // Handler functions for header actions
  const handleSendReviewRequest = () => {
    if (businessLocationId) {
      setSendReviewOpen(true)
    } else {
      // Fallback: try to fetch location first
      fetch('/api/business-location/primary')
        .then(res => res.json())
        .then(data => {
          if (data.id) {
            setBusinessLocationId(data.id)
            setSendReviewOpen(true)
          }
        })
        .catch(() => {
          // If fetch fails, still try to open modal (it will handle missing location)
          setSendReviewOpen(true)
        })
    }
  }

  const handleHelp = () => {
    router?.push('/help')
  }

  const handleSettings = () => {
    router?.push('/settings')
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#f1f3f4]">
      {/* Top App Bar - Google Cloud Style */}
      <header className="fixed top-0 left-0 right-0 z-30 flex h-14 md:h-16 items-center border-b border-slate-200 bg-white px-3 md:px-6 shadow-sm">
        {/* Left Section: Antistatic Brand */}
        <div className="flex flex-1 items-center gap-2">
          <Link href="/dashboard" className="text-base md:text-lg font-semibold text-slate-900" style={{ fontFamily: 'var(--font-google-sans)' }}>
            Antistatic
          </Link>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-500" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
            Beta
          </span>
        </div>

        {/* Right Section: Icon-only Actions */}
        <div className="flex items-center gap-1 md:gap-2">
          {/* Send Review Request (leftmost in code, rightmost on screen) */}
          <button
            type="button"
            onClick={handleSendReviewRequest}
            className="group relative inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition-colors"
          >
            <SendIcon sx={{ fontSize: 20 }} />
            <span className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 text-xs font-medium text-white bg-black rounded pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap z-50">
              Send a review request
            </span>
          </button>

          {/* Help */}
          <button
            type="button"
            onClick={handleHelp}
            className="group relative inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition-colors"
          >
            <HelpOutlineIcon sx={{ fontSize: 20 }} />
            <span className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 text-xs font-medium text-white bg-black rounded pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap z-50">
              Help
            </span>
          </button>

          {/* Settings */}
          <button
            type="button"
            onClick={handleSettings}
            className="group relative inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition-colors"
          >
            <SettingsOutlinedIcon sx={{ fontSize: 20 }} />
            <span className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 text-xs font-medium text-white bg-black rounded pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap z-50">
              Settings
            </span>
          </button>

          {/* Account (rightmost in code, leftmost on screen) */}
          <AccountMenu userName={userName} userEmail={userEmail} businessName={_businessName} />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden pt-14 md:pt-16">
        {/* Side Navigation - Google Cloud Style - Collapsible on Hover */}
        <aside 
          className="group hidden lg:flex fixed top-14 md:top-16 left-0 h-[calc(100vh-3.5rem)] md:h-[calc(100vh-4rem)] w-16 hover:w-64 flex-col border-r border-slate-200 bg-white transition-all duration-300 ease-in-out overflow-y-auto overflow-x-visible z-10"
          onMouseEnter={() => setSidebarHovered(true)}
          onMouseLeave={() => setSidebarHovered(false)}
        >
          <nav className="mt-3 flex flex-1 flex-col gap-1 pb-4">
            {NAV_ITEMS.map((item) => {
              const isActive =
                pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(item.href))
              const enabled = isNavItemEnabled(item, enabledTools)
              return (
                <NavItem
                  key={item.key}
                  item={item}
                  active={isActive}
                  enabled={enabled}
                  onClick={() => setIsNavigating(true)}
                />
              )
            })}
          </nav>
        </aside>

        {/* Mobile Navigation Toggle */}
        <button
          onClick={() => setMobileNavOpen(!mobileNavOpen)}
          className="lg:hidden fixed bottom-4 right-4 w-14 h-14 rounded-full bg-[#1a73e8] text-white shadow-lg flex items-center justify-center z-40"
        >
          <DashboardOutlinedIcon sx={{ fontSize: 24 }} />
        </button>

        {/* Mobile Navigation Overlay */}
        {mobileNavOpen && (
          <>
            <div
              className="lg:hidden fixed inset-0 bg-black/50 z-30"
              onClick={() => setMobileNavOpen(false)}
            />
            <aside className="lg:hidden fixed left-0 top-0 bottom-0 w-64 bg-white border-r border-slate-200 z-40 overflow-y-auto">
              <nav className="mt-3 flex flex-1 flex-col gap-1 pb-4">
                {NAV_ITEMS.map((item) => {
                  const isActive =
                    pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(item.href))
                  const enabled = isNavItemEnabled(item, enabledTools)
                  return (
                    <NavItem
                      key={item.key}
                      item={item}
                      active={isActive}
                      enabled={enabled}
                      onClick={() => setMobileNavOpen(false)}
                    />
                  )
                })}
              </nav>
            </aside>
          </>
        )}

        {/* Main Content - Adjusts when sidebar expands */}
        <main className={`flex-1 ml-16 overflow-y-auto transition-all duration-300 ease-in-out min-w-0 bg-white ${sidebarHovered ? 'lg:ml-64' : ''}`}>
          {children}
        </main>
      </div>

      {/* Send Review Request Modal */}
      {businessLocationId && (
        <SendReviewRequestModal
          open={sendReviewOpen}
          onOpenChange={setSendReviewOpen}
          businessLocationId={businessLocationId}
        />
      )}
    </div>
  )
}

