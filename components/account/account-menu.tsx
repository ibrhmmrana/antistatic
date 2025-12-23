'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import CloseIcon from '@mui/icons-material/Close'
import AddIcon from '@mui/icons-material/Add'
import LogoutIcon from '@mui/icons-material/Logout'

type CurrentUser = {
  name: string
  email: string
  avatarUrl?: string
}

interface AccountMenuProps {
  userName?: string
  userEmail?: string
  businessName?: string | null
}

export function AccountMenu({ userName, userEmail, businessName }: AccountMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const router = useRouter()
  
  // Use provided props or fallback to defaults
  const user: CurrentUser = {
    name: userName || 'User',
    email: userEmail || 'user@example.com',
  }
  
  const primaryBusinessName = businessName || 'your business'

  const firstName = user.name.split(' ')[0]
  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2)

  // Close menu
  const closeMenu = () => setIsOpen(false)
  const toggleMenu = () => setIsOpen(!isOpen)

  // Click outside handler
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        closeMenu()
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    // Focus trap: focus the close button when menu opens
    const closeButton = menuRef.current?.querySelector(
      '[aria-label="Close account menu"]'
    ) as HTMLButtonElement
    if (closeButton) {
      closeButton.focus()
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  // Handle navigation
  const handleAccountSettings = () => {
    router.push('/settings/account')
    closeMenu()
  }

  const handleAddLocation = () => {
    router.push('/onboarding/business')
    closeMenu()
  }

  const handleSignOut = async () => {
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signOut()
      
      if (error) {
        console.error('Error signing out:', error)
        // Still redirect even if there's an error
      }
      
      // Use window.location for full page reload to clear session
      window.location.href = '/auth'
    } catch (error) {
      console.error('Error signing out:', error)
      // Still redirect even if there's an error
      window.location.href = '/auth'
    }
  }

  const popoverContent = isOpen ? (
    <div
      ref={menuRef}
      className="fixed top-16 right-3 z-50 w-[380px] max-w-[calc(100vw-1.5rem)] rounded-3xl bg-[#EAEEF6] shadow-[0_4px_16px_rgba(0,0,0,0.15),0_0_0_1px_rgba(0,0,0,0.05)] border border-slate-200 overflow-hidden transform origin-top-right transition-all duration-150 ease-out"
      style={{
        opacity: isOpen ? 1 : 0,
        transform: isOpen ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.98)',
      }}
    >
      <div className="p-6 account-menu-content">
        {/* Top row: email + close */}
        <div className="relative flex items-start justify-center mb-4">
          <p className="text-xs font-medium tracking-wide text-slate-500 text-center" style={{ fontFamily: 'var(--font-google-sans) !important' }}>
            {user.email}
          </p>
          <button
            type="button"
            onClick={closeMenu}
            className="absolute right-0 top-0 inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-white/70 active:scale-95 active:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 transition-all duration-150"
            aria-label="Close account menu"
          >
            <CloseIcon sx={{ fontSize: 16 }} />
          </button>
        </div>

        {/* Avatar + greeting */}
        <div className="flex flex-col items-center text-center mb-6">
          {/* Large avatar */}
          <div className="mb-3 h-20 w-20 rounded-full border-4 border-white shadow-md bg-sky-500 flex items-center justify-center text-3xl font-semibold text-white overflow-hidden">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <span>{initials}</span>
            )}
          </div>
          <h2 className="text-lg font-medium text-slate-900" style={{ fontFamily: 'var(--font-google-sans)' }}>
            Hi, {firstName}!
          </h2>
          <p className="mt-1 text-xs text-slate-600" style={{ fontFamily: 'var(--font-google-sans) !important' }}>
            Managing <span className="font-medium">{primaryBusinessName}</span> in Antistatic.
          </p>
        </div>

        {/* Primary CTA */}
        <button
          type="button"
          onClick={handleAccountSettings}
          className="mb-5 inline-flex w-full items-center justify-center rounded-full border-2 px-4 py-2.5 text-sm font-medium bg-transparent hover:bg-slate-100 active:scale-[0.98] active:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 transition-all duration-150"
          style={{ 
            fontFamily: 'var(--font-google-sans)',
            borderColor: '#B0B5BA',
            color: '#3D6AD7'
          }}
        >
          Open account settings
        </button>

        {/* Two large action buttons */}
        <div className="grid gap-3 sm:grid-cols-2 mb-3">
          <button
            type="button"
            onClick={handleAddLocation}
            className="flex items-center justify-center gap-2 rounded-2xl bg-white/80 px-4 py-3 text-sm font-medium text-slate-800 shadow-sm hover:bg-white active:scale-[0.98] active:bg-slate-50 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 transition-all duration-150"
            style={{ fontFamily: 'var(--font-google-sans) !important' }}
          >
            <AddIcon sx={{ fontSize: 16, color: '#0284c7' }} />
            <span>Add or switch location</span>
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            className="flex items-center justify-center gap-2 rounded-2xl bg-white/80 px-4 py-3 text-sm font-medium text-slate-800 shadow-sm hover:bg-white active:scale-[0.98] active:bg-slate-50 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 transition-all duration-150"
            style={{ fontFamily: 'var(--font-google-sans) !important' }}
          >
            <LogoutIcon sx={{ fontSize: 16, color: '#ef4444' }} />
            <span>Sign out</span>
          </button>
        </div>

        {/* Bottom tiny links row */}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3 border-t border-slate-200/60 pt-3">
          <button
            type="button"
            className="text-[11px] text-slate-600 hover:underline active:scale-95 active:text-slate-800 transition-transform duration-100"
            style={{ fontFamily: 'var(--font-google-sans)' }}
          >
            Privacy
          </button>
          <span className="text-[10px] text-slate-400">•</span>
          <button
            type="button"
            className="text-[11px] text-slate-600 hover:underline active:scale-95 active:text-slate-800 transition-transform duration-100"
            style={{ fontFamily: 'var(--font-google-sans)' }}
          >
            Terms
          </button>
          <span className="text-[10px] text-slate-400">•</span>
          <button
            type="button"
            className="text-[11px] text-slate-600 hover:underline active:scale-95 active:text-slate-800 transition-transform duration-100"
            style={{ fontFamily: 'var(--font-google-sans)' }}
          >
            System status
          </button>
        </div>
      </div>
    </div>
  ) : null

  return (
    <>
      {/* Account button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleMenu}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-medium shadow-sm hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 transition-all"
        aria-label="Open account menu"
        aria-expanded={isOpen}
      >
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.name}
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <div className="h-8 w-8 rounded-full bg-sky-500 flex items-center justify-center text-white text-xs font-medium" style={{ fontFamily: 'var(--font-google-sans)' }}>
            {initials}
          </div>
        )}
      </button>

      {/* Popover - rendered via portal */}
      {typeof window !== 'undefined' && createPortal(popoverContent, document.body)}
    </>
  )
}

