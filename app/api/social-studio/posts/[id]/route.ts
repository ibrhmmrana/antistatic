import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Database, Json } from '@/lib/supabase/database.types'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const updateSchema = z.object({
  scheduledAt: z.string().datetime().optional(),
  status: z.enum(['draft', 'scheduled', 'published', 'failed']).optional(),
  platforms: z.array(z.enum(['instagram', 'facebook', 'google_business', 'linkedin', 'tiktok'])).optional(),
  topic: z.string().optional(),
  caption: z.string().optional(),
  media: z.array(z.any()).optional(),
  linkUrl: z.string().optional(),
  utm: z.record(z.any()).optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Force table name to be a typed key (fixes "never" inference in strict mode)
    const POSTS_TABLE = 'social_studio_posts' as const satisfies keyof Database['public']['Tables']
    type PostsUpdate = Database['public']['Tables'][typeof POSTS_TABLE]['Update']
    
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const postId = params.id
    const body = await request.json()
    const validationResult = updateSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request payload', details: validationResult.error.errors },
        { status: 400 }
      )
    }

    const updateData = validationResult.data

    // First, verify the post exists and user owns it
    const { data: existingPost, error: fetchError } = await supabase
      .from(POSTS_TABLE)
      .select('business_location_id')
      .eq('id', postId)
      .maybeSingle()

    if (fetchError || !existingPost) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    // Type assertion for Supabase query result
    const postData = existingPost as { business_location_id: string }

    // Verify user owns the business location
    const { data: location } = await supabase
      .from('business_locations')
      .select('id')
      .eq('id', postData.business_location_id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!location) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Build update object with proper typing
    // Note: Supabase Update types already have optional fields, so PostsUpdate is safe for partial updates
    const updatePayload: PostsUpdate = {}
    
    if (updateData.scheduledAt !== undefined) {
      updatePayload.scheduled_at = updateData.scheduledAt || null
      // Auto-update status if scheduledAt is set
      if (updateData.scheduledAt && !updateData.status) {
        updatePayload.status = 'scheduled'
      } else if (!updateData.scheduledAt && !updateData.status) {
        updatePayload.status = 'draft'
      }
    }
    if (updateData.status !== undefined) {
      updatePayload.status = updateData.status
    }
    if (updateData.platforms !== undefined) {
      updatePayload.platforms = updateData.platforms
    }
    if (updateData.topic !== undefined) {
      updatePayload.topic = updateData.topic || null
    }
    if (updateData.caption !== undefined) {
      updatePayload.caption = updateData.caption || null
    }
    if (updateData.media !== undefined) {
      updatePayload.media = updateData.media as Json
    }
    if (updateData.linkUrl !== undefined) {
      updatePayload.link_url = updateData.linkUrl || null
    }
    if (updateData.utm !== undefined) {
      updatePayload.utm = updateData.utm as Json | null
    }

    // Update post - use typed table const and payload
    // If Vercel still infers 'never', use targeted escape hatch (consistent with other routes)
    const posts = supabase.from(POSTS_TABLE) as any
    const { data: post, error } = await posts
      .update(updatePayload as any)
      .eq('id', postId)
      .select()
      .single()

    if (error) {
      console.error('[Social Studio Posts API] Error updating post:', error)
      return NextResponse.json({ error: 'Failed to update post' }, { status: 500 })
    }

    return NextResponse.json({ post })
  } catch (error: any) {
    console.error('[Social Studio Posts API] Error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Force table name to be a typed key
    const POSTS_TABLE = 'social_studio_posts' as const satisfies keyof Database['public']['Tables']
    
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const postId = params.id

    // First, verify the post exists and user owns it
    const { data: existingPost, error: fetchError } = await supabase
      .from(POSTS_TABLE)
      .select('business_location_id')
      .eq('id', postId)
      .maybeSingle()

    if (fetchError || !existingPost) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    // Type assertion for Supabase query result
    const postData = existingPost as { business_location_id: string }

    // Verify user owns the business location
    const { data: location } = await supabase
      .from('business_locations')
      .select('id')
      .eq('id', postData.business_location_id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!location) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Delete post
    const { error } = await supabase.from(POSTS_TABLE).delete().eq('id', postId)

    if (error) {
      console.error('[Social Studio Posts API] Error deleting post:', error)
      return NextResponse.json({ error: 'Failed to delete post' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Social Studio Posts API] Error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

