# Social Studio Comments Tab - Investigation Report

## File Path Map (Ordered by Data Flow)

### 1. Route Entry Point
- **`app/(app)/social-studio/page.tsx`**
  - Server component that handles authentication and onboarding checks
  - Fetches primary business location
  - Renders `SocialStudioPage` component with `businessLocationId`

### 2. Main Page Component
- **`components/social-studio/SocialStudioPage.tsx`**
  - Client component managing tab navigation
  - Reads `tab` query param from URL (`?tab=comments`)
  - Renders `CommentsTab` when `activeTab === 'comments'` (line 289)
  - Tab state synced with URL via `useSearchParams()` and `router.push()`

### 3. Comments Tab Component
- **`components/social-studio/tabs/CommentsTab.tsx`**
  - Main UI component for displaying comments
  - Handles loading states, connection checks, permission checks
  - Renders comment list, reply drawer, and empty states

### 4. Data Fetching (Client-Side)
- **`components/social-studio/tabs/CommentsTab.tsx`** (lines 102-138)
  - `fetchComments()` function makes GET request to `/api/social-studio/instagram/comments`
  - Uses cache-busting timestamp (`_t=${Date.now()}`)
  - Sets `credentials: 'include'` for cookie-based auth
  - Stores response in `comments` state

### 5. API Route (Server-Side)
- **`app/api/social-studio/instagram/comments/route.ts`**
  - Handles GET requests for comments
  - Syncs live data from Instagram API
  - Queries Supabase database
  - Transforms and returns formatted comments

### 6. Instagram API Client
- **`lib/instagram/api.ts`**
  - `listMedia()` - Fetches media items (line 253)
  - `listComments()` - Fetches comments for a media item (line 310)
  - `listReplies()` - Fetches replies for a comment (line 359)
  - All use Instagram Graph API endpoints

### 7. Reply API Route
- **`app/api/social/instagram/comments/reply/route.ts`**
  - Handles POST requests to reply to comments
  - Calls `api.replyToComment(commentId, text)`
  - Updates database to mark comment as replied

### 8. Database Tables
- **`public.instagram_media`** - Stores media/post data
- **`public.instagram_comments`** - Stores comments and replies
- **`public.instagram_connections`** - Stores Instagram account connections

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. USER NAVIGATES TO /social-studio?tab=comments               │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. app/(app)/social-studio/page.tsx                             │
│    - Server component                                            │
│    - Authenticates user                                          │
│    - Fetches businessLocationId                                  │
│    - Renders <SocialStudioPage businessLocationId={...} />      │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. components/social-studio/SocialStudioPage.tsx                │
│    - Client component                                            │
│    - Reads ?tab=comments from URL                                │
│    - Sets activeTab = 'comments'                                 │
│    - Renders <CommentsTab businessLocationId={...} />            │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. components/social-studio/tabs/CommentsTab.tsx                │
│    - useEffect() checks permissions (lines 65-100)               │
│    - fetchComments() called when hasCommentsPermission=true      │
│    - Makes GET /api/social-studio/instagram/comments            │
│    - Sets comments state from response                           │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. app/api/social-studio/instagram/comments/route.ts            │
│    GET handler (line 13)                                         │
│                                                                  │
│    A. Sync Phase (lines 93-506):                                 │
│       - Creates InstagramAPI client                              │
│       - Fetches media via api.listMedia()                       │
│       - For each media:                                          │
│         * Fetches comments via api.listComments()                │
│         * Fetches replies via api.listReplies()                  │
│         * Inserts/updates in Supabase                            │
│                                                                  │
│    B. Query Phase (lines 512-537):                               │
│       - Queries instagram_comments table                         │
│       - Joins with instagram_media for thumbnails                │
│       - Filters: parent_comment_id IS NULL (top-level only)     │
│                                                                  │
│    C. Transform Phase (lines 573-704):                            │
│       - Maps DB rows to Comment interface                        │
│       - Resolves usernames from raw data                         │
│       - Fetches nested replies                                   │
│       - Returns JSON: { comments: [...], total: N }             │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. lib/instagram/api.ts                                          │
│    InstagramAPI class methods:                                   │
│    - listMedia(): GET /{ig_user_id}/media                        │
│      fields: id,caption,like_count,comments_count,              │
│              timestamp,media_type,media_url,thumbnail_url,       │
│              permalink                                           │
│                                                                  │
│    - listComments(mediaId): GET /{mediaId}/comments               │
│      fields: id,text,timestamp,from                              │
│                                                                  │
│    - listReplies(commentId): GET /{commentId}/replies             │
│      fields: id,text,timestamp,from                              │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 7. Meta Instagram Graph API                                      │
│    - Returns JSON with comment/reply data                       │
│    - Some replies may not include 'from' field                  │
│      (Instagram API limitation/privacy)                         │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 8. Supabase Database                                             │
│    - instagram_media: Stores post/media data                    │
│    - instagram_comments: Stores comments and replies            │
│      * username column (can be NULL)                             │
│      * raw column (JSONB with full API response)                │
│      * parent_comment_id (for replies)                           │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 9. Transform & Return (route.ts lines 573-704)                  │
│    - Parses raw JSONB if stored as string                        │
│    - Extracts username from raw.from.username                   │
│    - Falls back to 'unknown' if no username found               │
│    - Returns formatted Comment[] array                          │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ 10. CommentsTab.tsx renders UI (lines 339-470)                 │
│     - Maps comments array to JSX                                 │
│     - Displays author name (line 364-368)                       │
│     - Displays date (line 371)                                  │
│     - Displays media thumbnail or "Post" placeholder (345-360)   │
│     - Displays Reply button (lines 446-465)                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Where "@unknown" is Introduced

