'use client'

import { useState, useEffect } from 'react'

interface WatchlistTabProps {
  businessLocationId: string
}

export function WatchlistTab({ businessLocationId }: WatchlistTabProps) {
  const [watchlist, setWatchlist] = useState<any[]>([])
  const [selectedCompetitor, setSelectedCompetitor] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadWatchlist()
  }, [businessLocationId])

  const loadWatchlist = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/competitors/watchlist?locationId=${businessLocationId}`)
      if (response.ok) {
        const data = await response.json()
        setWatchlist(data.competitors || [])
      }
    } catch (error) {
      console.error('Failed to load watchlist:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left Column - Watchlist */}
      <div className="min-h-0 overflow-y-auto">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Watchlist</h2>
        {loading ? (
          <div className="text-slate-500">Loading watchlist...</div>
        ) : watchlist.length > 0 ? (
          <div className="space-y-3">
            {watchlist.map((competitor) => (
              <div
                key={competitor.id}
                onClick={() => setSelectedCompetitor(competitor)}
                className={`bg-white rounded-lg border p-4 shadow-sm cursor-pointer transition-all ${
                  selectedCompetitor?.id === competitor.id
                    ? 'border-[#1a73e8] shadow-md'
                    : 'border-slate-200 hover:shadow-md'
                }`}
              >
                <div className="flex items-start gap-3">
                  {competitor.imageUrl && (
                    <img
                      src={competitor.imageUrl}
                      alt={competitor.title}
                      className="w-12 h-12 rounded-lg object-cover"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 truncate">{competitor.title}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      {competitor.totalScore && (
                        <div className="flex items-center gap-1">
                          <span className="text-yellow-400 text-sm">★</span>
                          <span className="text-sm font-medium">{competitor.totalScore.toFixed(1)}</span>
                        </div>
                      )}
                      {competitor.reviewsCount && (
                        <span className="text-sm text-slate-600">({competitor.reviewsCount} reviews)</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-slate-500">No competitors in watchlist yet.</div>
        )}
      </div>

      {/* Right Column - Competitor Detail */}
      <div className="min-h-0 overflow-y-auto">
        {selectedCompetitor ? (
          <CompetitorDetail competitor={selectedCompetitor} businessLocationId={businessLocationId} />
        ) : (
          <div className="flex items-center justify-center h-full min-h-[400px] text-slate-400 bg-white rounded-lg border border-slate-200 p-8">
            Select a competitor to view details
          </div>
        )}
      </div>
    </div>
  )
}

function CompetitorDetail({ competitor, businessLocationId }: { competitor: any; businessLocationId: string }) {
  const [socialHandles, setSocialHandles] = useState<any[]>([])
  const [editingHandles, setEditingHandles] = useState(false)
  const [newHandle, setNewHandle] = useState({ platform: 'instagram', handle: '' })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (competitor.id) {
      loadSocialHandles()
    }
  }, [competitor.id])

  const loadSocialHandles = async () => {
    try {
      const response = await fetch(`/api/competitors/${competitor.id}/handles`)
      if (response.ok) {
        const data = await response.json()
        setSocialHandles(data.handles || [])
      }
    } catch (error) {
      console.error('Failed to load social handles:', error)
    }
  }

  const handleSaveHandles = async () => {
    setLoading(true)
    try {
      const handlesToSave = editingHandles && newHandle.handle.trim()
        ? [...socialHandles, newHandle].filter(h => h.handle.trim())
        : socialHandles

      const response = await fetch(`/api/competitors/${competitor.id}/handles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handles: handlesToSave }),
      })
      if (response.ok) {
        await loadSocialHandles()
        setEditingHandles(false)
        setNewHandle({ platform: 'instagram', handle: '' })
      }
    } catch (error) {
      console.error('Failed to save handles:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveHandle = async (handleId: string) => {
    try {
      const response = await fetch(`/api/competitors/${competitor.id}/handles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handles: socialHandles.filter((h: any) => h.id !== handleId) }),
      })
      if (response.ok) {
        await loadSocialHandles()
      }
    } catch (error) {
      console.error('Failed to remove handle:', error)
    }
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-900 mb-4">{competitor.title}</h2>
      
      {/* Metrics Cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-slate-50 rounded-lg p-4">
          <div className="text-sm text-slate-600">Rating</div>
          <div className="text-2xl font-semibold text-slate-900">{(competitor.total_score || competitor.totalScore)?.toFixed(1) || 'N/A'}</div>
        </div>
        <div className="bg-slate-50 rounded-lg p-4">
          <div className="text-sm text-slate-600">Reviews</div>
          <div className="text-2xl font-semibold text-slate-900">{competitor.reviews_count || competitor.reviewsCount || 0}</div>
        </div>
      </div>

      {/* Social Handles Section */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-900">Social Handles</h3>
          {!editingHandles && (
            <button
              onClick={() => setEditingHandles(true)}
              className="text-sm text-[#1a73e8] hover:underline"
            >
              Add
            </button>
          )}
        </div>
        {socialHandles.length > 0 && (
          <div className="space-y-2 mb-3">
            {socialHandles.map((handle: any) => (
              <div key={handle.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-md">
                <div>
                  <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full mr-2 capitalize">
                    {handle.platform}
                  </span>
                  <span className="text-sm text-slate-900">{handle.handle}</span>
                </div>
                {editingHandles && (
                  <button
                    onClick={() => handleRemoveHandle(handle.id)}
                    className="text-sm text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {editingHandles && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <select
                value={newHandle.platform}
                onChange={(e) => setNewHandle({ ...newHandle, platform: e.target.value })}
                className="px-3 py-2 text-sm border border-slate-300 rounded-md"
              >
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
                <option value="tiktok">TikTok</option>
                <option value="x">X (Twitter)</option>
              </select>
              <input
                type="text"
                value={newHandle.handle}
                onChange={(e) => setNewHandle({ ...newHandle, handle: e.target.value })}
                placeholder="@username"
                className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSaveHandles}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-white bg-[#1a73e8] rounded-md hover:bg-[#1557b0] transition-colors disabled:opacity-50"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setEditingHandles(false)
                  setNewHandle({ platform: 'instagram', handle: '' })
                }}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tracking Status */}
      <div>
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Tracking Status</h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">GBP Tracking</span>
            <span className="text-sm font-medium text-green-600">ON</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">Social Tracking</span>
            <span className={`text-sm font-medium ${socialHandles.length > 0 ? 'text-green-600' : 'text-slate-400'}`}>
              {socialHandles.length > 0 ? 'ON' : 'OFF'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

