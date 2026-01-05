# Google Business Profile (GBP) Posting Implementation

## Audit Results

### A) Access Token / Refresh Token Source

**Location:** `lib/gbp/client.ts`

**Functions:**
- `findGBPConnectedAccount(supabase, businessLocationId, userId?)` - Finds connected account from `connected_accounts` table
- `getGBPTokens(userId, businessLocationId)` - Retrieves tokens from database
- `getValidAccessToken(userId, businessLocationId, origin?)` - Gets valid token, automatically refreshes if expired
- `refreshGBPAccessToken(refreshToken, origin?)` - Refreshes expired tokens

**Database Storage:**
- Table: `connected_accounts`
- Provider: `'google_gbp'` (constant: `GBP_CONNECTED_ACCOUNTS_PROVIDER`)
- Fields:
  - `access_token` (TEXT)
  - `refresh_token` (TEXT, nullable)
  - `expires_at` (TIMESTAMPTZ, nullable)
  - `status` (TEXT, default 'connected')
  - `scopes` (TEXT[], nullable)

**Token Refresh:**
- Automatically handled by `getValidAccessToken()`
- Checks expiration with 5-minute buffer
- Updates database with new token after refresh

### B) Parent Location Name

**Database Field:** `business_locations.google_location_name`

**Format:** `accounts/{accountId}/locations/{locationId}`

**Example:** `accounts/111454594662810630407/locations/123456789`

**Helper Function:** `resolveAndStoreGBPLocationName(userId, businessLocationId, origin?)` in `lib/gbp/location-resolver.ts`

**Usage:**
- Stored in `business_locations` table after GBP connection
- If not present, can be resolved by calling `resolveAndStoreGBPLocationName()`
- Used directly in API calls as the `parent` parameter

---

## Implementation

### 1. API Route: `/api/social-studio/publish/gbp`

**File:** `app/api/social-studio/publish/gbp/route.ts`

**Endpoint:** `POST /api/social-studio/publish/gbp`

**Request Body:**
```typescript
{
  businessLocationId: string
  summary: string          // Required: post text
  languageCode?: string    // Optional: default "en"
  cta?: {
    actionType: string     // Optional: "LEARN_MORE" | "CALL" | etc
    url?: string          // Optional: required for non-CALL actions
  }
  media?: {
    sourceUrl: string      // Optional: publicly accessible image URL
  }
}
```

**Response (Success):**
```typescript
{
  ok: true
  localPostName: string    // "accounts/.../locations/.../localPosts/..."
  searchUrl?: string       // Optional: search URL for the post
}
```

**Response (Error):**
```typescript
{
  ok: false
  error: string
  needs_reauth?: boolean   // true if token expired and needs reconnection
  status?: number
  details?: any
}
```

**Features:**
- ✅ Validates authenticated user
- ✅ Verifies user owns `businessLocationId`
- ✅ Checks GBP connection status
- ✅ Resolves `google_location_name` if not stored
- ✅ Gets valid access token (auto-refreshes if expired)
- ✅ Handles token expiration with `needs_reauth` flag
- ✅ Builds LocalPost payload with STANDARD topic type
- ✅ Supports optional CTA and media
- ✅ Comprehensive error handling

**GBP API Call:**
- Endpoint: `POST https://mybusiness.googleapis.com/v4/{parent}/localPosts`
- Headers: `Authorization: Bearer {accessToken}`, `Content-Type: application/json`
- Payload includes: `languageCode`, `summary`, `topicType: 'STANDARD'`, optional `callToAction`, optional `media[]`

### 2. CreateTab Integration

**File:** `components/social-studio/tabs/CreateTab.tsx`

**Changes:**
- Modified `handleSave()` function to handle platform-specific publishing when `action === 'post'`
- For each selected platform:
  - **Google Business Profile**: Calls `/api/social-studio/publish/gbp` with summary and optional media
  - **Instagram**: Placeholder (not yet implemented)
  - **Other platforms**: Placeholder (not yet implemented)
- Shows individual success/error toasts for each platform
- Saves post to database after successful publishing
- Handles partial failures (some platforms succeed, others fail)

**Publishing Flow:**
1. User clicks "Post" button
2. For each selected platform:
   - If `google_business`: Call GBP publish API
   - If `instagram`: TODO (not implemented)
   - Other platforms: TODO (not implemented)
3. Show results (success/error) for each platform
4. Save post record to database with `status: 'published'` and `publishedAt: now()`
5. Navigate to Planner tab after 1 second

---

## Manual Test Steps

### Prerequisites
1. User must have a business location with GBP connected
2. `google_location_name` should be stored in `business_locations` table
3. GBP connection must have valid access token (or refresh token for auto-refresh)

