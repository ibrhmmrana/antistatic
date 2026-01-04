import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createStorageClient } from '@/lib/supabase/storage'
import { randomUUID } from 'crypto'

/**
 * POST /api/social-studio/upload-media
 * 
 * Upload image/video to Supabase Storage for Social Studio posts
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    const businessLocationId = formData.get('businessLocationId') as string

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!businessLocationId) {
      return NextResponse.json({ error: 'businessLocationId is required' }, { status: 400 })
    }

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

    // Validate file type (image or video)
    const isValidType = file.type.startsWith('image/') || file.type.startsWith('video/')
    if (!isValidType) {
      return NextResponse.json({ error: 'File must be an image or video' }, { status: 400 })
    }

    // Validate file size (100MB for video, 10MB for image)
    const maxSize = file.type.startsWith('video/') ? 100 * 1024 * 1024 : 10 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json({ 
        error: `File size must be less than ${file.type.startsWith('video/') ? '100MB' : '10MB'}` 
      }, { status: 400 })
    }

    // Generate unique filename
    const timestamp = Date.now()
    const fileExtension = file.name.split('.').pop() || (file.type.startsWith('video/') ? 'mp4' : 'jpg')
    const fileName = `social-studio/${businessLocationId}/${timestamp}-${randomUUID()}.${fileExtension}`
    const filePath = fileName

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Use storage client
    const storageClient = createStorageClient()

    // Upload to Supabase Storage
    const bucketName = 'Storage'
    const { data: uploadData, error: uploadError } = await storageClient.storage
      .from(bucketName)
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('[Social Studio Upload] Storage error:', uploadError)
      return NextResponse.json({ 
        error: uploadError.message || 'Failed to upload media'
      }, { status: 500 })
    }

    // Get public URL
    const { data: urlData } = storageClient.storage
      .from(bucketName)
      .getPublicUrl(filePath)

    if (!urlData?.publicUrl) {
      return NextResponse.json({ error: 'Failed to generate public URL' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      publicUrl: urlData.publicUrl,
      filePath,
      type: file.type.startsWith('video/') ? 'video' : 'image',
    })
  } catch (error: any) {
    console.error('[Social Studio Upload] Error:', error)
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 })
  }
}

