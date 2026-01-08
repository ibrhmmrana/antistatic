# GBP Video Publishing Investigation Report

**Date:** 2025-01-27  
**Investigator:** AI Assistant  
**Goal:** Investigate GBP publishing implementation, identify video posting blockers, and determine feasibility

---

## 1. GBP Publish Flow Map

### UI Entry Point
- **File:** `components/social-studio/tabs/CreateTab.tsx`
- **Function:** `handleSave(action: 'draft' | 'schedule' | 'post')` (line ~262)
- **Trigger:** User clicks "Post" button when `google_business` is selected in channel selector

### Frontend Payload Construction
- **Location:** `CreateTab.tsx` lines 308-324
- **Payload Structure:**
  ```typescript
  {
    businessLocationId: string
    summary: string              // Post text content
    languageCode?: string         // Default: 'en'
    media?: {
      sourceUrl: string          // Public URL to media (currently only first image)
    }
  }
  ```
- **Current Behavior:** Only sends first media item (`mediaArray[0].url`) if available
- **Media Selection:** No video filtering - sends whatever is in `mediaArray[0]`

### API Route
- **File:** `app/api/social-studio/publish/gbp/route.ts`
- **Endpoint:** `POST /api/social-studio/publish/gbp`
- **Handler:** `POST(request: NextRequest)` (line 15)

### Authentication Flow
- **Token Source:** `lib/gbp/client.ts`
  - `getValidAccessToken(userId, businessLocationId, origin?)` - Auto-refreshes if expired
  - `getGBPTokens(userId, businessLocationId)` - Retrieves from `connected_accounts` table
  - `refreshGBPAccessToken(refreshToken, origin?)` - Refreshes via `https://oauth2.googleapis.com/token`
- **OAuth Scopes:** `lib/gbp/config.ts` line 56-61
  ```typescript
  [
    'openid',
    'email',
    'profile',
    'https://www.googleapis.com/auth/business.manage'
  ]
  ```
- **Storage:** `connected_accounts` table with `provider = 'google_gbp'`
- **Token Refresh:** Automatic with 5-minute buffer before expiration

### Location Resolution
- **Database Field:** `business_locations.google_location_name`
- **Format:** `accounts/{accountId}/locations/{locationId}`
- **Resolution:** `lib/gbp/location-resolver.ts` - Fetches from GBP API if missing
- **Usage:** Used as `parent` parameter in API endpoint

### Google API Call
- **Base URL:** `https://mybusiness.googleapis.com/v4`
- **Endpoint:** `POST /{parent}/localPosts`
- **Full URL Example:** `https://mybusiness.googleapis.com/v4/accounts/123/locations/456/localPosts`
- **API Version:** v4
- **Headers:**
  ```
  Authorization: Bearer {accessToken}
  Content-Type: application/json
  ```

### Service Layer
- **File:** `lib/gbp/client.ts`
- **Function:** `gbpApiRequest<T>(endpoint, userId, businessLocationId, options, origin?)`
- **Base URL Selection:** 
  - Default: `https://mybusinessbusinessinformation.googleapis.com/v1` (for accounts/locations)
  - Reviews: `https://mybusiness.googleapis.com/v4`
  - Performance: `https://businessprofileperformance.googleapis.com/v1`
- **Note:** Local Posts endpoint uses `mybusiness.googleapis.com/v4` directly (not via `gbpApiRequest`)

---

## 2. Current Image Publish Payload Example

### Request Payload (from CreateTab)
```json
{
  "businessLocationId": "uuid-here",
  "summary": "Check out our new product!",
  "languageCode": "en",
  "media": {
    "sourceUrl": "https://supabase-storage-url.com/path/to/image.jpg"
  }
}
```

### GBP API Payload (constructed in route)
```json
{
  "languageCode": "en",
  "summary": "Check out our new product!",
  "topicType": "STANDARD",
  "media": [
    {
      "mediaFormat": "PHOTO",
      "sourceUrl": "https://supabase-storage-url.com/path/to/image.jpg"
    }
  ]
}
```

### Response (Success)
```json
{
  "ok": true,
  "localPostName": "accounts/123/locations/456/localPosts/789",
  "searchUrl": "https://www.google.com/search?q=..."
}
```

### Media Validation (Development Only)
- **Location:** Lines 198-233 in `route.ts`
- **Checks:**
  - URL accessibility (HEAD request, must return 200)
  - Content-Type must start with `image/`
  - Logs: original URL, final URL (after redirects), status, content-type, file size
