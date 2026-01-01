'use client'

import { useState, useEffect } from 'react'
import { Database } from '@/lib/supabase/database.types'
import ImageIcon from '@mui/icons-material/Image'
import AddIcon from '@mui/icons-material/Add'
import FilterListIcon from '@mui/icons-material/FilterList'
import { Button } from '@/components/ui/button'
import { useToast, ToastContainer } from '@/components/ui/toast'

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

interface InstagramContentProps {
  locationId: string
  instagramConnection: InstagramConnection | null
}

interface Post {
  id: string
  caption: string
  likesCount: number
  commentsCount: number
  timestamp: string
  mediaUrl?: string
  permalink: string
  mediaType?: string
}

export function InstagramContent({ locationId, instagramConnection }: InstagramContentProps) {
  const [loading, setLoading] = useState(true)
  const [posts, setPosts] = useState<Post[]>([])
  const [showComposer, setShowComposer] = useState(false)
  const [timeFilter, setTimeFilter] = useState<'7' | '30' | '90' | 'all'>('30')
  const [mediaFilter, setMediaFilter] = useState<'all' | 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM'>('all')
  const [uploading, setUploading] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [caption, setCaption] = useState('')
  const [mediaType, setMediaType] = useState<'IMAGE' | 'VIDEO'>('IMAGE')
  const { toasts, showToast, removeToast } = useToast()

  const handleFileSelect = async (file: File) => {
    setSelectedFile(file)
    setMediaType(file.type.startsWith('video/') ? 'VIDEO' : 'IMAGE')
    setUploading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('businessLocationId', locationId)

      const response = await fetch('/api/social/instagram/upload-media', {
        method: 'POST',
        body: formData,
      })

      if (response.ok) {
        const data = await response.json()
        setMediaUrl(data.publicUrl)
        showToast('Media uploaded successfully', 'success')
      } else {
        const error = await response.json()
        showToast(`Upload failed: ${error.error || 'Unknown error'}`, 'error')
        setSelectedFile(null)
      }
    } catch (error: any) {
      showToast(`Upload failed: ${error.message}`, 'error')
      setSelectedFile(null)
    } finally {
      setUploading(false)
    }
  }

  const handlePublish = async () => {
    if (!mediaUrl) {
      showToast('Please upload a media file first', 'error')
      return
    }

    setPublishing(true)

    try {
      // Step 1: Create container
      const createResponse = await fetch('/api/social/instagram/publish/create-container', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId,
          type: mediaType,
          mediaUrl,
          caption: caption.trim() || undefined,
        }),
      })

      // Safe JSON parsing
      const contentType = createResponse.headers.get('content-type') || ''
      const rawText = await createResponse.text()
      let createResult: any = {}
      
      if (contentType.includes('application/json')) {
        try {
          createResult = JSON.parse(rawText)
        } catch (parseError) {
          showToast(`Failed to parse response: ${rawText.slice(0, 200)}`, 'error')
          setPublishing(false)
          return
        }
      } else {
        showToast(`Unexpected response: ${rawText.slice(0, 200)}`, 'error')
        setPublishing(false)
        return
      }

      if (!createResponse.ok || !createResult.success) {
        const errorMsg = createResult.error || 'Failed to create media container'
        const errorDetails = createResult.details ? `\n\nDetails: ${createResult.details}` : ''
        showToast(`${errorMsg}${errorDetails}`, 'error')
        setPublishing(false)
        return
      }

      const creationId = createResult.creationId

      // Step 2: Publish container
      const publishResponse = await fetch('/api/social/instagram/publish/publish-container', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId,
          creationId,
        }),
      })

      // Safe JSON parsing
      const publishContentType = publishResponse.headers.get('content-type') || ''
      const publishRawText = await publishResponse.text()
      let publishResult: any = {}
      
      if (publishContentType.includes('application/json')) {
        try {
          publishResult = JSON.parse(publishRawText)
        } catch (parseError) {
          showToast(`Failed to parse publish response: ${publishRawText.slice(0, 200)}`, 'error')
          setPublishing(false)
          return
        }
      } else {
        showToast(`Unexpected publish response: ${publishRawText.slice(0, 200)}`, 'error')
        setPublishing(false)
        return
      }

      if (publishResponse.ok && publishResult.success) {
        showToast('Post published successfully!', 'success')
        setShowComposer(false)
        setSelectedFile(null)
        setMediaUrl(null)
        setCaption('')
        
        // Refresh posts list
        const refreshResponse = await fetch(
          `/api/social/instagram/media?locationId=${locationId}&limit=12&timeFilter=${timeFilter}&mediaFilter=${mediaFilter}`
        )
        if (refreshResponse.ok) {
          const data = await refreshResponse.json()
          setPosts(data.posts || [])
        }
      } else {
        const errorMsg = publishResult.error || 'Failed to publish media'
        const errorDetails = publishResult.details ? `\n\nDetails: ${publishResult.details}` : ''
        showToast(`${errorMsg}${errorDetails}`, 'error')
      }
    } catch (error: any) {
      showToast(`Publish failed: ${error.message}`, 'error')
    } finally {
      setPublishing(false)
    }
  }

  useEffect(() => {
    const fetchPosts = async () => {
      if (!instagramConnection) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const response = await fetch(
          `/api/social/instagram/media?locationId=${locationId}&limit=12&timeFilter=${timeFilter}&mediaFilter=${mediaFilter}`
        )
        if (response.ok) {
          const data = await response.json()
          setPosts(data.posts || [])
        } else {
          const errorData = await response.json().catch(() => ({}))
          console.error('Error fetching posts:', errorData)
        }
      } catch (error) {
        console.error('Error fetching posts:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchPosts()
  }, [locationId, instagramConnection, timeFilter, mediaFilter])

  if (!instagramConnection) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
        <p className="text-slate-600">Instagram account not connected</p>
      </div>
    )
  }

  // Check if publish is enabled
  const canPublish = instagramConnection.scopes?.some(s => s.includes('instagram_business_content_publish')) || false

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onClose={removeToast} />
      {/* Header with Filters */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            <ImageIcon sx={{ fontSize: 24 }} />
            Content
          </h2>
          {canPublish && (
            <Button
              onClick={() => setShowComposer(true)}
            >
              <AddIcon sx={{ fontSize: 16 }} className="mr-1" />
              Create Post
            </Button>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <FilterListIcon sx={{ fontSize: 20 }} className="text-slate-500" />
            <span className="text-sm text-slate-600">Time:</span>
            <select
              value={timeFilter}
              onChange={(e) => setTimeFilter(e.target.value as any)}
              className="px-3 py-1 border border-slate-300 rounded-md text-sm"
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="all">All time</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">Type:</span>
            <select
              value={mediaFilter}
              onChange={(e) => setMediaFilter(e.target.value as any)}
              className="px-3 py-1 border border-slate-300 rounded-md text-sm"
            >
              <option value="all">All</option>
              <option value="IMAGE">Posts</option>
              <option value="VIDEO">Videos</option>
              <option value="CAROUSEL_ALBUM">Carousels</option>
            </select>
          </div>
        </div>
      </div>

      {/* Posts Grid */}
      {loading ? (
        <div className="bg-white rounded-lg border border-slate-200 p-6 animate-pulse">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="aspect-square bg-slate-200 rounded"></div>
            ))}
          </div>
        </div>
      ) : posts.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
          <ImageIcon sx={{ fontSize: 48 }} className="text-slate-300 mb-4" />
          <p className="text-slate-600 mb-2">No posts found</p>
          <p className="text-sm text-slate-500">Posts matching your filters will appear here</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {posts.map((post) => (
            <a
              key={post.id}
              href={post.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white rounded-lg border border-slate-200 overflow-hidden hover:shadow-md transition-shadow group"
            >
              {post.mediaUrl ? (
                <div className="aspect-square relative overflow-hidden">
                  <img
                    src={post.mediaUrl}
                    alt="Post"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    onError={(e) => {
                      // Fallback to placeholder if image fails to load
                      const target = e.target as HTMLImageElement
                      target.style.display = 'none'
                      const parent = target.parentElement
                      if (parent && !parent.querySelector('.placeholder')) {
                        const placeholder = document.createElement('div')
                        placeholder.className = 'placeholder aspect-square bg-slate-100 flex items-center justify-center'
                        placeholder.innerHTML = '<svg class="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>'
                        parent.appendChild(placeholder)
                      }
                    }}
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <div className="text-white text-center">
                      <div className="flex items-center justify-center gap-4 mb-1">
                        <span>❤️ {post.likesCount.toLocaleString()}</span>
                        <span>💬 {post.commentsCount.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="aspect-square bg-slate-100 flex items-center justify-center">
                  <ImageIcon sx={{ fontSize: 32 }} className="text-slate-400" />
                </div>
              )}
              {post.caption && (
                <div className="p-2">
                  <p className="text-xs text-slate-600 line-clamp-2">{post.caption}</p>
                </div>
              )}
            </a>
          ))}
        </div>
      )}

      {/* Composer Modal */}
      {showComposer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">Create New Post</h3>
                <button
                  onClick={() => setShowComposer(false)}
                  className="text-slate-500 hover:text-slate-900"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Upload Image/Video
                  </label>
                  <div
                    className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center cursor-pointer hover:border-slate-400 transition-colors"
                    onDragOver={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      const file = e.dataTransfer.files[0]
                      if (file) {
                        handleFileSelect(file)
                      }
                    }}
                    onClick={() => {
                      const input = document.createElement('input')
                      input.type = 'file'
                      input.accept = 'image/*,video/*'
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0]
                        if (file) {
                          handleFileSelect(file)
                        }
                      }
                      input.click()
                    }}
                  >
                    {uploading ? (
                      <div className="flex flex-col items-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1a73e8] mb-2"></div>
                        <p className="text-sm text-slate-600">Uploading...</p>
                      </div>
                    ) : mediaUrl ? (
                      <div className="flex flex-col items-center">
                        {mediaType === 'IMAGE' ? (
                          <img src={mediaUrl} alt="Preview" className="max-h-48 rounded-lg mb-2" />
                        ) : (
                          <video src={mediaUrl} className="max-h-48 rounded-lg mb-2" controls />
                        )}
                        <p className="text-sm text-green-600">Media uploaded ✓</p>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedFile(null)
                            setMediaUrl(null)
                          }}
                          className="text-xs text-red-600 hover:underline mt-1"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <>
                        <ImageIcon sx={{ fontSize: 48 }} className="text-slate-400 mb-2" />
                        <p className="text-sm text-slate-600">Click to upload or drag and drop</p>
                        <p className="text-xs text-slate-500 mt-1">Images (max 10MB) or Videos (max 100MB)</p>
                      </>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Caption
                  </label>
                  <textarea
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Write a caption..."
                    className="w-full p-3 border border-slate-300 rounded-lg min-h-[120px]"
                    disabled={publishing}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handlePublish}
                    disabled={!mediaUrl || publishing || uploading}
                  >
                    {publishing ? 'Publishing...' : 'Publish'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowComposer(false)
                      setSelectedFile(null)
                      setMediaUrl(null)
                      setCaption('')
                    }}
                    disabled={publishing}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

