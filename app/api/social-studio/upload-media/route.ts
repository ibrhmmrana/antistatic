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
    let arrayBuffer: ArrayBuffer
    let buffer: Buffer
    
    try {
      arrayBuffer = await file.arrayBuffer()
      buffer = Buffer.from(arrayBuffer)
    } catch (error: any) {
      console.error('[Social Studio Upload] Error converting file to buffer:', error)
      return NextResponse.json({ 
        error: 'Failed to process file'
      }, { status: 500 })
    }

    // Use storage client
    let storageClient
    try {
      storageClient = createStorageClient()
    } catch (error: any) {
      console.error('[Social Studio Upload] Error creating storage client:', error)
      return NextResponse.json({ 
        error: 'Failed to initialize storage connection'
      }, { status: 500 })
    }

    // Upload to Supabase Storage
    const bucketName = 'Storage'
    let uploadData, uploadError
    
    try {
      const uploadResult = await storageClient.storage
        .from(bucketName)
        .upload(filePath, buffer, {
          contentType: file.type,
          upsert: false,
        })
      uploadData = uploadResult.data
      uploadError = uploadResult.error
    } catch (error: any) {
      console.error('[Social Studio Upload] Storage upload exception:', error)
      return NextResponse.json({ 
        error: error.message || 'Failed to upload to storage'
      }, { status: 500 })
    }

    if (uploadError) {
      console.error('[Social Studio Upload] Storage error:', uploadError)
      // Provide more specific error messages
      let errorMessage = uploadError.message || 'Failed to upload media'
      if (uploadError.message?.includes('Bucket not found')) {
        errorMessage = 'Storage bucket not found. Please check Supabase configuration.'
      } else if (uploadError.message?.includes('new row violates row-level security')) {
        errorMessage = 'Storage access denied. Please check storage policies.'
      }
      return NextResponse.json({ 
        error: errorMessage
      }, { status: 500 })
    }

    // Get public URL
    let urlData
    try {
      const urlResult = storageClient.storage
        .from(bucketName)
        .getPublicUrl(filePath)
      urlData = urlResult.data
    } catch (error: any) {
      console.error('[Social Studio Upload] Error getting public URL:', error)
      return NextResponse.json({ 
        error: 'Failed to generate public URL'
      }, { status: 500 })
    }

    if (!urlData?.publicUrl) {
      console.error('[Social Studio Upload] No public URL returned:', urlData)
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

