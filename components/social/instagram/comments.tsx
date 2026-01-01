'use client'

import { useState, useEffect } from 'react'
import { Database } from '@/lib/supabase/database.types'
import CommentIcon from '@mui/icons-material/Comment'
import ReplyIcon from '@mui/icons-material/Reply'
import DeleteIcon from '@mui/icons-material/Delete'
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

interface InstagramCommentsProps {
  locationId: string
  instagramConnection: InstagramConnection | null
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
}

export function InstagramComments({ locationId, instagramConnection }: InstagramCommentsProps) {
  const [loading, setLoading] = useState(true)
  const [comments, setComments] = useState<Comment[]>([])
  const [selectedComment, setSelectedComment] = useState<Comment | null>(null)
  const [replyText, setReplyText] = useState('')
  const [replying, setReplying] = useState(false)
  const { toasts, showToast, removeToast } = useToast()

  useEffect(() => {
    const fetchComments = async () => {
      if (!instagramConnection) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const response = await fetch(`/api/social/instagram/comments?locationId=${locationId}`)
        if (response.ok) {
          const data = await response.json()
          setComments(data.comments || [])
        } else {
          const errorData = await response.json().catch(() => ({}))
          console.error('Error fetching comments:', errorData)
        }
      } catch (error) {
        console.error('Error fetching comments:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchComments()
  }, [locationId, instagramConnection])

  const handleReply = async (comment: Comment) => {
    if (!replyText.trim()) return

    setReplying(true)

    try {
      const response = await fetch(`/api/social/instagram/comments/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId,
          commentId: comment.id,
          mediaId: comment.mediaId,
          text: replyText,
        }),
      })

      // Safe JSON parsing - handle non-JSON responses
      const contentType = response.headers.get('content-type') || ''
      const rawText = await response.text()
      
      let result: any = {}
      if (contentType.includes('application/json')) {
        try {
          result = JSON.parse(rawText)
        } catch (parseError) {
          // JSON parse failed - use raw text as error
          result = {
            error: `Invalid JSON response: ${rawText.slice(0, 200)}`,
            details: rawText.slice(0, 500),
          }
        }
      } else {
        // Not JSON - treat as error
        result = {
          error: `Unexpected response format (${contentType}): ${rawText.slice(0, 200)}`,
          details: rawText.slice(0, 500),
        }
      }

      if (response.ok && result.success) {
        // Optimistically update UI
        setComments(comments.map(c => 
          c.id === comment.id 
            ? { ...c, replied: true }
            : c
        ))
        setReplyText('')
        setSelectedComment(null)
        showToast('Reply sent successfully!', 'success')
      } else {
        // Handle error - show real error from server
        const errorMsg = result.error || `Failed to send reply (${response.status})`
        const errorDetails = result.details ? `\n\nDetails: ${result.details}` : ''
        
        if (result.requiredPermission) {
          const fullErrorMsg = `${errorMsg}\n\nRequired permission: ${result.requiredPermission}${errorDetails}`
          showToast(fullErrorMsg, 'error')
          
          // Show reconnect option
          if (confirm(`${errorMsg}\n\nWould you like to reconnect your Instagram account to grant the required permission?`)) {
            window.location.href = `/api/integrations/instagram/connect?business_location_id=${locationId}`
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

  if (!instagramConnection) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
        <p className="text-slate-600">Instagram account not connected</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6 animate-pulse">
        <div className="h-6 bg-slate-200 rounded w-1/3 mb-4"></div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-slate-200 rounded"></div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onClose={removeToast} />
      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            <CommentIcon sx={{ fontSize: 24 }} />
            Comments
          </h2>
          <div className="text-sm text-slate-600">
            {comments.length} comment{comments.length !== 1 ? 's' : ''}
          </div>
        </div>

        {comments.length === 0 ? (
          <div className="text-center py-12">
            <CommentIcon sx={{ fontSize: 48 }} className="text-slate-300 mb-4" />
            <p className="text-slate-600 mb-2">No comments found</p>
            <p className="text-sm text-slate-500">Comments on your posts will appear here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {comments.map((comment) => (
              <div
                key={comment.id}
                className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50"
              >
                <div className="flex items-start gap-3">
                  {comment.mediaThumbnail && (
                    <img
                      src={comment.mediaThumbnail}
                      alt="Post"
                      className="w-16 h-16 object-cover rounded"
                    />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900">
                          @{comment.from.username}
                        </span>
                        <span className="text-xs text-slate-500">
                          {new Date(comment.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                      {comment.mediaPermalink && (
                        <a
                          href={comment.mediaPermalink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-[#1a73e8] hover:underline"
                        >
                          View Post →
                        </a>
                      )}
                    </div>
                    <p className="text-slate-700 mb-3">{comment.text}</p>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedComment(comment)}
                      >
                        <ReplyIcon sx={{ fontSize: 16 }} className="mr-1" />
                        Reply
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          if (confirm('Hide this comment?')) {
                            // TODO: Implement hide comment
                          }
                        }}
                      >
                        <DeleteIcon sx={{ fontSize: 16 }} className="mr-1" />
                        Hide
                      </Button>
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
                <h3 className="text-lg font-semibold text-slate-900">Reply to Comment</h3>
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
                <p className="text-sm text-slate-600 mb-1">
                  <span className="font-medium">@{selectedComment.from.username}</span> commented:
                </p>
                <p className="text-slate-900">{selectedComment.text}</p>
              </div>
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Write your reply..."
                className="w-full p-3 border border-slate-300 rounded-lg mb-4 min-h-[100px]"
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

