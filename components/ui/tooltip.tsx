'use client'

import { ReactNode, useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface TooltipProps {
  children: ReactNode
  content: ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
}

export function Tooltip({ children, content, side = 'right' }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isVisible && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      if (side === 'right') {
        setPosition({
          top: rect.top + rect.height / 2,
          left: rect.right + 8,
        })
      }
    }
  }, [isVisible, side])

  return (
    <>
      <div
        ref={triggerRef}
        className="relative w-full"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      >
        {children}
      </div>
      {isVisible && typeof window !== 'undefined' && createPortal(
        <div
          className="fixed z-[9999] px-3 py-2.5 text-sm text-white bg-gray-900 rounded-md shadow-xl whitespace-normal max-w-xs pointer-events-none"
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
            transform: 'translateY(-50%)',
          }}
        >
          {content}
        </div>,
        document.body
      )}
    </>
  )
}

