'use client'

import { ReactNode, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined'
import ReviewsOutlinedIcon from '@mui/icons-material/ReviewsOutlined'
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined'
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined'
import PinDropOutlinedIcon from '@mui/icons-material/PinDropOutlined'
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import SendIcon from '@mui/icons-material/Send'
import { AccountMenu } from '@/components/account/account-menu'

interface AppShellProps {
  children: ReactNode
  userName: string
  userEmail?: string
  businessName: string | null
  businessRating: number | null
  businessReviewCount: number | null
}

interface NavItemData {
  label: string
  href: string
  icon: ReactNode
}

const navItems: NavItemData[] = [
  { label: 'Overview', href: '/dashboard', icon: <DashboardOutlinedIcon sx={{ fontSize: 18 }} /> },
  { label: 'Reviews', href: '/reviews', icon: <ReviewsOutlinedIcon sx={{ fontSize: 18 }} /> },
  { label: 'Messaging', href: '/messaging', icon: <ForumOutlinedIcon sx={{ fontSize: 18 }} /> },
  { label: 'Social', href: '/social', icon: <CampaignOutlinedIcon sx={{ fontSize: 18 }} /> },
  { label: 'Listings', href: '/listings', icon: <PinDropOutlinedIcon sx={{ fontSize: 18 }} /> },
  { label: 'Automations', href: '/automations', icon: <BoltOutlinedIcon sx={{ fontSize: 18 }} /> },
  { label: 'Settings', href: '/settings', icon: <SettingsOutlinedIcon sx={{ fontSize: 18 }} /> },
]

// Google Cloud style NavItem component
interface NavItemProps {
  icon: ReactNode
  label: string
  href: string
  active?: boolean
  onClick?: () => void
}

function NavItem({ icon, label, href, active, onClick }: NavItemProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`group/item flex items-center gap-3 px-4 group-hover:px-4 px-3 py-2.5 text-sm cursor-pointer select-none transition-all duration-150 hover:bg-slate-100 nav-item-link ${
        active ? 'bg-blue-50 font-bold' : 'font-light'
      }`}
      style={{
        fontFamily: "'Product Sans', 'Google Sans', system-ui, sans-serif",
        color: active ? '#001d35' : '#202124',
        fontWeight: active ? 700 : 300,
      }}
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
        {icon}
      </span>
      {/* Label - hidden when sidebar is collapsed, visible on hover */}
      <span className="truncate opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
        {label}
      </span>
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

  // Handler functions for header actions
  const handleSendReviewRequest = () => {
    // Route to reviews section or open modal
    router?.push('/reviews/send')
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
          className="group hidden lg:flex fixed top-14 md:top-16 left-0 h-[calc(100vh-3.5rem)] md:h-[calc(100vh-4rem)] w-16 hover:w-64 flex-col border-r border-slate-200 bg-white transition-all duration-300 ease-in-out overflow-y-auto z-10"
          onMouseEnter={() => setSidebarHovered(true)}
          onMouseLeave={() => setSidebarHovered(false)}
        >
          <nav className="mt-3 flex flex-1 flex-col gap-1 pb-4">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(item.href))
              return (
                <NavItem
                  key={item.href}
                  icon={item.icon}
                  label={item.label}
                  href={item.href}
                  active={isActive}
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
                {navItems.map((item) => {
                  const isActive =
                    pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(item.href))
                  return (
                    <NavItem
                      key={item.href}
                      icon={item.icon}
                      label={item.label}
                      href={item.href}
                      active={isActive}
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
    </div>
  )
}

