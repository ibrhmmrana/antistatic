'use client'

import { useState, useEffect } from 'react'
import { Database } from '@/lib/supabase/database.types'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import VisibilityIcon from '@mui/icons-material/Visibility'
import PersonAddIcon from '@mui/icons-material/PersonAdd'
import FavoriteIcon from '@mui/icons-material/Favorite'
import { Button } from '@/components/ui/button'

// Instagram connection type (table may not be in generated types yet)
type InstagramConnection = {
  id: string
  business_location_id: string
  access_token: string
  instagram_user_id: string
  instagram_username: string | null
  scopes: string[] | null
  token_expires_at: string | null
  created_at: string
  updated_at: string
} | null

interface InstagramInsightsProps {
  locationId: string
  instagramConnection: InstagramConnection | null
}

interface InsightData {
  status: 'success' | 'empty' | 'disabled'
  reach?: number
  impressions?: number
  profileVisits?: number
  followerGrowth?: number
  engagementRate?: number
  websiteClicks?: number
  emailContacts?: number
  phoneCallClicks?: number
  dailyData?: Array<{
    date: string
    reach?: number
    impressions?: number
    profile_visits?: number
  }>
  requiredPermission?: string
  lastError?: string
  errorCode?: string
  errorPayload?: any
  missingScopes?: string[]
  suggestion?: string
}

