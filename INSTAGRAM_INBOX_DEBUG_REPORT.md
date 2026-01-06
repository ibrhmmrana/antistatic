# Instagram Inbox Debug Report

## Step 1: Database Reality Map

### Tables Found in Codebase

| Table Name | What Writes | What Reads | API Route | Used by Social Studio? |
|------------|------------|------------|-----------|------------------------|
| `instagram_conversations` | `lib/instagram/inbox-sync.ts`, `lib/instagram/webhook-handler.ts` | `app/api/social/instagram/inbox/route.ts` | `/api/social/instagram/inbox` | ✅ YES (PRIMARY) |
| `instagram_messages` | `lib/instagram/inbox-sync.ts`, `lib/instagram/webhook-handler.ts`, `app/api/social/instagram/messages/send/route.ts` | `app/api/social/instagram/inbox/route.ts` | `/api/social/instagram/inbox` | ✅ YES (PRIMARY) |
| `instagram_user_cache` | `lib/instagram/messaging-user-profile.ts`, `lib/instagram/resolve-user.ts` | `app/api/social/instagram/inbox/route.ts` | `/api/social/instagram/inbox` | ✅ YES |
| `instagram_dm_events` | `app/api/webhooks/meta/instagram/route.ts` (legacy) | None found | N/A | ❌ NO (legacy) |
| `instagram_dm_conversations` | Migration exists | None found | N/A | ❌ NO (unused) |
| `instagram_dm_messages` | Migration exists | None found | N/A | ❌ NO (unused) |
| `instagram_threads` | Migration exists | None found | N/A | ❌ NO (unused) |
| `instagram_dm_unmatched_events` | `app/api/webhooks/meta/instagram/route.ts` | None found | N/A | ❌ NO (debug only) |

### Conclusion
**CANONICAL SYSTEM**: `instagram_conversations` + `instagram_messages` (from `create_instagram_inbox_schema.sql`)
- These are the ONLY tables used by Social Studio Inbox
- Legacy `instagram_dm_*` tables exist but are NOT used by the inbox UI

---

## Step 2: SQL Diagnostic Queries

Run these in Supabase SQL Editor:

```sql
-- 1. List all Instagram-related tables
SELECT table_name, 
       (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name ILIKE 'instagram%'
ORDER BY table_name;

-- 2. Check row counts for active tables
SELECT 'instagram_conversations' as table_name, COUNT(*) as row_count FROM instagram_conversations
UNION ALL
SELECT 'instagram_messages', COUNT(*) FROM instagram_messages
UNION ALL
SELECT 'instagram_user_cache', COUNT(*) FROM instagram_user_cache
UNION ALL
SELECT 'instagram_dm_events', COUNT(*) FROM instagram_dm_events
UNION ALL
SELECT 'instagram_dm_conversations', COUNT(*) FROM instagram_dm_conversations
UNION ALL
SELECT 'instagram_dm_messages', COUNT(*) FROM instagram_dm_messages;

-- 3. Inspect recent conversations (CANONICAL)
SELECT 
  id as conversation_id,
  ig_account_id,
  participant_igsid,
  last_message_preview,
  last_message_at,
  updated_time,
  unread_count
FROM public.instagram_conversations
ORDER BY updated_time DESC NULLS LAST
LIMIT 20;

-- 4. Inspect recent messages (CANONICAL)
SELECT 
  id as message_id,
  conversation_id,
  direction,
  from_id,
  to_id,
  LEFT(text, 80) as text_preview,
  created_time
FROM public.instagram_messages
ORDER BY created_time DESC NULLS LAST
LIMIT 50;

-- 5. Detect "participant collapse" - are many convs stored under the same participant_igsid?
SELECT 
  participant_igsid, 
  COUNT(*) as conv_count,
  STRING_AGG(id, ', ' ORDER BY last_message_at DESC) as conversation_ids
FROM public.instagram_conversations
GROUP BY participant_igsid
ORDER BY conv_count DESC
LIMIT 20;

-- 6. Check if participant_igsid equals our own business account (BUG DETECTION)
SELECT 
  c.id as conversation_id,
  c.ig_account_id,
  c.participant_igsid,
  u.username as participant_username,
  ic.instagram_username as business_account_username,
  CASE 
    WHEN c.participant_igsid = c.ig_account_id THEN 'BUG: participant = ig_account_id'
    WHEN u.username = ic.instagram_username THEN 'BUG: participant username = business username'
    ELSE 'OK'
  END as status,
  c.last_message_preview,
  c.last_message_at
FROM public.instagram_conversations c
LEFT JOIN public.instagram_user_cache u
  ON u.ig_user_id = c.participant_igsid
 AND u.ig_account_id = c.ig_account_id
LEFT JOIN public.instagram_connections ic
  ON ic.instagram_user_id = c.ig_account_id
ORDER BY c.updated_time DESC NULLS LAST
LIMIT 50;

-- 7. Check message grouping by conversation_id (should be 1:many, not merged)
SELECT 
  conversation_id,
  COUNT(*) as message_count,
  COUNT(DISTINCT from_id) as distinct_senders,
  MIN(created_time) as first_message,
  MAX(created_time) as last_message
FROM public.instagram_messages
GROUP BY conversation_id
ORDER BY message_count DESC
LIMIT 20;

-- 8. Find conversations with messages from multiple different participants (MERGE DETECTION)
SELECT 
  c.id as conversation_id,
  c.participant_igsid as stored_participant,
  COUNT(DISTINCT m.from_id) as distinct_senders_in_messages,
  STRING_AGG(DISTINCT m.from_id, ', ') as all_sender_ids
FROM public.instagram_conversations c
JOIN public.instagram_messages m ON m.conversation_id = c.id
WHERE m.direction = 'inbound'
GROUP BY c.id, c.participant_igsid
HAVING COUNT(DISTINCT m.from_id) > 1
ORDER BY distinct_senders_in_messages DESC;
```

