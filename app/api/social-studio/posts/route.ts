import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Database } from '@/lib/supabase/database.types'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const querySchema = z.object({
  businessLocationId: z.string().uuid(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
})

export async function GET(request: NextRequest) {
  try {
    // Force table name to be a typed key (fixes "never" inference in strict mode)
    const POSTS_TABLE = 'social_studio_posts' as const satisfies keyof Database['public']['Tables']
    
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const validationResult = querySchema.safeParse({
      businessLocationId: searchParams.get('businessLocationId'),
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
    })

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validationResult.error.errors },
        { status: 400 }
      )
    }

    const { businessLocationId, from, to } = validationResult.data

    // Verify user owns the business location
    const { data: location } = await supabase
      .from('business_locations')
      .select('id')
      .eq('id', businessLocationId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!location) {
      return NextResponse.json({ error: 'Business location not found' }, { status: 404 })
    }

    // Build query
    let query = supabase
      .from(POSTS_TABLE)
      .select('*')
      .eq('business_location_id', businessLocationId)
      .order('scheduled_at', { ascending: true, nullsFirst: false })

    // Add date range filters if provided
    if (from) {
      query = query.gte('scheduled_at', from)
    }
    if (to) {
      query = query.lte('scheduled_at', to)
    }

    const { data: posts, error } = await query

    if (error) {
      console.error('[Social Studio Posts API] Error fetching posts:', error)
      return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 })
    }

    // Type assertion for query result (needed for strict mode type inference)
    type PostRow = Database['public']['Tables'][typeof POSTS_TABLE]['Row']
    const typedPosts = (posts || []) as PostRow[]

    // Transform posts into calendar event format
    const events = typedPosts.map((post) => ({
      id: post.id,
      title: post.topic || post.caption?.substring(0, 50) || 'Post',
      start: post.scheduled_at || post.created_at,
      end: post.scheduled_at || post.created_at,
      extendedProps: {
        status: post.status,
        platforms: post.platforms || [],
        caption: post.caption,
        media: post.media || [],
        linkUrl: post.link_url,
        utm: post.utm,
        publishedAt: post.published_at,
      },
      backgroundColor: getStatusColor(post.status),
      borderColor: getStatusColor(post.status),
      textColor: '#ffffff',
    }))

    return NextResponse.json({ events, posts: typedPosts })
  } catch (error: any) {
    console.error('[Social Studio Posts API] Error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

const postSchema = z.object({
  businessLocationId: z.string().uuid(),
  platforms: z.array(z.enum(['instagram', 'facebook', 'google_business', 'linkedin', 'tiktok'])).min(1),
  topic: z.string().optional(),
  caption: z.string().optional(),
  media: z.array(z.any()).default([]),
  linkUrl: z.string().optional(),
  utm: z.record(z.any()).optional(),
  scheduledAt: z.string().datetime().optional(),
})

export async function POST(request: NextRequest) {
  try {
    // Force table name to be a typed key (fixes "never" inference in strict mode)
    const POSTS_TABLE = 'social_studio_posts' as const satisfies keyof Database['public']['Tables']
    
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validationResult = postSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request payload', details: validationResult.error.errors },
        { status: 400 }
      )
    }

    const { businessLocationId, platforms, topic, caption, media, linkUrl, utm, scheduledAt } =
      validationResult.data

    // Verify user owns the business location
    const { data: location } = await supabase
      .from('business_locations')
      .select('id')
      .eq('id', businessLocationId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!location) {
      return NextResponse.json({ error: 'Business location not found' }, { status: 404 })
    }

    // Determine status based on scheduledAt
    const status = scheduledAt ? 'scheduled' : 'draft'

    // Insert post
    const { data: post, error } = await supabase
      .from(POSTS_TABLE)
      .insert({
        business_location_id: businessLocationId,
        status,
        platforms,
        topic: topic || null,
        caption: caption || null,
        media: media || [],
        link_url: linkUrl || null,
        utm: utm || null,
        scheduled_at: scheduledAt || null,
      })
      .select()
      .single()

    if (error) {
      console.error('[Social Studio Posts API] Error creating post:', error)
      return NextResponse.json({ error: 'Failed to create post' }, { status: 500 })
    }

    return NextResponse.json({ post }, { status: 201 })
  } catch (error: any) {
    console.error('[Social Studio Posts API] Error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'published':
      return '#10b981' // green
    case 'scheduled':
      return '#3b82f6' // blue
    case 'draft':
      return '#f59e0b' // amber
    case 'failed':
      return '#ef4444' // red
    default:
      return '#6b7280' // gray
  }
}

