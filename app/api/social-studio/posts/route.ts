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

    // Build query - fetch all posts for the location (exclude deleted posts)
    let query = supabase
      .from(POSTS_TABLE)
      .select('*')
      .eq('business_location_id', businessLocationId)
      .neq('status', 'deleted') // Exclude deleted posts

    // Order by the relevant date (scheduled_at, then published_at, then created_at)
    query = query.order('scheduled_at', { ascending: true, nullsFirst: true })
      .order('published_at', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true })

    const { data: posts, error } = await query

    if (error) {
      console.error('[Social Studio Posts API] Error fetching posts:', error)
      return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 })
    }

    // Type assertion for query result (needed for strict mode type inference)
    type PostRow = Database['public']['Tables'][typeof POSTS_TABLE]['Row']
    let typedPosts = (posts || []) as PostRow[]
    
    console.log(`[Social Studio Posts API] Fetched ${typedPosts.length} posts from DB for location ${businessLocationId}`)

    // Filter by date range if provided (check both scheduled_at and published_at)
    if (from || to) {
      typedPosts = typedPosts.filter((post) => {
        // Use scheduled_at, then published_at, then created_at for event date
        const eventDate = post.scheduled_at || post.published_at || post.created_at
        
        if (from && eventDate < from) {
          return false
        }
        if (to && eventDate > to) {
          return false
        }
        return true
      })
    }

    // Transform posts into calendar event format
    const events = typedPosts.map((post) => {
      // Use scheduled_at, then published_at, then created_at for event date
      const eventDate = post.scheduled_at || post.published_at || post.created_at
      
      // Debug: Log posts with same date to help identify dedupe issues
      if (eventDate) {
        const dateStr = new Date(eventDate).toISOString().split('T')[0]
        // Log if multiple posts on same day (for debugging)
        const sameDayPosts = typedPosts.filter(p => {
          const pDate = p.scheduled_at || p.published_at || p.created_at
          return pDate && new Date(pDate).toISOString().split('T')[0] === dateStr
        })
        if (sameDayPosts.length > 1) {
          console.log(`[Social Studio Posts API] Found ${sameDayPosts.length} posts on ${dateStr}:`, 
            sameDayPosts.map(p => ({ id: p.id, platform: (p as any).platform, caption: p.caption?.substring(0, 30) })))
        }
      }
      
      // Extract media URL (from media_url or first media item)
      // GBP posts use sourceUrl, other posts might use url
      const mediaUrl = (post as any).media_url || 
        (Array.isArray(post.media) && post.media.length > 0 && typeof post.media[0] === 'object'
          ? ((post.media[0] as any).sourceUrl || (post.media[0] as any).url || null)
          : null)
      
      return {
        id: post.id,
        title: post.topic || post.caption?.substring(0, 50) || 'Post',
        start: eventDate,
        end: eventDate,
        extendedProps: {
          status: post.status,
          platforms: post.platforms || [],
          platform: (post as any).platform || null,
          caption: post.caption,
          media: post.media || [],
          mediaUrl,
          cta: (post as any).cta || null,
          linkUrl: post.link_url,
          utm: post.utm,
          scheduledAt: post.scheduled_at,
          publishedAt: post.published_at,
          gbpLocalPostName: (post as any).gbp_local_post_name || null,
          gbpSearchUrl: (post as any).gbp_search_url || null,
          platformMeta: (post as any).platform_meta || null,
        },
        // Use transparent background - custom styling is in eventContent
        backgroundColor: 'transparent',
        borderColor: 'transparent',
        textColor: '#000000',
        classNames: ['custom-calendar-event'],
      }
    })

    console.log(`[Social Studio Posts API] Created ${events.length} calendar events from ${typedPosts.length} posts`)

    return NextResponse.json({ events, posts: typedPosts })
  } catch (error: any) {
    console.error('[Social Studio Posts API] Error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

const postSchema = z.object({
  businessLocationId: z.string().uuid(),
  platforms: z.array(z.enum(['instagram', 'facebook', 'google_business', 'linkedin', 'tiktok'])).min(1),
  platform: z.string().optional(),
  topic: z.string().optional(),
  caption: z.string().optional(),
  media: z.array(z.any()).default([]),
  mediaUrl: z.string().optional(),
  cta: z.record(z.any()).optional(),
  linkUrl: z.string().optional(),
  utm: z.record(z.any()).optional(),
  scheduledAt: z.string().datetime().optional(),
  status: z.enum(['draft', 'scheduled', 'published', 'failed']).optional(),
  publishedAt: z.string().datetime().optional(),
  gbpLocalPostName: z.string().optional(),
  gbpSearchUrl: z.string().optional(),
  platformMeta: z.record(z.any()).optional(),
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

    const { 
      businessLocationId, 
      platforms, 
      platform,
      topic, 
      caption, 
      media, 
      mediaUrl,
      cta,
      linkUrl, 
      utm, 
      scheduledAt, 
      status: statusParam, 
      publishedAt,
      gbpLocalPostName,
      gbpSearchUrl,
      platformMeta,
    } = validationResult.data

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

    // Determine status: use provided status, or infer from scheduledAt, or default to draft
    const status = statusParam || (scheduledAt ? 'scheduled' : 'draft')

    // Insert post - use typed payload and escape hatch for strict mode
    type PostsInsert = Database['public']['Tables'][typeof POSTS_TABLE]['Insert']
    const insertPayload: PostsInsert = {
      business_location_id: businessLocationId,
      status,
      platforms,
      platform: platform || null,
      topic: topic || null,
      caption: caption || null,
      media: media || [],
      media_url: mediaUrl || null,
      cta: cta || null,
      link_url: linkUrl || null,
      utm: utm || null,
      scheduled_at: scheduledAt || null,
      published_at: publishedAt || null,
      gbp_local_post_name: gbpLocalPostName || null,
      gbp_search_url: gbpSearchUrl || null,
      platform_meta: platformMeta || null,
    }
    
    const posts = supabase.from(POSTS_TABLE) as any
    const { data: post, error } = await posts
      .insert(insertPayload as any)
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

