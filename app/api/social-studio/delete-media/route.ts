import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createStorageClient } from '@/lib/supabase/storage'

/**
 * DELETE /api/social-studio/delete-media
 * 
 * Delete image/video from Supabase Storage
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const filePath = searchParams.get('filePath')
    const businessLocationId = searchParams.get('businessLocationId')

    if (!filePath) {
      return NextResponse.json({ error: 'filePath is required' }, { status: 400 })
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

    // Verify the file path belongs to this business location
    if (!filePath.startsWith(`social-studio/${businessLocationId}/`)) {
      return NextResponse.json({ error: 'Invalid file path' }, { status: 403 })
    }

    // Use storage client
    const storageClient = createStorageClient()

    // Delete from Supabase Storage
    const bucketName = 'Storage'
    const { error: deleteError } = await storageClient.storage
      .from(bucketName)
      .remove([filePath])

    if (deleteError) {
      console.error('[Social Studio Delete] Storage error:', deleteError)
      return NextResponse.json({ 
        error: deleteError.message || 'Failed to delete media'
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Media deleted successfully',
    })
  } catch (error: any) {
    console.error('[Social Studio Delete] Error:', error)
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 })
  }
}

