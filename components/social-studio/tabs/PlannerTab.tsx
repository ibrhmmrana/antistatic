'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useToast, ToastContainer } from '@/components/ui/toast'
import Image from 'next/image'
import type { EventInput, CalendarApi } from '@fullcalendar/core'

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
  platform?: string | null
  topic?: string
  caption?: string
  media: any[]
  media_url?: string | null
  cta?: any
  link_url?: string
  utm?: any
  scheduled_at?: string
  published_at?: string
  gbp_local_post_name?: string | null
  gbp_search_url?: string | null
  platform_meta?: any
  created_at: string
  updated_at: string
}

export function PlannerTab({ businessLocationId }: PlannerTabProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toasts, showToast, removeToast } = useToast()
  const calendarRef = useRef<any>(null)
  
  // Direct API ref - captured from datesSet callback
  const apiRef = useRef<CalendarApi | null>(null)
  
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState<EventInput[]>([])
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)
  const [loading, setLoading] = useState(true)
  const [isInspectorOpen, setIsInspectorOpen] = useState(false)
  const [plugins, setPlugins] = useState<any[]>([])
  const lastFetchedDateRef = useRef<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editCaption, setEditCaption] = useState('')
  const [editScheduledDate, setEditScheduledDate] = useState('')
  const [editScheduledTime, setEditScheduledTime] = useState('09:00')
  const [isSaving, setIsSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [postToDelete, setPostToDelete] = useState<Post | null>(null)

  // Load FullCalendar CSS from CDN (only once)
  useEffect(() => {
    if (typeof document !== 'undefined') {
      // Check if already loaded
      if (document.getElementById('fullcalendar-core-css')) return

      const links = [
        { id: 'fullcalendar-core-css', href: 'https://cdn.jsdelivr.net/npm/@fullcalendar/core@6.1.20/main.min.css' },
        { id: 'fullcalendar-daygrid-css', href: 'https://cdn.jsdelivr.net/npm/@fullcalendar/daygrid@6.1.20/main.min.css' },
        { id: 'fullcalendar-timegrid-css', href: 'https://cdn.jsdelivr.net/npm/@fullcalendar/timegrid@6.1.20/main.min.css' },
        { id: 'fullcalendar-list-css', href: 'https://cdn.jsdelivr.net/npm/@fullcalendar/list@6.1.20/main.min.css' },
      ]

      links.forEach(({ id, href }) => {
        const link = document.createElement('link')
        link.id = id
        link.rel = 'stylesheet'
        link.href = href
        document.head.appendChild(link)
      })
    }
  }, [])

  // Sync GBP posts on mount and when businessLocationId changes
  const syncGBPPosts = async () => {
    if (!businessLocationId) return
    
    try {
      console.log('[PlannerTab] Auto-syncing GBP posts...')
      const response = await fetch('/api/social-studio/sync/gbp-posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          businessLocationId,
          lookbackDays: 365,
        }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        console.log(`[PlannerTab] Auto-synced ${data.synced} GBP posts`)
      } else {
        // Don't show error toast for auto-sync failures (might be expected if no GBP connection)
        console.warn('[PlannerTab] Auto-sync failed (non-critical):', data.error || 'Unknown error')
      }
    } catch (error: any) {
      // Don't show error toast for auto-sync failures (non-critical)
      console.warn('[PlannerTab] Auto-sync error (non-critical):', error)
    }
  }

  // Load FullCalendar plugins, fetch posts, and sync GBP posts in parallel
  useEffect(() => {
    if (!businessLocationId) return

    // Start auto-syncing GBP posts in the background (don't wait for it)
    syncGBPPosts()
    
    // Start fetching posts immediately (don't wait for plugins or sync)
    fetchPosts()

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
      const fetchedEvents = data.events || []
      console.log(`[PlannerTab] Fetched ${fetchedEvents.length} events from API (date range: ${from.toISOString().split('T')[0]} to ${to.toISOString().split('T')[0]})`)
      setEvents(fetchedEvents)
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
    
    // Format date as YYYY-MM-DD for Create tab
    const year = clickedDate.getFullYear()
    const month = String(clickedDate.getMonth() + 1).padStart(2, '0')
    const day = String(clickedDate.getDate()).padStart(2, '0')
    const dateStr = `${year}-${month}-${day}`
    
    // Navigate to Create tab with date prefilled
    const params = new URLSearchParams()
    params.set('tab', 'create')
    params.set('date', dateStr)
    router.push(`/social-studio?${params.toString()}`)
  }

  const handleEventClick = async (arg: any) => {
    const postId = arg.event.id
    const extendedProps = arg.event.extendedProps || {}
    
    try {
      // Try to use extendedProps first (faster, no API call needed)
      if (extendedProps.status) {
        const postFromEvent: Post = {
          id: postId,
          status: extendedProps.status || 'draft',
          platforms: extendedProps.platforms || [],
          platform: extendedProps.platform || null,
          topic: null,
          caption: extendedProps.caption || null,
          media: extendedProps.media || [],
          media_url: extendedProps.mediaUrl || null,
          cta: extendedProps.cta || null,
          link_url: extendedProps.linkUrl || null,
          utm: extendedProps.utm || null,
          scheduled_at: extendedProps.scheduledAt || null,
          published_at: extendedProps.publishedAt || null,
          gbp_local_post_name: extendedProps.gbpLocalPostName || null,
          gbp_search_url: extendedProps.gbpSearchUrl || null,
          platform_meta: extendedProps.platformMeta || null,
          created_at: arg.event.start || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        setSelectedPost(postFromEvent)
        setIsInspectorOpen(true)
        setIsEditing(false) // Reset edit mode when selecting a new post
        return
      }

      // Fallback: Fetch full post details from API
      const response = await fetch(`/api/social-studio/posts?businessLocationId=${businessLocationId}`)
      if (response.ok) {
        const data = await response.json()
        const post = data.posts?.find((p: Post) => p.id === postId)
        if (post) {
          setSelectedPost(post)
          setIsInspectorOpen(true)
          setIsEditing(false) // Reset edit mode when selecting a new post
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
      setIsEditing(true)
      setEditCaption(selectedPost.caption || '')
      if (selectedPost.scheduled_at) {
        const scheduledDate = new Date(selectedPost.scheduled_at)
        setEditScheduledDate(scheduledDate.toISOString().split('T')[0])
        const hours = String(scheduledDate.getHours()).padStart(2, '0')
        const minutes = String(scheduledDate.getMinutes()).padStart(2, '0')
        setEditScheduledTime(`${hours}:${minutes}`)
      } else {
        setEditScheduledDate('')
        setEditScheduledTime('09:00')
      }
    }
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditCaption('')
    setEditScheduledDate('')
    setEditScheduledTime('09:00')
  }

  const handleSaveEdit = async () => {
    if (!selectedPost) return

    setIsSaving(true)
    try {
      // Check if this is a GBP published post - use GBP edit route
      const isGBPPost = selectedPost.platform === 'google_business' && 
                        selectedPost.status === 'published' && 
                        selectedPost.gbp_local_post_name

      if (isGBPPost) {
        // Edit on Google Business Profile
        const response = await fetch(`/api/social-studio/gbp/posts/${selectedPost.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            caption: editCaption || '',
          }),
        })

        const data = await response.json()

        if (!response.ok) {
          if (data.needs_reauth) {
            showToast('Please reconnect your Google Business Profile to edit posts', 'error')
          } else {
            throw new Error(data.error || 'Failed to update post on Google')
          }
          return
        }

        showToast('Post updated on Google successfully', 'success')
        setIsEditing(false)
        await fetchPosts() // Refresh calendar
        
        // Reload the selected post to show updated data
        const updatedResponse = await fetch(`/api/social-studio/posts?businessLocationId=${businessLocationId}`)
        if (updatedResponse.ok) {
          const responseData = await updatedResponse.json()
          const updatedPost = responseData.posts?.find((p: Post) => p.id === selectedPost.id)
          if (updatedPost) {
            setSelectedPost(updatedPost)
          }
        }
      } else {
        // Edit local post (scheduled/draft or non-GBP)
        const updatePayload: any = {
          caption: editCaption || null,
        }

        // Update scheduled date if provided
        if (editScheduledDate && editScheduledTime) {
          const [hours, minutes] = editScheduledTime.split(':').map(Number)
          const scheduledDateTime = new Date(editScheduledDate)
          scheduledDateTime.setHours(hours, minutes, 0, 0)
          updatePayload.scheduledAt = scheduledDateTime.toISOString()
          updatePayload.status = 'scheduled'
        } else if (editScheduledDate === '' && selectedPost.scheduled_at) {
          // Remove scheduled date if cleared
          updatePayload.scheduledAt = null
          updatePayload.status = 'draft'
        }

        const response = await fetch(`/api/social-studio/posts/${selectedPost.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatePayload),
        })

        if (!response.ok) {
          throw new Error('Failed to update post')
        }

        showToast('Post updated successfully', 'success')
        setIsEditing(false)
        await fetchPosts() // Refresh calendar
        
        // Reload the selected post to show updated data
        const updatedResponse = await fetch(`/api/social-studio/posts?businessLocationId=${businessLocationId}`)
        if (updatedResponse.ok) {
          const data = await updatedResponse.json()
          const updatedPost = data.posts?.find((p: Post) => p.id === selectedPost.id)
          if (updatedPost) {
            setSelectedPost(updatedPost)
          }
        }
      }
    } catch (error: any) {
      console.error('[PlannerTab] Error saving post:', error)
      showToast(error.message || 'Failed to update post', 'error')
    } finally {
      setIsSaving(false)
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

  const handleDeleteClick = () => {
    if (!selectedPost) return
    setPostToDelete(selectedPost)
    setShowDeleteConfirm(true)
  }

  const handleDeleteConfirm = async () => {
    if (!postToDelete) return

    setShowDeleteConfirm(false)

    // Check if this is a GBP post - use GBP delete route
    const isGBPPost = postToDelete.platform === 'google_business' && postToDelete.gbp_local_post_name

    try {
      if (isGBPPost) {
        // Delete from Google Business Profile
        const response = await fetch(`/api/social-studio/gbp/posts/${postToDelete.id}`, {
          method: 'DELETE',
        })

        const data = await response.json()

        if (!response.ok) {
          if (data.needs_reauth) {
            showToast('Please reconnect your Google Business Profile to delete posts', 'error')
          } else {
            throw new Error(data.error || 'Failed to delete post on Google')
          }
          return
        }

        showToast('Post deleted from Google successfully', 'success')
      } else {
        // Delete local post
        console.log('[PlannerTab] Deleting local post:', postToDelete.id)
        const response = await fetch(`/api/social-studio/posts/${postToDelete.id}`, {
          method: 'DELETE',
        })

        const data = await response.json()

        if (!response.ok) {
          console.error('[PlannerTab] Delete failed:', {
            status: response.status,
            error: data.error || data,
          })
          throw new Error(data.error || 'Failed to delete post')
        }

        console.log('[PlannerTab] Post deleted successfully:', data)
        showToast('Post deleted', 'success')
      }

      setSelectedPost(null)
      setIsInspectorOpen(false)
      setIsEditing(false) // Reset edit mode
      setPostToDelete(null)
      
      // Force calendar refresh by clearing events first, then fetching
      setEvents([])
      await fetchPosts()
      
      // Also force FullCalendar to refresh if API is available
      if (apiRef.current) {
        try {
          apiRef.current.refetchEvents()
        } catch (e) {
          console.warn('[PlannerTab] Could not refetch events:', e)
        }
      }
    } catch (error: any) {
      console.error('Error deleting post:', error)
      showToast(error.message || 'Failed to delete post', 'error')
      setPostToDelete(null)
    }
  }

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false)
    setPostToDelete(null)
  }

  // Track if calendar is ready for navigation (set only in datesSet)
  const [calendarReady, setCalendarReady] = useState(false)

  // Get calendar API - returns apiRef.current directly (no wrapper indirection)
  const getCalendarApi = (): CalendarApi | null => {
    if (!apiRef.current) {
      console.warn('[PlannerTab] getCalendarApi() - apiRef.current is null (calendar not ready)')
      return null
    }
    return apiRef.current
  }

  const handleNavigate = (direction: 'prev' | 'next' | 'today') => {
    const api = apiRef.current
    if (!api) {
      showToast('Calendar is not ready yet. Please try again in a moment.', 'info')
      return
    }

    try {
      if (direction === 'prev') {
        api.prev()
      } else if (direction === 'next') {
        api.next()
      } else {
        api.today()
      }
      // datesSet callback will update currentDate automatically
    } catch (error) {
      console.error('[PlannerTab] Error navigating calendar:', error)
      showToast('Failed to navigate calendar', 'error')
    }
  }

  const handleViewChange = (view: ViewMode) => {
    setViewMode(view)
    
    const api = apiRef.current
    if (!api) {
      showToast('Calendar is not ready yet. Please try again in a moment.', 'info')
      return
    }

    try {
      const viewName = view === 'list' ? 'listWeek' : view === 'week' ? 'timeGridWeek' : 'dayGridMonth'
      api.changeView(viewName)
      // datesSet callback will update currentDate automatically
    } catch (error) {
      console.error('[PlannerTab] Error changing view:', error)
      showToast('Failed to change view', 'error')
    }
  }

  const handleDateSelect = (date: Date) => {
    const api = apiRef.current
    if (!api) {
      showToast('Calendar is not ready yet. Please try again in a moment.', 'info')
      return
    }

    try {
      api.gotoDate(date)
      // DO NOT setCurrentDate here - let datesSet be the single source of truth
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
      <style jsx global>{`
        /* Custom styles for calendar events */
        .fc-event.custom-calendar-event {
          border: none !important;
          background: transparent !important;
          padding: 0 !important;
          margin: 2px 0 !important;
          box-shadow: none !important;
          max-width: 100% !important;
          overflow: hidden !important;
        }
        .fc-event.custom-calendar-event .fc-event-main {
          padding: 0 !important;
          max-width: 100% !important;
          overflow: hidden !important;
        }
        .fc-event.custom-calendar-event .fc-event-main-frame {
          cursor: pointer;
          max-width: 100% !important;
          overflow: hidden !important;
        }
        .fc-daygrid-event {
          margin: 2px 0 !important;
          max-width: 100% !important;
        }
        .fc-daygrid-day-events {
          margin: 0 !important;
          max-width: 100% !important;
        }
        .fc-daygrid-day-frame {
          overflow: hidden !important;
        }
        .fc-daygrid-day {
          overflow: hidden !important;
        }
        /* Ensure event content doesn't overflow day cells */
        .fc-daygrid-day-events .fc-event {
          max-width: calc(100% - 4px) !important;
        }
      `}</style>
      <ToastContainer toasts={toasts} onClose={removeToast} />
      
      {/* Top Controls */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-4">
          {/* Left: Month Picker */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleNavigate('prev')}
              disabled={!apiRef.current}
              className="px-2 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Previous month"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() => handleNavigate('next')}
              disabled={!apiRef.current}
              className="px-2 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Next month"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button
              onClick={() => handleNavigate('today')}
              disabled={!apiRef.current}
              className="px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                disabled={!apiRef.current}
                className={`px-3 py-1.5 text-sm font-semibold text-slate-900 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1a73e8] bg-white ${
                  apiRef.current ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
                }`}
                title={apiRef.current ? 'Select month' : 'Calendar is loading...'}
              />
            </div>
          </div>

          {/* Middle: Sync Button */}
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                try {
                  showToast('Syncing GBP posts...', 'info')
                  const response = await fetch('/api/social-studio/sync/gbp-posts', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      businessLocationId,
                      lookbackDays: 365,
                    }),
                  })

                  const data = await response.json()

                  if (!response.ok || !data.success) {
                    throw new Error(data.error || 'Failed to sync posts')
                  }

                  showToast(`Synced ${data.synced} GBP posts`, 'success')
                  await fetchPosts() // Refresh calendar
                } catch (error: any) {
                  console.error('[PlannerTab] Error syncing GBP posts:', error)
                  showToast(error.message || 'Failed to sync GBP posts', 'error')
                }
              }}
              className="px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
            >
              Sync GBP posts
            </button>
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
        <div className="lg:col-span-2 bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 min-h-0 p-4 overflow-y-auto">
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
                      // Capture the API directly from the calendar instance
                      const api = arg.view.calendar
                      apiRef.current = api
                      
                      // Mark calendar as ready (only set here, never elsewhere)
                      if (!calendarReady) {
                        setCalendarReady(true)
                        console.log('[PlannerTab] datesSet - Calendar ready, API captured')
                      }
                      
                      // Use the calendar's focused date (api.getDate()) instead of arg.start
                      // arg.start can be in the previous month (e.g., Dec 28 when viewing January)
                      // api.getDate() returns the date the calendar is actually focused on
                      const focused = api.getDate()
                      const monthAnchor = new Date(focused.getFullYear(), focused.getMonth(), 1)
                      
                      // Only update if the month actually changed (prevents unnecessary re-renders)
                      const currentMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
                      if (monthAnchor.getTime() !== currentMonth.getTime()) {
                        setCurrentDate(monthAnchor)
                      }
                      
                      // DON'T call fetchPosts() here - it causes infinite loops
                      // Posts are already fetched with a wide date range (6 months back, 12 months forward) on mount
                    }}
                  loading={(isLoading) => {
                    // Don't set calendarReady here - only datesSet should set it
                    // This callback just tracks loading state
                  }}
                  eventContent={(arg) => {
                    const platforms = arg.event.extendedProps.platforms || []
                    const platform = arg.event.extendedProps.platform || platforms[0]
                    const status = arg.event.extendedProps.status || 'draft'
                    const caption = arg.event.extendedProps.caption || arg.event.title || ''
                    const mediaUrl = arg.event.extendedProps.mediaUrl
                    // Truncate more aggressively for month view to fit in day cells
                    const maxLength = arg.view.type === 'dayGridMonth' ? 20 : 30
                    const truncatedCaption = caption.length > maxLength ? caption.substring(0, maxLength) + '...' : caption
                    
                    // Status colors for better visual distinction
                    const statusConfig = {
                      published: { 
                        bg: 'bg-green-50', 
                        border: 'border-green-300', 
                        text: 'text-green-800', 
                        dot: 'bg-green-500',
                        iconBg: 'bg-green-100'
                      },
                      scheduled: { 
                        bg: 'bg-blue-50', 
                        border: 'border-blue-300', 
                        text: 'text-blue-800', 
                        dot: 'bg-blue-500',
                        iconBg: 'bg-blue-100'
                      },
                      draft: { 
                        bg: 'bg-amber-50', 
                        border: 'border-amber-300', 
                        text: 'text-amber-800', 
                        dot: 'bg-amber-500',
                        iconBg: 'bg-amber-100'
                      },
                      failed: { 
                        bg: 'bg-red-50', 
                        border: 'border-red-300', 
                        text: 'text-red-800', 
                        dot: 'bg-red-500',
                        iconBg: 'bg-red-100'
                      },
                    }
                    const statusStyle = statusConfig[status as keyof typeof statusConfig] || statusConfig.draft
                    
                    return (
                      <div className={`group flex items-center gap-1.5 px-1.5 py-1 rounded border ${statusStyle.bg} ${statusStyle.border} shadow-sm hover:shadow-md transition-all cursor-pointer max-w-full overflow-hidden`}>
                        {/* Status dot */}
                        <div className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot} flex-shrink-0`} />
                        
                        {/* Platform icon */}
                        {platform && (
                          <div className={`flex-shrink-0 w-4 h-4 rounded ${statusStyle.iconBg} flex items-center justify-center p-0.5`}>
                            <Image
                              src={getPlatformIcon(platform)}
                              alt={platform}
                              width={12}
                              height={12}
                              className="object-contain"
                            />
                          </div>
                        )}
                        
                        {/* Caption - ensure it doesn't overflow */}
                        <p className={`text-xs font-medium ${statusStyle.text} leading-tight truncate flex-1 min-w-0 overflow-hidden`}>
                          {truncatedCaption || 'Untitled post'}
                        </p>
                        
                        {/* Media indicator - only show if space allows */}
                        {mediaUrl && (
                          <svg className="w-3 h-3 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        )}
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
        <div className="lg:col-span-1 min-h-0 flex flex-col overflow-hidden">
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col min-h-0 overflow-hidden">
            <div className="shrink-0 p-6 pb-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">Inspector</h3>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-6 pt-4">
              {selectedPost ? (
                <div className="space-y-4">
                {/* Media Preview */}
                {(() => {
                  // Extract image URL from various possible sources
                  let imageUrl: string | null = null
                  
                  // Debug: Log the selectedPost to see what data we have
                  console.log('[PlannerTab] Inspector - selectedPost:', {
                    id: selectedPost.id,
                    media_url: selectedPost.media_url,
                    media: selectedPost.media,
                    mediaType: typeof selectedPost.media,
                    mediaIsArray: Array.isArray(selectedPost.media),
                    platform: selectedPost.platform,
                  })
                  
                  // Priority 1: Check media_url field (direct - this is set for GBP posts)
                  if (selectedPost.media_url) {
                    imageUrl = selectedPost.media_url
                    console.log('[PlannerTab] Using media_url:', imageUrl)
                  } 
                  // Priority 2: Check media array (GBP posts store full media objects with sourceUrl)
                  else if (selectedPost.media) {
                    if (Array.isArray(selectedPost.media) && selectedPost.media.length > 0) {
                      const firstMedia = selectedPost.media[0]
                      console.log('[PlannerTab] First media item:', firstMedia, typeof firstMedia)
                      
                      if (typeof firstMedia === 'string') {
                        imageUrl = firstMedia
                        console.log('[PlannerTab] Using media[0] as string:', imageUrl)
                      } else if (typeof firstMedia === 'object' && firstMedia !== null) {
                        // GBP media objects use sourceUrl, not url
                        imageUrl = (firstMedia as any).sourceUrl || (firstMedia as any).url || (firstMedia as any).source_url || null
                        console.log('[PlannerTab] Using media[0] object URL:', imageUrl, {
                          hasSourceUrl: !!(firstMedia as any).sourceUrl,
                          hasUrl: !!(firstMedia as any).url,
                          keys: Object.keys(firstMedia as any),
                        })
                      }
                    } else if (typeof selectedPost.media === 'string') {
                      // Media might be a JSON string
                      try {
                        const parsed = JSON.parse(selectedPost.media)
                        if (Array.isArray(parsed) && parsed.length > 0) {
                          const firstMedia = parsed[0]
                          if (typeof firstMedia === 'string') {
                            imageUrl = firstMedia
                          } else if (typeof firstMedia === 'object' && firstMedia !== null) {
                            // GBP uses sourceUrl
                            imageUrl = (firstMedia as any).sourceUrl || (firstMedia as any).url || null
                          }
                        }
                      } catch (e) {
                        // Not JSON, ignore
                      }
                    }
                  }
                  
                  console.log('[PlannerTab] Final imageUrl:', imageUrl)
                  
                  if (!imageUrl) {
                    console.log('[PlannerTab] No image URL found, not rendering image')
                    return null
                  }
                  
                  // Check if it's a video
                  const isVideo = imageUrl.match(/\.(mp4|webm|ogg|mov)(\?|$)/i) || 
                                 (selectedPost.media && Array.isArray(selectedPost.media) && 
                                  selectedPost.media[0] && typeof selectedPost.media[0] === 'object' &&
                                  (selectedPost.media[0] as any).type === 'video')
                  
                  return (
                    <div className="relative w-full h-48 rounded-lg overflow-hidden bg-slate-100">
                      {isVideo ? (
                        <video
                          src={imageUrl}
                          className="w-full h-full object-cover"
                          controls
                          muted
                          playsInline
                        />
                      ) : (
                        // Use regular img tag for external URLs to avoid Next.js Image optimization issues
                        <img
                          src={imageUrl}
                          alt={selectedPost.topic || selectedPost.caption || 'Post media'}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            console.error('[PlannerTab] Image load error:', imageUrl)
                            // Show error message
                            const target = e.target as HTMLImageElement
                            if (target.parentElement) {
                              target.parentElement.innerHTML = `
                                <div class="w-full h-full flex items-center justify-center text-slate-500 text-sm p-4">
                                  <div class="text-center">
                                    <svg class="w-8 h-8 mx-auto mb-2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    <p>Failed to load image</p>
                                    <p class="text-xs mt-1 break-all">${imageUrl?.substring(0, 50)}...</p>
                                  </div>
                                </div>
                              `
                            }
                          }}
                        />
                      )}
                    </div>
                  )
                })()}

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


                {/* Date/Time - Editable if scheduled, read-only if published */}
                {(selectedPost.scheduled_at || selectedPost.published_at) && (
                  <div>
                    <div className="text-xs font-medium text-slate-600 mb-1">
                      {selectedPost.published_at ? 'Published' : 'Scheduled'}
                    </div>
                    {isEditing && !selectedPost.published_at && selectedPost.platform !== 'google_business' ? (
                      <div className="space-y-2">
                        <input
                          type="date"
                          value={editScheduledDate}
                          onChange={(e) => setEditScheduledDate(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1a73e8]"
                        />
                        <input
                          type="time"
                          value={editScheduledTime}
                          onChange={(e) => setEditScheduledTime(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1a73e8]"
                        />
                      </div>
                    ) : (
                      <div className="text-sm text-slate-900">
                        {new Date(selectedPost.published_at || selectedPost.scheduled_at!).toLocaleString()}
                      </div>
                    )}
                  </div>
                )}
                
                {/* Allow scheduling if not scheduled or published (and not GBP) */}
                {isEditing && !selectedPost.scheduled_at && !selectedPost.published_at && selectedPost.platform !== 'google_business' && (
                  <div>
                    <div className="text-xs font-medium text-slate-600 mb-1">Schedule</div>
                    <div className="space-y-2">
                      <input
                        type="date"
                        value={editScheduledDate}
                        onChange={(e) => setEditScheduledDate(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1a73e8]"
                      />
                      <input
                        type="time"
                        value={editScheduledTime}
                        onChange={(e) => setEditScheduledTime(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1a73e8]"
                      />
                    </div>
                  </div>
                )}

                {/* Caption - Editable */}
                <div>
                  <div className="text-xs font-medium text-slate-600 mb-1">Caption</div>
                  {isEditing ? (
                    <textarea
                      value={editCaption}
                      onChange={(e) => setEditCaption(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1a73e8] resize-none"
                      rows={4}
                      placeholder="Enter post caption..."
                    />
                  ) : (
                    <p className="text-sm text-slate-700 line-clamp-4">
                      {selectedPost.caption || 'No caption'}
                    </p>
                  )}
                </div>

                {/* GBP Search URL or Link */}
                {(selectedPost.gbp_search_url || selectedPost.link_url) && (
                  <div>
                    <div className="text-xs font-medium text-slate-600 mb-1">
                      {selectedPost.gbp_search_url ? 'View on Google' : 'Link'}
                    </div>
                    <a
                      href={selectedPost.gbp_search_url || selectedPost.link_url!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-[#1a73e8] hover:underline break-all"
                    >
                      {selectedPost.gbp_search_url ? 'Open on Google' : selectedPost.link_url}
                    </a>
                  </div>
                )}

                {/* CTA */}
                {selectedPost.cta && typeof selectedPost.cta === 'object' && (selectedPost.cta as any).actionType && (
                  <div>
                    <div className="text-xs font-medium text-slate-600 mb-1">Call to Action</div>
                    <div className="text-sm text-slate-700">
                      {(selectedPost.cta as any).actionType}
                      {(selectedPost.cta as any).url && (
                        <a
                          href={(selectedPost.cta as any).url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2 text-[#1a73e8] hover:underline"
                        >
                          {(selectedPost.cta as any).url}
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="pt-4 border-t border-slate-200 space-y-2">
                  {isEditing ? (
                    <>
                      <button
                        onClick={handleSaveEdit}
                        disabled={isSaving}
                        className="w-full px-4 py-2 text-sm font-medium text-white bg-[#1a73e8] rounded-md hover:bg-[#1557b0] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSaving ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            Saving...
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Save Changes
                          </>
                        )}
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        disabled={isSaving}
                        className="w-full px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handleEdit}
                      className="w-full px-4 py-2 text-sm font-medium text-white bg-[#1a73e8] rounded-md hover:bg-[#1557b0] transition-colors flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      {selectedPost.platform === 'google_business' && selectedPost.status === 'published' && selectedPost.gbp_local_post_name
                        ? 'Edit on Google'
                        : 'Edit Post'}
                    </button>
                  )}
                  <button
                    onClick={handleDuplicate}
                    className="w-full px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
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
                    onClick={handleDeleteClick}
                    className="w-full px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-300 rounded-md hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    {selectedPost.platform === 'google_business' && selectedPost.gbp_local_post_name
                      ? 'Delete on Google'
                      : 'Delete Post'}
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

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && postToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">
              {postToDelete.platform === 'google_business' && postToDelete.gbp_local_post_name
                ? 'Delete from Google Business Profile'
                : 'Delete Post'}
            </h3>
            <p className="text-sm text-slate-700 mb-6">
              {postToDelete.platform === 'google_business' && postToDelete.gbp_local_post_name
                ? 'Are you sure you want to delete this post from Google Business Profile? This action cannot be undone.'
                : 'Are you sure you want to delete this post? This action cannot be undone.'}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleDeleteCancel}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

