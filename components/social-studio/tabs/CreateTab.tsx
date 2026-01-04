'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { mockSocialAccounts } from '@/lib/social-studio/mock'
import { useToast, ToastContainer } from '@/components/ui/toast'
import Image from 'next/image'
import type { Platform } from '@/lib/social-studio/mock'
import { EmojiPicker } from '@/components/social-studio/EmojiPicker'
import { MediaViewer } from '@/components/social-studio/MediaViewer'
import { AiPostIdeasDrawer } from '@/components/social-studio/ai/AiPostIdeasDrawer'

interface CreateTabProps {
  businessLocationId: string
}

interface ChannelOption {
  id: Platform | 'youtube'
  name: string
  iconPath: string
  connected: boolean
}

export function CreateTab({ businessLocationId }: CreateTabProps) {
  const searchParams = useSearchParams()
  const { toasts, showToast, removeToast } = useToast()
  const [selectedChannels, setSelectedChannels] = useState<Platform[]>([])
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [content, setContent] = useState('')
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

  // All available channels
  const allChannels: ChannelOption[] = [
    {
      id: 'facebook',
      name: 'Facebook',
      iconPath: '/Facebook_f_logo_(2019).svg',
      connected: mockSocialAccounts.some(acc => acc.platform === 'facebook' && acc.status === 'connected'),
    },
    {
      id: 'instagram',
      name: 'Instagram',
      iconPath: '/Instagram_logo_2022.svg',
      connected: mockSocialAccounts.some(acc => acc.platform === 'instagram' && acc.status === 'connected'),
    },
    {
      id: 'google_business',
      name: 'Google',
      iconPath: '/Google__G__logo.svg',
      connected: mockSocialAccounts.some(acc => acc.platform === 'google_business' && acc.status === 'connected'),
    },
    {
      id: 'linkedin',
      name: 'LinkedIn',
      iconPath: '/LinkedIn_logo_initials.png.webp',
      connected: mockSocialAccounts.some(acc => acc.platform === 'linkedin' && acc.status === 'connected'),
    },
    {
      id: 'youtube',
      name: 'YouTube',
      iconPath: '/1690643591twitter-x-logo-png.webp', // Placeholder - YouTube icon needed
      connected: false,
    },
    {
      id: 'tiktok',
      name: 'TikTok',
      iconPath: '/tik-tok-logo_578229-290.avif',
      connected: false,
    },
  ]

  // Get connected channels for preview
  const connectedChannels = useMemo(() => allChannels.filter(ch => ch.connected), [])
  
  // Initialize selected channels with connected ones
  useEffect(() => {
    const connected = connectedChannels
      .filter(ch => ch.id !== 'youtube')
      .map(ch => ch.id as Platform)
    setSelectedChannels(connected)
  }, [connectedChannels])

  const handleChannelToggle = (channelId: string) => {
    if (channelId === 'youtube') {
      showToast('YouTube integration coming soon', 'info')
      return
    }
    const platformId = channelId as Platform
    if (!['instagram', 'facebook', 'linkedin', 'tiktok', 'google_business'].includes(platformId)) {
      return
    }
    setSelectedChannels((prev) =>
      prev.includes(platformId)
        ? prev.filter((id) => id !== platformId)
        : [...prev, platformId]
    )
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
            <div className="relative">
              {/* Preview: Selected Channels */}
              <div className="flex items-center gap-2 flex-wrap">
                {selectedChannels.map((channelId) => {
                  const channel = allChannels.find(ch => ch.id === channelId)
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
                    {allChannels.map((channel) => {
                      const isSelected = selectedChannels.includes(channel.id as Platform)
                      return (
                        <button
                          key={channel.id}
                          onClick={() => handleChannelToggle(channel.id)}
                          className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors ${
                            isSelected ? 'bg-blue-50' : ''
                          }`}
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
                            {!channel.connected && (
                              <div className="text-xs text-slate-500">Not connected</div>
                            )}
                          </div>
                          {isSelected && (
                            <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
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
        </div>
      </div>

      {/* Right: Preview */}
      <div className="lg:col-span-1">
        <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm sticky top-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Preview</h3>
          {selectedChannels.length > 0 ? (
            <div className="space-y-4">
              {selectedChannels.map((channelId) => {
                const channel = allChannels.find(ch => ch.id === channelId)
                if (!channel) return null
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
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 bg-slate-300 rounded-full"></div>
                        <div className="flex-1">
                          <div className="h-3 bg-slate-300 rounded w-24 mb-1"></div>
                          <div className="h-2 bg-slate-200 rounded w-16"></div>
                        </div>
                      </div>
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
        selectedChannels={selectedChannels.filter((ch) => ch !== 'youtube') as Array<'instagram' | 'facebook' | 'google_business' | 'linkedin' | 'tiktok'>}
        onInsert={(caption) => {
          setContent(caption)
        }}
        connectedChannels={allChannels
          .filter((ch) => selectedChannels.includes(ch.id as Platform))
          .map((ch) => ({ platform: ch.id, connected: ch.connected }))}
      />
    </div>
  )
}
