'use client'

import { useRef, useState, useEffect } from 'react'
import Image from 'next/image'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'

interface ImageCarouselProps {
  images: string[]
  onImageClick?: (imageUrl: string, index: number) => void
}

export function ImageCarousel({ images, onImageClick }: ImageCarouselProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  if (!images || images.length === 0) {
    return null
  }

  const checkScrollability = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current
      setCanScrollLeft(scrollLeft > 0)
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1)
    }
  }

  useEffect(() => {
    checkScrollability()
    const container = scrollContainerRef.current
    if (container) {
      container.addEventListener('scroll', checkScrollability)
      window.addEventListener('resize', checkScrollability)
      return () => {
        container.removeEventListener('scroll', checkScrollability)
        window.removeEventListener('resize', checkScrollability)
      }
    }
  }, [images])

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 68 // 64px (image width) + 4px (gap)
      const newScrollLeft =
        scrollContainerRef.current.scrollLeft + (direction === 'left' ? -scrollAmount : scrollAmount)
      scrollContainerRef.current.scrollTo({
        left: newScrollLeft,
        behavior: 'smooth',
      })
    }
  }

  const handleImageClick = (e: React.MouseEvent, imageUrl: string, index: number) => {
    e.stopPropagation()
    if (onImageClick) {
      onImageClick(imageUrl, index)
    }
  }

  return (
    <div className="relative">
      {/* Left Arrow */}
      {canScrollLeft && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            scroll('left')
          }}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white/90 hover:bg-white border border-slate-200 rounded-full p-1 shadow-sm"
          aria-label="Scroll left"
        >
          <ChevronLeftIcon sx={{ fontSize: 18, color: '#475569' }} />
        </button>
      )}

      {/* Scrollable Container */}
      <div
        ref={scrollContainerRef}
        className="flex gap-1 overflow-x-auto scroll-smooth hide-scrollbar"
      >
        {images.map((imageUrl, index) => (
          <div
            key={index}
            className="relative flex-shrink-0 aspect-square w-16 h-16 rounded-md overflow-hidden border border-slate-200 bg-slate-100 cursor-pointer hover:border-slate-300 transition-colors group"
            onClick={(e) => handleImageClick(e, imageUrl, index)}
          >
            <Image
              src={imageUrl}
              alt={`Review image ${index + 1}`}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-200"
              unoptimized={!imageUrl.includes('lh3.googleusercontent.com') && !imageUrl.includes('storage.googleapis.com')}
            />
            {/* Overlay on hover */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
          </div>
        ))}
      </div>

      {/* Right Arrow */}
      {canScrollRight && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            scroll('right')
          }}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white/90 hover:bg-white border border-slate-200 rounded-full p-1 shadow-sm"
          aria-label="Scroll right"
        >
          <ChevronRightIcon sx={{ fontSize: 18, color: '#475569' }} />
        </button>
      )}

    </div>
  )
}

