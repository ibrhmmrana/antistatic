'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import CommentIcon from '@mui/icons-material/Comment'
import ReplyIcon from '@mui/icons-material/Reply'
import { Button } from '@/components/ui/button'
import { useToast, ToastContainer } from '@/components/ui/toast'

interface CommentsTabProps {
  businessLocationId: string
}

type InstagramConnection = {
  id: string
  business_location_id: string
  instagram_user_id: string
  instagram_username: string | null
  scopes: string[] | null
} | null

interface CommentAuthor {
  id: string | null
  username: string | null
}

interface Reply {
  id: string
  text: string
  timestamp: string
  from: CommentAuthor | null
}

interface Comment {
  id: string
  text: string
  timestamp: string
  from: CommentAuthor | null
  replies: Reply[]
}

interface MediaItem {
  mediaId: string
  caption?: string
  permalink?: string
  timestamp: string
  mediaThumbnail?: string
  comments: Comment[]
}

interface CommentsResponse {
  media: MediaItem[]
  paging: {
    after: string | null
  }
  connectedAccountUserId?: string | null
}

export function CommentsTab({ businessLocationId }: CommentsTabProps) {
  const [loadingInitial, setLoadingInitial] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [mediaFeed, setMediaFeed] = useState<MediaItem[]>([])
  const [pagingAfter, setPagingAfter] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [selectedComment, setSelectedComment] = useState<{ mediaId: string; comment: Comment } | null>(null)
  const [replyText, setReplyText] = useState('')
  const [replying, setReplying] = useState(false)
  const [instagramConnection, setInstagramConnection] = useState<InstagramConnection>(null)
  const [hasCommentsPermission, setHasCommentsPermission] = useState(false)
  const [connectedAccountUsername, setConnectedAccountUsername] = useState<string | null>(null)
  const [connectedAccountUserId, setConnectedAccountUserId] = useState<string | null>(null)
  const { toasts, showToast, removeToast } = useToast()
  const supabase = createClient()
  const sentinelRef = useRef<HTMLDivElement>(null)
  const hasFetchedInitialRef = useRef(false)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const fetchMediaPageRef = useRef<((params: { reset?: boolean; after?: string | null }) => Promise<void>) | null>(null)

  // Check for comments permission
  useEffect(() => {
    const checkPermission = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          setLoadingInitial(false)
          return
        }

        // Fetch Instagram connection
        const { data: connection } = await (supabase
          .from('instagram_connections') as any)
          .select('id, business_location_id, instagram_user_id, instagram_username, scopes')
          .eq('business_location_id', businessLocationId)
          .maybeSingle()

        setInstagramConnection(connection || null)
        setConnectedAccountUsername(connection?.instagram_username || null)

        if (connection?.scopes) {
          const scopes = connection.scopes || []
          const hasPermission = scopes.some((scope: string) => 
            scope.includes('instagram_business_manage_comments') || 
            scope.includes('instagram_manage_comments')
          )
          setHasCommentsPermission(hasPermission)
        }
      } catch (error) {
        console.error('[CommentsTab] Error checking permission:', error)
      }
    }

    checkPermission()
  }, [businessLocationId, supabase])

  const loadingInitialRef = useRef(false)
  const loadingMoreRef = useRef(false)

  const fetchMediaPage = useCallback(async ({ reset = false, after }: { reset?: boolean; after?: string | null }) => {
    // Prevent concurrent fetches using refs
    if (reset && loadingInitialRef.current) {
      console.log('[CommentsTab] Skipping fetch - already loading initial')
      return
    }
    if (!reset && loadingMoreRef.current) {
      console.log('[CommentsTab] Skipping fetch - already loading more')
      return
    }

    try {
      if (reset) {
        loadingInitialRef.current = true
        setLoadingInitial(true)
        hasFetchedInitialRef.current = true
      } else {
        loadingMoreRef.current = true
        setLoadingMore(true)
      }

      const params = new URLSearchParams({
        businessLocationId,
        limitMedia: '12',
        limitComments: '20',
        limitReplies: '20',
      })

      if (after) {
        params.set('after', after)
      }

      console.log('[CommentsTab] Fetching media page:', { reset, after, businessLocationId })

      const response = await fetch(
        `/api/social-studio/instagram/comments?${params.toString()}`,
        { 
          credentials: 'include',
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
          }
        }
      )

      if (response.ok) {
        const data: CommentsResponse = await response.json()
        console.log('[CommentsTab] Received data:', { mediaCount: data.media.length, hasMore: !!data.paging?.after })
        
        // Store connected account user ID for filtering
        if (data.connectedAccountUserId) {
          setConnectedAccountUserId(data.connectedAccountUserId)
        }
        
        // Filter out media items with no comments
        const mediaWithComments = (data.media || []).filter(m => m.comments && m.comments.length > 0)
        
        if (reset) {
          setMediaFeed(mediaWithComments)
        } else {
          // Append new media, dedupe by mediaId, and filter out items with no comments
          setMediaFeed(prev => {
            const existingIds = new Set(prev.map(m => m.mediaId))
            const newMedia = mediaWithComments.filter(m => !existingIds.has(m.mediaId))
            return [...prev, ...newMedia]
          })
        }

        setPagingAfter(data.paging?.after || null)
        setHasMore(!!data.paging?.after)
      } else {
        const errorData = await response.json().catch(() => ({}))
        
        if (errorData.requiresConnection || errorData.requiresReconnect) {
          setMediaFeed([])
        } else {
          console.error('Error fetching comments:', errorData)
          showToast(errorData.error || 'Failed to fetch comments', 'error')
        }
      }
    } catch (error) {
      console.error('Error fetching comments:', error)
      showToast('Failed to fetch comments', 'error')
    } finally {
      loadingInitialRef.current = false
      loadingMoreRef.current = false
      setLoadingInitial(false)
      setLoadingMore(false)
    }
  }, [businessLocationId, showToast])

  // Keep ref updated with latest function
  useEffect(() => {
    fetchMediaPageRef.current = fetchMediaPage
  }, [fetchMediaPage])

  // Reset fetch flag when businessLocationId changes (new location = new fetch)
  useEffect(() => {
    hasFetchedInitialRef.current = false
  }, [businessLocationId])

  // Initial fetch on mount or when permission is granted - ONLY ONCE per permission state
  useEffect(() => {
    if (!hasCommentsPermission) {
      setLoadingInitial(false)
      return
    }

    // Only fetch if we haven't fetched yet
    if (!hasFetchedInitialRef.current && fetchMediaPageRef.current) {
      console.log('[CommentsTab] Initial fetch triggered', { businessLocationId, hasCommentsPermission })
      hasFetchedInitialRef.current = true
      fetchMediaPageRef.current({ reset: true })
    }
  }, [hasCommentsPermission]) // Only depend on permission - businessLocationId change is handled by reset above

  // Infinite scroll with IntersectionObserver
  useEffect(() => {
    if (!hasCommentsPermission || !hasMore || loadingMore || loadingInitial) {
      // Clean up observer if conditions aren't met
      if (observerRef.current) {
        const sentinel = sentinelRef.current
        if (sentinel) {
          observerRef.current.unobserve(sentinel)
        }
        observerRef.current = null
      }
      return
    }

    const sentinel = sentinelRef.current
    if (!sentinel) return

    // Clean up existing observer
    if (observerRef.current) {
      observerRef.current.unobserve(sentinel)
    }

    // Create new observer
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loadingInitial && fetchMediaPageRef.current) {
          fetchMediaPageRef.current({ reset: false, after: pagingAfter })
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(sentinel)
    observerRef.current = observer

    return () => {
      if (observerRef.current && sentinel) {
        observerRef.current.unobserve(sentinel)
        observerRef.current = null
      }
    }
  }, [hasMore, loadingMore, loadingInitial, pagingAfter, hasCommentsPermission]) // Removed fetchMediaPage from deps

  const handleReply = async (mediaId: string, comment: Comment) => {
    if (!replyText.trim()) return

    setReplying(true)

    try {
      const response = await fetch(`/api/social/instagram/comments/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          locationId: businessLocationId,
          commentId: comment.id,
          mediaId: mediaId,
          text: replyText,
        }),
      })

      const contentType = response.headers.get('content-type') || ''
      const rawText = await response.text()
      
      let result: any = {}
      if (contentType.includes('application/json')) {
        try {
          result = JSON.parse(rawText)
        } catch (parseError) {
          result = {
            error: `Invalid JSON response: ${rawText.slice(0, 200)}`,
            details: rawText.slice(0, 500),
          }
        }
      } else {
        result = {
          error: `Unexpected response format (${contentType}): ${rawText.slice(0, 200)}`,
          details: rawText.slice(0, 500),
        }
      }

      if (response.ok && result.success) {
        setReplyText('')
        setSelectedComment(null)
        showToast('Reply sent successfully!', 'success')
        
        // Refresh first page to show new reply
        await fetchMediaPage({ reset: true })
      } else {
        const errorMsg = result.error || `Failed to send reply (${response.status})`
        const errorDetails = result.details ? `\n\nDetails: ${result.details}` : ''
        
        if (result.requiredPermission) {
          const fullErrorMsg = `${errorMsg}\n\nRequired permission: ${result.requiredPermission}${errorDetails}`
          showToast(fullErrorMsg, 'error')
          
          if (confirm(`${errorMsg}\n\nWould you like to reconnect your Instagram account to grant the required permission?`)) {
            window.location.href = `/api/integrations/instagram/connect?business_location_id=${businessLocationId}&return_to=${encodeURIComponent('/social-studio?tab=comments')}`
          }
        } else {
          showToast(`${errorMsg}${errorDetails}`, 'error')
        }
      }
    } catch (error: any) {
      console.error('Error replying to comment:', error)
      showToast(error.message || 'Failed to send reply', 'error')
    } finally {
      setReplying(false)
    }
  }

  const formatAuthorName = (from: CommentAuthor | null): string => {
    if (!from || !from.username) {
      return 'You'
    }
    if (connectedAccountUsername && from.username.toLowerCase() === connectedAccountUsername.toLowerCase()) {
      return 'You'
    }
    return `@${from.username}`
  }

  // Check if a comment/reply is from the user account
  // Use both ID and username matching for accuracy
  const isFromUserAccount = (from: CommentAuthor | null): boolean => {
    if (!from) {
      // If from is completely null, show it (might be privacy-restricted, not necessarily user)
      return false
    }
    // Most reliable: check if ID matches connected account ID
    if (connectedAccountUserId && from.id && from.id === connectedAccountUserId) {
      return true
    }
    // Fallback: check if username matches connected account
    if (connectedAccountUsername && from.username && from.username.toLowerCase() === connectedAccountUsername.toLowerCase()) {
      return true
    }
    // If username is null but we have an ID that doesn't match, show it (privacy-restricted account)
    // Only filter null username if we don't have ID info (less reliable)
    if (from.username === null && !from.id) {
      // Can't be certain - show it to avoid hiding legitimate replies
      return false
    }
    return false
  }

  // Show loading state
  if (loadingInitial) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1a73e8] mx-auto mb-4"></div>
          <p className="text-sm text-slate-600">Loading comments...</p>
        </div>
      </div>
    )
  }

  // Show connect prompt if not connected
  if (!instagramConnection) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center max-w-md">
          <div className="mb-4">
            <CommentIcon sx={{ fontSize: 64 }} className="text-slate-400 mx-auto" />
          </div>
          <h3 className="text-xl font-semibold text-slate-900 mb-2" style={{ fontFamily: 'var(--font-google-sans)' }}>
            Connect Instagram to view comments
          </h3>
          <p className="text-slate-600 mb-6" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
            Connect your Instagram Business account to view and manage comments on all your posts.
          </p>
          <Button
            variant="primary"
            size="md"
            onClick={() => {
              window.location.href = `/api/integrations/instagram/connect?business_location_id=${businessLocationId}&return_to=${encodeURIComponent('/social-studio?tab=comments')}`
            }}
          >
            Connect Instagram
          </Button>
        </div>
      </div>
    )
  }

  // Show permission prompt if no comments permission
  if (!hasCommentsPermission) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center max-w-md">
          <div className="mb-4">
            <CommentIcon sx={{ fontSize: 64 }} className="text-slate-400 mx-auto" />
          </div>
          <h3 className="text-xl font-semibold text-slate-900 mb-2" style={{ fontFamily: 'var(--font-google-sans)' }}>
            Comments permission required
          </h3>
          <p className="text-slate-600 mb-6" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
            To view and manage comments, you need to reconnect your Instagram account and grant the{' '}
            <code className="text-xs bg-slate-100 px-2 py-1 rounded">instagram_business_manage_comments</code> permission.
          </p>
          <Button
            variant="primary"
            size="md"
            onClick={() => {
              window.location.href = `/api/integrations/instagram/connect?business_location_id=${businessLocationId}&return_to=${encodeURIComponent('/social-studio?tab=comments')}`
            }}
          >
            Reconnect Instagram
          </Button>
        </div>
      </div>
    )
  }

  const totalComments = mediaFeed.reduce((sum, media) => sum + media.comments.length, 0)

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onClose={removeToast} />
      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-slate-900 flex items-center gap-2" style={{ fontFamily: 'var(--font-google-sans)' }}>
            <CommentIcon sx={{ fontSize: 24 }} />
            Comments
          </h2>
          <div className="text-sm text-slate-600" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
            {totalComments} comment{totalComments !== 1 ? 's' : ''} across {mediaFeed.length} post{mediaFeed.length !== 1 ? 's' : ''}
          </div>
        </div>

        {mediaFeed.length === 0 ? (
          <div className="text-center py-12">
            <CommentIcon sx={{ fontSize: 48 }} className="text-slate-300 mb-4 mx-auto" />
            <p className="text-slate-600 mb-2" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
              No comments found
            </p>
            <p className="text-sm text-slate-500" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
              Comments on your posts will appear here
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {mediaFeed.map((mediaItem) => {
              // Filter out comments from user account, but keep all comments (even if all replies are from user)
              // Only filter out replies from user account
              const visibleComments = mediaItem.comments
                .filter(comment => !isFromUserAccount(comment.from))
                .map(comment => ({
                  ...comment,
                  replies: comment.replies.filter(reply => !isFromUserAccount(reply.from))
                }))

              if (visibleComments.length === 0) return null

              return (
                <div
                  key={mediaItem.mediaId}
                  className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm"
                >
                  {/* Post Header */}
                  <div className="p-4 border-b border-slate-100 bg-slate-50">
                    <div className="flex items-start gap-3">
                      {mediaItem.mediaThumbnail ? (
                        <img
                          src={mediaItem.mediaThumbnail}
                          alt="Post"
                          className="w-20 h-20 object-cover rounded-lg flex-shrink-0"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement
                            target.style.display = 'none'
                          }}
                        />
                      ) : (
                        <div className="w-20 h-20 bg-slate-200 rounded-lg flex items-center justify-center flex-shrink-0">
                          <span className="text-xs text-slate-500">Post</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-slate-600" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                            {new Date(mediaItem.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                          {mediaItem.permalink && (
                            <a
                              href={mediaItem.permalink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-[#1a73e8] hover:text-[#1557b0] font-medium"
                              style={{ fontFamily: 'var(--font-roboto-stack)' }}
                            >
                              View on Instagram →
                            </a>
                          )}
                        </div>
                        {mediaItem.caption && (
                          <p className="text-sm text-slate-700 line-clamp-2 mt-1" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                            {mediaItem.caption}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Comments Section */}
                  <div className="p-4 space-y-3">
                    {visibleComments.map((comment) => (
                      <div key={comment.id} className="border-b border-slate-100 last:border-b-0 pb-3 last:pb-0">
                        {/* Comment */}
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold text-slate-900 text-sm" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                {formatAuthorName(comment.from)}
                              </span>
                              <span className="text-xs text-slate-500" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                {new Date(comment.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </span>
                            </div>
                            <p className="text-slate-800 text-sm leading-relaxed mb-2" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                              {comment.text}
                            </p>

                            {/* Replies */}
                            {comment.replies.length > 0 && (
                              <div className="ml-3 mt-2 space-y-2.5">
                                {comment.replies.map((reply) => (
                                  <div key={reply.id} className="flex items-start gap-2">
                                    <div className="w-px h-4 bg-slate-300 mt-1.5 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-0.5">
                                        <span className="font-medium text-slate-900 text-xs" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                          {formatAuthorName(reply.from)}
                                        </span>
                                        <span className="text-xs text-slate-500" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                          {new Date(reply.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </span>
                                      </div>
                                      <p className="text-slate-700 text-xs leading-relaxed" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                        {reply.text}
                                      </p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Reply Button */}
                            <div className="mt-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setSelectedComment({ mediaId: mediaItem.mediaId, comment })}
                                className="h-7 text-xs"
                              >
                                <ReplyIcon sx={{ fontSize: 14 }} className="mr-1" />
                                Reply
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}

            {/* Infinite Scroll Sentinel */}
            <div ref={sentinelRef} className="h-4 flex items-center justify-center">
              {loadingMore && (
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#1a73e8]"></div>
                  <span className="text-xs text-slate-500">Loading more posts...</span>
                </div>
              )}
              {!hasMore && mediaFeed.length > 0 && (
                <p className="text-xs text-slate-500">No more posts to load</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Reply Drawer */}
      {selectedComment && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50">
          <div className="bg-white rounded-t-lg w-full max-w-2xl mx-auto max-h-[80vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900" style={{ fontFamily: 'var(--font-google-sans)' }}>
                  Reply to Comment
                </h3>
                <button
                  onClick={() => {
                    setSelectedComment(null)
                    setReplyText('')
                  }}
                  className="text-slate-500 hover:text-slate-900"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="p-6">
              <div className="mb-4 p-3 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-600 mb-1" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                  <span className="font-medium">{formatAuthorName(selectedComment.comment.from)}</span> commented:
                </p>
                <p className="text-slate-900" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                  {selectedComment.comment.text}
                </p>
              </div>
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Write your reply..."
                className="w-full p-3 border border-slate-300 rounded-lg mb-4 min-h-[100px]"
                style={{ fontFamily: 'var(--font-roboto-stack)' }}
                disabled={replying}
              />
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => handleReply(selectedComment.mediaId, selectedComment.comment)}
                  disabled={!replyText.trim() || replying}
                >
                  {replying ? 'Sending...' : 'Send Reply'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedComment(null)
                    setReplyText('')
                  }}
                  disabled={replying}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
