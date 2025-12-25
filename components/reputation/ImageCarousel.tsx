'use client'

import Image from 'next/image'

interface ImageCarouselProps {
  images: string[]
  onImageClick?: (imageUrl: string, index: number) => void
  maxVisible?: number // Maximum number of images to show
}

export function ImageCarousel({ images, onImageClick, maxVisible = 4 }: ImageCarouselProps) {
  if (!images || images.length === 0) {
    return null
  }

  // Show up to maxVisible images, or all if less than maxVisible
  const visibleImages = images.slice(0, maxVisible)
  const remainingCount = images.length - maxVisible

  const handleImageClick = (e: React.MouseEvent, imageUrl: string, index: number) => {
    e.stopPropagation()
    if (onImageClick) {
      onImageClick(imageUrl, index)
    }
  }

  return (
    <div className="flex gap-1.5 flex-wrap">
      {visibleImages.map((imageUrl, index) => (
        <div
          key={index}
          className="relative aspect-square w-16 h-16 rounded-md overflow-hidden border border-slate-200 bg-slate-100 cursor-pointer hover:border-slate-300 transition-colors group"
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
      {/* Show "+X more" indicator if there are more images */}
      {remainingCount > 0 && (
        <div
          className="relative aspect-square w-16 h-16 rounded-md overflow-hidden border border-slate-200 bg-slate-100 cursor-pointer hover:border-slate-300 transition-colors flex items-center justify-center"
          onClick={(e) => {
            e.stopPropagation()
            // Clicking "+X more" opens the first hidden image
            if (onImageClick) {
              onImageClick(images[maxVisible], maxVisible)
            }
          }}
        >
          <div className="text-xs font-medium text-slate-600">
            +{remainingCount}
          </div>
        </div>
      )}
    </div>
  )
}

