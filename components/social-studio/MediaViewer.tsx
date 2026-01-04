'use client'

import { useEffect } from 'react'
import Image from 'next/image'

interface MediaViewerProps {
  media: {
    url: string
    type?: 'image' | 'video'
  } | null
  onClose: () => void
}

export function MediaViewer({ media, onClose }: MediaViewerProps) {
  useEffect(() => {
    if (media) {
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [media])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    if (media) {
      window.addEventListener('keydown', handleEscape)
      return () => window.removeEventListener('keydown', handleEscape)
    }
  }, [media, onClose])

  if (!media) return null

  const isVideo = media.type === 'video' || media.url.match(/\.(mp4|webm|ogg|mov)(\?|$)/i)

  return (
    <div
      className="fixed inset-0 z-50 bg-black bg-opacity-90 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative max-w-7xl max-h-full w-full h-full flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-10 h-10 bg-black bg-opacity-50 hover:bg-opacity-75 rounded-full flex items-center justify-center text-white transition-colors"
          aria-label="Close"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Media Content */}
        {isVideo ? (
          <video
            src={media.url}
            controls
            autoPlay
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          >
            Your browser does not support the video tag.
          </video>
        ) : (
          <div className="relative max-w-full max-h-full">
            <Image
              src={media.url}
              alt="Full size media"
              width={1920}
              height={1080}
              className="max-w-full max-h-full object-contain"
              unoptimized
            />
          </div>
        )}
      </div>
    </div>
  )
}

