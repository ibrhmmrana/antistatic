# Instagram Inbox ID Model Fix

## Overview
Fixed the root cause of the broken Instagram DM inbox: **ID model mismatch**. The system was comparing `igAccountId` (professional account ID like `333...`) against message participant IDs like `1784...` (scoped IDs), which are different types of IDs.

## Root Cause
- **Symptom**: Conversations showed `user_******` instead of usernames/profile pics
- **Symptom**: Logs showed "MULTI-SENDER DETECTED" for single `conversation_id`
- **Root Cause**: Wrong "self" comparisons using `igAccountId` (professional account ID) instead of `self_scoped_id` (scoped participant ID)
- **Root Cause**: Dangerous unique index `UNIQUE(ig_account_id, participant_igsid)` causing conversation merging

## Solution
Implemented a comprehensive fix that:
1. Stores `self_scoped_id` (the scoped participant ID that represents our own account)
2. Uses `self_scoped_id` for direction logic (not `ig_account_id`)
3. Treats conversation `id` as canonical (not participant-based)
4. Handles group chats properly
5. Caches participant identities reliably

## Changes Made

### 1. Database Migration (`migrations/fix_instagram_inbox_id_model.sql`)

**Added `self_scoped_id` column:**
```sql
ALTER TABLE public.instagram_connections
ADD COLUMN IF NOT EXISTS self_scoped_id TEXT;
```

**Dropped dangerous unique index:**
```sql
DROP INDEX IF EXISTS public.idx_instagram_conversations_unique;
```

**Added group chat support:**
```sql
ALTER TABLE public.instagram_conversations
ADD COLUMN IF NOT EXISTS is_group BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS participant_count INTEGER;

ALTER TABLE public.instagram_conversations
ALTER COLUMN participant_igsid DROP NOT NULL;
```

**Ensured cache uniqueness:**
- Kept unique index on `(ig_account_id, ig_user_id)`
- Ensured `ig_account_id` is NOT NULL

### 2. Sync Logic (`lib/instagram/inbox-sync.ts`)

**A. Discover and persist `self_scoped_id`:**
- Added `discoverAndPersistSelfScopedId()` helper function
- Finds participant where `participant.username === instagram_connections.instagram_username`
- Stores that participant's `id` as `self_scoped_id` in `instagram_connections`
- Called during sync when processing conversations

**B. Direction logic uses `self_scoped_id`:**
- Changed from: `message.from.id === igAccountId` (WRONG)
- Changed to: `message.from.id === selfScopedId` (CORRECT)
- Outbound if `from_id === self_scoped_id`, inbound otherwise

**C. Participant selection excludes `self_scoped_id`:**
- For 1:1 chats: Find participant where `id !== self_scoped_id`
- For group chats: Set `participant_igsid = GROUP:<conversation_id>` (synthetic value)
- Set `is_group = true` and `participant_count = N` for group chats
- Never store `self_scoped_id` as `participant_igsid`

**D. Upserts conflict on `id` only:**
- Changed from: `onConflict: 'ig_account_id,participant_igsid'` (DANGEROUS)
- Changed to: `onConflict: 'id'` (SAFE)
- Conversation `id` from API is the canonical identifier

**E. Identity caching:**
- Captures participant identity from API response during sync
- Upserts into `instagram_user_cache` with `ig_account_id` always set
- Never caches identity for `self_scoped_id` as a participant

### 3. Webhook Handler (`lib/instagram/webhook-handler.ts`)

**Updated to use `self_scoped_id`:**
- Loads `self_scoped_id` from `instagram_connections`
- Uses `self_scoped_id` for direction determination (not `ig_account_id`)
- Ensures conversation upsert conflicts on `id` only
- Includes `is_group` and `participant_count` in upserts

### 4. Inbox API Route (`app/api/social/instagram/inbox/route.ts`)

**Group chat support:**
- Includes `is_group` and `participant_count` in conversation select
- For group chats: Shows "Group chat (N)" as display name
- For group chats: Uses sender identities for avatars in thread (not single participant)
- For 1:1 chats: Shows participant username/avatar from cache

## Testing / Debugging

**Debug logging (enabled with `DEBUG_INSTAGRAM_INBOX=true`):**
- Logs `ig_account_id`, `instagram_username`, `self_scoped_id`
- Logs participant IDs list, chosen participant, `is_group` for each conversation
- Logs `from.id` and direction decision for sample messages

**Verification steps:**
1. Run migration: `migrations/fix_instagram_inbox_id_model.sql`
2. Truncate canonical tables:
   ```sql
   TRUNCATE TABLE instagram_messages, instagram_conversations, instagram_user_cache;
   ```
3. Resync inbox
4. Verify:
   - Conversations show real usernames (not `user_******`)
   - No "multi-sender" warnings unless it's truly a group chat
   - Outbound messages appear as "You", inbound as the other user
   - Group chats show "Group chat (N)" label

## Files Changed

1. `migrations/fix_instagram_inbox_id_model.sql` - New migration
2. `lib/instagram/inbox-sync.ts` - Complete rewrite of sync logic
3. `lib/instagram/webhook-handler.ts` - Updated to use `self_scoped_id`
4. `app/api/social/instagram/inbox/route.ts` - Added group chat support

## Key Improvements

1. **Correct ID Model**: Uses `self_scoped_id` (scoped participant ID) instead of `ig_account_id` (professional account ID)
2. **No More Merging**: Conversations are uniquely identified by `id` only, not by participant
3. **Group Chat Support**: Properly handles group chats without collapsing to single participant
4. **Reliable Identity**: Participant identities are cached with `ig_account_id` always set
5. **Better Debugging**: Comprehensive logging for troubleshooting

## Next Steps

1. **Run Migration**: Execute `migrations/fix_instagram_inbox_id_model.sql` in Supabase
2. **Truncate Tables**: Clean slate for testing
3. **Resync**: Run inbox sync to repopulate with correct data
4. **Verify**: Check that all issues are resolved

All code is linter-clean and type-safe.

