import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getInstagramAccessTokenForLocation, InstagramAuthError, isTokenExpiredError } from '@/lib/instagram/tokens'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/social/instagram/messages/send
 * 
 * Send a Direct Message via Instagram Messaging API
 * 
 * According to Instagram Messaging API docs:
 * - Endpoint: POST https://graph.instagram.com/vXX.X/<IG_ID>/messages
 * - Body: { recipient: { id: <IGSID> }, message: { text: "<TEXT>" } }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { locationId, conversationId, text } = body

    if (!locationId || !conversationId || !text) {
      return NextResponse.json(
        { error: { type: 'validation', message: 'Missing required fields: locationId, conversationId, text' } },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: { type: 'auth', message: 'Unauthorized' } }, { status: 401 })
    }

    // Step 1: Verify location belongs to user
    const { data: location } = await supabase
      .from('business_locations')
      .select('id')
      .eq('id', locationId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!location) {
      return NextResponse.json({ error: { type: 'not_found', message: 'Location not found' } }, { status: 404 })
    }

    // Step 2: Get Instagram connection to determine ig_account_id and business account IGSID
    const { data: connection } = await (supabase
      .from('instagram_connections') as any)
      .select('instagram_user_id, instagram_username')
      .eq('business_location_id', locationId)
      .maybeSingle()

    if (!connection) {
      return NextResponse.json(
        { error: { type: 'not_found', message: 'Instagram not connected' } },
        { status: 404 }
      )
    }

    const igAccountId = connection.instagram_user_id
    
    // Get the business account's IGSID from user cache (we need this for from_id and validation)
    // The business account IGSID is stored in instagram_user_cache with username matching
    let businessAccountIgsid: string | null = null
    if (connection.instagram_username) {
      const { data: businessAccountCache } = await (supabase
        .from('instagram_user_cache') as any)
        .select('ig_user_id')
        .eq('ig_account_id', igAccountId)
        .eq('username', connection.instagram_username)
        .maybeSingle()
      
      if (businessAccountCache) {
        businessAccountIgsid = businessAccountCache.ig_user_id
      }
    }
    
    // Define selfId as the business account's IGSID (or fallback to igAccountId)
    const selfId = businessAccountIgsid || igAccountId

    // Step 3: Get valid access token using centralized helper (needed for API calls)
    let accessToken: string
    try {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'messages/send/route.ts:85',message:'Getting access token',data:{locationId,igAccountId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      const tokenResult = await getInstagramAccessTokenForLocation(locationId)
      accessToken = tokenResult.access_token
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'messages/send/route.ts:87',message:'Access token retrieved',data:{hasToken:!!accessToken,tokenLength:accessToken?.length,tokenPrefix:accessToken?.substring(0,20),igAccountId:tokenResult.ig_account_id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
    } catch (error: any) {
      if (error instanceof InstagramAuthError) {
        return NextResponse.json(
          {
            error: {
              type: 'instagram_auth',
              code: error.code,
              message: error.message,
            },
          },
          { status: 401 }
        )
      }
      throw error
    }

    // Step 4: Fetch conversation row (with detailed logging)
    const { data: conversation, error: convError } = await (supabase
      .from('instagram_conversations') as any)
      .select('id, participant_igsid, ig_account_id')
      .eq('id', conversationId)
      .eq('ig_account_id', igAccountId)
      .maybeSingle()

    if (convError) {
      console.error('[Instagram Send Message] Conversation lookup error:', {
        conversationId,
        igAccountId,
        error: convError.message,
      })
      return NextResponse.json(
        { error: { type: 'database', message: 'Failed to lookup conversation' } },
        { status: 500 }
      )
    }

    // Step 5: If conversation not found, try to fetch from Instagram API
    let recipientIgsid: string | null = null
    let finalConversationId = conversationId

    if (!conversation) {
      console.warn('[Instagram Send Message] Conversation not found in DB, trying API lookup:', {
        conversationId,
        igAccountId,
        locationId,
      })

      // Try to find conversation by participant_igsid if conversationId looks like a generated one
      // Or try to fetch from Instagram API using user_id parameter
      // For now, if conversationId is provided but not found, we'll need participant_igsid from request
      // This is a fallback - ideally the UI should always provide valid conversationId
      
      // If the request includes participant_igsid, try to fetch conversation from API
      // DO NOT lookup by participant - always use API conversation ID
      if (body.participant_igsid) {
        recipientIgsid = body.participant_igsid
        
        // Try to fetch conversation from Instagram API using participant
        // This gives us the real API conversation ID
        try {
          const apiVersion = 'v24.0'
          const convUrl = `https://graph.instagram.com/${apiVersion}/me/conversations?platform=instagram&user_id=${recipientIgsid}&access_token=${accessToken}`
          
          const convResponse = await fetch(convUrl)
          if (convResponse.ok) {
            const convData = await convResponse.json()
            if (convData.data && convData.data.length > 0) {
              const apiConversation = convData.data[0]
              finalConversationId = apiConversation.id
              
              // Upsert conversation using API conversation ID (primary key)
              await (supabase
                .from('instagram_conversations') as any)
                .upsert({
                  id: apiConversation.id, // API conversation ID - primary key
                  ig_account_id: igAccountId,
                  participant_igsid: recipientIgsid, // Metadata only
                  updated_time: apiConversation.updated_time || new Date().toISOString(),
                  last_message_at: apiConversation.updated_time || new Date().toISOString(),
                  unread_count: 0,
                }, { 
                  onConflict: 'id', // ONLY conflict on id, never on participant
                })
              
              console.log('[Instagram Send Message] Fetched conversation from API:', finalConversationId)
            } else {
              console.warn('[Instagram Send Message] No conversation found in API for participant:', recipientIgsid)
            }
          } else {
            const errorData = await convResponse.json().catch(() => ({}))
            console.warn('[Instagram Send Message] Failed to fetch conversation from API:', {
              status: convResponse.status,
              error: errorData,
            })
          }
        } catch (apiError: any) {
          console.warn('[Instagram Send Message] Failed to fetch conversation from API:', apiError.message)
        }
      } else {
        return NextResponse.json(
          { 
            error: { 
              type: 'not_found', 
              message: 'Conversation not found. Please refresh the inbox and try again.' 
            } 
          },
          { status: 404 }
        )
      }
    } else {
      recipientIgsid = conversation.participant_igsid
    }
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'messages/send/route.ts:199',message:'Recipient IGSID determined',data:{recipientIgsid,recipientIgsidLength:recipientIgsid?.length,recipientIgsidFormat:recipientIgsid?.substring(0,20),isUnknown:recipientIgsid?.startsWith('UNKNOWN_'),conversationId:finalConversationId,hasConversation:!!conversation},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    if (!recipientIgsid || recipientIgsid.startsWith('UNKNOWN_')) {
      console.error('[Instagram Send Message] Missing or invalid participant_igsid:', {
        conversationId,
        conversation,
        recipientIgsid,
      })
      return NextResponse.json(
        { 
          error: { 
            type: 'validation', 
            message: 'Conversation missing valid participant ID. Please refresh the inbox and try again.' 
          } 
        },
        { status: 400 }
      )
    }
    
    // Guard: Validate that recipient is NOT the business account (selfId)
    if (recipientIgsid === selfId || recipientIgsid === businessAccountIgsid || recipientIgsid === igAccountId) {
      console.error('[Instagram Send Message] Invalid recipient - cannot send to self:', {
        conversationId,
        recipientIgsid,
        selfId,
        businessAccountIgsid,
        igAccountId,
      })
      return NextResponse.json(
        { 
          error: { 
            type: 'validation', 
            message: 'Cannot send message to yourself. The conversation participant ID is incorrect. Please refresh the inbox and try again.' 
          } 
        },
        { status: 400 }
      )
    }

    // Step 6: Call Instagram Graph API with retry logic
    // According to Instagram Messaging API docs, use form-urlencoded format with access_token in query params
    // Endpoint: /<IG_ID>/messages
    const apiVersion = 'v24.0'
    const baseHosts = ['https://graph.instagram.com', 'https://graph.facebook.com'] // Try both hosts
    const maxRetries = 3
    const backoffDelays = [500, 1500, 3000] // ms
    
    let lastError: any = null
    let lastResponse: Response | null = null
    let lastResponseData: any = null
    
    // Retry loop with host fallback
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // Try each host (start with graph.instagram.com, fallback to graph.facebook.com on code 2)
      const hostsToTry = attempt === 0 ? [baseHosts[0]] : baseHosts
      
      for (const baseHost of hostsToTry) {
        try {
          const apiUrl = new URL(`${baseHost}/${apiVersion}/${igAccountId}/messages`)
          apiUrl.searchParams.set('access_token', accessToken)
          
          // Use form-urlencoded format (Instagram Messaging API expects this format)
          const formBody = new URLSearchParams()
          formBody.append('recipient', JSON.stringify({ id: recipientIgsid }))
          formBody.append('message', JSON.stringify({ text: text.trim() }))

          if (attempt === 0 && baseHost === baseHosts[0]) {
            console.log('[Instagram Send Message] Calling Instagram API:', {
              url: apiUrl.toString().replace(accessToken, 'REDACTED'),
              recipientId: recipientIgsid,
              textLength: text.length,
              format: 'form-urlencoded',
              host: baseHost,
              attempt: attempt + 1,
            })
          }

          const response = await fetch(apiUrl.toString(), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formBody.toString(),
          })

          const responseData = await response.json().catch(() => ({}))

          if (!response.ok) {
            const error = responseData.error || {}
            
            // Check if this is a transient error (code 2) that we should retry
            const isTransient = error.code === 2 || // OAuthException
                               error.code === 1 || // API Unknown Error
                               response.status >= 500 // Server errors
            
            // If OAuthException code 2 and we haven't tried fallback host yet, try it
            if (error.code === 2 && baseHost === baseHosts[0] && attempt === 0) {
              console.log('[Instagram Send Message] OAuthException code 2, trying fallback host:', {
                originalHost: baseHost,
                fallbackHost: baseHosts[1],
              })
              // Continue to next host
              lastError = error
              lastResponse = response
              lastResponseData = responseData
              continue
            }
            
            // If transient and we have retries left, retry with backoff
            if (isTransient && attempt < maxRetries) {
              const delay = backoffDelays[attempt] || 3000
              console.log('[Instagram Send Message] Transient error, retrying:', {
                code: error.code,
                message: error.message,
                attempt: attempt + 1,
                maxRetries,
                delay,
                host: baseHost,
              })
              
              lastError = error
              lastResponse = response
              lastResponseData = responseData
              
              // Wait before retrying
              await new Promise((resolve) => setTimeout(resolve, delay))
              break // Break out of host loop, continue to next attempt
            }
            
            // Non-transient error or max retries exceeded
            lastError = error
            lastResponse = response
            lastResponseData = responseData
            break // Break out of host loop
          }
          
          // Success! Return the response data
          const messageId = responseData.id || responseData.message_id || `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`
          const messageTime = new Date().toISOString()

          console.log('[Instagram Send Message] Success:', {
            messageId,
            recipientId: recipientIgsid,
            host: baseHost,
            attempt: attempt + 1,
          })

          // Step 7: Insert outbound message into database
          const fromId = businessAccountIgsid || igAccountId
          
          const { error: insertError } = await (supabase
            .from('instagram_messages') as any)
            .insert({
              id: messageId,
              ig_account_id: igAccountId,
              conversation_id: finalConversationId,
              direction: 'outbound',
              from_id: fromId,
              to_id: recipientIgsid,
              text: text.trim(),
              attachments: null,
              created_time: messageTime,
              read_at: messageTime,
              raw: responseData,
            })

          if (insertError) {
            console.error('[Instagram Send Message] Error inserting message:', insertError)
          }

          // Step 8: Update conversation metadata
          const { data: recentMessages } = await (supabase
            .from('instagram_messages') as any)
            .select('text, created_time')
            .eq('conversation_id', finalConversationId)
            .eq('ig_account_id', igAccountId)
            .order('created_time', { ascending: false })
            .limit(1)
            .maybeSingle()
          
          const previewText = recentMessages?.text || text.trim()
          const previewTime = recentMessages?.created_time || messageTime
          
          const { error: updateError } = await (supabase
            .from('instagram_conversations') as any)
            .update({
              last_message_preview: previewText ? previewText.substring(0, 100) : null,
              last_message_at: previewTime,
              updated_time: previewTime,
              unread_count: 0,
            })
            .eq('id', finalConversationId)

          if (updateError) {
            console.error('[Instagram Send Message] Error updating conversation:', updateError)
          }

          return NextResponse.json({
            ok: true,
            messageId,
          })
        } catch (fetchError: any) {
          // Network/timeout errors - retry if we have attempts left
          if (attempt < maxRetries) {
            const delay = backoffDelays[attempt] || 3000
            console.log('[Instagram Send Message] Network error, retrying:', {
              error: fetchError.message,
              attempt: attempt + 1,
              maxRetries,
              delay,
              host: baseHost,
            })
            
            lastError = fetchError
            await new Promise((resolve) => setTimeout(resolve, delay))
            break // Break out of host loop, continue to next attempt
          }
          
          lastError = fetchError
        }
      }
    }
    
    // All retries exhausted - return error
    const error = lastResponseData?.error || lastError || {}
    
    console.error('[Instagram Send Message] All retries exhausted:', {
      status: lastResponse?.status,
      code: error.code,
      message: error.message,
      type: error.type,
      error_subcode: error.error_subcode,
      fbtrace_id: error.fbtrace_id,
      conversationId,
      recipientIgsid,
      igAccountId,
      attempts: maxRetries + 1,
    })

    // Check for token expiry (code 190)
    if (isTokenExpiredError(error) || error.code === 190) {
      return NextResponse.json(
        {
          error: {
            type: 'instagram_auth',
            code: 'EXPIRED',
            message: 'Instagram token expired. Please reconnect your Instagram account.',
          },
        },
        { status: 401 }
      )
    }

    // Return detailed error to client
    const errorStatus = lastResponse ? lastResponse.status : 500
    return NextResponse.json(
      {
        error: {
          type: 'instagram_api',
          message: error.message || error.error_user_msg || 'An unexpected error has occurred. Please retry your request later.',
          code: error.code,
          error_subcode: error.error_subcode,
          fbtrace_id: error.fbtrace_id,
          error_user_title: error.error_user_title,
          error_user_msg: error.error_user_msg,
        },
      },
      { status: errorStatus }
    )
  } catch (error: any) {
    console.error('[Instagram Send Message] Unexpected error:', error)
    
    if (error instanceof InstagramAuthError) {
      return NextResponse.json(
        {
          error: {
            type: 'instagram_auth',
            code: error.code,
            message: error.message,
          },
        },
        { status: 401 }
      )
    }
    
    return NextResponse.json(
      { error: { type: 'internal', message: error.message || 'Internal server error' } },
      { status: 500 }
    )
  }
}

