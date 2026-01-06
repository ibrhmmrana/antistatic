# Instagram Identity Caching Implementation

## Overview
Implemented a robust identity caching system for Instagram inbox participants to fix the issue where all participants showed as `user_******` because `instagram_user_cache` rows had `ig_account_id = null` and `username = null`.

## Changes Made

### 1. Identity Capture from API Response (`lib/instagram/inbox-sync.ts`)

**New Helper Function: `upsertParticipantIdentityFromApi`**
- Captures participant identity directly from the Conversations API response
- Always sets `ig_account_id` (NOT NULL)
- Upserts into `instagram_user_cache` with:
  - `ig_account_id` (ALWAYS set)
  - `ig_user_id` (participant IGSID)
  - `username` (from API)
  - `name` (from API, if provided)
  - `profile_pic` (from API, preferred field name)
  - `profile_pic_url` (also set for backward compatibility)
  - `last_fetched_at` (current timestamp)

**Guards Implemented:**
- Never stores `selfId` as participant identity (logs warning and skips)
- Always requires `ig_account_id` (logs error and skips if missing)
- Logs raw participant object when username is missing (for debugging)

**Updated API Fields:**
- Added `name` field to participants query: `participants{username,id,profile_pic,name}`
- Updated return type to include `name?: string`

**Identity Caching During Sync:**
- After identifying the participant, captures their identity from the API response
- Calls `upsertParticipantIdentityFromApi` with participant data from `conversationDetail.participants`
- Non-blocking: errors are logged but don't stop sync

### 2. Refresh Identities Endpoint (`app/api/social/instagram/inbox/refresh-identities/route.ts`)

**New API Route: `POST /api/social/instagram/inbox/refresh-identities?locationId={id}`**

**Functionality:**
- Collects all distinct participant IDs from:
  - `instagram_conversations.participant_igsid` (excluding NULL and UNKNOWN_*)
  - Recent `instagram_messages.from_id` and `to_id` (last 30 days)
- Excludes self (business account IGSID and `igAccountId`)
- Refetches identities via `resolveMessagingUserProfile` for each participant
- Returns summary: `{ refreshed, failed, total, errors }`

**Use Cases:**
- Manual refresh of all participant identities
- Recovery from corrupted cache data
- Bulk update after fixing cache issues

### 3. Database Migration (`migrations/fix_instagram_user_cache.sql`)

**Migration Steps:**
1. **Delete invalid cache rows**: Removes all rows where `ig_account_id IS NULL`
2. **Add unique index**: Creates `instagram_user_cache_ig_account_id_ig_user_id_unique` on `(ig_account_id, ig_user_id)`
   - Prevents cross-account overwrites
   - Ensures cache entries are properly scoped per account
3. **Add NOT NULL constraint**: Sets `ig_account_id` to NOT NULL to prevent future invalid entries

**Verification Queries:**
```sql
-- Check total rows
SELECT COUNT(*) as total_rows FROM instagram_user_cache;

-- Verify no NULL ig_account_id
SELECT COUNT(*) as null_ig_account_id FROM instagram_user_cache WHERE ig_account_id IS NULL;

-- Verify unique index (should equal total_rows)
SELECT COUNT(*) as unique_pairs FROM (
  SELECT DISTINCT ig_account_id, ig_user_id FROM instagram_user_cache
) t;
```

### 4. Webhook Handler (`lib/instagram/webhook-handler.ts`)

**Already Implemented:**
- Webhook handler already calls `resolveMessagingUserProfile` for inbound messages
- This function properly sets `ig_account_id` when upserting to cache
- No changes needed (already correct)

## Data Flow

### During Sync:
1. Fetch conversation detail with participants from API
2. Identify participant (the "other" user, not self)
3. **NEW**: Capture participant identity from API response (`username`, `name`, `profile_pic`)
4. **NEW**: Upsert into `instagram_user_cache` with `ig_account_id` always set
5. Continue with conversation/message upserts

### During Webhook:
1. Receive webhook event
2. Identify participant (sender or recipient, excluding self)
3. Call `resolveMessagingUserProfile` (makes API call to fetch profile)
4. Function upserts into cache with `ig_account_id` set

### During Refresh:
1. Collect all participant IDs from conversations and messages
2. Exclude self
3. For each participant, call `resolveMessagingUserProfile`
4. Function upserts into cache with `ig_account_id` set

## Next Steps

1. **Run Migration**: Execute `migrations/fix_instagram_user_cache.sql` in Supabase
2. **TRUNCATE Canonical Tables**: As requested, truncate `instagram_conversations` and `instagram_messages`
3. **Run Clean Resync**: Trigger sync to repopulate with correct identity data
4. **Verify**: Check that participants now show usernames instead of `user_******`

## Files Changed

1. `lib/instagram/inbox-sync.ts`
   - Added `upsertParticipantIdentityFromApi` helper function
   - Updated `fetchConversationDetail` to include `name` field
   - Added identity caching after participant identification
   - Added guards and logging

2. `app/api/social/instagram/inbox/refresh-identities/route.ts`
   - New file: Refresh identities endpoint

3. `migrations/fix_instagram_user_cache.sql`
   - New file: Database migration for cache cleanup and unique index

## Testing

After running the migration and resync:
- Verify participants show usernames in the inbox UI
- Check `instagram_user_cache` table: all rows should have `ig_account_id` set
- Test refresh endpoint: `POST /api/social/instagram/inbox/refresh-identities?locationId={id}`
- Verify no duplicate cache entries (unique index should prevent this)