### Test Case 1: Basic GBP Post (Text Only)

1. Navigate to Social Studio → Create tab
2. Select "Google Business Profile" channel
3. Enter text in content area (e.g., "Check out our new product!")
4. Click "Post" button
5. **Expected:**
   - Button shows "Publishing..." state
   - Toast: "Posted to Google Business Profile"
   - Post saved to database
   - Redirects to Planner tab

### Test Case 2: GBP Post with Image

1. Navigate to Social Studio → Create tab
2. Select "Google Business Profile" channel
3. Enter text in content area
4. Upload an image (must be publicly accessible URL)
5. Click "Post" button
6. **Expected:**
   - Post published with image
   - Image appears in GBP post

### Test Case 3: Multiple Platforms (GBP + Instagram)

1. Select both "Google Business Profile" and "Instagram"
2. Enter content
3. Click "Post"
4. **Expected:**
   - GBP publishes successfully
   - Instagram shows "not yet implemented" message
   - Combined toast showing results

### Test Case 4: Token Expiration Handling

1. Manually expire the access token in database (set `expires_at` to past date)
2. Ensure refresh token exists
3. Try to post
4. **Expected:**
   - Token automatically refreshes
   - Post publishes successfully
   - New token saved to database

### Test Case 5: Missing Connection

1. Disconnect GBP (set `status` to 'disconnected' in `connected_accounts`)
2. Try to post
3. **Expected:**
   - Error: "Google Business Profile not connected"
   - `needs_reauth: true` in response
   - Toast shows error message

### Test Case 6: Missing Location Name

1. Clear `google_location_name` from `business_locations` table
2. Try to post
3. **Expected:**
   - Location name automatically resolved
   - Stored in database
   - Post publishes successfully

---

## What to Watch in Logs

### Server Logs (API Route)

**Success Flow:**
```
[GBP Publish] Publishing to: https://mybusiness.googleapis.com/v4/accounts/.../locations/.../localPosts
[GBP Publish] Payload: { languageCode: 'en', summary: '...', topicType: 'STANDARD' }
[GBP Publish] Success: { localPostName: '...', searchUrl: '...' }
```

**Token Refresh:**
```
[GBP Client] Access token expired or expiring soon, refreshing...
[GBP Client] Token refreshed successfully
```

**Location Resolution:**
```
[GBP Publish] Location name not stored, resolving...
[GBP Location Resolver] Resolving location name for: { userId, businessLocationId }
[GBP Location Resolver] Location name resolved: accounts/.../locations/...
```

**Error Cases:**
```
[GBP Publish] API error: { status: 401, error: {...} }
[GBP Publish] Token error: Access token expired and no refresh token available
```

### Client Logs (CreateTab)

**Publishing:**
```
[CreateTab] Publishing to google_business
[CreateTab] Publishing to instagram (if selected)
```

**Errors:**
```
[CreateTab] Error publishing to google_business: { error message }
```

---

## API Documentation References

- [Google Business Profile Local Posts API](https://developers.google.com/my-business/content/local-posts)
- [LocalPost Resource](https://developers.google.com/my-business/reference/rest/v4/accounts.locations.localPosts#LocalPost)
- [CallToAction Resource](https://developers.google.com/my-business/reference/rest/v4/accounts.locations.localPosts#CallToAction)
- [MediaItem Resource](https://developers.google.com/my-business/reference/rest/v4/accounts.locations.localPosts#MediaItem)

---

## Notes

1. **Topic Type**: Currently hardcoded to `STANDARD`. Other types (OFFER, EVENT, PRODUCT) can be added later.
2. **Media**: Only supports `sourceUrl` (publicly accessible URL). Media must be uploaded to Supabase Storage or another public CDN first.
3. **CTA**: Optional. If provided, `url` is required for all action types except `CALL`.
4. **Language Code**: Defaults to `'en'`. Can be extended to support other languages.
5. **Error Handling**: Comprehensive error handling with specific messages for auth failures, permission issues, etc.
6. **Token Management**: Automatic token refresh is handled by `getValidAccessToken()`, so the API route doesn't need to handle refresh logic directly.

---

## Future Enhancements

1. **Instagram Publishing**: Wire up existing Instagram publish route
2. **Other Platforms**: Add Facebook, LinkedIn, TikTok publishing
3. **CTA Support**: Add UI for selecting CTA type and URL
4. **Media Upload**: Integrate media upload flow before publishing
5. **Post Scheduling**: Extend to support scheduled GBP posts (if API supports it)
6. **Post Analytics**: Track published posts and their performance


