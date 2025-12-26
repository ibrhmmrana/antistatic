'use client'

import { useEffect } from 'react'
import Image from 'next/image'
import CloseIcon from '@mui/icons-material/Close'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'

interface ImagePopupProps {
  images: string[]
  currentIndex: number
  isOpen: boolean
  onClose: () => void
  onNavigate: (index: number) => void
}

export function ImagePopup({ images, currentIndex, isOpen, onClose, onNavigate }: ImagePopupProps) {
  useEffect(() => {
    if (isOpen) {
      // Prevent body scroll when popup is open
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return

      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowLeft') {
        const prevIndex = currentIndex === 0 ? images.length - 1 : currentIndex - 1
        onNavigate(prevIndex)
      } else if (e.key === 'ArrowRight') {
        const nextIndex = currentIndex === images.length - 1 ? 0 : currentIndex + 1
        onNavigate(nextIndex)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, currentIndex, images.length, onClose, onNavigate])

  if (!isOpen || !images || images.length === 0) {
    return null
  }

  const goToPrevious = () => {
    const prevIndex = currentIndex === 0 ? images.length - 1 : currentIndex - 1
    onNavigate(prevIndex)
  }

  const goToNext = () => {
    const nextIndex = currentIndex === images.length - 1 ? 0 : currentIndex + 1
    onNavigate(nextIndex)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors z-10 bg-black/50 rounded-full p-2"
        aria-label="Close"
      >
        <CloseIcon sx={{ fontSize: 28 }} />
      </button>

      {/* Navigation arrows */}
      {images.length > 1 && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation()
              goToPrevious()
            }}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 transition-colors z-10 bg-black/50 rounded-full p-2"
            aria-label="Previous image"
          >
            <ChevronLeftIcon sx={{ fontSize: 32 }} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              goToNext()
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 transition-colors z-10 bg-black/50 rounded-full p-2"
            aria-label="Next image"
          >
            <ChevronRightIcon sx={{ fontSize: 32 }} />
          </button>
        </>
      )}

      {/* Image counter */}
      {images.length > 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white text-sm bg-black/50 px-3 py-1 rounded-full">
          {currentIndex + 1} / {images.length}
        </div>
      )}

      {/* Image container */}
      <div
        className="relative max-w-[90vw] max-h-[90vh] w-full h-full flex items-center justify-center p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative w-full h-full max-w-5xl max-h-[85vh]">
          <Image
            src={images[currentIndex]}
            alt={`Review image ${currentIndex + 1}`}
            fill
            className="object-contain"
            unoptimized={!images[currentIndex].includes('lh3.googleusercontent.com') && !images[currentIndex].includes('storage.googleapis.com')}
            priority
          />
        </div>
      </div>
    </div>
  )
}