### Primary Location: API Route Transformation

**File:** `app/api/social-studio/instagram/comments/route.ts`

**For Top-Level Comments:**
- **Line 624:** `username: commentUsername || 'unknown'`
  - `commentUsername` is resolved in lines 591-617
  - Falls back to `'unknown'` if:
    1. `c.username` is NULL in database
    2. `raw.from.username` is missing/undefined
    3. User ID comparison fails or IDs don't match

**For Replies:**
- **Line 698:** `username: username || 'unknown'`
  - `username` is resolved in lines 652-681
  - Falls back to `'unknown'` if:
    1. `r.username` is NULL in database
    2. `raw.from.username` is missing/undefined
    3. User ID comparison fails or IDs don't match

### Secondary Location: UI Component

**File:** `components/social-studio/tabs/CommentsTab.tsx`

**Line 406:** Direct fallback in JSX:
```typescript
reply.from.username 
  ? `@${reply.from.username}`
  : 'unknown'
```

This is a **redundant fallback** since the API already returns `'unknown'` in the `from.username` field. However, it provides an additional safety net.

---

## Instagram Graph API Fields Requested

### Comments Endpoint
**Method:** `GET /{mediaId}/comments`  
**Fields:** `id,text,timestamp,from`  
**Location:** `lib/instagram/api.ts` line 336

### Replies Endpoint
**Method:** `GET /{commentId}/replies`  
**Fields:** `id,text,timestamp,from`  
**Location:** `lib/instagram/api.ts` line 385

### Media Endpoint
**Method:** `GET /{ig_user_id}/media`  
**Fields:** `id,caption,like_count,comments_count,timestamp,media_type,media_url,thumbnail_url,permalink`  
**Location:** `lib/instagram/api.ts` line 279

### Analysis

✅ **The `from` field IS requested** for both comments and replies.  
❌ **However, Instagram API sometimes doesn't return `from`** for replies due to:
- Privacy settings
- Account restrictions
- API limitations
- Deleted/suspended accounts

When `from` is missing from the API response:
1. `username` column in DB is set to `NULL` (line 330, 354)
2. `raw` column stores the incomplete response
3. Username resolution logic (lines 591-617, 652-681) can't extract username
4. Falls back to `'unknown'`

---

## Rendering Issues

### 1. "Post" Placeholder Block

**Location:** `components/social-studio/tabs/CommentsTab.tsx` lines 345-360

**Code:**
```typescript
{comment.mediaThumbnail ? (
  <img src={comment.mediaThumbnail} ... />
) : (
  <div className="w-16 h-16 bg-slate-200 rounded flex items-center justify-center">
    <span className="text-xs text-slate-500">Post</span>
  </div>
)}
```

