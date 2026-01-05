# GBP Planner Implementation Plan

## Step 0 - Current State Analysis

### Current Implementation

1. **Sync Route** (`app/api/social-studio/sync/gbp-posts/route.ts`):
   - ✅ Calls GBP API to list local posts
   - ❌ **BUG**: Line 252 references `upsertError` which doesn't exist (dead code)
   - ❌ **MISSING**: No pagination handling (GBP API may return partial results)
   - ✅ Uses `gbp_local_post_name` as unique identifier for dedupe
   - ✅ Filters by date range (lookbackDays)

2. **PlannerTab** (`components/social-studio/tabs/PlannerTab.tsx`):
   - ✅ `fetchPosts()` fetches 6 months back, 12 months forward
   - ✅ Uses `post.id` (DB UUID) as FullCalendar event `id` (unique per row)
   - ✅ Events mapped from posts API response
   - ❌ Inspector Edit/Delete only update local DB, not Google

3. **Posts API** (`/api/social-studio/posts`):
   - ✅ Returns all posts for location (or filtered by date range)
   - ✅ Maps posts to FullCalendar events using `post.id` as event `id`
   - ✅ Uses `scheduled_at || published_at || created_at` for event date

4. **Database Schema**:
   - ✅ `gbp_local_post_name` (TEXT UNIQUE) - unique identifier from Google
   - ✅ `gbp_search_url` - Google search URL
   - ✅ `platform` - platform identifier
   - ✅ `published_at`, `scheduled_at` - timestamps
   - ✅ `platform_meta` - raw GBP payload

### Issues Identified

1. **Sync doesn't paginate** - GBP API may return posts in pages, we only fetch first page
2. **Sync has dead code bug** - line 252 references undefined `upsertError`
3. **Edit/Delete only work locally** - Inspector buttons don't update/delete on Google
4. **Multiple posts per day** - Need to verify dedupe logic works correctly

### Unique Identifiers

- **FullCalendar event `id`**: `post.id` (DB UUID) - ✅ Unique per row
- **GBP post dedupe key**: `gbp_local_post_name` - ✅ Already used in sync route

---

## Step 1 - Fix GBP Sync Route

### Changes Needed

1. **Add pagination handling**:
   - GBP API may return `nextPageToken` in response
   - Loop until `nextPageToken` is null/undefined
   - Accumulate all posts before processing

2. **Fix dead code bug**:
   - Remove lines 252-257 (references undefined `upsertError`)

3. **Add logging**:
   - Log total posts fetched from Google
   - Log posts upserted
   - Log any errors

### Implementation

File: `app/api/social-studio/sync/gbp-posts/route.ts`

---

## Step 2 - Ensure Calendar Shows All Posts

### Changes Needed

1. **Verify event mapping**:
   - Ensure each post gets unique event `id` (already using `post.id`)
   - Ensure `start` date uses correct timestamp priority

2. **Add datesSet-based refetch** (optional enhancement):
   - Currently fetches 6 months back, 12 forward on mount
   - Could refetch for visible range when month changes (but current approach is fine)

3. **Add logging**:
   - Log count of posts returned from API
   - Log count of events passed to FullCalendar

### Implementation

Files:
- `components/social-studio/tabs/PlannerTab.tsx` - Add logging to `fetchPosts()`
- `app/api/social-studio/posts/route.ts` - Add logging

---

## Step 3 - Add Edit GBP API Route

### New Route

`PATCH /api/social-studio/gbp/posts/[id]`

### Behavior

1. Load post by `id` from `social_studio_posts`
2. Verify:
   - User owns the business location
   - Post has `gbp_local_post_name` (is a GBP post)
   - Post is published (can't edit scheduled/draft GBP posts)
3. Get valid access token
4. Call GBP API:
   ```
   PATCH https://mybusiness.googleapis.com/v4/{gbp_local_post_name}
   Headers:
     Authorization: Bearer {token}
     Content-Type: application/json
   Body:
     {
       "summary": "updated caption",
       "updateMask": "summary"
     }
   ```
5. On success:
   - Update local DB row (`caption`, `updated_at`)
   - Return updated post

### Error Handling

- Token expired → return `{ needs_reauth: true }`
- Missing `gbp_local_post_name` → return `{ error: "Post not synced from Google" }`
- GBP API error → return error message

---

## Step 4 - Add Delete GBP API Route

### New Route

`DELETE /api/social-studio/gbp/posts/[id]`

### Behavior

1. Load post by `id` from `social_studio_posts`
2. Verify:
   - User owns the business location
   - Post has `gbp_local_post_name` (is a GBP post)
3. Get valid access token
4. Call GBP API:
   ```
   DELETE https://mybusiness.googleapis.com/v4/{gbp_local_post_name}
   Headers:
     Authorization: Bearer {token}
   ```
5. On success:
   - Option A: Delete row from DB
   - Option B: Set `status='deleted'` and filter out in queries (preferred for audit trail)
   - Return success

### Error Handling

- Token expired → return `{ needs_reauth: true }`
- Missing `gbp_local_post_name` → return `{ error: "Post not synced from Google" }`
- GBP API error → return error message

---

## Step 5 - Update Inspector UI

### Changes Needed

1. **Edit Button**:
   - For GBP published posts: Call `PATCH /api/social-studio/gbp/posts/[id]`
   - Show loading state
   - Handle `needs_reauth` error
   - Refresh calendar and inspector on success

2. **Delete Button**:
   - For GBP posts: Show confirm dialog
   - Call `DELETE /api/social-studio/gbp/posts/[id]`
   - Show loading state
   - Handle `needs_reauth` error
   - Clear inspector and refresh calendar on success

3. **UI Updates**:
   - Show "Edit on Google" vs "Edit Post" based on platform
   - Show "Delete on Google" vs "Delete Post" based on platform
   - Update warning message for GBP posts

### Implementation

File: `components/social-studio/tabs/PlannerTab.tsx`

---

## Step 6 - Add Debug Logging

### Logging Points

1. **Sync Route**:
   - Total posts from Google (before filtering)
   - Posts after date filtering
   - Posts upserted
   - Posts with errors

2. **Posts API**:
   - Total posts in DB for location
   - Posts after date filtering
   - Events created

3. **PlannerTab**:
   - Events received from API
   - Events passed to FullCalendar

---

## Implementation Order

1. ✅ Step 0: Document current state (DONE)
2. ⏳ Step 1: Fix sync route (pagination + bug fix)
3. ⏳ Step 2: Add logging to calendar
4. ⏳ Step 3: Add Edit GBP route
5. ⏳ Step 4: Add Delete GBP route
6. ⏳ Step 5: Update Inspector UI
7. ⏳ Step 6: Add debug logging


