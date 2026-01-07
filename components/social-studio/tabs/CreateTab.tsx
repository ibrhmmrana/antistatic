'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useToast, ToastContainer } from '@/components/ui/toast'
import Image from 'next/image'
import type { Platform } from '@/lib/social-studio/mock'
import { EmojiPicker } from '@/components/social-studio/EmojiPicker'
import { MediaViewer } from '@/components/social-studio/MediaViewer'
import { AiPostIdeasDrawer } from '@/components/social-studio/ai/AiPostIdeasDrawer'
import { createClient } from '@/lib/supabase/client'

interface CreateTabProps {
  businessLocationId: string
}

interface ChannelOption {
  id: Platform
  name: string
  iconPath: string
  connected: boolean
  canSelect: boolean
  needsReconnect: boolean
  displayName?: string | null
  avatarUrl?: string | null
  username?: string | null
}

export function CreateTab({ businessLocationId }: CreateTabProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { toasts, showToast, removeToast } = useToast()
  const [selectedChannels, setSelectedChannels] = useState<Platform[]>([])
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [content, setContent] = useState('')
  const [scheduledAt, setScheduledAt] = useState<string | null>(null)
  const [scheduledDate, setScheduledDate] = useState<string>('')
  const [scheduledTime, setScheduledTime] = useState<string>('09:00')
  const [timezone, setTimezone] = useState<string>('Africa/Johannesburg') // SAST default
  const [editingPostId, setEditingPostId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showScheduleForm, setShowScheduleForm] = useState(false) // Only show when Schedule button is clicked or scheduledAt param exists
  const [channels, setChannels] = useState<ChannelOption[]>([])
  const [channelsLoading, setChannelsLoading] = useState(true)
  const [channelsError, setChannelsError] = useState<string | null>(null)
  const didInitSelectionRef = useRef(false)
  const [uploadedMedia, setUploadedMedia] = useState<Array<{ 
    id: string
    url: string
    filePath?: string
    type?: 'image' | 'video'
    isUploading?: boolean
    uploadProgress?: number
  }>>([])
  const [isMediaSectionExpanded, setIsMediaSectionExpanded] = useState(true)
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false)
  const [viewingMedia, setViewingMedia] = useState<{ url: string; type?: 'image' | 'video' } | null>(null)
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false)
  const emojiButtonRef = useRef<HTMLButtonElement>(null)

  // Handle URL params: date, scheduledAt, and postId
  useEffect(() => {
    const dateParam = searchParams.get('date') // YYYY-MM-DD format
    const scheduledAtParam = searchParams.get('scheduledAt')
    const postIdParam = searchParams.get('postId')
    
    if (dateParam) {
      // Handle YYYY-MM-DD format from Planner date click
      try {
        const [year, month, day] = dateParam.split('-').map(Number)
        const date = new Date(year, month - 1, day, 9, 0, 0) // Default to 9:00 AM
        if (!isNaN(date.getTime())) {
          setScheduledDate(dateParam)
          setScheduledTime('09:00')
          // Don't auto-show schedule form - user needs to click Schedule button
          setShowScheduleForm(false)
        }
      } catch (e) {
        console.error('Invalid date param:', e)
      }
    } else if (scheduledAtParam) {
      // Handle full ISO datetime format
      try {
        const date = new Date(scheduledAtParam)
        if (!isNaN(date.getTime())) {
          // Set default time to 9:00 AM SAST if not specified
          if (!scheduledAtParam.includes('T')) {
            date.setHours(9, 0, 0, 0)
          }
          setScheduledAt(date.toISOString())
          // Set date and time inputs
          setScheduledDate(date.toISOString().split('T')[0])
          const hours = String(date.getHours()).padStart(2, '0')
          const minutes = String(date.getMinutes()).padStart(2, '0')
          setScheduledTime(`${hours}:${minutes}`)
          // Show schedule form when scheduledAt param is present
          setShowScheduleForm(true)
        }
      } catch (e) {
        console.error('Invalid scheduledAt param:', e)
      }
    } else {
      // If no date params, hide schedule form (user came directly to Create tab)
      setShowScheduleForm(false)
    }

    if (postIdParam) {
      setEditingPostId(postIdParam)
    }
  }, [searchParams, businessLocationId])

  // Load post data when editingPostId changes
  useEffect(() => {
    const loadPost = async () => {
      if (!editingPostId) return

      try {
        const response = await fetch(`/api/social-studio/posts?businessLocationId=${businessLocationId}`)
        if (!response.ok) {
          throw new Error('Failed to fetch posts')
        }

        const data = await response.json()
        const post = data.posts?.find((p: any) => p.id === editingPostId)

        if (!post) {
          showToast('Post not found', 'error')
          setEditingPostId(null)
          return
        }

        // Load post data into form
        setContent(post.caption || '')
        setSelectedChannels((post.platforms || []) as Platform[])

        // Load media
        if (post.media && Array.isArray(post.media) && post.media.length > 0) {
          const mediaItems = post.media.map((m: any) => ({
            id: Math.random().toString(36).substring(7),
            url: m.url || (post as any).media_url || '',
            filePath: m.filePath,
            type: m.type || 'image',
          }))
          setUploadedMedia(mediaItems)
        } else if ((post as any).media_url) {
          // Fallback: use media_url if media array is empty
          setUploadedMedia([{
            id: Math.random().toString(36).substring(7),
            url: (post as any).media_url,
            type: 'image',
          }])
        }

        // Load scheduled date/time if scheduled
        if (post.scheduled_at) {
          const scheduledDate = new Date(post.scheduled_at)
          setScheduledAt(post.scheduled_at)
          setScheduledDate(scheduledDate.toISOString().split('T')[0])
          const hours = String(scheduledDate.getHours()).padStart(2, '0')
          const minutes = String(scheduledDate.getMinutes()).padStart(2, '0')
          setScheduledTime(`${hours}:${minutes}`)
          setShowScheduleForm(true)
        } else if (post.published_at) {
          // For published posts, show the published date but don't enable scheduling
          const publishedDate = new Date(post.published_at)
          setScheduledDate(publishedDate.toISOString().split('T')[0])
          setScheduledTime(`${String(publishedDate.getHours()).padStart(2, '0')}:${String(publishedDate.getMinutes()).padStart(2, '0')}`)
          setShowScheduleForm(false)
        }

        showToast('Post loaded for editing', 'success')
      } catch (error: any) {
        console.error('[CreateTab] Error loading post:', error)
        showToast(error.message || 'Failed to load post for editing', 'error')
        setEditingPostId(null)
      }
    }

    loadPost()
  }, [editingPostId, businessLocationId, showToast])

  // Fetch real connected channels
  useEffect(() => {
    const fetchChannels = async () => {
      setChannelsLoading(true)
      setChannelsError(null)
      try {
        const response = await fetch(
          `/api/social-studio/connections?businessLocationId=${businessLocationId}`
        )
        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to fetch channels')
        }
        const data = await response.json()
        setChannels(data.channels || [])
      } catch (error: any) {
        console.error('[CreateTab] Error fetching channels:', error)
        setChannelsError(error.message || 'Failed to load channels')
        showToast('Failed to load connected channels', 'error')
      } finally {
        setChannelsLoading(false)
      }
    }

    fetchChannels()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessLocationId]) // Only depend on businessLocationId, showToast is stable from useToast hook

  // Get connected channels for preview
  const connectedChannels = useMemo(() => channels.filter(ch => ch.connected && ch.canSelect), [channels])
  
  // Initialize selected channels with connected ones (only once, on first load, and only if not editing)
  useEffect(() => {
    if (!channelsLoading && !didInitSelectionRef.current && channels.length > 0 && !editingPostId) {
      const defaults = channels
        .filter(ch => ch.connected && ch.canSelect)
        .map(ch => ch.id as Platform)
      if (defaults.length > 0) {
        setSelectedChannels(defaults)
        didInitSelectionRef.current = true
      }
    }
  }, [channelsLoading, channels, editingPostId])

  const handleChannelToggle = (channelId: string) => {
    const platformId = channelId as Platform
    if (!['instagram', 'facebook', 'linkedin', 'tiktok', 'google_business'].includes(platformId)) {
      return
    }
    const channel = channels.find(ch => ch.id === platformId)
    if (!channel) return

    // If channel is not connected, prompt to connect
    if (!channel.connected) {
      showToast(`${channel.name} is not connected. Please connect it first.`, 'info')
      router.push('/onboarding/connect')
      setIsDropdownOpen(false)
      return
    }

    // If channel needs reconnection, prompt to fix
    if (channel.needsReconnect) {
      showToast('This channel needs to be reconnected', 'error')
      router.push('/onboarding/connect')
      setIsDropdownOpen(false)
      return
    }

    // Only allow toggling if channel is selectable
    if (!channel.canSelect) {
      return
    }

    setSelectedChannels((prev) =>
      prev.includes(platformId)
        ? prev.filter((id) => id !== platformId)
        : [...prev, platformId]
    )
  }

  const handleSave = async (action: 'draft' | 'schedule' | 'post') => {
    if (selectedChannels.length === 0) {
      showToast('Please select at least one channel', 'error')
      return
    }

    if (action === 'schedule' && (!scheduledDate || !scheduledTime)) {
      showToast('Please select a date and time to schedule', 'error')
      return
    }

    setSaving(true)

    try {
      // Prepare media array
      const mediaArray = uploadedMedia.map((m) => ({
        url: m.url,
        type: m.type || 'image',
        filePath: m.filePath,
      }))

      // Determine scheduledAt and status
      let scheduledAtValue: string | undefined = undefined
      let postStatus: 'draft' | 'scheduled' | 'published' = 'draft'
      
      if (action === 'schedule' && scheduledDate && scheduledTime) {
        updateScheduledAt(scheduledDate, scheduledTime, timezone)
        scheduledAtValue = scheduledAt || undefined
        postStatus = 'scheduled'
      } else if (action === 'post') {
        // Post immediately - publish to selected platforms
        postStatus = 'published'
      } else {
        // Save as draft
        postStatus = 'draft'
      }

      // If posting, publish to each selected platform
      let gbpMetadata: { localPostName?: string; searchUrl?: string } | null = null
      let instagramMetadata: { mediaId?: string; permalink?: string } | null = null
      
      if (action === 'post') {
        const publishResults: Array<{ platform: string; success: boolean; error?: string; gbpMetadata?: { localPostName?: string; searchUrl?: string }; instagramMetadata?: { mediaId?: string; permalink?: string } }> = []
        
        for (const platform of selectedChannels) {
          try {
            if (platform === 'google_business') {
              // Publish to Google Business Profile
              const gbpPayload: {
                businessLocationId: string
                summary: string
                languageCode?: string
                media?: { sourceUrl: string }
              } = {
                businessLocationId,
                summary: content || '',
                languageCode: 'en',
              }

              // Add media if available (use first image)
              if (mediaArray.length > 0 && mediaArray[0].url) {
                gbpPayload.media = { sourceUrl: mediaArray[0].url }
              }

              const gbpResponse = await fetch('/api/social-studio/publish/gbp', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(gbpPayload),
              })

              const gbpData = await gbpResponse.json()

              if (!gbpResponse.ok || !gbpData.ok) {
                throw new Error(gbpData.error || 'Failed to publish to Google Business Profile')
              }

              // Store GBP metadata for saving to database
              gbpMetadata = {
                localPostName: gbpData.localPostName,
                searchUrl: gbpData.searchUrl,
              }
              
              publishResults.push({ 
                platform: 'Google Business Profile', 
                success: true,
                gbpMetadata
              })
            } else if (platform === 'instagram') {
              // Publish to Instagram
              // Instagram requires media, so check if we have it
              if (mediaArray.length === 0 || !mediaArray[0].url) {
                throw new Error('Instagram posts require media (image or video)')
              }

              // Support carousel posts (multiple media items) or single media
              const isCarousel = mediaArray.length > 1
              
              const instagramPayload: {
                businessLocationId: string
                caption?: string
                media: { sourceUrl: string; type?: string } | Array<{ sourceUrl: string; type?: string }>
                mediaType?: string
              } = {
                businessLocationId,
                caption: content || undefined,
                media: isCarousel
                  ? // Carousel post: send array of media items
                    mediaArray.map(item => ({
                      sourceUrl: item.url,
                      type: item.type || (item.url.match(/\.(mp4|webm|ogg|mov|avi|mkv)(\?|$)/i) ? 'video' : 'image'),
                    }))
                  : // Single media post
                    {
                      sourceUrl: mediaArray[0].url,
                      type: mediaArray[0].type || (mediaArray[0].url.match(/\.(mp4|webm|ogg|mov|avi|mkv)(\?|$)/i) ? 'video' : 'image'),
                    },
              }

              const instagramResponse = await fetch('/api/social-studio/publish/instagram', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(instagramPayload),
              })

              const instagramData = await instagramResponse.json()

              if (!instagramResponse.ok || !instagramData.ok) {
                // Check for reauth requirement
                if (instagramData.needs_reauth) {
                  throw new Error('Instagram connection expired. Please reconnect your account.')
                }

                // Handle structured errors from the server
                if (instagramData.step) {
                  let errorMessage = instagramData.message || instagramData.error || 'Failed to publish to Instagram'
                  
                  // Add fbtrace_id if available
                  if (instagramData.meta?.fbtrace_id) {
                    errorMessage += ` (Trace ID: ${instagramData.meta.fbtrace_id})`
                  }

                  // Special handling for capability check errors
                  if (instagramData.step === 'capability_check') {
                    if (instagramResponse.status === 401) {
                      errorMessage = 'Instagram connection expired. Please reconnect your account.'
                    } else if (instagramResponse.status === 403) {
                      errorMessage = 'Missing Instagram publishing permission. Please reconnect and approve publish access (Advanced Access may be required in Meta App Review).'
                    } else if (errorMessage.includes('Professional')) {
                      errorMessage = 'Instagram account must be Professional (Business/Creator) to publish. Switch account type in Instagram settings.'
                    }
                  }

                  // Special handling for content type errors
                  if (instagramData.step === 'preflight' && errorMessage.includes('JPEG')) {
                    errorMessage = 'Instagram requires JPEG for image publishing. We\'ll auto-convert — retry.'
                  }

                  throw new Error(errorMessage)
                }

                throw new Error(instagramData.error || 'Failed to publish to Instagram')
              }

              // Store Instagram metadata for saving to database
              instagramMetadata = {
                mediaId: instagramData.mediaId,
                permalink: instagramData.permalink,
              }
              
              publishResults.push({ 
                platform: 'Instagram', 
                success: true,
                instagramMetadata
              })
            } else {
              // Other platforms not yet supported
              publishResults.push({ platform, success: false, error: 'Publishing not yet implemented for this platform' })
            }
          } catch (error: any) {
            console.error(`[CreateTab] Error publishing to ${platform}:`, error)
            publishResults.push({ 
              platform: platform === 'google_business' ? 'Google Business Profile' : platform === 'instagram' ? 'Instagram' : platform,
              success: false,
              error: error.message || 'Publishing failed'
            })
          }
        }

        // Show results
        const successful = publishResults.filter(r => r.success)
        const failed = publishResults.filter(r => !r.success)

        if (successful.length > 0) {
          showToast(
            `Posted to ${successful.map(r => r.platform).join(', ')}${failed.length > 0 ? ` (${failed.length} failed)` : ''}`,
            failed.length > 0 ? 'error' : 'success'
          )
        }

        if (failed.length > 0) {
          failed.forEach(result => {
            showToast(`${result.platform}: ${result.error}`, 'error')
          })
        }

        // If all failed, don't save to database
        if (failed.length === publishResults.length) {
          throw new Error('Failed to publish to all selected platforms')
        }
      }

      // Save post to database (for all actions: draft, schedule, or post)
      const payload: {
        businessLocationId: string
        platforms: string[]
        platform?: string
        topic?: string | null
        caption?: string | null
        media?: any[]
        mediaUrl?: string | null
        cta?: any
        linkUrl?: string | null
        utm?: any
        scheduledAt?: string
        status?: string
        publishedAt?: string
        gbpLocalPostName?: string | null
        gbpSearchUrl?: string | null
        platformMeta?: any
      } = {
        businessLocationId,
        platforms: selectedChannels,
        caption: content || null,
        media: mediaArray,
        status: postStatus,
      }

      // Set primary platform (prioritize GBP, then Instagram, then first selected)
      if (selectedChannels.includes('google_business')) {
        payload.platform = 'google_business'
      } else if (selectedChannels.includes('instagram')) {
        payload.platform = 'instagram'
      } else if (selectedChannels.length > 0) {
        payload.platform = selectedChannels[0]
      }

      if (scheduledAtValue) {
        payload.scheduledAt = scheduledAtValue
      }
      
      if (action === 'post') {
        // Set published_at to now for immediate posting
        payload.publishedAt = new Date().toISOString()
        
        // Add GBP-specific metadata if available
        if (gbpMetadata) {
          payload.gbpLocalPostName = gbpMetadata.localPostName || null
          payload.gbpSearchUrl = gbpMetadata.searchUrl || null
        }
        
        // Add Instagram-specific metadata if available
        if (instagramMetadata) {
          payload.platformMeta = {
            ...(payload.platformMeta || {}),
            instagram: {
              mediaId: instagramMetadata.mediaId,
              permalink: instagramMetadata.permalink,
            },
          }
        }
        
        // Add media URL (use first media item's URL)
        if (mediaArray.length > 0 && mediaArray[0].url) {
          payload.mediaUrl = mediaArray[0].url
        }
      }

      // Use PATCH if editing, POST if creating
      const url = editingPostId
        ? `/api/social-studio/posts/${editingPostId}`
        : '/api/social-studio/posts'
      const method = editingPostId ? 'PATCH' : 'POST'

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to save post')
      }

      const data = await response.json()
      let successMessage = ''
      if (action === 'post') {
        // Message already shown above for publishing
        successMessage = 'Post saved successfully!'
      } else if (action === 'schedule') {
        successMessage = 'Post scheduled successfully!'
      } else {
        successMessage = editingPostId ? 'Post updated successfully!' : 'Post saved as draft!'
      }
      
      if (action !== 'post' || successMessage) {
        showToast(successMessage, 'success')
      }

      // Reset form if creating new post
      if (!editingPostId) {
        setContent('')
        setUploadedMedia([])
        setScheduledAt(null)
        setScheduledDate('')
        setScheduledTime('09:00')
        setEditingPostId(null)
      }

      // Navigate back to planner if scheduled or posted
      if (action === 'schedule' || action === 'post') {
        setTimeout(() => {
          router.push('/social-studio?tab=planner')
        }, 1000)
      }
    } catch (error: any) {
      console.error('[CreateTab] Error saving post:', error)
      showToast(error.message || 'Failed to save post', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Update scheduledAt from date, time, and timezone
  // For MVP: timezone selector is for display only, we store in UTC
  // Future: implement proper timezone conversion
  const updateScheduledAt = (date: string, time: string, tz: string) => {
    if (!date || !time) {
      setScheduledAt(null)
      return
    }

    try {
      // Create date string
      const dateTimeString = `${date}T${time}:00`
      
      // For now, treat the date/time as if it's in the selected timezone
      // and convert to UTC by creating a date and getting its UTC equivalent
      // This is a simplified approach - proper timezone conversion would require a library
      const localDate = new Date(dateTimeString)
      
      // Get the timezone offset for the target timezone at this date
      // We'll use a workaround: create the date, then adjust based on timezone
      const formatter = new Intl.DateTimeFormat('en', {
        timeZone: tz,
        timeZoneName: 'longOffset'
      })
      
      // Create a test date to get timezone offset
      const parts = formatter.formatToParts(localDate)
      const offsetPart = parts.find(p => p.type === 'timeZoneName')
      
      // For MVP: just use the local date converted to ISO (UTC)
      // The timezone is stored for display purposes
      setScheduledAt(localDate.toISOString())
    } catch (error) {
      console.error('Error updating scheduledAt:', error)
      // Fallback: use the date/time as-is
      try {
        const dateTimeString = `${date}T${time}:00`
        const localDate = new Date(dateTimeString)
        setScheduledAt(localDate.toISOString())
      } catch (e) {
        setScheduledAt(null)
      }
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <ToastContainer toasts={toasts} onClose={removeToast} />
      
      {/* Left: Composer */}
      <div className="space-y-6">
        <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
          {/* Channel Selector */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">Select channels</label>
            {channelsLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <div className="w-4 h-4 border-2 border-slate-300 border-t-[#1a73e8] rounded-full animate-spin"></div>
                Loading channels...
              </div>
            ) : channelsError ? (
              <div className="text-sm text-red-600">{channelsError}</div>
            ) : channels.length === 0 ? (
              <div className="flex items-center gap-3 p-4 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">No channels connected</p>
                  <p className="text-xs text-slate-500 mt-1">Connect a channel to get started</p>
                </div>
                <button
                  onClick={() => router.push('/onboarding/connect')}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-[#1a73e8] rounded-md hover:bg-[#1557b0] transition-colors"
                >
                  Connect
                </button>
              </div>
            ) : (
              <div className="relative">
                {/* Preview: Selected Channels */}
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedChannels.map((channelId) => {
                    const channel = channels.find(ch => ch.id === channelId)
                    if (!channel) return null
                    return (
                      <div
                        key={channelId}
                        className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg"
                      >
                        <Image
                          src={channel.iconPath}
                          alt={channel.name}
                          width={20}
                          height={20}
                          className="object-contain"
                        />
                        <span className="text-sm font-medium text-slate-700">{channel.name}</span>
                        <button
                          onClick={() => handleChannelToggle(channelId)}
                          className="ml-1 text-slate-400 hover:text-slate-600"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    )
                  })}
                  {/* Dropdown Button */}
                  <button
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>

                {/* Dropdown Menu */}
                {isDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setIsDropdownOpen(false)}
                    />
                    <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-slate-200 rounded-lg shadow-lg z-20 max-h-80 overflow-y-auto">
                      {channels.map((channel) => {
                        const isSelected = selectedChannels.includes(channel.id as Platform)
                        const isNotConnected = !channel.connected
                        const isDisabled = !channel.canSelect && channel.connected
                        return (
                          <button
                            key={channel.id}
                            onClick={() => {
                              // Allow clicking on unconnected channels to prompt connection
                              handleChannelToggle(channel.id)
                            }}
                            className={`w-full flex items-center gap-3 px-4 py-3 transition-colors ${
                              isDisabled
                                ? 'opacity-50 cursor-not-allowed bg-slate-50'
                                : isSelected
                                ? 'bg-blue-50 hover:bg-blue-100'
                                : isNotConnected
                                ? 'hover:bg-slate-50 opacity-75'
                                : 'hover:bg-slate-50'
                            }`}
                            title={
                              isNotConnected
                                ? `Click to connect ${channel.name}`
                                : isDisabled
                                ? channel.needsReconnect
                                  ? 'Connection expired or needs reconnection. Click to fix.'
                                  : 'Not available'
                                : undefined
                            }
                          >
                            <div className="relative w-8 h-8 flex-shrink-0">
                              <Image
                                src={channel.iconPath}
                                alt={channel.name}
                                fill
                                className="object-contain"
                                sizes="32px"
                              />
                            </div>
                            <div className="flex-1 text-left">
                              <div className="text-sm font-medium text-slate-900">{channel.name}</div>
                              {channel.displayName || channel.username ? (
                                <div className="text-xs text-slate-500">
                                  {channel.displayName || channel.username}
                                </div>
                              ) : !channel.connected ? (
                                <div className="text-xs text-slate-500">Not connected</div>
                              ) : channel.needsReconnect ? (
                                <div className="text-xs text-amber-600">Needs reconnection</div>
                              ) : null}
                            </div>
                            {isSelected && channel.canSelect && (
                              <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            )}
                            {isNotConnected && (
                              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                              </svg>
                            )}
                            {isDisabled && channel.needsReconnect && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  router.push('/onboarding/connect')
                                }}
                                className="text-xs text-[#1a73e8] hover:text-[#1557b0] font-medium"
                              >
                                Fix
                              </button>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Initial Content Tab */}
          <div className="mb-4">
            <div className="border-b border-slate-200">
              <button className="px-4 py-2 text-sm font-medium text-[#1a73e8] border-b-2 border-[#1a73e8]">
                Initial content
              </button>
            </div>
          </div>

          {/* Content Textarea */}
          <div className="mb-4">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1a73e8] resize-none"
              placeholder="What would you like to share?"
            />
          </div>

          {/* Media Attachment Section */}
          {uploadedMedia.length > 0 && (
            <div className="mb-4 border border-slate-200 rounded-lg">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-sm font-medium text-slate-900">
                    {uploadedMedia.length} attached {uploadedMedia.length === 1 ? 'image' : 'images'}
                  </span>
                </div>
                <button
                  onClick={() => setIsMediaSectionExpanded(!isMediaSectionExpanded)}
                  className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
                >
                  <svg className={`w-4 h-4 transition-transform ${isMediaSectionExpanded ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                </button>
              </div>

              {/* Media Grid */}
              {isMediaSectionExpanded && (
                <div className="p-4">
                  <div className="flex items-start gap-4 flex-wrap">
                    {uploadedMedia.map((media) => (
                      <div key={media.id} className="relative group">
                        <div 
                          className={`relative w-32 h-32 border border-slate-200 rounded-lg overflow-hidden ${
                            !media.isUploading ? 'cursor-pointer' : ''
                          }`}
                          onClick={() => {
                            if (!media.isUploading) {
                              setViewingMedia({ url: media.url, type: media.type })
                            }
                          }}
                        >
                          {media.isUploading ? (
                            <div className="w-full h-full bg-slate-100 flex flex-col items-center justify-center">
                              <div className="w-8 h-8 border-4 border-[#1a73e8] border-t-transparent rounded-full animate-spin mb-2"></div>
                              <span className="text-xs text-slate-600">
                                {media.uploadProgress !== undefined ? `${media.uploadProgress}%` : 'Uploading...'}
                              </span>
                            </div>
                          ) : media.type === 'video' || media.url.match(/\.(mp4|webm|ogg|mov)(\?|$)/i) ? (
                            <>
                              <video
                                src={media.url}
                                className="w-full h-full object-cover"
                                muted
                                playsInline
                                preload="metadata"
                              />
                              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 pointer-events-none">
                                <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                                </svg>
                              </div>
                            </>
                          ) : (
                            <Image
                              src={media.url}
                              alt="Uploaded media"
                              fill
                              className="object-cover"
                              sizes="128px"
                              unoptimized
                            />
                          )}
                          {/* Edit Button */}
                          {!media.isUploading && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                showToast('Edit functionality coming soon', 'info')
                              }}
                              className="absolute top-2 right-2 w-6 h-6 bg-slate-800 bg-opacity-75 hover:bg-opacity-90 rounded-full flex items-center justify-center transition-opacity opacity-0 group-hover:opacity-100 z-10"
                            >
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          )}
                          {/* Remove Button */}
                          {!media.isUploading && (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation()
                                // Delete from Supabase if filePath exists
                                if (media.filePath) {
                                  try {
                                    const response = await fetch(
                                      `/api/social-studio/delete-media?filePath=${encodeURIComponent(media.filePath)}&businessLocationId=${encodeURIComponent(businessLocationId)}`,
                                      {
                                        method: 'DELETE',
                                      }
                                    )

                                    if (!response.ok) {
                                      const error = await response.json()
                                      throw new Error(error.error || 'Delete failed')
                                    }
                                  } catch (error: any) {
                                    console.error('Delete error:', error)
                                    showToast(error.message || 'Failed to delete from storage', 'error')
                                    // Still remove from UI even if storage delete fails
                                  }
                                }

                                // Remove from UI
                                setUploadedMedia((prev) => prev.filter((m) => m.id !== media.id))
                                showToast('Media removed', 'success')
                              }}
                              className="absolute top-2 left-2 w-6 h-6 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center transition-opacity opacity-0 group-hover:opacity-100 z-10"
                            >
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {/* Add More Button */}
                    <button
                      onClick={async () => {
                        const input = document.createElement('input')
                        input.type = 'file'
                        input.accept = 'image/*,video/*'
                        input.multiple = true
                        input.onchange = async (e) => {
                          const files = Array.from((e.target as HTMLInputElement).files || [])
                          for (const file of files) {
                            const mediaId = Math.random().toString(36).substring(7)
                            const isVideo = file.type.startsWith('video/')
                            const previewUrl = URL.createObjectURL(file)

                            // Add to uploaded media with uploading state
                            setUploadedMedia((prev) => [
                              ...prev,
                              {
                                id: mediaId,
                                url: previewUrl,
                                type: isVideo ? 'video' : 'image',
                                isUploading: true,
                                uploadProgress: 0,
                              },
                            ])

                            try {
                              // Create form data
                              const formData = new FormData()
                              formData.append('file', file)
                              formData.append('businessLocationId', businessLocationId)

                              // Upload to Supabase with progress tracking
                              const xhr = new XMLHttpRequest()
                              
                              xhr.upload.addEventListener('progress', (event) => {
                                if (event.lengthComputable) {
                                  const progress = Math.round((event.loaded / event.total) * 100)
                                  setUploadedMedia((prev) =>
                                    prev.map((m) =>
                                      m.id === mediaId ? { ...m, uploadProgress: progress } : m
                                    )
                                  )
                                }
                              })

                              const uploadPromise = new Promise<{ publicUrl: string; filePath: string }>((resolve, reject) => {
                                xhr.addEventListener('load', () => {
                                  if (xhr.status >= 200 && xhr.status < 300) {
                                    const data = JSON.parse(xhr.responseText)
                                    resolve({ publicUrl: data.publicUrl, filePath: data.filePath })
                                  } else {
                                    const error = JSON.parse(xhr.responseText)
                                    reject(new Error(error.error || 'Upload failed'))
                                  }
                                })

                                xhr.addEventListener('error', () => {
                                  reject(new Error('Upload failed'))
                                })

                                xhr.open('POST', '/api/social-studio/upload-media')
                                xhr.send(formData)
                              })

                              const data = await uploadPromise

                              // Revoke the preview URL and update with real URL
                              URL.revokeObjectURL(previewUrl)

                              // Update uploaded media with real URL and remove uploading state
                              setUploadedMedia((prev) =>
                                prev.map((m) =>
                                  m.id === mediaId
                                    ? {
                                        ...m,
                                        url: data.publicUrl,
                                        filePath: data.filePath,
                                        isUploading: false,
                                        uploadProgress: undefined,
                                      }
                                    : m
                                )
                              )

                              showToast('Media uploaded successfully', 'success')
                            } catch (error: any) {
                              console.error('Upload error:', error)
                              // Remove failed upload from UI
                              setUploadedMedia((prev) => prev.filter((m) => m.id !== mediaId))
                              URL.revokeObjectURL(previewUrl)
                              showToast(error.message || 'Failed to upload media', 'error')
                            }
                          }
                        }
                        input.click()
                      }}
                      className="w-32 h-32 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center hover:border-slate-400 hover:bg-slate-50 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
                        <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Bottom Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
            {/* Upload Media */}
            <button
              onClick={async () => {
                const input = document.createElement('input')
                input.type = 'file'
                input.accept = 'image/*,video/*'
                input.multiple = true
                input.onchange = async (e) => {
                  const files = Array.from((e.target as HTMLInputElement).files || [])
                  for (const file of files) {
                    const mediaId = Math.random().toString(36).substring(7)
                    const isVideo = file.type.startsWith('video/')
                    const previewUrl = URL.createObjectURL(file)

                    // Add to uploaded media with uploading state
                    setUploadedMedia((prev) => [
                      ...prev,
                      {
                        id: mediaId,
                        url: previewUrl,
                        type: isVideo ? 'video' : 'image',
                        isUploading: true,
                        uploadProgress: 0,
                      },
                    ])

                    try {
                      // Always use API route (uses service role, bypasses RLS)
                      // Note: Large files (>4.5MB) may fail on Vercel Hobby plan due to body size limits
                      const formData = new FormData()
                      formData.append('file', file)
                      formData.append('businessLocationId', businessLocationId)

                      // Upload to Supabase with progress tracking
                      const xhr = new XMLHttpRequest()
                      
                      xhr.upload.addEventListener('progress', (event) => {
                        if (event.lengthComputable) {
                          const progress = Math.round((event.loaded / event.total) * 100)
                          setUploadedMedia((prev) =>
                            prev.map((m) =>
                              m.id === mediaId ? { ...m, uploadProgress: progress } : m
                            )
                          )
                        }
                      })

                      const uploadPromise = new Promise<{ publicUrl: string; filePath: string }>((resolve, reject) => {
                        // Set timeout (5 minutes for large videos)
                        const timeout = setTimeout(() => {
                          xhr.abort()
                          reject(new Error('Upload timeout: The file is too large or the connection is too slow'))
                        }, 5 * 60 * 1000) // 5 minutes

                        xhr.addEventListener('loadend', () => {
                          clearTimeout(timeout)
                          
                          // Check readyState - should be 4 (DONE)
                          if (xhr.readyState !== 4) {
                            reject(new Error('Upload incomplete: connection interrupted'))
                            return
                          }
                          
                          // Check if response is empty
                          if (!xhr.responseText || xhr.responseText.trim() === '') {
                            console.error('[Upload] Empty response. Status:', xhr.status, 'StatusText:', xhr.statusText)
                            reject(new Error('Empty response from server'))
                            return
                          }

                          try {
                            if (xhr.status >= 200 && xhr.status < 300) {
                              const data = JSON.parse(xhr.responseText)
                              
                              // Validate response structure
                              if (!data.publicUrl || !data.filePath) {
                                console.error('[Upload] Invalid response structure:', data)
                                reject(new Error('Invalid response from server: missing publicUrl or filePath'))
                                return
                              }
                              
                              resolve({ publicUrl: data.publicUrl, filePath: data.filePath })
                            } else {
                              // Handle specific error codes
                              let errorMessage = 'Upload failed'
                              try {
                                const error = JSON.parse(xhr.responseText)
                                errorMessage = error.error || error.message || `Server error: ${xhr.status}`
                                
                                // Provide helpful message for 413 (Payload Too Large)
                                if (xhr.status === 413) {
                                  const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1)
                                  errorMessage = `File too large (${fileSizeMB}MB). Your hosting plan may have a file size limit (e.g., Vercel Hobby allows 4.5MB). Consider upgrading your plan or compressing the file.`
                                }
                              } catch {
                                // If JSON parsing fails, use status text
                                if (xhr.status === 413) {
                                  const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1)
                                  errorMessage = `File too large (${fileSizeMB}MB). Your hosting plan may have a file size limit.`
                                } else {
                                  errorMessage = `Server error: ${xhr.status} ${xhr.statusText || 'Unknown error'}`
                                }
                              }
                              reject(new Error(errorMessage))
                            }
                          } catch (parseError: any) {
                            console.error('[Upload] JSON parse error:', parseError, 'Response:', xhr.responseText?.substring(0, 200))
                            reject(new Error(`Failed to parse server response: ${parseError.message}`))
                          }
                        })

                        xhr.addEventListener('error', () => {
                          clearTimeout(timeout)
                          reject(new Error('Network error: Failed to upload file'))
                        })

                        xhr.addEventListener('abort', () => {
                          clearTimeout(timeout)
                          reject(new Error('Upload was cancelled'))
                        })

                        xhr.open('POST', '/api/social-studio/upload-media')
                        xhr.send(formData)
                      })

                      const data = await uploadPromise

                      // Revoke the preview URL and update with real URL
                      URL.revokeObjectURL(previewUrl)

                      // Update uploaded media with real URL and remove uploading state
                      setUploadedMedia((prev) =>
                        prev.map((m) =>
                          m.id === mediaId
                            ? {
                                ...m,
                                url: data.publicUrl,
                                filePath: data.filePath,
                                isUploading: false,
                                uploadProgress: undefined,
                              }
                            : m
                        )
                      )

                      showToast('Media uploaded successfully', 'success')
                    } catch (error: any) {
                      console.error('Upload error:', error)
                      // Remove failed upload from UI
                      setUploadedMedia((prev) => prev.filter((m) => m.id !== mediaId))
                      URL.revokeObjectURL(previewUrl)
                      showToast(error.message || 'Failed to upload media', 'error')
                    }
                  }
                }
                input.click()
              }}
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              aria-label="Upload media"
              title="Upload media"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>

            {/* Add Emoji */}
            <div className="relative">
              <button
                ref={emojiButtonRef}
                onClick={() => setIsEmojiPickerOpen(!isEmojiPickerOpen)}
                className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                aria-label="Add emoji"
                title="Add emoji"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
              {isEmojiPickerOpen && (
                <EmojiPicker
                  onSelect={(emoji) => {
                    setContent(prev => prev + emoji)
                    setIsEmojiPickerOpen(false)
                  }}
                  onClose={() => setIsEmojiPickerOpen(false)}
                />
              )}
            </div>
            </div>

            {/* Generate with AI - Primary CTA */}
            <button
              onClick={() => setIsAiDrawerOpen(true)}
              className="text-sm font-medium text-[#1a73e8] underline hover:text-[#1557b0] transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              Generate with AI
            </button>
          </div>

          {/* Schedule Date/Time Picker - Only show when Schedule button is clicked or scheduledAt param exists */}
          {showScheduleForm && (
            <div className="mt-6 pt-6 border-t border-slate-200 space-y-4">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-sm font-medium text-slate-700 mb-2">Schedule Date</label>
                  <input
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => {
                      setScheduledDate(e.target.value)
                      if (e.target.value && scheduledTime) {
                        updateScheduledAt(e.target.value, scheduledTime, timezone)
                      }
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1a73e8] focus:border-transparent"
                  />
                </div>
                <div className="flex-1 min-w-[150px]">
                  <label className="block text-sm font-medium text-slate-700 mb-2">Time</label>
                  <input
                    type="time"
                    value={scheduledTime}
                    onChange={(e) => {
                      setScheduledTime(e.target.value)
                      if (scheduledDate && e.target.value) {
                        updateScheduledAt(scheduledDate, e.target.value, timezone)
                      }
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1a73e8] focus:border-transparent"
                  />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-sm font-medium text-slate-700 mb-2">Timezone</label>
                  <select
                    value={timezone}
                    onChange={(e) => {
                      setTimezone(e.target.value)
                      if (scheduledDate && scheduledTime) {
                        updateScheduledAt(scheduledDate, scheduledTime, e.target.value)
                      }
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1a73e8] focus:border-transparent"
                  >
                    <option value="Africa/Johannesburg">SAST (UTC+2)</option>
                    <option value="UTC">UTC (UTC+0)</option>
                    <option value="America/New_York">EST (UTC-5)</option>
                    <option value="America/Los_Angeles">PST (UTC-8)</option>
                    <option value="Europe/London">GMT (UTC+0)</option>
                    <option value="Europe/Paris">CET (UTC+1)</option>
                    <option value="Asia/Dubai">GST (UTC+4)</option>
                    <option value="Asia/Tokyo">JST (UTC+9)</option>
                    <option value="Australia/Sydney">AEDT (UTC+11)</option>
                  </select>
                </div>
              </div>
              {scheduledAt && (
                <div className="text-sm text-slate-600">
                  Scheduled for: {new Date(scheduledAt).toLocaleString('en-US', { 
                    timeZone: timezone,
                    dateStyle: 'full',
                    timeStyle: 'short'
                  })} ({timezone === 'Africa/Johannesburg' ? 'SAST' : timezone.split('/')[1]})
                </div>
              )}
            </div>
          )}

          {/* Action Buttons: Post, Schedule, Save Draft */}
          <div className="mt-4 flex items-center justify-end gap-3">
            <button
              onClick={() => handleSave('draft')}
              disabled={saving || selectedChannels.length === 0}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Draft'}
            </button>
            <button
              onClick={() => {
                setShowScheduleForm(true)
                // If schedule form is now visible and no date/time set, set defaults
                if (!scheduledDate) {
                  const tomorrow = new Date()
                  tomorrow.setDate(tomorrow.getDate() + 1)
                  setScheduledDate(tomorrow.toISOString().split('T')[0])
                }
              }}
              disabled={saving || selectedChannels.length === 0}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Schedule
            </button>
            {showScheduleForm && (
              <button
                onClick={() => handleSave('schedule')}
                disabled={saving || selectedChannels.length === 0 || !scheduledDate || !scheduledTime}
                className="px-4 py-2 text-sm font-medium text-white bg-[#1a73e8] rounded-md hover:bg-[#1557b0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Scheduling...' : 'Confirm Schedule'}
              </button>
            )}
            <button
              onClick={() => handleSave('post')}
              disabled={saving || selectedChannels.length === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-[#10b981] rounded-md hover:bg-[#059669] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Publishing...' : 'Post'}
            </button>
          </div>
        </div>
      </div>

      {/* Right: Preview */}
      <div className="lg:col-span-1">
        <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm sticky top-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Preview</h3>
          {selectedChannels.length > 0 ? (
            <div className="space-y-4">
              {selectedChannels.map((channelId) => {
                const channel = channels.find(ch => ch.id === channelId)
                if (!channel) return null
                
                // Get first image for preview (GBP supports single image)
                const previewImage = uploadedMedia.length > 0 && uploadedMedia[0].type === 'image' && !uploadedMedia[0].isUploading
                  ? uploadedMedia[0].url
                  : null
                
                return (
                  <div key={channelId} className="border border-slate-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Image
                        src={channel.iconPath}
                        alt={channel.name}
                        width={20}
                        height={20}
                        className="object-contain"
                      />
                      <span className="text-sm font-medium text-slate-700">{channel.name}</span>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-4">
                      {/* Image Preview */}
                      {previewImage ? (
                        <div className="relative w-full h-48 rounded-lg overflow-hidden mb-3 bg-slate-200">
                          <Image
                            src={previewImage}
                            alt="Post preview"
                            fill
                            className="object-cover"
                            sizes="100%"
                            unoptimized
                          />
                        </div>
                      ) : null}
                      
                      {/* Content */}
                      {content ? (
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{content}</p>
                      ) : (
                        <div className="space-y-2">
                          <div className="h-2 bg-slate-200 rounded"></div>
                          <div className="h-2 bg-slate-200 rounded w-3/4"></div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500">
              <div className="bg-slate-50 rounded-lg p-8 mb-4">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <div className="w-10 h-10 bg-slate-300 rounded-full"></div>
                  <div className="space-y-1">
                    <div className="h-3 bg-slate-300 rounded w-32"></div>
                    <div className="h-2 bg-slate-200 rounded w-24"></div>
                  </div>
                </div>
                <div className="h-32 bg-slate-200 rounded-lg"></div>
              </div>
              <p className="text-sm">Select a channel and start creating a post to see a preview.</p>
            </div>
          )}
        </div>
      </div>

      {/* Media Viewer Modal */}
      <MediaViewer
        media={viewingMedia}
        onClose={() => setViewingMedia(null)}
      />

      {/* AI Post Ideas Drawer */}
      <AiPostIdeasDrawer
        open={isAiDrawerOpen}
        onClose={() => setIsAiDrawerOpen(false)}
        businessLocationId={businessLocationId}
        platform={
          selectedChannels.length > 0
            ? (selectedChannels[0] as 'instagram' | 'facebook' | 'google_business' | 'linkedin' | 'tiktok')
            : connectedChannels.length > 0
            ? (connectedChannels[0].id as 'instagram' | 'facebook' | 'google_business' | 'linkedin' | 'tiktok')
            : null
        }
        selectedChannels={selectedChannels as Array<'instagram' | 'facebook' | 'google_business' | 'linkedin' | 'tiktok'>}
        onInsert={(caption) => {
          setContent(caption)
        }}
        connectedChannels={channels
          .filter((ch) => selectedChannels.includes(ch.id as Platform))
          .map((ch) => ({ platform: ch.id, connected: ch.connected && ch.canSelect }))}
      />
    </div>
  )
}