**Why it shows:**
- `comment.mediaThumbnail` is `undefined` or falsy
- This happens when:
  1. Media sync failed (RLS errors, API errors)
  2. `thumbnail_url` is NULL in database
  3. `media_url` is also NULL (no fallback available)
  4. Media join failed (left join returns NULL)

**Data source:** `app/api/social-studio/instagram/comments/route.ts` line 641:
```typescript
mediaThumbnail: c.instagram_media?.thumbnail_url || c.instagram_media?.media_url || undefined
```

### 2. Date Formatting

**Location:** `components/social-studio/tabs/CommentsTab.tsx` lines 371, 409, 429

**Code:**
```typescript
{new Date(comment.timestamp).toLocaleDateString()}
```

**Format:** Uses browser's default locale (e.g., `1/1/2026` for US locale)  
**No custom formatting** - relies on browser's `Intl.DateTimeFormat`

---

## Reply Button Flow

### 1. Click Handler

**Location:** `components/social-studio/tabs/CommentsTab.tsx` line 450

**Code:**
```typescript
onClick={() => setSelectedComment(comment)}
```

Opens reply drawer (lines 476-533).

### 2. Send Reply Handler

**Location:** `components/social-studio/tabs/CommentsTab.tsx` line 164

**Function:** `handleReply(comment: Comment)`

**Flow:**
1. Validates `replyText` is not empty (line 165)
2. Makes POST request to `/api/social/instagram/comments/reply` (line 170)
3. **Payload:**
   ```json
   {
     "locationId": "businessLocationId",
     "commentId": "comment.id",
     "mediaId": "comment.mediaId",
     "text": "replyText"
   }
   ```
4. On success: Updates local state optimistically (lines 204-214)
5. Refreshes comments list (line 220)

### 3. Reply API Route

**Location:** `app/api/social/instagram/comments/reply/route.ts`

**Flow:**
1. Validates request body (lines 39-46)
2. Authenticates user (lines 48-59)
3. Verifies location ownership (lines 62-74)
4. Verifies comment exists (lines 77-89)
5. Creates InstagramAPI client (lines 92-110)
6. Calls `api.replyToComment(commentId, text)` (line 115)
7. Updates database to mark comment as replied (lines 149-164)
8. Returns success response (lines 166-170)

### 4. Instagram API Reply Method

**Location:** `lib/instagram/api.ts` (likely around line 405+)

**Method:** `replyToComment(commentId: string, text: string)`  
**Endpoint:** `POST /{commentId}/replies`  
**Payload:** `{ message: text }`

---

## Summary of Issues

### 1. "@unknown" Username
- **Root Cause:** Instagram API doesn't always return `from` field for replies
- **Current Handling:** Falls back to `'unknown'` when username can't be resolved
- **Location:** API route transformation (lines 624, 698) and UI fallback (line 406)

### 2. "Post" Placeholder
- **Root Cause:** Media thumbnail not available (sync failed, NULL in DB, or join failed)
- **Current Handling:** Shows gray placeholder with "Post" text
- **Location:** UI component (lines 357-359)

### 3. Date Formatting
- **Current:** Uses browser default (`toLocaleDateString()`)
- **Format:** `1/1/2026` (US locale) or locale-specific format
- **Location:** UI component (lines 371, 409, 429)

### 4. Reply Functionality
- **Status:** ✅ Fully implemented
- **Flow:** UI → API route → Instagram Graph API → Database update
- **Error Handling:** Comprehensive with user-friendly messages

---

## Recommendations

1. **Username Resolution:**
   - Consider showing "Anonymous" or "Private Account" instead of "unknown"
   - Add logging when `from` field is missing to track frequency
   - Consider extracting username from reply text mentions as hint (currently commented out, line 340-345)

2. **Media Thumbnail:**
   - Add retry logic for failed media syncs
   - Show loading skeleton instead of "Post" placeholder
   - Add error state with retry button

3. **Date Formatting:**
   - Use consistent date format across app
   - Consider relative dates ("2 days ago") for recent comments
   - Add time component for same-day comments

4. **Code Cleanup:**
   - Remove redundant `'unknown'` fallback in UI (line 406) since API already handles it
   - Consolidate username resolution logic into shared utility function

