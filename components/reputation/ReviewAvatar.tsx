'use client'

import Image from 'next/image'

interface ReviewAvatarProps {
  authorName: string
  authorPhotoUrl?: string | null
  size?: number
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

export function ReviewAvatar({ authorName, authorPhotoUrl, size = 40 }: ReviewAvatarProps) {
  const initials = getInitials(authorName)

  if (authorPhotoUrl) {
    return (
      <div className="relative rounded-full overflow-hidden flex-shrink-0 bg-slate-200" style={{ width: size, height: size }}>
        <Image
          src={authorPhotoUrl}
          alt={authorName}
          width={size}
          height={size}
          className="object-cover"
          unoptimized={!authorPhotoUrl.includes('lh3.googleusercontent.com')}
        />
      </div>
    )
  }

  // Fallback to initials
  return (
    <div
      className="rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-medium text-sm flex-shrink-0"
      style={{ width: size, height: size }}
    >
      {initials}
    </div>
  )
}

