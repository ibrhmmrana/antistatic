'use client'

import { useState } from 'react'
import { mockPosts, mockQueueItems, getScheduledPostsForWeek } from '@/lib/social-studio/mock'
import { useToast, ToastContainer } from '@/components/ui/toast'
import Image from 'next/image'
import type { SocialPost } from '@/lib/social-studio/mock'

interface PlannerTabProps {
  businessLocationId: string
}

type ViewMode = 'month' | 'week'

export function PlannerTab({ businessLocationId }: PlannerTabProps) {
  const { toasts, showToast, removeToast } = useToast()
  const [viewMode, setViewMode] = useState<ViewMode>('week')
  const [selectedPost, setSelectedPost] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedPillar, setSelectedPillar] = useState<string>('all')
  
  const scheduledPosts = getScheduledPostsForWeek(mockPosts)
  const selectedPostData = scheduledPosts.find(p => p.id === selectedPost) || mockPosts.find(p => p.id === selectedPost)

  const handlePublishNow = () => {
    showToast('Post published immediately', 'success')
  }

  const handleReschedule = () => {
    showToast('Reschedule dialog would open here', 'info')
  }

  const handleDuplicate = () => {
    showToast('Post duplicated', 'success')
  }

  const handleAddToDay = (queueItemId: string, date: Date) => {
    showToast('Added to calendar', 'success')
    setSelectedDate(date)
  }

  const handleCreatePost = (date: Date) => {
    setSelectedDate(date)
    showToast('Opening Create tab', 'info')
  }

  // Get current week dates
  const getWeekDates = () => {
    const today = new Date()
    const day = today.getDay()
    const diff = today.getDate() - day
    const monday = new Date(today.setDate(diff))
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(monday)
      date.setDate(monday.getDate() + i)
      return date
    })
  }

  const weekDates = getWeekDates()

  // Get posts for a specific date
  const getPostsForDate = (date: Date) => {
    return scheduledPosts.filter(p => {
      if (!p.scheduledAt) return false
      const postDate = new Date(p.scheduledAt)
      return postDate.toDateString() === date.toDateString()
    })
  }

  // Filter queue by pillar
  const filteredQueue = selectedPillar === 'all' 
    ? mockQueueItems 
    : mockQueueItems.filter(q => q.pillar === selectedPillar)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <ToastContainer toasts={toasts} onClose={removeToast} />
      
      {/* Left: Calendar */}
      <div className="lg:col-span-2 space-y-6">
        {/* Calendar Card */}
        <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900">Planner</h3>
            <div className="flex gap-2">
              <button
                onClick={() => setViewMode('week')}
                className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                  viewMode === 'week'
                    ? 'bg-[#1a73e8] text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Week
              </button>
              <button
                onClick={() => setViewMode('month')}
                className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                  viewMode === 'month'
                    ? 'bg-[#1a73e8] text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Month
              </button>
            </div>
          </div>

          {/* Week View */}
          {viewMode === 'week' && (
            <div className="space-y-4">
              {weekDates.map((date, idx) => {
                const dayPosts = getPostsForDate(date)
                const isToday = date.toDateString() === new Date().toDateString()
                return (
                  <div key={idx} className={`border rounded-lg p-4 ${isToday ? 'border-[#1a73e8] bg-blue-50' : 'border-slate-200'}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="font-medium text-slate-900">
                        {date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                      </div>
                      <button
                        onClick={() => handleCreatePost(date)}
                        className="px-2 py-1 text-xs font-medium text-[#1a73e8] hover:bg-blue-100 rounded transition-colors"
                      >
                        + Add
                      </button>
                    </div>
                    <div className="space-y-2">
                      {dayPosts.length > 0 ? (
                        dayPosts.map((post) => (
                          <button
                            key={post.id}
                            onClick={() => setSelectedPost(post.id)}
                            className={`w-full text-left p-3 border rounded-lg transition-colors ${
                              selectedPost === post.id
                                ? 'border-[#1a73e8] bg-blue-50'
                                : 'border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              {post.variants.map((v) => (
                                <span
                                  key={v.platform}
                                  className="px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700 rounded capitalize"
                                >
                                  {v.platform.replace('_', ' ')}
                                </span>
                              ))}
                              <span className="px-2 py-0.5 text-xs font-medium bg-yellow-50 text-yellow-700 rounded">
                                Scheduled
                              </span>
                            </div>
                            <div className="font-medium text-slate-900 text-sm">{post.title}</div>
                            {post.scheduledAt && (
                              <div className="text-xs text-slate-500 mt-1">
                                {new Date(post.scheduledAt).toLocaleTimeString('en-US', {
                                  hour: 'numeric',
                                  minute: '2-digit',
                                })}
                              </div>
                            )}
                          </button>
                        ))
                      ) : (
                        <div className="text-center py-4 text-sm text-slate-400">
                          No posts scheduled
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Month View - Simplified Grid */}
          {viewMode === 'month' && (
            <div className="space-y-4">
              <div className="text-sm text-slate-600 mb-2">
                {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </div>
              <div className="grid grid-cols-7 gap-2">
                {Array.from({ length: 35 }, (_, i) => {
                  const date = new Date()
                  date.setDate(1)
                  date.setDate(date.getDate() + i - date.getDay())
                  const dayPosts = getPostsForDate(date)
                  const isToday = date.toDateString() === new Date().toDateString()
                  return (
                    <button
                      key={i}
                      onClick={() => {
                        setSelectedDate(date)
                        handleCreatePost(date)
                      }}
                      className={`p-2 border rounded text-sm transition-colors ${
                        isToday
                          ? 'border-[#1a73e8] bg-blue-50 font-medium'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="text-slate-600 mb-1">{date.getDate()}</div>
                      {dayPosts.length > 0 && (
                        <div className="flex gap-1">
                          {dayPosts.slice(0, 3).map((_, idx) => (
                            <div key={idx} className="w-1 h-1 bg-[#1a73e8] rounded-full" />
                          ))}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Queue Strip */}
        <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900">Queue</h3>
            <div className="flex gap-2">
              {['all', 'proof', 'offer', 'education', 'culture'].map((pillar) => (
                <button
                  key={pillar}
                  onClick={() => setSelectedPillar(pillar)}
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors capitalize ${
                    selectedPillar === pillar
                      ? 'bg-[#1a73e8] text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {pillar}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {filteredQueue.map((item) => (
              <div key={item.id} className="flex-shrink-0 w-48 border border-slate-200 rounded-lg p-3">
                <div className="relative w-full h-32 rounded-lg overflow-hidden mb-2">
                  <Image
                    src={item.mediaUrl}
                    alt={item.title}
                    fill
                    className="object-cover"
                    sizes="192px"
                  />
                </div>
                <h4 className="font-medium text-slate-900 text-sm mb-1 line-clamp-1">{item.title}</h4>
                <div className="flex flex-wrap gap-1 mb-2">
                  <span className="px-1.5 py-0.5 text-xs bg-slate-100 text-slate-700 rounded capitalize">
                    {item.pillar}
                  </span>
                </div>
                <button
                  onClick={() => {
                    const date = selectedDate || new Date()
                    handleAddToDay(item.id, date)
                  }}
                  className="w-full px-3 py-1.5 text-sm font-medium text-[#1a73e8] bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-colors"
                >
                  Add to day
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right: Inspector Panel */}
      <div className="lg:col-span-1">
        <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm sticky top-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Inspector</h3>
          {selectedPostData ? (
            <div className="space-y-4">
              <div className="relative w-full h-48 rounded-lg overflow-hidden">
                <Image
                  src={selectedPostData.mediaUrl}
                  alt={selectedPostData.title}
                  fill
                  className="object-cover"
                  sizes="100%"
                />
              </div>
              <div>
                <h4 className="font-medium text-slate-900 mb-2">{selectedPostData.title}</h4>
                {selectedPostData.variants.map((variant, idx) => (
                  <div key={idx} className="mb-3">
                    <div className="text-xs font-medium text-slate-600 mb-1 capitalize">
                      {variant.platform.replace('_', ' ')}
                    </div>
                    <p className="text-sm text-slate-700 mb-2">{variant.caption}</p>
                    {variant.linkUrl && (
                      <div className="text-xs text-slate-500">
                        Link: {variant.linkUrl}
                      </div>
                    )}
                  </div>
                ))}
                <div className="flex flex-wrap gap-2 mb-3">
                  {selectedPostData.variants.map((v) => (
                    <span
                      key={v.platform}
                      className="px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700 rounded capitalize"
                    >
                      {v.platform.replace('_', ' ')}
                    </span>
                  ))}
                </div>
                {selectedPostData.scheduledAt && (
                  <div className="text-sm text-slate-600 mb-4">
                    Scheduled: {new Date(selectedPostData.scheduledAt).toLocaleString()}
                  </div>
                )}
                <div className="space-y-2">
                  <button
                    onClick={handlePublishNow}
                    className="w-full px-4 py-2 text-sm font-medium text-white bg-[#1a73e8] rounded-md hover:bg-[#1557b0] transition-colors"
                  >
                    Publish Now
                  </button>
                  <button
                    onClick={handleReschedule}
                    className="w-full px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
                  >
                    Reschedule
                  </button>
                  <button
                    onClick={handleDuplicate}
                    className="w-full px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
                  >
                    Duplicate
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500 text-sm">
              Select a post from the calendar to view details
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

