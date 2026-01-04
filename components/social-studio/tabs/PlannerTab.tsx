'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useToast, ToastContainer } from '@/components/ui/toast'
import Image from 'next/image'
import type { EventInput } from '@fullcalendar/core'

// Dynamically import FullCalendar to avoid SSR issues
const FullCalendar = dynamic(() => import('@/components/social-studio/FullCalendarWrapper'), {
  ssr: false,
})

interface PlannerTabProps {
  businessLocationId: string
}

type ViewMode = 'month' | 'week' | 'list'

interface Post {
  id: string
  status: 'draft' | 'scheduled' | 'published' | 'failed'
  platforms: string[]
  topic?: string
  caption?: string
  media: any[]
  link_url?: string
  utm?: any
  scheduled_at?: string
  published_at?: string
  created_at: string
  updated_at: string
}

export function PlannerTab({ businessLocationId }: PlannerTabProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toasts, showToast, removeToast } = useToast()
  const calendarRef = useRef<any>(null)
  
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState<EventInput[]>([])
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)
  const [loading, setLoading] = useState(true)
  const [isInspectorOpen, setIsInspectorOpen] = useState(false)
  const [plugins, setPlugins] = useState<any[]>([])
  const lastFetchedDateRef = useRef<string | null>(null)

  // Load FullCalendar plugins and fetch posts in parallel for faster loading
  useEffect(() => {
    // Start fetching posts immediately (don't wait for plugins)
    if (businessLocationId) {
      fetchPosts()
    }

    // Load plugins in parallel
    const loadPlugins = async () => {
      const [
        { default: dayGridPlugin },
        { default: timeGridPlugin },
        { default: listPlugin },
        { default: interactionPlugin },
      ] = await Promise.all([
        import('@fullcalendar/daygrid'),
        import('@fullcalendar/timegrid'),
        import('@fullcalendar/list'),
        import('@fullcalendar/interaction'),
      ])
      setPlugins([dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin])
    }
    loadPlugins()
  }, [businessLocationId])

  const fetchPostsRef = useRef<boolean>(false)
  
  const fetchPosts = async () => {
    // Prevent multiple simultaneous calls using ref instead of state
    if (fetchPostsRef.current) {
      console.log('[PlannerTab] Already fetching posts, skipping...')
      return
    }
    
    fetchPostsRef.current = true
    setLoading(true)
    try {
      // Fetch a wide date range to avoid refetching on navigation
      // Fetch 6 months back and 12 months forward
      const from = new Date()
      from.setMonth(from.getMonth() - 6)
      from.setDate(1)
      from.setHours(0, 0, 0, 0)
      
      const to = new Date()
      to.setMonth(to.getMonth() + 12)
      to.setDate(0) // Last day of that month
      to.setHours(23, 59, 59, 999)

      const response = await fetch(
        `/api/social-studio/posts?businessLocationId=${businessLocationId}&from=${from.toISOString()}&to=${to.toISOString()}`
      )

      if (!response.ok) {
        if (response.status === 401) {
          // Don't show error for auth issues - might be session expired
          console.warn('[PlannerTab] Unauthorized - session may have expired')
          setEvents([])
          return
        }
        throw new Error(`Failed to fetch posts: ${response.status}`)
      }

      const data = await response.json()
      setEvents(data.events || [])
      lastFetchedDateRef.current = new Date().toISOString().split('T')[0]
    } catch (error: any) {
      console.error('[PlannerTab] Error fetching posts:', error)
      // Only show error toast once, not on every failed request
      if (events.length === 0) {
        showToast('Failed to load scheduled posts', 'error')
      }
    } finally {
      setLoading(false)
      fetchPostsRef.current = false
    }
  }

  const [isNavigating, setIsNavigating] = useState(false)

  const handleDateClick = (arg: any) => {
    // Calculate next nearest half-hour for default scheduled time
    const clickedDate = new Date(arg.date)
    const now = new Date()
    
    // Round to nearest half-hour (0 or 30 minutes)
    const minutes = clickedDate.getMinutes()
    const roundedMinutes = minutes < 30 ? 30 : 0
    clickedDate.setMinutes(roundedMinutes, 0, 0)
    
    // If the rounded time is in the past, move to next half-hour
    if (clickedDate < now) {
      clickedDate.setMinutes(clickedDate.getMinutes() + 30, 0, 0)
    }
    
    // If still in the past (e.g., clicked on yesterday), set to next hour on that date
    if (clickedDate < now) {
      clickedDate.setHours(clickedDate.getHours() + 1)
      clickedDate.setMinutes(0, 0, 0)
    }
    
    const scheduledAt = clickedDate.toISOString()
    
    // Navigate to Create tab with scheduledAt prefilled
    const params = new URLSearchParams()
    params.set('tab', 'create')
    params.set('scheduledAt', scheduledAt)
    router.push(`/social-studio?${params.toString()}`)
  }

  const handleEventClick = async (arg: any) => {
    const postId = arg.event.id
    try {
      // Fetch full post details from API
      const response = await fetch(`/api/social-studio/posts?businessLocationId=${businessLocationId}`)
      if (response.ok) {
        const data = await response.json()
        const post = data.posts?.find((p: Post) => p.id === postId)
        if (post) {
          setSelectedPost(post)
          setIsInspectorOpen(true)
        } else {
          showToast('Post not found', 'error')
        }
      } else {
        showToast('Failed to load post details', 'error')
      }
    } catch (error) {
      console.error('[PlannerTab] Error fetching post details:', error)
      showToast('Failed to load post details', 'error')
    }
  }

  const handleEventDrop = async (arg: any) => {
    const postId = arg.event.id
    const newScheduledAt = arg.event.start.toISOString()

    try {
      const response = await fetch(`/api/social-studio/posts/${postId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledAt: newScheduledAt }),
      })

      if (!response.ok) {
        throw new Error('Failed to reschedule post')
      }

      showToast('Post rescheduled', 'success')
      await fetchPosts() // Refresh events
    } catch (error: any) {
      console.error('Error rescheduling post:', error)
      showToast('Failed to reschedule post', 'error')
      // Revert the change
      arg.revert()
    }
  }

  const handleEdit = () => {
    if (selectedPost) {
      const params = new URLSearchParams()
      params.set('tab', 'create')
      params.set('postId', selectedPost.id)
      router.push(`/social-studio?${params.toString()}`)
    }
  }

  const handleDuplicate = async () => {
    if (!selectedPost) return

    try {
      const response = await fetch(`/api/social-studio/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessLocationId,
          platforms: selectedPost.platforms,
          topic: selectedPost.topic,
          caption: selectedPost.caption,
          media: selectedPost.media,
          linkUrl: selectedPost.link_url,
          utm: selectedPost.utm,
          // Don't copy scheduledAt - make it a draft
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to duplicate post')
      }

      showToast('Post duplicated', 'success')
      await fetchPosts()
    } catch (error: any) {
      console.error('Error duplicating post:', error)
      showToast('Failed to duplicate post', 'error')
    }
  }

  const handleReschedule = () => {
    // Open a date picker or allow drag/drop
    showToast('Drag the post to reschedule, or click Edit to change the date', 'info')
  }

  const handleDelete = async () => {
    if (!selectedPost) return

    if (!confirm('Are you sure you want to delete this post?')) {
      return
    }

    try {
      const response = await fetch(`/api/social-studio/posts/${selectedPost.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete post')
      }

      showToast('Post deleted', 'success')
      setSelectedPost(null)
      setIsInspectorOpen(false)
      await fetchPosts()
    } catch (error: any) {
      console.error('Error deleting post:', error)
      showToast('Failed to delete post', 'error')
    }
  }

  // Track if calendar is ready for navigation
  const [calendarReady, setCalendarReady] = useState(false)

  // Get calendar API safely - returns FullCalendar CalendarApi or null
  const getCalendarApi = (): any => {
    if (!calendarRef.current) return null
    try {
      // Our wrapper exposes getApi method that returns CalendarApi
      if (typeof calendarRef.current.getApi === 'function') {
        return calendarRef.current.getApi()
      }
      return null
    } catch (error) {
      console.error('[PlannerTab] Error getting calendar API:', error)
      return null
    }
  }

  // Check calendar readiness and update state
  useEffect(() => {
    if (plugins.length > 0 && calendarRef.current) {
      // Poll once to check if calendar is ready
      const checkReady = () => {
        const api = getCalendarApi()
        if (api) {
          setCalendarReady(true)
        } else {
          // Retry after a short delay
          setTimeout(checkReady, 100)
        }
      }
      checkReady()
    }
  }, [plugins])

  const handleNavigate = (direction: 'prev' | 'next' | 'today') => {
    if (!calendarReady) {
      showToast('Calendar is not ready yet. Please try again in a moment.', 'info')
      return
    }

    let calendarApi = getCalendarApi()
    
    // If API is null, retry once after animation frame
    if (!calendarApi) {
      requestAnimationFrame(() => {
        calendarApi = getCalendarApi()
        if (calendarApi) {
          try {
            if (direction === 'prev') {
              calendarApi.prev()
            } else if (direction === 'next') {
              calendarApi.next()
            } else {
              calendarApi.today()
            }
            // datesSet callback will update currentDate
          } catch (error) {
            console.error('[PlannerTab] Error navigating calendar:', error)
            showToast('Failed to navigate calendar', 'error')
          }
        } else {
          showToast('Calendar not ready. Please try again.', 'error')
        }
      })
      return
    }

    try {
      if (direction === 'prev') {
        calendarApi.prev()
      } else if (direction === 'next') {
        calendarApi.next()
      } else {
        calendarApi.today()
      }
      // datesSet callback will update currentDate automatically
    } catch (error) {
      console.error('[PlannerTab] Error navigating calendar:', error)
      showToast('Failed to navigate calendar', 'error')
    }
  }

  const handleViewChange = (view: ViewMode) => {
    setViewMode(view)
    
    if (!calendarReady) {
      showToast('Calendar is not ready yet. Please try again in a moment.', 'info')
      return
    }

    let calendarApi = getCalendarApi()
    
    // If API is null, retry once after animation frame
    if (!calendarApi) {
      requestAnimationFrame(() => {
        calendarApi = getCalendarApi()
        if (calendarApi) {
          try {
            const viewName = view === 'list' ? 'listWeek' : view === 'week' ? 'timeGridWeek' : 'dayGridMonth'
            calendarApi.changeView(viewName)
            // datesSet callback will update currentDate
          } catch (error) {
            console.error('[PlannerTab] Error changing view:', error)
            showToast('Failed to change view', 'error')
          }
        } else {
          showToast('Calendar not ready. Please try again.', 'error')
        }
      })
      return
    }

    try {
      const viewName = view === 'list' ? 'listWeek' : view === 'week' ? 'timeGridWeek' : 'dayGridMonth'
      calendarApi.changeView(viewName)
      // datesSet callback will update currentDate automatically
    } catch (error) {
      console.error('[PlannerTab] Error changing view:', error)
      showToast('Failed to change view', 'error')
    }
  }

  const handleDateSelect = (date: Date) => {
    if (!calendarReady) {
      showToast('Calendar is not ready yet. Please try again in a moment.', 'info')
      return
    }

    let calendarApi = getCalendarApi()
    
    // If API is null, retry once after animation frame
    if (!calendarApi) {
      requestAnimationFrame(() => {
        calendarApi = getCalendarApi()
        if (calendarApi) {
          try {
            calendarApi.gotoDate(date)
            // Set state directly - don't rely on datesSet callback for immediate updates
            setCurrentDate(new Date(date.getFullYear(), date.getMonth(), 1))
          } catch (error) {
            console.error('[PlannerTab] Error navigating to date:', error)
            showToast('Failed to navigate to selected month', 'error')
          }
        } else {
          showToast('Calendar not ready. Please try again.', 'error')
        }
      })
      return
    }

    try {
      calendarApi.gotoDate(date)
      // Set state directly to the selected date (first day of month)
      setCurrentDate(new Date(date.getFullYear(), date.getMonth(), 1))
    } catch (error) {
      console.error('[PlannerTab] Error navigating to date:', error)
      showToast('Failed to navigate to selected month', 'error')
    }
  }

  const getPlatformIcon = (platform: string) => {
    const icons: Record<string, string> = {
      instagram: '/Instagram_logo_2022.svg',
      facebook: '/Facebook_f_logo_(2019).svg',
      google_business: '/Google__G__logo.svg',
      linkedin: '/LinkedIn_logo_initials.png.webp',
      tiktok: '/tik-tok-logo_578229-290.avif',
    }
    return icons[platform] || ''
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'published':
        return 'bg-green-100 text-green-700'
      case 'scheduled':
        return 'bg-blue-100 text-blue-700'
      case 'draft':
        return 'bg-amber-100 text-amber-700'
      case 'failed':
        return 'bg-red-100 text-red-700'
      default:
        return 'bg-slate-100 text-slate-700'
    }
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }

  return (
    <div className="h-full flex flex-col">
      <ToastContainer toasts={toasts} onClose={removeToast} />
      
      {/* Top Controls */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-4">
          {/* Left: Month Picker */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleNavigate('today')}
              className="px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
            >
              Today
            </button>
            <div className="flex items-center gap-2 ml-2">
              <input
                type="month"
                value={`${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`}
                onChange={(e) => {
                  const [year, month] = e.target.value.split('-')
                  const newDate = new Date(parseInt(year), parseInt(month) - 1, 1)
                  handleDateSelect(newDate)
                }}
                disabled={!calendarReady}
                className={`px-3 py-1.5 text-sm font-semibold text-slate-900 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1a73e8] bg-white ${
                  calendarReady ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
                }`}
                title={calendarReady ? 'Select month' : 'Calendar is loading...'}
              />
            </div>
          </div>

          {/* Right: View Toggle */}
          <div className="flex items-center gap-2 bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => handleViewChange('month')}
              className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                viewMode === 'month'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Month
            </button>
            <button
              onClick={() => handleViewChange('week')}
              className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                viewMode === 'week'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Week
            </button>
            <button
              onClick={() => handleViewChange('list')}
              className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                viewMode === 'list'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              List
            </button>
          </div>
        </div>
      </div>

      {/* Main Calendar Area */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-4 overflow-hidden">
        {/* Calendar - Left 2/3 */}
        <div className="lg:col-span-2 bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col min-h-0">
          <div className="flex-1 min-h-0 overflow-auto p-4">
            {plugins.length > 0 ? (
              <div className="h-full min-h-[600px]">
                <FullCalendar
                  ref={calendarRef}
                  plugins={plugins}
                  initialView="dayGridMonth"
                  initialDate={currentDate}
                  headerToolbar={false}
                  height="100%"
                  contentHeight="auto"
                  events={events}
                  editable={true}
                  droppable={false}
                  selectable={true}
                  selectMirror={true}
                  dayMaxEvents={true}
                  weekends={true}
                  dateClick={handleDateClick}
                  eventClick={handleEventClick}
                  eventDrop={handleEventDrop}
                  eventResize={handleEventDrop}
                    datesSet={(arg) => {
                      // Update current date when calendar view changes
                      // arg.start is the first day of the visible period (month/week/list)
                      const newDate = new Date(arg.start)
                      // Get the first day of the month being displayed
                      const displayedMonth = new Date(newDate.getFullYear(), newDate.getMonth(), 1)
                      
                      // Only update if the month actually changed (prevents unnecessary re-renders)
                      const currentMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
                      if (displayedMonth.getTime() !== currentMonth.getTime()) {
                        setCurrentDate(displayedMonth)
                      }
                      
                      // Mark calendar as ready once datesSet fires
                      if (!calendarReady) {
                        setCalendarReady(true)
                      }
                      
                      // DON'T call fetchPosts() here - it causes infinite loops
                      // Posts are already fetched with a wide date range (6 months back, 12 months forward) on mount
                    }}
                  loading={(isLoading) => {
                    if (!isLoading) {
                      setCalendarReady(true)
                    }
                  }}
                  eventContent={(arg) => {
                    const platforms = arg.event.extendedProps.platforms || []
                    const status = arg.event.extendedProps.status || 'draft'
                    return (
                      <div className="flex items-center gap-1 p-1">
                        {platforms.slice(0, 2).map((platform: string) => (
                          <span key={platform} className="text-xs font-medium capitalize">
                            {platform.replace('_', ' ').substring(0, 3)}
                          </span>
                        ))}
                        {platforms.length > 2 && <span className="text-xs">+{platforms.length - 2}</span>}
                        <span className={`text-xs px-1 py-0.5 rounded ${getStatusColor(status)}`}>
                          {status}
                        </span>
                      </div>
                    )
                  }}
                  eventTimeFormat={{
                    hour: 'numeric',
                    minute: '2-digit',
                    meridiem: 'short',
                  }}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center h-full min-h-[600px]">
                <div className="w-8 h-8 border-4 border-[#1a73e8] border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
          </div>
        </div>

        {/* Inspector Panel - Right 1/3 */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm sticky top-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Inspector</h3>
            {selectedPost ? (
              <div className="space-y-4">
                {/* Media Preview */}
                {selectedPost.media && selectedPost.media.length > 0 && (
                  <div className="relative w-full h-48 rounded-lg overflow-hidden bg-slate-100">
                    <Image
                      src={selectedPost.media[0].url}
                      alt={selectedPost.topic || 'Post media'}
                      fill
                      className="object-cover"
                      sizes="100%"
                    />
                  </div>
                )}

                {/* Platforms */}
                <div>
                  <div className="text-xs font-medium text-slate-600 mb-2">Platforms</div>
                  <div className="flex flex-wrap gap-2">
                    {selectedPost.platforms.map((platform) => (
                      <div
                        key={platform}
                        className="flex items-center gap-1.5 px-2 py-1 bg-slate-100 rounded text-xs"
                      >
                        <Image
                          src={getPlatformIcon(platform)}
                          alt={platform}
                          width={14}
                          height={14}
                          className="object-contain"
                        />
                        <span className="capitalize">{platform.replace('_', ' ')}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Status */}
                <div>
                  <div className="text-xs font-medium text-slate-600 mb-2">Status</div>
                  <span className={`px-2 py-1 text-xs font-medium rounded ${getStatusColor(selectedPost.status)}`}>
                    {selectedPost.status}
                  </span>
                </div>

                {/* Scheduled Time */}
                {selectedPost.scheduled_at && (
                  <div>
                    <div className="text-xs font-medium text-slate-600 mb-1">Scheduled</div>
                    <div className="text-sm text-slate-900">
                      {new Date(selectedPost.scheduled_at).toLocaleString()}
                    </div>
                  </div>
                )}

                {/* Caption Preview */}
                {selectedPost.caption && (
                  <div>
                    <div className="text-xs font-medium text-slate-600 mb-1">Caption</div>
                    <p className="text-sm text-slate-700 line-clamp-4">
                      {selectedPost.caption.length > 140 
                        ? `${selectedPost.caption.substring(0, 140)}...` 
                        : selectedPost.caption}
                    </p>
                  </div>
                )}

                {/* Link */}
                {selectedPost.link_url && (
                  <div>
                    <div className="text-xs font-medium text-slate-600 mb-1">Link</div>
                    <a
                      href={selectedPost.link_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-[#1a73e8] hover:underline break-all"
                    >
                      {selectedPost.link_url}
                    </a>
                  </div>
                )}

                {/* Actions */}
                <div className="pt-4 border-t border-slate-200 space-y-2">
                  <button
                    onClick={handleEdit}
                    className="w-full px-4 py-2 text-sm font-medium text-white bg-[#1a73e8] rounded-md hover:bg-[#1557b0] transition-colors"
                  >
                    Open in Create
                  </button>
                  <button
                    onClick={handleDuplicate}
                    className="w-full px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
                  >
                    Duplicate
                  </button>
                  {selectedPost.scheduled_at && (
                    <button
                      onClick={async () => {
                        if (!selectedPost) return
                        try {
                          const response = await fetch(`/api/social-studio/posts/${selectedPost.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ scheduledAt: null }),
                          })
                          if (!response.ok) throw new Error('Failed to unschedule')
                          showToast('Post unscheduled', 'success')
                          setSelectedPost(null)
                          setIsInspectorOpen(false)
                          await fetchPosts()
                        } catch (error: any) {
                          console.error('[PlannerTab] Error unscheduling post:', error)
                          showToast('Failed to unschedule post', 'error')
                        }
                      }}
                      className="w-full px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
                    >
                      Unschedule
                    </button>
                  )}
                  <button
                    onClick={() => showToast('Publish now feature coming soon', 'info')}
                    disabled
                    className="w-full px-4 py-2 text-sm font-medium text-slate-400 bg-slate-50 border border-slate-200 rounded-md cursor-not-allowed transition-colors"
                    title="Coming soon"
                  >
                    Publish now
                  </button>
                  <button
                    onClick={handleDelete}
                    className="w-full px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-300 rounded-md hover:bg-red-50 transition-colors"
                  >
                    Delete
                  </button>
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
    </div>
  )
}