- **Production:** No validation (relies on Google API to reject invalid media)

---

## 3. Video Feasibility Analysis

### Current Implementation Constraints

#### A) Code-Level Blockers
1. **Hardcoded Media Format** (Line 238)
   - `mediaFormat: 'PHOTO'` is hardcoded
   - No logic to detect video vs image
   - No conditional `mediaFormat: 'VIDEO'` path

2. **Content-Type Validation** (Line 220)
   - Explicitly rejects non-image content types:
   ```typescript
   if (!contentType.startsWith('image/')) {
     return NextResponse.json(
       { error: `Media URL does not point to an image...` },
       { status: 400 }
     )
   }
   ```
   - This validation only runs in development, but still blocks video attempts

3. **Frontend Media Selection** (Line 322-323)
   - Only sends first media item: `mediaArray[0].url`
   - No type checking or filtering
   - Would send video URL if it's first in array

#### B) API Documentation Research

**Google Business Profile Local Posts API v4:**
- **Documentation Reference:** [MediaItem Resource](https://developers.google.com/my-business/reference/rest/v4/accounts.locations.localPosts#MediaItem)
- **Supported `mediaFormat` Values:**
  - `PHOTO` - For images
  - **`VIDEO` - For videos** ✅ (API supports it!)

**MediaItem Structure:**
```typescript
{
  mediaFormat: 'PHOTO' | 'VIDEO'
  sourceUrl: string  // Publicly accessible URL
}
```

**Key Findings:**
- ✅ **The API DOES support video posts** via `mediaFormat: 'VIDEO'`
- ✅ Same endpoint: `POST /{parent}/localPosts`
- ✅ Same payload structure (just change `mediaFormat`)
- ✅ Same authentication (no additional scopes needed)
- ✅ Same `sourceUrl` requirement (must be publicly accessible)

#### C) Media Hosting Constraints

**Current Flow:**
1. User uploads media → Supabase Storage
2. Public URL generated → `https://supabase.co/storage/v1/object/public/Storage/{path}`
3. URL passed to GBP API
4. Google fetches media via cURL (must be publicly accessible)

**Video-Specific Considerations:**
- ✅ Supabase Storage supports video files (already working for Instagram)
- ✅ Public URLs work for videos (same as images)
- ⚠️ **File size limits:** 
  - Supabase Storage: No hard limit (practical limit ~5GB)
  - Google API: Unknown (not documented, but likely has limits)
- ⚠️ **Video format requirements:** Not documented in GBP API, but likely:
  - MP4 (H.264) recommended
  - Common formats: MP4, MOV, AVI (similar to Instagram)

#### D) OAuth Scopes

**Current Scopes:**
- `https://www.googleapis.com/auth/business.manage` ✅
- This scope covers Local Posts (both PHOTO and VIDEO)
- **No additional scopes needed for video**

---

## 4. Video Posting Implementation Requirements

### Required Code Changes

#### A) Backend (`app/api/social-studio/publish/gbp/route.ts`)

1. **Remove Image-Only Validation** (Line 220)
   ```typescript
   // REMOVE or MODIFY:
   if (!contentType.startsWith('image/')) {
     return NextResponse.json({ error: '...' }, { status: 400 })
   }
   
   // REPLACE WITH:
   const isImage = contentType.startsWith('image/')
   const isVideo = contentType.startsWith('video/')
   if (!isImage && !isVideo) {
     return NextResponse.json(
       { error: `Media must be an image or video (content-type: ${contentType})` },
       { status: 400 }
     )
   }
   ```

2. **Dynamic Media Format Detection** (Line 238)
   ```typescript
   // REPLACE:
   mediaFormat: 'PHOTO',
   
   // WITH:
   mediaFormat: isVideo ? 'VIDEO' : 'PHOTO',
   ```

3. **Enhanced Logging** (Already added)
   - Instrumentation logs video attempts when `DEBUG_GBP_VIDEO=1` or when video detected
   - Logs: channel, mediaType, isVideo, fileSizeMB, derivedMediaFormat, endpoint

#### B) Frontend (`components/social-studio/tabs/CreateTab.tsx`)

**No changes required** - Already sends media URL regardless of type. However, consider:
- Adding video format validation (optional, for UX)
- Showing video-specific error messages
- File size warnings for large videos

### Implementation Checklist

- [ ] Remove image-only content-type validation
- [ ] Add video content-type detection
- [ ] Set `mediaFormat: 'VIDEO'` for videos
- [ ] Test with small video file (<10MB)
- [ ] Test with larger video file (50-100MB)
- [ ] Verify video appears in GBP post
- [ ] Handle video-specific errors gracefully
- [ ] Update error messages to mention video support

### Testing Strategy

1. **Small Video Test** (<10MB MP4)
   - Upload video via Create tab
   - Select GBP channel
   - Publish
   - Verify video appears in GBP post

2. **Large Video Test** (50-100MB MP4)
   - Test file size limits
   - Monitor upload time
   - Check for timeout issues

3. **Format Validation**
   - Test MP4 (H.264)
   - Test MOV
   - Test unsupported formats (if any)

4. **Error Handling**
   - Invalid video URL
   - Unsupported format
   - File too large
   - Network timeout

---

## 5. Alternative Approaches (If Direct Video Fails)

### Option A: Upload to YouTube, Link in Post
- **Pros:** YouTube handles all video hosting/processing
- **Cons:** Requires YouTube API integration, extra step for users
- **Feasibility:** Medium (requires additional OAuth scope)

### Option B: Convert Video to GIF
- **Pros:** GIFs might be supported as images
- **Cons:** Quality loss, larger file sizes, not true video
- **Feasibility:** Low (not recommended)

### Option C: Use GBP Media Library API
- **Pros:** Dedicated media management
- **Cons:** Requires separate API calls, more complex flow
- **Feasibility:** Unknown (needs API documentation review)

### Option D: Link Post with Video Thumbnail
- **Pros:** Simple, works with current implementation
- **Cons:** Not a true video post, requires external hosting
- **Feasibility:** High (but not ideal)

**Recommendation:** Implement direct video posting first (Option: Direct API support). The API supports `mediaFormat: 'VIDEO'`, so this should work with minimal code changes.

---

## 6. Instrumentation Added

**File:** `app/api/social-studio/publish/gbp/route.ts` (lines 207-217)

**Debug Logging:**
- Triggered when `DEBUG_GBP_VIDEO=1` environment variable is set OR when video is detected
- Logs (redacted for security):
  - `channel`: 'google_business'
  - `mediaType`: Content-Type header value
  - `isVideo`: Boolean detection
  - `fileSizeMB`: File size in megabytes
  - `sourceUrl`: First 100 chars (redacted)
  - `derivedMediaFormat`: 'VIDEO (would be)' or 'PHOTO'
  - `endpoint`: Full API endpoint URL

**Usage:**
```bash
# Enable debug logging
DEBUG_GBP_VIDEO=1 npm run dev

# Or set in .env.local
DEBUG_GBP_VIDEO=1
```

---

## 7. Summary

### Current State
- ✅ GBP publishing works for **images only**
- ✅ Authentication and token management robust
- ✅ Location resolution automatic
- ✅ Error handling comprehensive

### Video Support Status
- ✅ **API supports video** (`mediaFormat: 'VIDEO'`)
- ❌ **Code blocks video** (hardcoded `PHOTO`, image-only validation)
- ✅ **No additional scopes needed**
- ✅ **Media hosting ready** (Supabase Storage supports videos)

### Blocker Summary
1. **Primary Blocker:** Hardcoded `mediaFormat: 'PHOTO'` (line 238)
2. **Secondary Blocker:** Image-only content-type validation (line 220, dev only)
3. **No API Limitation:** Google API fully supports video posts

### Implementation Effort
- **Estimated Time:** 1-2 hours
- **Complexity:** Low
- **Risk:** Low (API supports it, just need to enable in code)
- **Testing Required:** Medium (need to verify video formats, sizes, playback)

### Next Steps
1. Remove image-only validation
2. Add video detection logic
3. Set `mediaFormat` dynamically based on content type
4. Test with sample videos
5. Monitor for video-specific errors
6. Update documentation

---

## 8. References

- [Google Business Profile Local Posts API](https://developers.google.com/my-business/content/local-posts)
- [LocalPost Resource](https://developers.google.com/my-business/reference/rest/v4/accounts.locations.localPosts#LocalPost)
- [MediaItem Resource](https://developers.google.com/my-business/reference/rest/v4/accounts.locations.localPosts#MediaItem)
- [GBP Posting Implementation Doc](./GBP_POSTING_IMPLEMENTATION.md)

---

**Report Generated:** 2025-01-27  
**Status:** Investigation Complete - Ready for Implementation

