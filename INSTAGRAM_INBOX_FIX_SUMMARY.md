# Instagram Inbox Fix Summary

## Critical Bugs Fixed

### 1. Webhook Handler Participant Selection (FIXED)

**File**: `lib/instagram/webhook-handler.ts`

**Problem**: 
- Line 113: `sender.id === igAccountId` comparison was always false
- `sender.id` is an IGSID, `igAccountId` is a business account ID (different types)
- Result: Always picked `sender.id` as participant, causing outbound messages to store business account IGSID as participant

**Fix**:
- Added business account IGSID lookup from cache
- Properly identifies self vs other using IGSID comparison
- Added guard to prevent storing selfId as participant_igsid

### 2. Sync Participant Selection (ALREADY FIXED)

**File**: `lib/instagram/inbox-sync.ts`

- Previously fixed to use `selfId` detection
- Added diagnostic logging to verify identity resolution

### 3. Diagnostic Logging Added

**Files**: `lib/instagram/inbox-sync.ts`, `lib/instagram/webhook-handler.ts`

- Logs `GET /me` response to verify identity
- Logs participants and messages for each conversation
- Logs participant selection decisions

### 4. Send Message Error Handling (ALREADY FIXED)

**File**: `app/api/social/instagram/messages/send/route.ts`

- Returns full Graph API error (code, subcode, fbtrace_id)
- Validates recipient !== selfId before sending

## Next Steps

1. **Run SQL Diagnostic Queries** (from `INSTAGRAM_INBOX_DEBUG_REPORT.md`)
   - Check for existing bad data (participant_igsid = business account ID)
   - Identify conversations that need fixing

2. **Test the Fixes**:
   - Trigger a webhook (send a test message to the Instagram account)
   - Run inbox sync
   - Verify conversations show correct participants
   - Try sending a message and verify error details if it fails

3. **Data Migration (if needed)**:
   - If SQL queries show bad data, create migration to fix existing conversations
   - Update `participant_igsid` for conversations where it equals business account ID

## SQL Migration (if needed)

```sql
-- Fix conversations where participant_igsid equals business account ID
-- This should be rare after the fix, but may exist from before

-- First, identify the problematic conversations
SELECT 
  c.id,
  c.ig_account_id,
  c.participant_igsid,
  ic.instagram_username as business_username,
  COUNT(m.id) as message_count
FROM instagram_conversations c
JOIN instagram_connections ic ON ic.instagram_user_id = c.ig_account_id
LEFT JOIN instagram_messages m ON m.conversation_id = c.id
WHERE c.participant_igsid = c.ig_account_id
   OR EXISTS (
     SELECT 1 FROM instagram_user_cache u
     WHERE u.ig_account_id = c.ig_account_id
       AND u.ig_user_id = c.participant_igsid
       AND u.username = ic.instagram_username
   )
GROUP BY c.id, c.ig_account_id, c.participant_igsid, ic.instagram_username;

-- If conversations need fixing, we'll need to:
-- 1. Fetch conversation details from API to get correct participant
-- 2. Update participant_igsid
-- (This requires API access, so should be done via a script, not pure SQL)
```

## Testing Checklist

- [ ] Run SQL diagnostic queries
- [ ] Check server logs for diagnostic output during sync
- [ ] Verify conversations show correct usernames (not "user_864191")
- [ ] Verify selecting a conversation shows only its messages (no merging)
- [ ] Test sending a message - should work or show detailed error
- [ ] Check webhook logs to verify participant selection is correct

