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

    // Step 2: Get Instagram connection to determine ig_account_id, self_scoped_id, and business account IGSID
    const { data: connection } = await (supabase
      .from('instagram_connections') as any)
      .select('instagram_user_id, instagram_username, self_scoped_id')
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
      const tokenResult = await getInstagramAccessTokenForLocation(locationId)
      accessToken = tokenResult.access_token
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

    // Step 6: Validate recipientId (smoke test)
    // Recipient ID must be numeric (IGSID format)
    if (!recipientIgsid || !/^\d+$/.test(recipientIgsid)) {
      console.error('[Instagram Send Message] Invalid recipientId format:', {
        recipientIgsid,
        conversationId,
        igAccountId,
      })
      return NextResponse.json(
        {
          error: {
            type: 'validation',
            message: 'Missing recipient participant id (IGSID). Please refresh the inbox and try again.',
          },
        },
        { status: 400 }
      )
    }

    // Validate token shape
    if (!accessToken || accessToken.trim().length < 20) {
      console.error('[Instagram Send Message] Invalid token shape:', {
        tokenLength: accessToken?.length,
        hasToken: !!accessToken,
      })
      return NextResponse.json(
        {
          error: {
            type: 'instagram_auth',
            code: 'INVALID_TOKEN',
            message: 'Invalid Instagram access token. Please reconnect your account.',
          },
        },
        { status: 401 }
      )
    }

    // Step 7: Resolve IG User ID for endpoint (scoped ID, not account ID)
    // For Instagram Login Messaging API, we need the scoped IG User ID (not the account ID)
    // Priority: self_scoped_id from DB > businessAccountIgsid from cache > fallback to /me API call
    let igUserIdForEndpoint: string | null = connection.self_scoped_id || businessAccountIgsid || null
    
    // If we don't have self_scoped_id or businessAccountIgsid, try to fetch it from /me
    // Note: /me returns account ID, not scoped ID, but we'll use it as a last resort
    if (!igUserIdForEndpoint) {
      try {
        const apiVersion = 'v24.0'
        const meUrl = `https://graph.instagram.com/${apiVersion}/me?fields=id&access_token=${accessToken}`
        const meResponse = await fetch(meUrl)
        
        if (meResponse.ok) {
          const meData = await meResponse.json()
          // Note: /me returns the account ID, not the scoped ID
          // This is a fallback - ideally self_scoped_id should be populated during inbox sync
          console.warn('[Instagram Send Message] No self_scoped_id found, using account ID as fallback:', {
            igAccountId,
            meDataId: meData.id,
          })
        }
      } catch (meError: any) {
        console.warn('[Instagram Send Message] Failed to fetch /me for scoped ID:', meError.message)
      }
    }
    
    // Final fallback: use account ID if no scoped ID available (this might fail, but we'll try)
    const finalIgUserId = igUserIdForEndpoint || igAccountId

    // Step 8: Call Instagram Graph API with retry logic
    // Instagram API with Instagram Login requires:
    // - Endpoint: POST https://graph.instagram.com/v{apiVersion}/{IG_USER_ID}/messages
    //   WHERE IG_USER_ID is the scoped user ID (self_scoped_id), NOT the account ID
    // - Headers: Authorization: Bearer <IG_USER_ACCESS_TOKEN>, Content-Type: application/json
    // - Body: { "recipient": { "id": "<RECIPIENT_IGSID>" }, "message": { "text": "<TEXT>" } }
    const apiVersion = 'v24.0'
    const apiBase = 'https://graph.instagram.com' // ONLY use graph.instagram.com for Instagram Login
    const maxRetries = 3
    const backoffDelays = [500, 1500, 3000] // ms
    
    // Generate requestId for logging
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    
    // Log request details (never log full token)
    console.log('[Instagram Send Message] Preparing request:', {
      requestId,
      igUserId: finalIgUserId,
      igAccountId,
      selfScopedId: connection.self_scoped_id,
      conversationId: finalConversationId,
      recipientId: recipientIgsid,
      recipientIdLength: recipientIgsid.length,
      apiVersion,
      host: apiBase,
      textLength: text.trim().length,
      tokenLength: accessToken.length,
      tokenPrefix: accessToken.substring(0, 10) + '...',
      payloadKeys: ['recipient', 'message'],
    })
    
    let lastError: any = null
    let lastResponse: Response | null = null
    let lastResponseData: any = null
    
    // Retry loop (only retry on transient errors or 5xx)
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Use scoped IG User ID (self_scoped_id) in endpoint, NOT account ID
        const apiUrl = `${apiBase}/${apiVersion}/${finalIgUserId}/messages`
        
        // Use JSON body with Bearer token header (Instagram Login format)
        const requestBody = {
          recipient: { id: recipientIgsid },
          message: { text: text.trim() },
        }

        if (attempt === 0) {
          console.log('[Instagram Send Message] Calling Instagram API:', {
            requestId,
            url: apiUrl,
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ***',
              'Content-Type': 'application/json',
            },
            body: requestBody,
            attempt: attempt + 1,
          })
        }

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        })

        const responseData = await response.json().catch(() => ({}))

        if (!response.ok) {
          const error = responseData.error || {}
          
          // Determine if error is transient
          // Meta's is_transient flag, or HTTP 5xx, or specific transient error codes
          const isTransient = 
            error.is_transient === true ||
            response.status >= 500 ||
            response.status === 502 ||
            response.status === 503 ||
            response.status === 504 ||
            (error.code === 2 && error.is_transient !== false) // OAuthException code 2 with is_transient flag
          
          // Log error details
          console.error('[Instagram Send Message] Instagram API error:', {
            requestId,
            attempt: attempt + 1,
            status: response.status,
            code: error.code,
            type: error.type,
            message: error.message,
            error_subcode: error.error_subcode,
            fbtrace_id: error.fbtrace_id,
            is_transient: isTransient,
            error_user_title: error.error_user_title,
            error_user_msg: error.error_user_msg,
          })
          
          // If transient and we have retries left, retry with backoff
          if (isTransient && attempt < maxRetries) {
            const delay = backoffDelays[attempt] || 3000
            console.log('[Instagram Send Message] Transient error, retrying:', {
              requestId,
              code: error.code,
              message: error.message,
              attempt: attempt + 1,
              maxRetries,
              delay,
              is_transient: isTransient,
            })
            
            lastError = error
            lastResponse = response
            lastResponseData = responseData
            
            // Wait before retrying
            await new Promise((resolve) => setTimeout(resolve, delay))
            continue
          }
          
          // Non-transient error or max retries exceeded - return immediately
          lastError = error
          lastResponse = response
          lastResponseData = responseData
          break
        }
        
        // Success! Return the response data
        const messageId = responseData.id || responseData.message_id || `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`
        const messageTime = new Date().toISOString()

        console.log('[Instagram Send Message] Success:', {
          requestId,
          messageId,
          recipientId: recipientIgsid,
          attempt: attempt + 1,
        })

        // Step 8: Insert outbound message into database
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

        // Step 9: Update conversation metadata
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
            requestId,
            error: fetchError.message,
            attempt: attempt + 1,
            maxRetries,
            delay,
          })
          
          lastError = fetchError
          await new Promise((resolve) => setTimeout(resolve, delay))
          continue
        }
        
        lastError = fetchError
      }
    }
    
    // All retries exhausted - return error with full Meta error details
    const error = lastResponseData?.error || lastError || {}
    const isTransient = 
      error.is_transient === true ||
      (lastResponse && lastResponse.status >= 500) ||
      (lastResponse && [502, 503, 504].includes(lastResponse.status))
    
    console.error('[Instagram Send Message] All retries exhausted:', {
      requestId,
      status: lastResponse?.status,
      code: error.code,
      type: error.type,
      message: error.message,
      error_subcode: error.error_subcode,
      fbtrace_id: error.fbtrace_id,
      is_transient: isTransient,
      conversationId: finalConversationId,
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

    // Return detailed error to client with all Meta error fields
    const errorStatus = lastResponse ? lastResponse.status : 500
    return NextResponse.json(
      {
        error: {
          type: 'instagram_api',
          code: error.code,
          message: error.message || error.error_user_msg || 'An unexpected error has occurred. Please retry your request later.',
          error_subcode: error.error_subcode,
          fbtrace_id: error.fbtrace_id,
          is_transient: isTransient,
          status: errorStatus,
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

