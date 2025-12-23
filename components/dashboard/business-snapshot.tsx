'use client'

import Link from 'next/link'
import LocationOnIcon from '@mui/icons-material/LocationOn'
import LanguageIcon from '@mui/icons-material/Language'
import StarIcon from '@mui/icons-material/Star'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'

interface BusinessSnapshotProps {
  greeting: string
  business: {
    name: string
    formatted_address: string | null
    rating: number | null
    review_count: number | null
    category: string | null
    website: string | null
  }
  connectedProviders: string[]
}

const CHANNEL_ICONS: Record<string, { icon: string; color: string }> = {
  google_gbp: { icon: 'G', color: '#4285F4' },
  facebook: { icon: 'f', color: '#1877F2' },
  instagram: { icon: '📷', color: '#E4405F' },
  linkedin: { icon: 'in', color: '#0077B5' },
  youtube: { icon: '▶', color: '#FF0000' },
}

export function BusinessSnapshot({
  greeting,
  business,
  connectedProviders,
}: BusinessSnapshotProps) {
  const channels = [
    { id: 'google_gbp', name: 'Google' },
    { id: 'facebook', name: 'Facebook' },
    { id: 'instagram', name: 'Instagram' },
    { id: 'linkedin', name: 'LinkedIn' },
    { id: 'youtube', name: 'YouTube' },
  ]

  return (
    <div className="rounded-2xl bg-white shadow-sm border border-[var(--google-grey-200)] p-5">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        {/* Left Block */}
        <div className="flex-1">
          <h2 className="text-xl font-medium text-[var(--google-grey-900)] mb-2" style={{ fontFamily: 'var(--font-google-sans)' }}>
            {greeting}
          </h2>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-[var(--google-grey-700)]" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
              <span className="font-medium">{business.name}</span>
              {business.category && (
                <>
                  <span className="text-[var(--google-grey-400)]">·</span>
                  <span>{business.category}</span>
                </>
              )}
            </div>

            {business.formatted_address && (
              <div className="flex items-start gap-2 text-sm text-[var(--google-grey-600)]" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                <LocationOnIcon sx={{ fontSize: 18, color: 'var(--google-grey-500)', flexShrink: 0, marginTop: '2px' }} />
                <span>{business.formatted_address}</span>
              </div>
            )}

            {business.website && (
              <div className="flex items-center gap-2 text-sm" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                <LanguageIcon sx={{ fontSize: 18, color: 'var(--google-grey-500)' }} />
                <Link
                  href={business.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#1a73e8] hover:underline"
                >
                  {business.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Right Block */}
        <div className="flex flex-col sm:flex-row lg:flex-col gap-4">
          {/* Rating Badge */}
          {business.rating && (
            <div className="flex items-center gap-3 p-3 bg-[var(--google-grey-50)] rounded-lg">
              <div className="flex items-center gap-1">
                <StarIcon sx={{ fontSize: 32, color: '#fbbf24' }} />
                <span className="text-2xl font-medium text-[var(--google-grey-900)]" style={{ fontFamily: 'var(--font-google-sans)' }}>
                  {business.rating.toFixed(1)}
                </span>
              </div>
              <div className="text-sm text-[var(--google-grey-600)]" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                {business.review_count || 0} Google reviews
              </div>
            </div>
          )}

          {/* Connected Channels */}
          <div className="flex flex-col gap-2">
            <div className="text-xs font-medium text-[var(--google-grey-600)] mb-1" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
              Connected channels
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {channels.map((channel) => {
                const isConnected = connectedProviders.includes(channel.id)
                const channelInfo = CHANNEL_ICONS[channel.id]
                return (
                  <div
                    key={channel.id}
                    className="flex items-center gap-1.5"
                    title={channel.name}
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold"
                      style={{
                        backgroundColor: channelInfo?.color || 'var(--google-grey-400)',
                        opacity: isConnected ? 1 : 0.4,
                      }}
                    >
                      {channelInfo?.icon || channel.name[0]}
                    </div>
                    {isConnected && (
                      <CheckCircleIcon sx={{ fontSize: 14, color: '#34a853' }} />
                    )}
                  </div>
                )
              })}
            </div>
            {connectedProviders.length === 0 && (
              <p className="text-xs text-[var(--google-grey-500)] mt-1" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                Connect from Settings → Channels
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}








