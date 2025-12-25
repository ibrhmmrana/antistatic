'use client'

import { useState } from 'react'
import Image from 'next/image'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'

interface ImageCarouselProps {
  images: string[]
  onImageClick?: (imageUrl: string, index: number) => void
  size?: 'small' | 'medium' | 'large'
  showDots?: boolean
}

export function ImageCarousel({ images, onImageClick, size = 'medium', showDots = true }: ImageCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0)

  if (!images || images.length === 0) {
    return null
  }

  const sizeClasses = {
    small: 'h-16',
    medium: 'h-32',
    large: 'h-64',
  }

  const goToPrevious = (e: React.MouseEvent) => {
    e.stopPropagation()
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1))
  }

  const goToNext = (e: React.MouseEvent) => {
    e.stopPropagation()
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1))
  }

  const goToSlide = (index: number) => {
    setCurrentIndex(index)
  }

  const handleImageClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onImageClick) {
      onImageClick(images[currentIndex], currentIndex)
    }
  }

  return (
    <div className="relative w-full">
      <div
        className={`relative ${sizeClasses[size]} rounded-lg overflow-hidden border border-slate-200 bg-slate-100 cursor-pointer group`}
        onClick={handleImageClick}
      >
        <Image
          src={images[currentIndex]}
          alt={`Review image ${currentIndex + 1}`}
          fill
          className="object-cover"
          unoptimized={!images[currentIndex].includes('lh3.googleusercontent.com') && !images[currentIndex].includes('storage.googleapis.com')}
        />
        
        {/* Navigation arrows */}
        {images.length > 1 && (
          <>
            <button
              onClick={goToPrevious}
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-10"
              aria-label="Previous image"
            >
              <ChevronLeftIcon sx={{ fontSize: 20 }} />
            </button>
            <button
              onClick={goToNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-10"
              aria-label="Next image"
            >
              <ChevronRightIcon sx={{ fontSize: 20 }} />
            </button>
          </>
        )}

        {/* Image count badge */}
        {images.length > 1 && (
          <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded-full">
            {currentIndex + 1} / {images.length}
          </div>
        )}
      </div>

      {/* Dots indicator */}
      {showDots && images.length > 1 && (
        <div className="flex justify-center gap-1 mt-2">
          {images.map((_, index) => (
            <button
              key={index}
              onClick={(e) => {
                e.stopPropagation()
                goToSlide(index)
              }}
              className={`h-1.5 rounded-full transition-all ${
                index === currentIndex ? 'w-6 bg-[#1a73e8]' : 'w-1.5 bg-slate-300'
              }`}
              aria-label={`Go to image ${index + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

