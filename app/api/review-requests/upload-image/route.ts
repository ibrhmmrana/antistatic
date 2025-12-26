import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createStorageClient } from '@/lib/supabase/storage'
import { randomUUID } from 'crypto'

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
    const { data: location, error: locationError } = await supabase
      .from('business_locations')
      .select('id')
      .eq('id', businessLocationId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (locationError || !location) {
      return NextResponse.json({ error: 'Business location not found' }, { status: 404 })
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 })
    }

    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'File size must be less than 5MB' }, { status: 400 })
    }

    // Generate unique filename
    const timestamp = Date.now()
    const fileExtension = file.name.split('.').pop() || 'png'
    const fileName = `${timestamp}-${randomUUID()}.${fileExtension}`
    const filePath = `review-requests/${user.id}/${fileName}`

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Use storage client (with service role if available, otherwise anon key)
    const storageClient = createStorageClient()

    // Upload to Supabase Storage
    // Try 'Storage' bucket first
    const bucketName = 'Storage'
    const { data: uploadData, error: uploadError } = await storageClient.storage
      .from(bucketName)
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('[Image Upload] Storage error:', uploadError)
      console.error('[Image Upload] Error code:', uploadError.statusCode)
      console.error('[Image Upload] Error message:', uploadError.message)
      
      // Provide helpful error messages
      let errorMessage = 'Failed to upload image'
      if (uploadError.message?.includes('Bucket not found') || uploadError.message?.includes('not found')) {
        errorMessage = 'Storage bucket "Storage" not found. Please create it in Supabase Storage settings.'
      } else if (uploadError.message?.includes('new row violates row-level security')) {
        errorMessage = 'Storage access denied. Please check storage policies in Supabase.'
      } else if (uploadError.message) {
        errorMessage = uploadError.message
      }
      
      return NextResponse.json({ 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? uploadError : undefined
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
    })
  } catch (error: any) {
    console.error('[Image Upload API] Error:', error)
    console.error('[Image Upload API] Error stack:', error.stack)
    return NextResponse.json({ 
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 })
  }
}

