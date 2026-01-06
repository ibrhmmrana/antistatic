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

    // Step 6: Call Instagram Graph API
    // According to Instagram Messaging API docs, use form-urlencoded format with access_token in query params
    // Endpoint: /<IG_ID>/messages
    const apiVersion = 'v24.0'
    
    // Use account ID endpoint directly (skip /me as it doesn't work for Instagram Business accounts)
    const apiUrl = new URL(`https://graph.instagram.com/${apiVersion}/${igAccountId}/messages`)
    apiUrl.searchParams.set('access_token', accessToken)
    
    // Use form-urlencoded format (Instagram Messaging API expects this format)
    const formBody = new URLSearchParams()
    formBody.append('recipient', JSON.stringify({ id: recipientIgsid }))
    formBody.append('message', JSON.stringify({ text: text.trim() }))

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'messages/send/route.ts:224',message:'Preparing Instagram API call',data:{apiUrl:apiUrl.toString(),recipientIgsid,recipientIgsidLength:recipientIgsid?.length,recipientIgsidFormat:recipientIgsid?.substring(0,10),textLength:text.length,textPreview:text.substring(0,50),igAccountId,apiVersion,hasAccessToken:!!accessToken,accessTokenLength:accessToken?.length,accessTokenPrefix:accessToken?.substring(0,20),format:'form-urlencoded'},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'C'})}).catch(()=>{});
    // #endregion

    console.log('[Instagram Send Message] Calling Instagram API:', {
      url: apiUrl.toString(),
      recipientId: recipientIgsid,
      textLength: text.length,
      format: 'form-urlencoded',
    })

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'messages/send/route.ts:237',message:'Calling Instagram API with form-urlencoded',data:{url:apiUrl.toString(),recipientIgsid,messageText:text.trim(),headers:{contentType:'application/x-www-form-urlencoded',hasAccessTokenInQuery:true}},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'C'})}).catch(()=>{});
    // #endregion

    const response = await fetch(apiUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formBody.toString(),
    })
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'messages/send/route.ts:245',message:'Instagram API response',data:{status:response.status,ok:response.ok,statusText:response.statusText,headers:Object.fromEntries(response.headers.entries())},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'C'})}).catch(()=>{});
    // #endregion

    const responseData = await response.json().catch(() => ({}))
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'messages/send/route.ts:271',message:'Instagram API response data',data:{responseOk:response.ok,responseStatus:response.status,responseData,hasError:!!responseData.error,errorCode:responseData.error?.code,errorType:responseData.error?.type,errorMessage:responseData.error?.message,errorSubcode:responseData.error?.error_subcode,fullError:responseData.error},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion

    if (!response.ok) {
      const error = responseData.error || {}
      
      // Log full error response (without tokens) for debugging
      console.error('[Instagram Send Message] Graph API error:', {
        status: response.status,
        code: error.code,
        message: error.message,
        type: error.type,
        error_subcode: error.error_subcode,
        fbtrace_id: error.fbtrace_id,
        error_user_title: error.error_user_title,
        error_user_msg: error.error_user_msg,
        conversationId,
        recipientIgsid,
        igAccountId,
        apiUrl: apiUrl.toString().replace(accessToken, 'REDACTED'),
        fullError: JSON.stringify(error),
      })
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'messages/send/route.ts:275',message:'Instagram API error details',data:{status:response.status,code:error.code,message:error.message,type:error.type,errorSubcode:error.error_subcode,fbtraceId:error.fbtrace_id,errorUserTitle:error.error_user_title,errorUserMsg:error.error_user_msg,fullError:error,conversationId,recipientIgsid,apiUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion

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
        { status: response.status }
      )
    }

    // Step 7: Parse response and extract message_id
    const messageId = responseData.id || responseData.message_id || `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`
    const messageTime = new Date().toISOString()

    console.log('[Instagram Send Message] Success:', {
      messageId,
      recipientId: recipientIgsid,
    })

    // Step 8: Insert outbound message into database
    // Use business account IGSID for from_id (not business account ID)
    // If we don't have the IGSID, we'll need to fetch it or use a placeholder
    // For now, we'll use the business account ID as fallback, but ideally we should have the IGSID
    const fromId = businessAccountIgsid || igAccountId
    
    const { error: insertError } = await (supabase
      .from('instagram_messages') as any)
      .insert({
        id: messageId,
        ig_account_id: igAccountId,
        conversation_id: finalConversationId,
        direction: 'outbound',
        from_id: fromId, // Use IGSID if available, otherwise fallback to account ID
        to_id: recipientIgsid,
        text: text.trim(),
        attachments: null,
        created_time: messageTime,
        read_at: messageTime, // Outbound messages are read immediately
        raw: responseData,
      })

    if (insertError) {
      console.error('[Instagram Send Message] Error inserting message:', insertError)
      // Don't fail the request - message was sent successfully to Instagram
    }

    // Step 9: Update conversation metadata with the most recent message
    // Get the most recent message from the database to ensure we have the correct preview
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
        unread_count: 0, // Reset unread since we sent it
      })
      .eq('id', finalConversationId)

    if (updateError) {
      console.error('[Instagram Send Message] Error updating conversation:', updateError)
      // Don't fail the request - message was sent successfully
    }

    // Step 10: Return success
    return NextResponse.json({
      ok: true,
      messageId,
    })
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

