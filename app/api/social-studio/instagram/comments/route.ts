import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/social-studio/instagram/comments
 * 
 * Fetch all comments from all Instagram posts for a business location
 * Requires instagram_business_manage_comments permission
 */
export async function GET(request: NextRequest) {
  try {
    const requestUrl = new URL(request.url)
    const businessLocationId = requestUrl.searchParams.get('businessLocationId')
    const limit = parseInt(requestUrl.searchParams.get('limit') || '100')
    const forceRefresh = requestUrl.searchParams.get('refresh') === 'true' || requestUrl.searchParams.get('_t') !== null

    if (!businessLocationId) {
      return NextResponse.json({ error: 'businessLocationId is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify location belongs to user
    const { data: location } = await supabase
      .from('business_locations')
      .select('id')
      .eq('id', businessLocationId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!location) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }

    // Check if Instagram connection exists and has comments permission
    const { data: instagramConnection } = await (supabase
      .from('instagram_connections') as any)
      .select('id, instagram_user_id, scopes')
      .eq('business_location_id', businessLocationId)
      .maybeSingle()

    if (!instagramConnection) {
      return NextResponse.json({ 
        error: 'Instagram account not connected',
        requiresConnection: true 
      }, { status: 404 })
    }

    // Check for comments permission
    const scopes = instagramConnection.scopes || []
    const hasCommentsPermission = scopes.some((scope: string) => 
      scope.includes('instagram_business_manage_comments') || 
      scope.includes('instagram_manage_comments')
    )

    if (!hasCommentsPermission) {
      return NextResponse.json({ 
        error: 'Comments permission not granted',
        requiredPermission: 'instagram_business_manage_comments',
        requiresReconnect: true 
      }, { status: 403 })
    }

    // Fetch live data from Instagram API and sync to database
    console.log('[Social Studio Comments API] Starting live sync for businessLocationId:', businessLocationId)
    try {
      const { InstagramAPI } = await import('@/lib/instagram/api')
      const api = await InstagramAPI.create(businessLocationId)

      if ('type' in api) {
        console.error('[Social Studio Comments API] Failed to create Instagram API:', api)
        throw new Error(`Failed to create Instagram API: ${api.message || 'Unknown error'}`)
      }
      
      console.log('[Social Studio Comments API] Instagram API created successfully, fetching media...')
      // Get all media items
      const mediaResult = await api.listMedia({ limit: 100 })
      
      if ('type' in mediaResult) {
        console.error('[Social Studio Comments API] Failed to fetch media:', mediaResult)
        throw new Error(`Failed to fetch media: ${mediaResult.message || 'Unknown error'}`)
      }
      
      const mediaItems = mediaResult.data || []
      console.log(`[Social Studio Comments API] Found ${mediaItems.length} media items to process`)
      
      if (mediaItems.length > 0) {
          
          // First, sync media items to database to ensure thumbnails are available
          console.log('[Social Studio Comments API] Syncing media items to database...')
          for (const media of mediaItems) {
            const { error: mediaError } = await (supabase
              .from('instagram_media') as any)
              .upsert({
                id: media.id,
                business_location_id: businessLocationId,
                ig_user_id: instagramConnection.instagram_user_id,
                permalink: media.permalink,
                caption: media.caption || null,
                media_type: media.media_type,
                media_url: media.media_url || null,
                thumbnail_url: media.thumbnail_url || null,
                timestamp: media.timestamp,
                like_count: media.like_count || 0,
                comments_count: media.comments_count || 0,
              }, {
                onConflict: 'id',
              })
            
            if (mediaError) {
              console.warn(`[Social Studio Comments API] Error syncing media ${media.id}:`, mediaError)
            }
          }
          console.log('[Social Studio Comments API] Media sync completed')
          
          // Fetch comments for each media item
          let totalCommentsSynced = 0
          let totalRepliesSynced = 0
          const allInstagramCommentIds = new Set<string>() // Track all comment IDs from Instagram
          for (const media of mediaItems.slice(0, 50)) { // Limit to 50 most recent posts
            if (!media.id || (media.comments_count || 0) === 0) {
              continue
            }

            try {
              let commentCursor: string | undefined
              let commentPageCount = 0
              const maxCommentPages = 2 // Limit to 2 pages (50 comments per post)

              do {
                const commentsResult = await api.listComments(media.id, {
                  limit: 25,
                  after: commentCursor,
                })

                if ('type' in commentsResult) {
                  console.warn(`[Social Studio Comments API] Failed to fetch comments for media ${media.id}:`, commentsResult)
                  break
                }

                console.log(`[Social Studio Comments API] Fetched ${commentsResult.data.length} comments for media ${media.id}`)

                // Upsert comments to database (preserve replied status)
                for (const comment of commentsResult.data) {
                  allInstagramCommentIds.add(comment.id) // Track this comment ID
                  // First, get existing comment to preserve replied status
                  const { data: existingComment } = await (supabase
                    .from('instagram_comments') as any)
                    .select('replied, replied_at, reply_text, reply_status')
                    .eq('id', comment.id)
                    .maybeSingle()

                  await (supabase
                    .from('instagram_comments') as any)
                    .upsert({
                      id: comment.id,
                      business_location_id: businessLocationId,
                      ig_user_id: instagramConnection.instagram_user_id,
                      media_id: media.id,
                      username: comment.from?.username || null,
                      text: comment.text || null,
                      timestamp: comment.timestamp,
                      // Preserve replied status if it exists
                      replied: existingComment?.replied || false,
                      replied_at: existingComment?.replied_at || null,
                      reply_text: existingComment?.reply_text || null,
                      reply_status: existingComment?.reply_status || null,
                      raw: comment,
                    }, {
                      onConflict: 'id',
                    })
                  totalCommentsSynced++
                }

                // Fetch and store replies for each comment
                for (const comment of commentsResult.data) {
                  try {
                    const repliesResult = await api.listReplies(comment.id, {
                      limit: 25,
                    })

                    if (!('type' in repliesResult)) {
                      const replies = repliesResult.data || []

                      // Get connected account username
                      const { data: connectionData } = await (supabase
                        .from('instagram_connections') as any)
                        .select('instagram_username')
                        .eq('business_location_id', businessLocationId)
                        .maybeSingle()

                      const connectedUsername = connectionData?.instagram_username?.toLowerCase()

                      // Store each reply as a separate comment with parent_comment_id
                      for (const reply of replies) {
                        allInstagramCommentIds.add(reply.id) // Track reply IDs too
                        const { error: replyError } = await (supabase
                          .from('instagram_comments') as any)
                          .upsert({
                            id: reply.id,
                            business_location_id: businessLocationId,
                            ig_user_id: instagramConnection.instagram_user_id,
                            media_id: media.id,
                            parent_comment_id: comment.id, // Link to parent comment
                            username: reply.from?.username || null,
                            text: reply.text || null,
                            timestamp: reply.timestamp,
                            raw: reply,
                          }, {
                            onConflict: 'id',
                          })
                        
                        if (!replyError) {
                          totalRepliesSynced++
                        } else {
                          console.warn(`[Social Studio Comments API] Error storing reply ${reply.id}:`, replyError)
                        }

                        // If this reply is from the connected account, also update parent comment's replied status
                        if (reply.from?.username?.toLowerCase() === connectedUsername) {
                          await (supabase
                            .from('instagram_comments') as any)
                            .update({
                              replied: true,
                              reply_text: reply.text,
                              replied_at: reply.timestamp,
                              reply_status: 'sent',
                            })
                            .eq('id', comment.id)
                        }
                      }

                      // Check if parent comment was marked as replied but no reply from us exists
                      const { data: dbComment } = await (supabase
                        .from('instagram_comments') as any)
                        .select('replied')
                        .eq('id', comment.id)
                        .maybeSingle()

                      if (dbComment?.replied) {
                        const ourReply = replies.find(r => 
                          r.from?.username?.toLowerCase() === connectedUsername
                        )

                        if (!ourReply) {
                          // Our reply was deleted - clear replied status
                          await (supabase
                            .from('instagram_comments') as any)
                            .update({
                              replied: false,
                              reply_text: null,
                              replied_at: null,
                              reply_status: null,
                            })
                            .eq('id', comment.id)
                        }
                      }
                    }
                  } catch (replyError) {
                    console.warn(`[Social Studio Comments] Error fetching replies for comment ${comment.id}:`, replyError)
                    // Continue with other comments
                  }
                }

                commentCursor = commentsResult.paging?.cursors?.after
                commentPageCount++

                if (commentPageCount >= maxCommentPages) {
                  break
                }
              } while (commentCursor)
            } catch (error: any) {
              console.warn(`[Social Studio Comments] Error syncing comments for media ${media.id}:`, error.message)
              // Continue with next media
            }
          }
          
          console.log(`[Social Studio Comments API] Sync summary: ${totalCommentsSynced} comments, ${totalRepliesSynced} replies synced`)
          
          // Get all existing comment IDs from database before cleanup (both top-level and replies)
          const { data: existingComments } = await (supabase
            .from('instagram_comments') as any)
            .select('id')
            .eq('business_location_id', businessLocationId)
          
          const existingCommentIds = new Set<string>((existingComments || []).map((c: any) => c.id as string))
          const deletedCommentIds = Array.from(existingCommentIds).filter((id: string) => !allInstagramCommentIds.has(id))
          
          // Delete comments that no longer exist in Instagram
          if (deletedCommentIds.length > 0) {
            console.log(`[Social Studio Comments API] Deleting ${deletedCommentIds.length} comments that no longer exist in Instagram`)
            const { error: deleteError } = await (supabase
              .from('instagram_comments') as any)
              .delete()
              .in('id', deletedCommentIds)
              .eq('business_location_id', businessLocationId)
            
            if (deleteError) {
              console.error('[Social Studio Comments API] Error deleting comments:', deleteError)
            }
          }
        } else {
          console.log('[Social Studio Comments API] No media items found')
        }
    } catch (syncError: any) {
      console.error('[Social Studio Comments API] Error syncing from Instagram:', {
        error: syncError.message,
        stack: syncError.stack,
        businessLocationId,
      })
      // Continue to return cached data even if sync fails, but log the error
      // This ensures users can still see their data even if Instagram API is down
    }
    
    console.log('[Social Studio Comments API] Sync completed, fetching from database...')

    // Build query to fetch all top-level comments (not replies) with their replies
    const { data: comments, error } = await (supabase
      .from('instagram_comments') as any)
      .select(`
        id,
        text,
        timestamp,
        username,
        media_id,
        parent_comment_id,
        replied,
        replied_at,
        reply_text,
        reply_status,
        instagram_media!inner(
          permalink,
          media_url,
          thumbnail_url,
          caption,
          media_type
        )
      `)
      .eq('business_location_id', businessLocationId)
      .is('parent_comment_id', null) // Only top-level comments
      .order('timestamp', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('[Social Studio Comments API] Error:', error)
      return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 })
    }

    // Get Instagram username and user ID for the connected account
    const { data: connectionData } = await (supabase
      .from('instagram_connections') as any)
      .select('instagram_username, instagram_user_id')
      .eq('business_location_id', businessLocationId)
      .maybeSingle()

    const connectedAccountUsername = connectionData?.instagram_username || null
    const connectedAccountUserId = connectionData?.instagram_user_id || null

    // Fetch replies for each comment
    const commentsWithReplies = await Promise.all((comments || []).map(async (c: any) => {
      // Fetch replies for this comment
      const { data: replies } = await (supabase
        .from('instagram_comments') as any)
        .select(`
          id,
          text,
          timestamp,
          username,
          media_id,
          parent_comment_id,
          raw
        `)
        .eq('parent_comment_id', c.id)
        .order('timestamp', { ascending: true })

      return {
        id: c.id,
        text: c.text || '',
        timestamp: c.timestamp,
        from: {
          username: c.username || 'unknown',
          id: '',
        },
        mediaId: c.media_id,
        mediaPermalink: c.instagram_media?.permalink || '',
        // Use thumbnail_url for images/videos, fallback to media_url
        mediaThumbnail: c.instagram_media?.thumbnail_url || c.instagram_media?.media_url || undefined,
        mediaCaption: c.instagram_media?.caption || undefined,
        mediaType: c.instagram_media?.media_type || undefined,
        replied: c.replied || false,
        repliedAt: c.replied_at || null,
        replyText: c.reply_text || null,
        replyStatus: c.reply_status || null,
        // Include connected account username for reply context
        connectedAccountUsername,
        // Include replies nested
        replies: (replies || []).map((r: any) => {
          // Try to get username from stored field first
          let username = r.username
          
          // If username is missing, try to extract from raw data
          if (!username && r.raw?.from?.username) {
            username = r.raw.from.username
          }
          
          // If still missing, check if this reply is from the connected account
          // We can check by comparing the reply's from.id with the connected account's user ID
          if (!username && connectedAccountUsername && r.raw?.from?.id && connectedAccountUserId) {
            // Check if this reply is from the connected account by comparing user IDs
            const replyUserId = r.raw.from.id
            // Instagram API might return different ID formats, so we do a string comparison
            if (replyUserId === connectedAccountUserId || replyUserId.toString() === connectedAccountUserId.toString()) {
              username = connectedAccountUsername
            }
          }
          
          return {
            id: r.id,
            text: r.text || '',
            timestamp: r.timestamp,
            from: {
              username: username || 'unknown',
              id: r.raw?.from?.id || '',
            },
          }
        }),
      }
    }))

    console.log('[Social Studio Comments API] Returning comments:', {
      total: commentsWithReplies.length,
      businessLocationId,
    })

    return NextResponse.json({
      comments: commentsWithReplies,
      total: commentsWithReplies.length,
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    })
  } catch (error: any) {
    console.error('[Social Studio Comments API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

