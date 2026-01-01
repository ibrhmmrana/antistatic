/**
 * Instagram Profile Helper
 * 
 * Fetches Instagram user profile information using the Instagram Graph API.
 * Used after OAuth token exchange to get username and user ID.
 */

export interface InstagramProfile {
  id: string
  username: string
}

/**
 * Get Instagram user profile using access token
 * 
 * @param accessToken - Instagram access token from OAuth
 * @returns Instagram profile with id and username, or null if fetch fails
 */
export async function getInstagramProfile(accessToken: string): Promise<InstagramProfile | null> {
  try {
    // Instagram Graph API endpoint for user profile
    // For Instagram Business accounts, we use the user_id from token response
    // and fetch username from the Graph API
    const profileUrl = `https://graph.instagram.com/me?fields=id,username&access_token=${accessToken}`
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'profile.ts:24',message:'Before profile fetch',data:{profileUrl:profileUrl.substring(0,100),hasAccessToken:!!accessToken,tokenLength:accessToken.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    
    const response = await fetch(profileUrl)
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'profile.ts:28',message:'Profile fetch response',data:{status:response.status,ok:response.ok,statusText:response.statusText},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('[Instagram Profile] Failed to fetch profile:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData,
      })
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'profile.ts:35',message:'Profile fetch failed',data:{status:response.status,statusText:response.statusText,errorCode:errorData.error?.code,errorMessage:errorData.error?.message,errorType:errorData.error?.type},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      
      return null
    }

    const data = await response.json()
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'profile.ts:44',message:'Profile data parsed',data:{hasError:!!data.error,errorCode:data.error?.code,errorMessage:data.error?.message,hasId:!!data.id,hasUsername:!!data.username,id:data.id,username:data.username},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    
    if (data.error) {
      console.error('[Instagram Profile] API error:', data.error)
      return null
    }

    if (!data.id || !data.username) {
      console.warn('[Instagram Profile] Missing id or username in response:', data)
      return null
    }

    return {
      id: data.id,
      username: data.username,
    }
  } catch (error: any) {
    console.error('[Instagram Profile] Error fetching profile:', error)
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'profile.ts:58',message:'Profile fetch exception',data:{errorMessage:error.message,errorName:error.name,errorStack:error.stack?.substring(0,300)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    
    return null
  }
}