---

## Step 3: UI Flow Analysis

### Component Hierarchy
1. **Social Studio → Inbox Tab**: `components/social-studio/tabs/InboxTab.tsx`
   - Renders: `components/social/instagram/inbox.tsx` (reused from `/social`)

2. **API Route**: `app/api/social/instagram/inbox/route.ts`
   - Reads: `instagram_conversations`, `instagram_messages`, `instagram_user_cache`
   - Groups messages by: `conversation_id` ✅ (line 175-181)

3. **Message Filtering**: 
   - ✅ **CORRECT**: Messages filtered by `conversation_id` (line 164, 177)
   - ✅ **CORRECT**: UI selects conversation by `conversation.id` (line 431 in inbox.tsx)

### UI Grouping Key Analysis

**Code Location**: `components/social/instagram/inbox.tsx:431-472`

```typescript
const handleSelectConversation = async (conversationId: string) => {
  setSelectedConversationId(conversationId)  // ✅ Uses conversation.id
  
  const response = await fetch(`/api/social/instagram/inbox?locationId=${locationId}&conversationId=${conversationId}`)
  // ...
  setMessages(conversation.messages || [])  // ✅ Messages already filtered by conversation_id in API
}
```

**Verdict**: ✅ UI grouping is CORRECT - uses `conversation.id`, not `participant_igsid`

**BUT**: If `participant_igsid` is stored incorrectly (as self), multiple conversations will have the same `participant_igsid`, and the unique constraint `(ig_account_id, participant_igsid)` will cause conversations to be merged/overwritten.

---

## Step 4: Identity Model Verification Needed

### Critical Questions to Answer

1. **Does `instagram_connections.instagram_user_id` match `GET /me` response?**
   - Check: `app/api/integrations/instagram/callback/route.ts`
   - What ID is stored during OAuth?

2. **Does `GET /me` id appear in conversation participants?**
   - Participants are IGSIDs (Instagram-scoped user IDs)
   - `instagram_user_id` might be a different ID type (business account ID)

3. **Is `participant_igsid` being stored as self?**
   - Run SQL query #6 above to detect this

### Next Steps

1. Add diagnostic logging to `lib/instagram/inbox-sync.ts`:
   - Log `GET /me` response
   - Log participants list for each conversation
   - Log which participant is selected as "other"

2. Verify OAuth callback stores correct ID:
   - Check what `GET /me` returns during OAuth
   - Ensure `instagram_connections.instagram_user_id` = `GET /me.id`

---

## Step 5: Send Message Analysis

### Current Implementation
**File**: `app/api/social/instagram/messages/send/route.ts`

- ✅ Endpoint: `https://graph.instagram.com/v24.0/${igAccountId}/messages`
- ✅ Format: `application/x-www-form-urlencoded`
- ✅ Body: `recipient={id: "<IGSID>"}`, `message={text: "..."}`
- ✅ Access token: Query parameter

### Error Handling
- ❌ Currently returns generic error
- ✅ **FIXED**: Now returns full Graph error (code, subcode, fbtrace_id)

### Validation
- ✅ **FIXED**: Validates `recipientIgsid !== selfId` before sending

---

## Root Cause Analysis

### CRITICAL BUG #1: Webhook Handler Participant Selection (CONFIRMED)

**File**: `lib/instagram/webhook-handler.ts:113`

```typescript
const participantIgsid = sender.id === igAccountId ? recipient.id : sender.id
```

**Problem**:
- `sender.id` and `recipient.id` are **IGSIDs** (Instagram-scoped user IDs)
- `igAccountId` is the **business account ID** (different ID type)
- They will **NEVER match**, so the condition is always false
- Result: Always picks `sender.id` as participant
- **For outbound messages**: Stores business account's IGSID as `participant_igsid` ❌
- **For inbound messages**: Works correctly (picks sender.id which is the customer)

**Impact**: All outbound messages create conversations with `participant_igsid = business account IGSID`, causing conversations to merge under the same participant.

### CRITICAL BUG #2: Sync Participant Selection (PARTIALLY FIXED)

**File**: `lib/instagram/inbox-sync.ts` (already fixed in previous changes)

- Previously had similar logic issues
- Now uses `selfId` detection from cache
- But needs verification that `selfId` is correctly identified

### CRITICAL BUG #3: Identity Model Mismatch (NEEDS VERIFICATION)

**Question**: Does `instagram_connections.instagram_user_id` match `GET /me` response?

- OAuth callback stores `tokenData.user_id` as `instagram_user_id`
- This should be the business account ID used for API calls
- But participants in conversations are IGSIDs (different type)
- Need to verify: Does `GET /me` return the same ID as stored?

### Display Name Fallback

When cache lookup fails, shows `user_${participant_igsid.slice(-6)}`
- This explains "user_864191" in UI
- The `864191` is likely the last 6 digits of the business account ID (stored incorrectly as participant)

---

## Recommended Fixes

1. **Add diagnostic logging** to sync to verify identity resolution
2. **Verify OAuth callback** stores correct `instagram_user_id`
3. **Fix participant selection** to never select self (already fixed in previous changes)
4. **Add SQL migration** to fix existing bad data (if needed)