export function InstagramInsights({ locationId, instagramConnection }: InstagramInsightsProps) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<InsightData | null>(null)

  useEffect(() => {
    const fetchInsights = async () => {
      if (!instagramConnection) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const response = await fetch(`/api/social/instagram/insights?locationId=${locationId}`)
        if (response.ok) {
          const result = await response.json()
          setData(result)
        } else {
          const errorData = await response.json().catch(() => ({}))
          setData({
            status: 'disabled',
            lastError: errorData.error || 'Failed to fetch insights',
          })
        }
      } catch (error: any) {
        setData({
          status: 'disabled',
          lastError: error.message || 'Failed to fetch insights',
        })
      } finally {
        setLoading(false)
      }
    }

    fetchInsights()
  }, [locationId, instagramConnection])

  if (!instagramConnection) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
        <p className="text-slate-600">Instagram account not connected</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-lg border border-slate-200 p-6 animate-pulse">
              <div className="h-4 bg-slate-200 rounded w-1/2 mb-2"></div>
              <div className="h-8 bg-slate-200 rounded w-1/3"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (data?.status === 'disabled') {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-8">
        <div className="text-center">
          <TrendingUpIcon sx={{ fontSize: 48 }} className="text-slate-300 mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Insights Not Available</h3>
          {data.lastError && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-left max-w-2xl mx-auto">
              <p className="text-sm font-medium text-red-800 mb-1">Error:</p>
              <p className="text-sm text-red-700 mb-2">{data.lastError}</p>
              {data.errorCode && (
                <p className="text-xs text-red-600 mb-2">Error Code: {data.errorCode}</p>
              )}
              {data.errorPayload && (
                <details className="mt-2">
                  <summary className="text-xs text-red-600 cursor-pointer hover:text-red-800">
                    View full error details
                  </summary>
                  <pre className="mt-2 p-2 bg-red-100 rounded text-xs text-red-900 overflow-auto max-h-48">
                    {JSON.stringify(data.errorPayload, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          )}
          {data.requiredPermission && (
            <div className="mb-4">
              <p className="text-slate-600 mb-2">
                Required permission: <code className="bg-slate-100 px-2 py-1 rounded text-sm">{data.requiredPermission}</code>
              </p>
              <Button
                onClick={() => {
                  window.location.href = `/api/integrations/instagram/connect?business_location_id=${locationId}`
                }}
              >
                Reconnect Instagram
              </Button>
            </div>
          )}
          {data.missingScopes && data.missingScopes.length > 0 && (
            <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-left max-w-2xl mx-auto">
              <p className="text-sm font-medium text-yellow-800 mb-2">Missing Scopes:</p>
              <ul className="list-disc list-inside text-sm text-yellow-700">
                {data.missingScopes.map((scope: string) => (
                  <li key={scope}><code className="bg-yellow-100 px-1 rounded text-xs">{scope}</code></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (data?.status === 'empty') {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-8">
        <div className="text-center">
          <TrendingUpIcon sx={{ fontSize: 48 }} className="text-slate-300 mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No Insights Data</h3>
          <p className="text-slate-600 mb-4">{data.suggestion || 'Run a sync to fetch insights data'}</p>
          <Button
            onClick={async () => {
              try {
                const response = await fetch('/api/social/instagram/sync', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ locationId }),
                })
                const result = await response.json()
                if (result.success) {
                  window.location.reload()
                } else {
                  alert(`Sync failed: ${result.error || 'Unknown error'}`)
                }
              } catch (error: any) {
                alert(`Sync failed: ${error.message}`)
              }
            }}
          >
            Run Sync
          </Button>
        </div>
      </div>
    )
  }

  if (data?.status !== 'success') {
    return null // Handled above
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-600">Reach</span>
            <VisibilityIcon sx={{ fontSize: 20 }} className="text-slate-400" />
          </div>
          <p className="text-2xl font-semibold text-slate-900">
            {data.reach?.toLocaleString() ?? '—'}
          </p>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-600">Impressions</span>
            <TrendingUpIcon sx={{ fontSize: 20 }} className="text-slate-400" />
          </div>
          <p className="text-2xl font-semibold text-slate-900">
            {data.impressions?.toLocaleString() ?? '—'}
          </p>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-600">Profile Visits</span>
            <PersonAddIcon sx={{ fontSize: 20 }} className="text-slate-400" />
          </div>
          <p className="text-2xl font-semibold text-slate-900">
            {data.profileVisits?.toLocaleString() ?? '—'}
          </p>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-600">Engagement Rate</span>
            <FavoriteIcon sx={{ fontSize: 20 }} className="text-slate-400" />
          </div>
          <p className="text-2xl font-semibold text-slate-900">
            {data.engagementRate ? `${data.engagementRate.toFixed(1)}%` : '—'}
          </p>
        </div>
      </div>

      {/* Simple Line Chart */}
      {data.dailyData && data.dailyData.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Performance Over Time (Last 30 Days)</h3>
          <div className="h-64 flex items-end justify-between gap-1">
            {data.dailyData.slice(0, 30).reverse().map((day, idx) => {
              const maxReach = Math.max(...data.dailyData!.map(d => d.reach || 0))
              const maxImpressions = Math.max(...data.dailyData!.map(d => d.impressions || 0))
              const maxValue = Math.max(maxReach, maxImpressions)
              const reachHeight = maxValue > 0 ? ((day.reach || 0) / maxValue) * 100 : 0
              const impressionsHeight = maxValue > 0 ? ((day.impressions || 0) / maxValue) * 100 : 0
              
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-1 group">
                  <div className="w-full flex flex-col items-center justify-end gap-0.5" style={{ height: '200px' }}>
                    {day.reach && (
                      <div
                        className="w-full bg-blue-500 rounded-t opacity-80 hover:opacity-100 transition-opacity"
                        style={{ height: `${reachHeight}%` }}
                        title={`Reach: ${day.reach}`}
                      />
                    )}
                    {day.impressions && (
                      <div
                        className="w-full bg-green-500 rounded-t opacity-80 hover:opacity-100 transition-opacity"
                        style={{ height: `${impressionsHeight}%` }}
                        title={`Impressions: ${day.impressions}`}
                      />
                    )}
                  </div>
                  {idx % 7 === 0 && (
                    <span className="text-xs text-slate-500 transform -rotate-45 origin-bottom-left whitespace-nowrap">
                      {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          <div className="flex items-center justify-center gap-4 mt-4">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-500 rounded"></div>
              <span className="text-sm text-slate-600">Reach</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-500 rounded"></div>
              <span className="text-sm text-slate-600">Impressions</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

