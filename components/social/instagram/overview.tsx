'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Database } from '@/lib/supabase/database.types'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import WarningIcon from '@mui/icons-material/Warning'
import ErrorIcon from '@mui/icons-material/Error'
import RefreshIcon from '@mui/icons-material/Refresh'
import MessageIcon from '@mui/icons-material/Message'
import CommentIcon from '@mui/icons-material/Comment'
import ImageIcon from '@mui/icons-material/Image'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'

type InstagramConnection = Database['public']['Tables']['instagram_connections']['Row']

interface InstagramOverviewProps {
  locationId: string
  instagramConnection: InstagramConnection | null
}

interface OverviewData {
  profile: {
    username: string | null
    userId: string
    followersCount?: number
    mediaCount?: number
  } | null
  stats: {
    totalPosts: number
    totalComments: number
    unreadMessages: number
    pendingComments: number
  }
  recentPosts: Array<{
    id: string
    caption: string
    likesCount: number
    commentsCount: number
    timestamp: string
    mediaUrl?: string
    permalink: string
  }>
  lastSync: string | null
}

export function InstagramOverview({ locationId, instagramConnection }: InstagramOverviewProps) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<OverviewData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchOverview = async () => {
      if (!instagramConnection) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const response = await fetch(`/api/social/instagram/profile?locationId=${locationId}`)
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || 'Failed to fetch overview data')
        }
        const result = await response.json()
        setData(result)
        setError(null)
      } catch (err: any) {
        console.error('Error fetching overview:', err)
        setError(err.message || 'Failed to load overview')
      } finally {
        setLoading(false)
      }
    }

    fetchOverview()
  }, [locationId, instagramConnection])

  const getPermissionStatus = () => {
    if (!instagramConnection?.scopes) return 'unknown'
    const scopes = instagramConnection.scopes
    const hasBasic = scopes.some(s => s.includes('instagram_business_basic'))
    const hasInsights = scopes.some(s => s.includes('instagram_business_manage_insights'))
    const hasComments = scopes.some(s => s.includes('instagram_manage_comments') || s.includes('instagram_business_manage_comments'))
    const hasMessages = scopes.some(s => s.includes('instagram_business_manage_messages'))
    const hasPublish = scopes.some(s => s.includes('instagram_business_content_publish'))

    if (hasBasic && hasInsights && hasComments && hasMessages && hasPublish) {
      return 'ok'
    } else if (hasBasic) {
      return 'partial'
    }
    return 'limited'
  }

  const permissionStatus = getPermissionStatus()

  if (!instagramConnection) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
        <p className="text-slate-600 mb-4">Instagram account not connected</p>
        <Button
          onClick={() => {
            window.location.href = `/api/integrations/instagram/connect?business_location_id=${locationId}`
          }}
        >
          Connect Instagram
        </Button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg border border-slate-200 p-6 animate-pulse">
          <div className="h-6 bg-slate-200 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-slate-200 rounded w-1/2"></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <div className="flex items-center gap-2 text-red-600 mb-4">
          <ErrorIcon sx={{ fontSize: 20 }} />
          <p className="font-semibold">Error loading overview</p>
        </div>
        <p className="text-slate-600 mb-4">{error}</p>
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Connection Status Card */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <img
              src="/Instagram_logo_2022.svg"
              alt="Instagram"
              className="w-10 h-10"
            />
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                @{instagramConnection.instagram_username || 'Unknown'}
              </h2>
              <p className="text-sm text-slate-600">
                {data?.profile?.followersCount ? `${data.profile.followersCount.toLocaleString()} followers` : 'Instagram Business Account'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {data?.lastError && (data.lastError.includes('expired') || data.lastError.includes('reconnect')) ? (
              <div className="flex items-center gap-1 text-red-600">
                <ErrorIcon sx={{ fontSize: 20 }} />
                <span className="text-sm font-medium">Token Expired - Reconnect Required</span>
              </div>
            ) : permissionStatus === 'ok' ? (
              <div className="flex items-center gap-1 text-green-600">
                <CheckCircleIcon sx={{ fontSize: 20 }} />
                <span className="text-sm font-medium">Permissions OK</span>
              </div>
            ) : permissionStatus === 'partial' ? (
              <div className="flex items-center gap-1 text-yellow-600">
                <WarningIcon sx={{ fontSize: 20 }} />
                <span className="text-sm font-medium">Limited Permissions</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-red-600">
                <ErrorIcon sx={{ fontSize: 20 }} />
                <span className="text-sm font-medium">Action Needed</span>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="flex items-center gap-2 text-slate-600">
            <span className="text-sm">Last sync:</span>
            <span className="text-sm font-medium">
              {data?.lastSync ? new Date(data.lastSync).toLocaleString() : 'Never'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  const response = await fetch('/api/social/instagram/sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ locationId }),
                  })
                  const result = await response.json()
                  if (result.success) {
                    // Refresh the page to show updated data
                    window.location.reload()
                  } else {
                    const errorMsg = result.error || 'Unknown error'
                    if (result.requiresReconnect || errorMsg.includes('expired') || errorMsg.includes('reconnect')) {
                      if (confirm(`${errorMsg}\n\nWould you like to reconnect your Instagram account now?`)) {
                        window.location.href = `/api/integrations/instagram/connect?business_location_id=${locationId}`
                      }
                    } else {
                      alert(`Sync failed: ${errorMsg}`)
                    }
                  }
                } catch (error: any) {
                  alert(`Sync failed: ${error.message}`)
                }
              }}
            >
              <RefreshIcon sx={{ fontSize: 16 }} className="mr-1" />
              Sync Now
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                window.location.href = `/api/integrations/instagram/connect?business_location_id=${locationId}`
              }}
            >
              Reconnect
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                if (confirm('Are you sure you want to disconnect Instagram?')) {
                  await fetch(`/api/integrations/instagram/disconnect?business_location_id=${locationId}`, {
                    method: 'POST',
                  })
                  window.location.reload()
                }
              }}
            >
              Disconnect
            </Button>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-600">Total Posts</span>
            <ImageIcon sx={{ fontSize: 20 }} className="text-slate-400" />
          </div>
          <p className="text-2xl font-semibold text-slate-900">
            {data?.stats.totalPosts ?? 0}
          </p>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-600">Total Comments</span>
            <CommentIcon sx={{ fontSize: 20 }} className="text-slate-400" />
          </div>
          <p className="text-2xl font-semibold text-slate-900">
            {data?.stats.totalComments ?? 0}
          </p>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-600">Unread Messages</span>
            <MessageIcon sx={{ fontSize: 20 }} className="text-slate-400" />
          </div>
          <p className="text-2xl font-semibold text-slate-900">
            {data?.stats.unreadMessages ?? 0}
          </p>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-600">Pending Comments</span>
            <TrendingUpIcon sx={{ fontSize: 20 }} className="text-slate-400" />
          </div>
          <p className="text-2xl font-semibold text-slate-900">
            {data?.stats.pendingComments ?? 0}
          </p>
        </div>
      </div>

      {/* 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column */}
        <div className="space-y-6">
          {/* Inbox Preview */}
          <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Recent Messages</h3>
              <Button
                variant="text"
                size="sm"
                onClick={() => {
                  const params = new URLSearchParams(window.location.search)
                  params.set('igTab', 'inbox')
                  window.location.href = `/social?${params.toString()}`
                }}
              >
                View All
              </Button>
            </div>
            <div className="space-y-3">
              {data?.stats.unreadMessages ? (
                <p className="text-sm text-slate-600">
                  {data.stats.unreadMessages} unread message{data.stats.unreadMessages !== 1 ? 's' : ''}
                </p>
              ) : (
                <p className="text-sm text-slate-500 italic">No new messages</p>
              )}
            </div>
          </div>

          {/* Comments Needing Attention */}
          <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Comments Needing Attention</h3>
              <Button
                variant="text"
                size="sm"
                onClick={() => {
                  const params = new URLSearchParams(window.location.search)
                  params.set('igTab', 'comments')
                  window.location.href = `/social?${params.toString()}`
                }}
              >
                View All
              </Button>
            </div>
            <div className="space-y-3">
              {data?.stats.pendingComments ? (
                <p className="text-sm text-slate-600">
                  {data.stats.pendingComments} comment{data.stats.pendingComments !== 1 ? 's' : ''} pending reply
                </p>
              ) : (
                <p className="text-sm text-slate-500 italic">All comments handled</p>
              )}
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Recent Posts Performance */}
          <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Recent Posts</h3>
              <Button
                variant="text"
                size="sm"
                onClick={() => {
                  const params = new URLSearchParams(window.location.search)
                  params.set('igTab', 'content')
                  window.location.href = `/social?${params.toString()}`
                }}
              >
                View All
              </Button>
            </div>
            <div className="space-y-3">
              {data?.recentPosts && data.recentPosts.length > 0 ? (
                data.recentPosts.slice(0, 3).map((post) => (
                  <a
                    key={post.id}
                    href={post.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    {post.mediaUrl && (
                      <img
                        src={post.mediaUrl}
                        alt="Post"
                        className="w-16 h-16 object-cover rounded flex-shrink-0"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none'
                        }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-900 line-clamp-2 mb-1">
                        {post.caption || 'No caption'}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-slate-600">
                        <span>❤️ {post.likesCount.toLocaleString()}</span>
                        <span>💬 {post.commentsCount.toLocaleString()}</span>
                      </div>
                    </div>
                  </a>
                ))
              ) : (
                <p className="text-sm text-slate-500 italic">No posts yet</p>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Quick Actions</h3>
            <div className="space-y-2">
              <Button
                className="w-full justify-start"
                variant="outline"
                onClick={() => {
                  const params = new URLSearchParams(window.location.search)
                  params.set('igTab', 'content')
                  window.location.href = `/social?${params.toString()}`
                }}
              >
                Create New Post
              </Button>
              <Button
                className="w-full justify-start"
                variant="outline"
                onClick={() => {
                  const params = new URLSearchParams(window.location.search)
                  params.set('igTab', 'insights')
                  window.location.href = `/social?${params.toString()}`
                }}
              >
                View Analytics
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

