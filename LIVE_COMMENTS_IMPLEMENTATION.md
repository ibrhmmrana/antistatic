# Live Comments with Infinite Scroll - Implementation Summary

## Overview
Implemented live Instagram comments feed with infinite scroll, removing Supabase storage for media/comments. All data is now fetched directly from Instagram Graph API on-demand.

## Files Changed

### 1. `lib/instagram/api.ts`
**Added:** `listMediaWithCommentsPage()` method
- Uses field expansion to fetch media with nested comments and replies in a single API call
- Parameters: `limitMedia`, `limitComments`, `limitReplies`, `after` (cursor)
- Returns: `{ media: [...], paging: { after: string | null } }`
- Handles missing/null fields defensively

### 2. `app/api/social-studio/instagram/comments/route.ts`
**Completely rewritten:**
- **Removed:** All DB sync logic (no inserts/updates to `instagram_media` or `instagram_comments`)
- **Removed:** All references to Supabase tables for media/comments
- **Added:** Live API call using `listMediaWithCommentsPage()`
- **Added:** Query params: `after`, `limitMedia` (default 12), `limitComments` (default 20), `limitReplies` (default 20)
- **Added:** Response transformation to new DTO format
- **Kept:** Auth checks, location validation, permission checks
- **Kept:** Connection loading from `instagram_connections` table

**New Response Shape:**
```typescript
{
  media: Array<{
    mediaId: string
    caption?: string
    permalink?: string
    timestamp: string
    mediaThumbnail?: string  // thumbnail_url || media_url || undefined
    comments: Array<{
      id: string
      text: string
      timestamp: string
      from: { id: string | null, username: string | null } | null
      replies: Array<{
        id: string
        text: string
        timestamp: string
        from: { id: string | null, username: string | null } | null
      }>
    }>
  }>,
  paging: {
    after: string | null
  }
}
```

### 3. `components/social-studio/tabs/CommentsTab.tsx`
**Completely refactored:**
- **Changed:** State from `comments: Comment[]` to `mediaFeed: MediaItem[]`
- **Added:** Infinite scroll state: `pagingAfter`, `hasMore`, `loadingInitial`, `loadingMore`
- **Added:** `fetchMediaPage()` function with `reset` and `after` parameters
- **Added:** IntersectionObserver for infinite scroll (sentinel div at bottom)
- **Added:** Deduplication logic when appending new media (by `mediaId`)
- **Changed:** UI to show media cards with nested comments/replies
- **Changed:** Author display: shows `@private` if username is missing/null
- **Changed:** Reply flow: refreshes first page after successful reply
- **Kept:** Reply drawer, permission checks, connection checks

**New UI Structure:**
- Media card → thumbnail, caption snippet, permalink, timestamp
- Comments list under each media card
- Replies nested under comments
- Infinite scroll sentinel at bottom with loading indicator

### 4. `app/api/social/instagram/comments/reply/route.ts`
**No changes needed** - still works with live mode

## How Infinite Scroll Works

1. **Initial Load:**
   - On mount, `fetchMediaPage({ reset: true })` is called
   - Fetches first 12 media items with comments/replies
   - Sets `pagingAfter` from response
   - Sets `hasMore` based on whether `paging.after` exists

2. **Scroll Detection:**
   - IntersectionObserver watches a sentinel `<div>` at the bottom
   - When sentinel enters viewport AND `hasMore && !loadingMore && !loadingInitial`:
     - Calls `fetchMediaPage({ reset: false, after: pagingAfter })`
     - Appends new media to feed (with deduplication)
     - Updates `pagingAfter` and `hasMore`

3. **Deduplication:**
   - When appending, filters out media items that already exist (by `mediaId`)
   - Prevents duplicates if API returns overlapping results

4. **Loading States:**
   - `loadingInitial`: Shows spinner on first load
   - `loadingMore`: Shows "Loading more posts..." at sentinel
   - `hasMore`: Controls whether to show "No more posts" message

## Key Features

✅ **Live Data:** All data fetched directly from Instagram Graph API  
✅ **Infinite Scroll:** Automatically loads older posts as user scrolls  
✅ **No DB Storage:** Media/comments no longer stored in Supabase  
✅ **Reply Support:** Reply functionality works with live data  
✅ **Author Display:** Shows `@private` for missing usernames, `You` for connected account  
✅ **Error Handling:** Graceful fallbacks for missing data  
✅ **Performance:** Single API call per page (field expansion)  

## Testing Checklist

- [ ] Visiting `/social-studio?tab=comments` loads live feed
- [ ] Media cards show thumbnails, captions, permalinks
- [ ] Comments and replies display correctly
- [ ] Infinite scroll loads more posts when scrolling down
- [ ] Reply button opens drawer and sends reply
- [ ] After replying, feed refreshes to show new reply
- [ ] Missing usernames show as `@private`
- [ ] Connected account comments show as `You`
- [ ] Loading states display correctly
- [ ] "No more posts" message shows when all loaded

## Notes

- **DB Tables:** `instagram_media` and `instagram_comments` tables are NOT deleted (left for potential future use or migration)
- **Caching:** No server-side caching implemented (can be added later if needed)
- **Rate Limiting:** Instagram API rate limits apply (handled by API client)
- **Error Recovery:** If API fails, user sees error toast but page doesn't crash

