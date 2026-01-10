'use client'

import { useState, useEffect, useCallback } from 'react'
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

interface Reply {
  id: string
  text: string
  timestamp: string
  from: {
    username: string
    id: string
  }
}

interface Comment {
  id: string
  text: string
  timestamp: string
  from: {
    username: string
    id: string
  }
  mediaId: string
  mediaPermalink?: string
  mediaThumbnail?: string
  mediaCaption?: string
  mediaType?: string
  replied?: boolean
  repliedAt?: string | null
  replyText?: string | null
  replyStatus?: string | null
  connectedAccountUsername?: string | null
  replies?: Reply[]
}

export function CommentsTab({ businessLocationId }: CommentsTabProps) {
  const [loading, setLoading] = useState(true)
  const [comments, setComments] = useState<Comment[]>([])
  const [selectedComment, setSelectedComment] = useState<Comment | null>(null)
  const [replyText, setReplyText] = useState('')
  const [replying, setReplying] = useState(false)
  const [instagramConnection, setInstagramConnection] = useState<InstagramConnection>(null)
  const [hasCommentsPermission, setHasCommentsPermission] = useState(false)
  const { toasts, showToast, removeToast } = useToast()
  const supabase = createClient()

  // Check for comments permission
  useEffect(() => {
    const checkPermission = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          setLoading(false)
          return
        }

        // Fetch Instagram connection
        const { data: connection } = await (supabase
          .from('instagram_connections') as any)
          .select('id, business_location_id, instagram_user_id, instagram_username, scopes')
          .eq('business_location_id', businessLocationId)
          .maybeSingle()

        setInstagramConnection(connection || null)

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

  const fetchComments = useCallback(async () => {
    try {
      setLoading(true)
      // Add cache-busting timestamp to ensure fresh data
      const timestamp = Date.now()
      const response = await fetch(
        `/api/social-studio/instagram/comments?businessLocationId=${businessLocationId}&_t=${timestamp}`,
        { 
          credentials: 'include',
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
          }
        }
      )

      if (response.ok) {
        const data = await response.json()
        setComments(data.comments || [])
      } else {
        const errorData = await response.json().catch(() => ({}))
        
        if (errorData.requiresConnection || errorData.requiresReconnect) {
          // Permission or connection issue - handled in UI
          setComments([])
        } else {
          console.error('Error fetching comments:', errorData)
          showToast(errorData.error || 'Failed to fetch comments', 'error')
        }
      }
    } catch (error) {
      console.error('Error fetching comments:', error)
      showToast('Failed to fetch comments', 'error')
    } finally {
      setLoading(false)
    }
  }, [businessLocationId, showToast])

  useEffect(() => {
    if (hasCommentsPermission) {
      fetchComments()
    } else {
      setLoading(false)
    }
  }, [businessLocationId, hasCommentsPermission])

  // Listen for sync completion event to refresh data
  useEffect(() => {
    if (!hasCommentsPermission) return

    const handleSyncComplete = (event: CustomEvent) => {
      if (event.detail?.locationId === businessLocationId) {
        fetchComments()
      }
    }

    window.addEventListener('instagram-sync-complete', handleSyncComplete as EventListener)
    return () => {
      window.removeEventListener('instagram-sync-complete', handleSyncComplete as EventListener)
    }
  }, [businessLocationId, hasCommentsPermission, fetchComments])

  const handleReply = async (comment: Comment) => {
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
          mediaId: comment.mediaId,
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
        // Optimistically update UI
        setComments(comments.map(c => 
          c.id === comment.id 
            ? { 
                ...c, 
                replied: true,
                repliedAt: new Date().toISOString(),
                replyText: replyText.trim(),
                replyStatus: 'sent'
              }
            : c
        ))
        setReplyText('')
        setSelectedComment(null)
        showToast('Reply sent successfully!', 'success')
        
        // Refresh comments to get the latest data
        await fetchComments()
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

  // Show loading state
  if (loading) {
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
            {comments.length} comment{comments.length !== 1 ? 's' : ''}
          </div>
        </div>

        {comments.length === 0 ? (
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
          <div className="space-y-3">
            {comments.map((comment) => (
              <div
                key={comment.id}
                className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  {comment.mediaThumbnail ? (
                    <img
                      src={comment.mediaThumbnail}
                      alt="Post"
                      className="w-16 h-16 object-cover rounded"
                      onError={(e) => {
                        // Fallback if image fails to load
                        const target = e.target as HTMLImageElement
                        target.style.display = 'none'
                      }}
                    />
                  ) : (
                    <div className="w-16 h-16 bg-slate-200 rounded flex items-center justify-center">
                      <span className="text-xs text-slate-500">Post</span>
                    </div>
                  )}
                  <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-slate-900" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                {comment.connectedAccountUsername && 
                                 comment.from.username.toLowerCase() === comment.connectedAccountUsername.toLowerCase() 
                                  ? 'You' 
                                  : `@${comment.from.username}`}
                              </span>
                              <span className="text-xs text-slate-500" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                {new Date(comment.timestamp).toLocaleDateString()}
                              </span>
                            </div>
                      {comment.mediaPermalink && (
                        <a
                          href={comment.mediaPermalink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-[#1a73e8] hover:underline"
                          style={{ fontFamily: 'var(--font-roboto-stack)' }}
                        >
                          View Post →
                        </a>
                      )}
                    </div>
                    {/* Show original comment */}
                    <div className="mb-3">
                      <p className="text-slate-700" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                        {comment.text}
                      </p>
                    </div>
                    
                    {/* Show replies nested under the comment */}
                    {comment.replies && comment.replies.length > 0 && (
                      <div className="ml-4 pl-4 border-l-2 border-slate-300 mt-3 space-y-2">
                        {comment.replies.map((reply) => (
                          <div key={reply.id} className="bg-slate-50 rounded p-2">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-slate-900 text-sm" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                {comment.connectedAccountUsername && 
                                 reply.from.username && 
                                 reply.from.username.toLowerCase() === comment.connectedAccountUsername.toLowerCase()
                                  ? 'You'
                                  : reply.from.username 
                                    ? `@${reply.from.username}`
                                    : 'unknown'}
                              </span>
                              <span className="text-xs text-slate-500" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                {new Date(reply.timestamp).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-slate-700 text-sm" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                              {reply.text}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* Legacy: Show reply if it exists (for backwards compatibility) */}
                    {comment.replied && comment.replyText && !comment.replies?.length && (
                      <div className="ml-4 pl-4 border-l-2 border-[#1a73e8] mb-3 bg-blue-50 rounded p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-medium text-[#1a73e8] text-sm" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                            {comment.connectedAccountUsername ? `@${comment.connectedAccountUsername}` : 'You'} replied to @{comment.from.username}:
                          </span>
                          {comment.repliedAt && (
                            <span className="text-xs text-slate-500" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                              {new Date(comment.repliedAt).toLocaleDateString()}
                            </span>
                          )}
                          {comment.replyStatus === 'sent' && (
                            <span className="text-xs text-green-600 font-medium" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                              ✓ Sent
                            </span>
                          )}
                        </div>
                        {/* Show the reply text */}
                        <p className="text-slate-700 text-sm" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                          {comment.replyText}
                        </p>
                      </div>
                    )}
                    
                    <div className="flex items-center gap-2">
                      {!comment.replied ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedComment(comment)}
                        >
                          <ReplyIcon sx={{ fontSize: 16 }} className="mr-1" />
                          Reply
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedComment(comment)}
                          className="text-slate-600"
                        >
                          <ReplyIcon sx={{ fontSize: 16 }} className="mr-1" />
                          Reply Again
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
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
                  <span className="font-medium">@{selectedComment.from.username}</span> commented:
                </p>
                <p className="text-slate-900" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                  {selectedComment.text}
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
                  onClick={() => handleReply(selectedComment)}
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

