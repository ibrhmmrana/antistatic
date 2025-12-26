'use client'

import { useState } from 'react'
import LockIcon from '@mui/icons-material/Lock'
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown'
import { Tooltip } from '@/components/ui/tooltip'
import { Sparkline } from './mini-charts/Sparkline'
import { MiniBars } from './mini-charts/MiniBars'
import { LineChartWithLabels } from './mini-charts/LineChartWithLabels'
import { MiniBarsWithLabels } from './mini-charts/MiniBarsWithLabels'
import { RatingLineChart } from './mini-charts/RatingLineChart'

interface OverviewMetricCardProps {
  title: string
  icon: React.ReactNode
  primary: string | number
  primaryLabel?: string
  subLeft?: string
  delta?: {
    value: number // Previous period value (not the difference)
    label: string
  }
  secondaryMetric?: {
    value: string | number
    label: string
    delta?: {
      value: number
      label: string
    }
  }
  channelIcons?: string[] // Array of channel IDs (e.g., ['facebook', 'instagram'])
  chart?: {
    type: 'sparkline' | 'bars' | 'line' | 'barsWithLabels' | 'ratingLine'
    data: Array<{ x: string; y: number }>
    color?: string
    timePeriod?: number // Number of days for time-based charts
  }
  timePeriodOptions?: Array<{ value: string; label: string }> // Time period options (e.g., [{ value: '7', label: '7 days' }])
  onTimePeriodChange?: (period: string) => void // Callback when time period changes
  href?: string
  locked?: boolean
  lockedReason?: string
  titleTooltip?: string // Tooltip text to show on hover of the title
  rating?: number // Small rating display (e.g., 4.6) - shown as a small visual element
  loading?: boolean // Show loading animation for the primary metric
}

// Helper to get channel icon path
function getChannelIconPath(channelId: string): string {
  switch (channelId) {
    case 'facebook':
      return '/Facebook_f_logo_(2019).svg'
    case 'instagram':
      return '/Instagram_logo_2022.svg'
    case 'linkedin':
      return '/LinkedIn_logo_initials.png.webp'
    case 'tiktok':
      return '/tik-tok-logo_578229-290.avif'
    default:
      return ''
  }
}

