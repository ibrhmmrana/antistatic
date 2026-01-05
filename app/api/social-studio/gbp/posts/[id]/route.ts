import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getValidAccessToken, GBP_CONNECTED_ACCOUNTS_PROVIDER } from '@/lib/gbp/client'
import { Database } from '@/lib/supabase/database.types'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const editSchema = z.object({
  caption: z.string().min(1).optional(),
})

/**
 * PATCH /api/social-studio/gbp/posts/[id]
 * 
 * Edit a GBP post on Google Business Profile
 * Uses updateMask to only update specified fields
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const postId = params.id
    const body = await request.json()
    const validationResult = editSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request payload', details: validationResult.error.errors },
        { status: 400 }
      )
    }

    const { caption } = validationResult.data

    if (!caption) {
      return NextResponse.json(
        { error: 'caption is required' },
        { status: 400 }
      )
    }

    // Load post from database
    const POSTS_TABLE = 'social_studio_posts' as const satisfies keyof Database['public']['Tables']
    type PostRow = Database['public']['Tables'][typeof POSTS_TABLE]['Row']
    
    const { data: post, error: postError } = await supabase
      .from(POSTS_TABLE)
      .select('*, business_locations!inner(user_id, google_location_name)')
      .eq('id', postId)
      .maybeSingle()

    if (postError || !post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    const typedPost = post as PostRow & { business_locations: { user_id: string; google_location_name: string | null } }

    // Verify user owns the business location
    if (typedPost.business_locations.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Verify this is a GBP post with external identifier
    const gbpLocalPostName = (typedPost as any).gbp_local_post_name
    if (!gbpLocalPostName) {
      return NextResponse.json(
        { error: 'This post is not synced from Google. Please sync it first.' },
        { status: 400 }
      )
    }

    // Verify post is published (can't edit scheduled/draft GBP posts)
    if (typedPost.status !== 'published') {
      return NextResponse.json(
        { error: 'Only published GBP posts can be edited on Google.' },
        { status: 400 }
      )
    }

    const businessLocationId = typedPost.business_location_id

    // Get valid access token
    let accessToken: string
    try {
      accessToken = await getValidAccessToken(
        user.id,
        businessLocationId,
        request.headers.get('origin') || undefined
      )
    } catch (tokenError: any) {
      console.error('[GBP Edit] Token error:', tokenError)
      if (tokenError.message?.includes('reconnect')) {
        return NextResponse.json(
          { error: tokenError.message, needs_reauth: true },
          { status: 401 }
        )
      }
      throw tokenError
    }

    // Call GBP API to update the post
    // API endpoint: PATCH https://mybusiness.googleapis.com/v4/{gbp_local_post_name}
    // Requires updateMask parameter
    const apiUrl = new URL(`https://mybusiness.googleapis.com/v4/${gbpLocalPostName}`)
    apiUrl.searchParams.set('updateMask', 'summary')
    
    console.log('[GBP Edit] Updating post:', gbpLocalPostName)
    console.log('[GBP Edit] New summary:', caption)

    const response = await fetch(apiUrl.toString(), {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: caption,
      }),
    })

    const responseData = await response.json().catch(() => ({ error: 'Failed to parse response' }))

    if (!response.ok) {
      console.error('[GBP Edit] API error:', {
        status: response.status,
        error: responseData,
      })

      if (response.status === 401) {
        return NextResponse.json(
          { error: 'Authentication failed. Please reconnect your Google Business Profile.', needs_reauth: true },
          { status: 401 }
        )
      }

      const errorMessage = responseData.error?.message || responseData.error || 'Failed to update post'
      return NextResponse.json(
        { error: errorMessage, details: responseData },
        { status: response.status }
      )
    }

    // Update local DB row
    type PostsUpdate = Database['public']['Tables'][typeof POSTS_TABLE]['Update']
    const updatePayload: PostsUpdate = {
      caption,
      updated_at: new Date().toISOString(),
    }

    const posts = supabase.from(POSTS_TABLE) as any
    const { data: updatedPost, error: updateError } = await posts
      .update(updatePayload as any)
      .eq('id', postId)
      .select()
      .single()

    if (updateError) {
      console.error('[GBP Edit] Error updating local DB:', updateError)
      // Don't fail the request - Google was updated successfully
    }

    console.log('[GBP Edit] Successfully updated post on Google and local DB')

    return NextResponse.json({
      success: true,
      post: updatedPost || post,
    })
  } catch (error: any) {
    console.error('[GBP Edit] Error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/social-studio/gbp/posts/[id]
 * 
 * Delete a GBP post from Google Business Profile
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const postId = params.id

    // Load post from database
    const POSTS_TABLE = 'social_studio_posts' as const satisfies keyof Database['public']['Tables']
    type PostRow = Database['public']['Tables'][typeof POSTS_TABLE]['Row']
    
    const { data: post, error: postError } = await supabase
      .from(POSTS_TABLE)
      .select('*, business_locations!inner(user_id, google_location_name)')
      .eq('id', postId)
      .maybeSingle()

    if (postError || !post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    const typedPost = post as PostRow & { business_locations: { user_id: string; google_location_name: string | null } }

    // Verify user owns the business location
    if (typedPost.business_locations.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Verify this is a GBP post with external identifier
    const gbpLocalPostName = (typedPost as any).gbp_local_post_name
    if (!gbpLocalPostName) {
      return NextResponse.json(
        { error: 'This post is not synced from Google. Please sync it first.' },
        { status: 400 }
      )
    }

    const businessLocationId = typedPost.business_location_id

    // Get valid access token
    let accessToken: string
    try {
      accessToken = await getValidAccessToken(
        user.id,
        businessLocationId,
        request.headers.get('origin') || undefined
      )
    } catch (tokenError: any) {
      console.error('[GBP Delete] Token error:', tokenError)
      if (tokenError.message?.includes('reconnect')) {
        return NextResponse.json(
          { error: tokenError.message, needs_reauth: true },
          { status: 401 }
        )
      }
      throw tokenError
    }

    // Call GBP API to delete the post
    // API endpoint: DELETE https://mybusiness.googleapis.com/v4/{gbp_local_post_name}
    const apiUrl = `https://mybusiness.googleapis.com/v4/${gbpLocalPostName}`
    
    console.log('[GBP Delete] Deleting post:', gbpLocalPostName)

    const response = await fetch(apiUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const responseData = await response.json().catch(() => ({ error: 'Failed to parse response' }))
      
      console.error('[GBP Delete] API error:', {
        status: response.status,
        error: responseData,
      })

      if (response.status === 401) {
        return NextResponse.json(
          { error: 'Authentication failed. Please reconnect your Google Business Profile.', needs_reauth: true },
          { status: 401 }
        )
      }

      const errorMessage = responseData.error?.message || responseData.error || 'Failed to delete post'
      return NextResponse.json(
        { error: errorMessage, details: responseData },
        { status: response.status }
      )
    }

    // Delete the row from the database
    const posts = supabase.from(POSTS_TABLE) as any
    const { error: deleteError } = await posts
      .delete()
      .eq('id', postId)

    if (deleteError) {
      console.error('[GBP Delete] Error deleting from local DB:', deleteError)
      // Don't fail the request - Google was deleted successfully
    }

    console.log('[GBP Delete] Successfully deleted post on Google and removed from local DB')

    return NextResponse.json({
      success: true,
    })
  } catch (error: any) {
    console.error('[GBP Delete] Error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