export function OverviewMetricCard({
  title,
  icon,
  primary,
  primaryLabel,
  subLeft,
  delta,
  secondaryMetric,
  channelIcons,
  chart,
  timePeriodOptions,
  onTimePeriodChange,
  href,
  locked = false,
  lockedReason,
  rating,
  titleTooltip,
  loading = false,
}: OverviewMetricCardProps) {
  const [selectedTimePeriod, setSelectedTimePeriod] = useState(timePeriodOptions?.[0]?.value || '7')
  const [showTimePeriodDropdown, setShowTimePeriodDropdown] = useState(false)
  const cardContent = (
    <div
      className={`rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition-all h-full flex flex-col ${
        locked
          ? 'opacity-60 cursor-not-allowed'
          : ''
      }`}
      onClick={locked ? (e) => e.preventDefault() : undefined}
    >
      {/* Header: Icon + Title + Time Period Selector / Lock */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon}
          {titleTooltip ? (
            <Tooltip content={titleTooltip} side="top">
              <h3
                className="text-sm font-medium text-slate-700 cursor-help"
                style={{ fontFamily: 'var(--font-roboto-stack)' }}
              >
                {title}
              </h3>
            </Tooltip>
          ) : (
            <h3
              className="text-sm font-medium text-slate-700"
              style={{ fontFamily: 'var(--font-roboto-stack)' }}
            >
              {title}
            </h3>
          )}
        </div>
        <div className="flex items-center gap-2">
          {timePeriodOptions && timePeriodOptions.length > 0 && !locked && (
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setShowTimePeriodDropdown(!showTimePeriodDropdown)
                }}
                className="flex items-center gap-1 px-2 py-1 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded transition-colors"
                style={{ fontFamily: 'var(--font-roboto-stack)' }}
              >
                {timePeriodOptions.find((opt) => opt.value === selectedTimePeriod)?.label || '7 days'}
                <ArrowDropDownIcon sx={{ fontSize: 16 }} />
              </button>
              {showTimePeriodDropdown && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowTimePeriodDropdown(false)
                    }}
                  />
                  <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 min-w-[100px]">
                    {timePeriodOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedTimePeriod(option.value)
                          setShowTimePeriodDropdown(false)
                          onTimePeriodChange?.(option.value)
                        }}
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-50 transition-colors ${
                          selectedTimePeriod === option.value
                            ? 'bg-slate-50 font-medium text-slate-900'
                            : 'text-slate-600'
                        }`}
                        style={{ fontFamily: 'var(--font-roboto-stack)' }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          {locked && (
            <LockIcon sx={{ fontSize: 16, color: '#9aa0a6' }} className="flex-shrink-0" />
          )}
        </div>
      </div>

      {/* Main content area */}
      {secondaryMetric ? (
        // Dual metric layout (side by side)
        <div className="flex items-start gap-6">
          {/* Primary metric */}
          <div className="flex-1">
            {loading ? (
              <div className="h-9 mb-1 flex items-center">
                <svg className="animate-spin h-6 w-6 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
            ) : (
              <div
                className="text-3xl font-medium text-slate-900 mb-1"
                style={{ fontFamily: 'var(--font-google-sans)' }}
              >
                {primary}
              </div>
            )}
            {primaryLabel && (
              <p
                className="text-xs text-slate-500 mb-2"
                style={{ fontFamily: 'var(--font-roboto-stack)' }}
              >
                {primaryLabel}
              </p>
            )}
            {delta && (() => {
              // Parse current value from primary (handle both string and number)
              const currentValue = typeof primary === 'string' 
                ? parseFloat(primary.replace(/,/g, '')) || 0
                : typeof primary === 'number' ? primary : 0
              const previousValue = delta.value ?? 0
              const difference = currentValue - previousValue
              const isIncrease = difference > 0.1
              const isDecrease = difference < -0.1
              const isNeutral = Math.abs(difference) <= 0.1

              return (
                <div className="mt-2 flex items-center gap-1">
                  {isNeutral ? (
                    <svg className="w-3 h-3 text-slate-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                    </svg>
                  ) : isIncrease ? (
                    <svg className="w-3 h-3 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="w-3 h-3 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                  <span
                    className={`text-xs font-medium ${
                      isNeutral
                        ? 'text-slate-400'
                        : isIncrease
                          ? 'text-green-600'
                          : 'text-red-600'
                    }`}
                    style={{ fontFamily: 'var(--font-roboto-stack)' }}
                  >
                    {delta.label.includes('stars') || delta.label.includes('requests') || delta.label.includes('impressions') || delta.label.includes('calls') || delta.label.includes('reviews') || delta.label.includes('visits')
                      ? `${(delta.value ?? 0).toLocaleString()} (previous period)`
                      : `${delta.value.toFixed(1)}% (previous period)`}
                  </span>
                </div>
              )
            })()}
          </div>

          {/* Secondary metric */}
          <div className="flex-1">
            {loading ? (
              <div className="h-9 mb-1 flex items-center">
                <svg className="animate-spin h-6 w-6 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
            ) : (
              <div
                className="text-3xl font-medium text-slate-900 mb-1"
                style={{ fontFamily: 'var(--font-google-sans)' }}
              >
                {secondaryMetric.value}
              </div>
            )}
            {secondaryMetric.label && (
              <p
                className="text-xs text-slate-500 mb-2"
                style={{ fontFamily: 'var(--font-roboto-stack)' }}
              >
                {secondaryMetric.label}
              </p>
            )}
            {secondaryMetric.delta && (() => {
              // Parse current value from secondaryMetric (handle both string and number)
              const currentValue = typeof secondaryMetric.value === 'string' 
                ? parseFloat(secondaryMetric.value.replace(/,/g, '')) || 0
                : typeof secondaryMetric.value === 'number' ? secondaryMetric.value : 0
              const previousValue = secondaryMetric.delta.value ?? 0
              const difference = currentValue - previousValue
              const isIncrease = difference > 0.1
              const isDecrease = difference < -0.1
              const isNeutral = Math.abs(difference) <= 0.1

              return (
                <div className="mt-2 flex items-center gap-1">
                  {isNeutral ? (
                    <svg className="w-3 h-3 text-slate-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                    </svg>
                  ) : isIncrease ? (
                    <svg className="w-3 h-3 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="w-3 h-3 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                  <span
                    className={`text-xs font-medium ${
                      isNeutral
                        ? 'text-slate-400'
                        : isIncrease
                          ? 'text-green-600'
                          : 'text-red-600'
                    }`}
                    style={{ fontFamily: 'var(--font-roboto-stack)' }}
                  >
                    {secondaryMetric.delta.label.includes('stars') || secondaryMetric.delta.label.includes('requests') || secondaryMetric.delta.label.includes('impressions') || secondaryMetric.delta.label.includes('calls') || secondaryMetric.delta.label.includes('visits') || secondaryMetric.delta.label.includes('reviews')
                      ? `${(secondaryMetric.delta.value ?? 0).toLocaleString()} (previous period)`
                      : `${secondaryMetric.delta.value.toFixed(1)}% (previous period)`}
                  </span>
                </div>
              )
            })()}
          </div>
        </div>
      ) : (
        // Single metric layout with chart
        <div className="flex items-start justify-between gap-4">
          {/* Left: Numbers */}
          <div className="flex-1 min-w-0">
            {/* Primary number */}
            {loading ? (
              <div className="h-9 mb-1 flex items-center">
                <svg className="animate-spin h-6 w-6 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
            ) : (
              <div
                className="text-3xl font-medium text-slate-900 mb-1"
                style={{ fontFamily: 'var(--font-google-sans)' }}
              >
                {primary}
              </div>
            )}

            {/* Primary label */}
            {primaryLabel && (
              <p
                className="text-xs text-slate-500 mb-2"
                style={{ fontFamily: 'var(--font-roboto-stack)' }}
              >
                {primaryLabel}
              </p>
            )}

            {/* Sub left text */}
            {subLeft && (
              <p
                className="text-xs text-slate-600"
                style={{ fontFamily: 'var(--font-roboto-stack)' }}
              >
                {subLeft}
              </p>
            )}

            {/* Previous Period */}
            {delta && (() => {
              // Parse current value from primary (handle both string and number)
              const currentValue = typeof primary === 'string' 
                ? parseFloat(primary.replace(/,/g, '')) || 0
                : typeof primary === 'number' ? primary : 0
              const previousValue = delta.value ?? 0
              const difference = currentValue - previousValue
              const isIncrease = difference > 0.1
              const isDecrease = difference < -0.1
              const isNeutral = Math.abs(difference) <= 0.1

              return (
                <div className="mt-2 flex items-center gap-1">
                  {isNeutral ? (
                    <svg className="w-3 h-3 text-slate-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                    </svg>
                  ) : isIncrease ? (
                    <svg className="w-3 h-3 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="w-3 h-3 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                  <span
                    className={`text-xs font-medium ${
                      isNeutral
                        ? 'text-slate-400'
                        : isIncrease
                          ? 'text-green-600'
                          : 'text-red-600'
                    }`}
                    style={{ fontFamily: 'var(--font-roboto-stack)' }}
                  >
                    {delta.label.includes('stars') || delta.label.includes('requests') || delta.label.includes('impressions') || delta.label.includes('calls') || delta.label.includes('reviews') || delta.label.includes('visits')
                      ? `${(delta.value ?? 0).toLocaleString()} (previous period)`
                      : `${delta.value.toFixed(1)}% (previous period)`}
                  </span>
                </div>
              )
            })()}
          </div>

          {/* Right: Chart */}
          {chart && (
            <div className={`flex-shrink-0 ${chart.type === 'line' || chart.type === 'barsWithLabels' || chart.type === 'ratingLine' ? 'w-32 h-24' : 'w-20 h-10'}`}>
              {chart.type === 'sparkline' ? (
                <Sparkline data={chart.data} color={chart.color} height={40} />
              ) : chart.type === 'line' ? (
                <LineChartWithLabels data={chart.data} color={chart.color} height={60} />
              ) : chart.type === 'barsWithLabels' ? (
                <MiniBarsWithLabels 
                  key={`chart-${chart.timePeriod}-${chart.data.length}`} 
                  data={chart.data} 
                  color={chart.color} 
                  height={90} 
                  timePeriod={chart.timePeriod} 
                />
              ) : chart.type === 'ratingLine' ? (
                <RatingLineChart data={chart.data} color={chart.color} height={90} />
              ) : (
                <MiniBars data={chart.data} color={chart.color} height={40} />
              )}
            </div>
          )}
        </div>
      )}

      {/* Channel icons in bottom right (if provided) */}
      {channelIcons && channelIcons.length > 0 && (
        <div className="mt-auto pt-3 flex items-center justify-end gap-2">
          {channelIcons.map((channelId) => {
            const iconPath = getChannelIconPath(channelId)
            if (!iconPath) return null
            return (
              <img
                key={channelId}
                src={iconPath}
                alt={channelId}
                className="w-5 h-5 object-contain opacity-70"
              />
            )
          })}
        </div>
      )}
    </div>
  )

  // If locked, wrap in tooltip
  if (locked && lockedReason) {
    const tooltipContent = (
      <div className="space-y-1.5">
        <div className="font-semibold text-white">Locked: {title}</div>
        <div className="text-xs text-gray-300 space-y-1">
          <div>{lockedReason}</div>
          <div>
            <strong>Unlock:</strong> Go to Settings → Tools to enable this module.
          </div>
        </div>
      </div>
    )

    return (
      <Tooltip content={tooltipContent} side="top">
        {cardContent}
      </Tooltip>
    )
  }

  // Return card content (no link wrapper)
  return cardContent
}

