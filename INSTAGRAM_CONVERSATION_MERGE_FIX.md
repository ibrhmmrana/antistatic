# Instagram Conversation Merge Fix - Summary

## Files Changed

### 1. `lib/instagram/inbox-sync.ts`

**Changes**:
- **Removed participant-based conversation lookup** (lines 772-802)
- **Changed upsert to use ONLY `onConflict: 'id'`** (never on participant)
- **Added multi-sender diagnostic check** during message processing
- **Added guard for missing conversation_id** in messages

**Key Diff**:
```typescript
// BEFORE: Looked up by (ig_account_id, participant_igsid) and merged conversations
const { data: existingConv } = await (supabase
  .from('instagram_conversations') as any)
  .select('id')
  .eq('ig_account_id', conv.ig_account_id)
  .eq('participant_igsid', conv.participant_igsid)
  .maybeSingle()

// AFTER: Direct upsert using API conversation ID only
const { error: convError } = await (supabase
  .from('instagram_conversations') as any)
  .upsert({
    id: conv.id, // API conversation/thread ID - this is the primary key
    ig_account_id: conv.ig_account_id,
    participant_igsid: conv.participant_igsid, // Metadata only, not used for uniqueness
    // ...
  }, {
    onConflict: 'id', // ONLY conflict on id, never on participant
  })
```

**Multi-Sender Diagnostic** (lines 850-863):
```typescript
// DIAGNOSTIC: Check for multi-sender conversations
const inboundSenders = new Set<string>()
for (const msg of conv.messages) {
  if (msg.direction === 'inbound' && msg.from_id) {
    inboundSenders.add(msg.from_id)
  }
}

if (inboundSenders.size > 1) {
  console.error('[Instagram Inbox Sync] ⚠️⚠️⚠️ MULTI-SENDER DETECTED ⚠️⚠️⚠️', {
    conversationId: conv.id,
    participantIgsid: conv.participant_igsid,
    inboundSenderIds: Array.from(inboundSenders),
    senderCount: inboundSenders.size,
    message: 'Multiple different senders found in same conversation_id - this should NEVER happen!',
  })
}
```

**Message Guard** (lines 866-873):
```typescript
// CRITICAL: conversation_id must be the API conversation ID, never a derived/generated ID
if (!msg.conversation_id || msg.conversation_id.trim() === '') {
  console.error('[Instagram Inbox Sync] Message missing conversation_id - skipping:', {
    messageId: msg.id,
    conversationId: conv.id,
  })
  errors.push(`Message ${msg.id} missing conversation_id`)
  continue
}
```

---

### 2. `lib/instagram/webhook-handler.ts`

**Changes**:
- **Renamed and refactored `findOrCreateConversation`** → `getOrCreateConversationFromEvent`
- **Removed participant-based lookup** - no longer generates fake IDs
- **Added API fallback** to fetch conversation ID if not in webhook event
- **Added guard for missing conversation_id** before message insert
- **Updated function signature** to accept optional access token

**Key Diff**:
```typescript
// BEFORE: Generated fake conversation ID based on participant
const conversationId = `conv_${igAccountId}_${participantIgsid}`

// AFTER: Only uses API conversation ID from event or API lookup
async function getOrCreateConversationFromEvent(
  supabase: any,
  igAccountId: string,
  participantIgsid: string,
  conversationIdFromEvent: string | null,
  accessToken: string | null = null
): Promise<string | null> {
  // Priority 1: Use conversation ID from webhook event
  if (conversationIdFromEvent && conversationIdFromEvent.trim() !== '') {
    // Upsert using API conversation ID
    // ...
  }
  
  // Priority 2: Try to fetch from API (if access token available)
  if (accessToken && participantIgsid) {
    // Fetch from /me/conversations?user_id={participantIgsid}
    // ...
  }
  
  // If neither available, return null (skip message - no fake IDs)
  return null
}
```

**Message Guard** (lines 220-228):
```typescript
// Insert message - conversation_id must be the API conversation ID
if (!conversationId || conversationId.trim() === '') {
  console.error('[Instagram Webhook] Cannot insert message - conversation_id is missing or empty', {
    messageId,
    conversationId,
  })
  return
}
```

---

### 3. `app/api/social/instagram/messages/send/route.ts`

**Changes**:
- **Removed participant-based conversation lookup**
- **Always fetches conversation ID from API** before sending
- **Uses `onConflict: 'id'` only** for conversation upsert

**Key Diff**:
```typescript
// BEFORE: Looked up conversation by participant, then fetched from API
const { data: existingConv } = await (supabase
  .from('instagram_conversations') as any)
  .select('id, participant_igsid')
  .eq('ig_account_id', igAccountId)
  .eq('participant_igsid', recipientIgsid)
  .maybeSingle()

// AFTER: Always fetches from API to get real conversation ID
// Try to fetch conversation from Instagram API using participant
const convUrl = `https://graph.instagram.com/v24.0/me/conversations?platform=instagram&user_id=${recipientIgsid}&access_token=${accessToken}`
// ... fetch and upsert with onConflict: 'id' only
```

---

### 4. `app/api/webhooks/meta/instagram/route.ts`

**Changes**:
- **Passes access token** to `handleWebhookMessage` for API fallback

**Key Diff**:
```typescript
// Get access token for API lookup if conversation ID not in event
let accessToken: string | null = null
try {
  const { data: connection } = await (supabase
    .from('instagram_connections') as any)
    .select('access_token')
    .eq('instagram_user_id', igAccountId)
    .maybeSingle()
  accessToken = connection?.access_token || null
} catch (tokenError: any) {
  console.warn('[Meta Webhook] Could not fetch access token for API lookup:', tokenError.message)
}

await handleWebhookMessage(business_location_id, igAccountId, event, accessToken)
```

---

## Summary of Fixes

### Step A: Fixed ALL conversation upserts ✅
- **inbox-sync.ts**: Uses API conversation ID, `onConflict: 'id'` only
- **webhook-handler.ts**: Uses API conversation ID from event or API lookup, `onConflict: 'id'` only
- **send route**: Fetches from API, uses `onConflict: 'id'` only
- **No participant-based lookups** remain

### Step B: Message inserts always use API conversation ID ✅
- **inbox-sync.ts**: Guard checks `conversation_id` is not empty before insert
- **webhook-handler.ts**: Guard checks `conversation_id` is not empty before insert
- Messages always use `conv.id` (API conversation ID)

### Step C: Multi-sender diagnostic ✅
- **inbox-sync.ts**: Collects distinct inbound `from_id` values per `conversation_id`
- Logs BIG warning if more than 1 inbound sender found
- Includes conversation ID and all sender IDs in log

### Step D: Participant_igsid is metadata only ✅
- All upserts use `onConflict: 'id'` (API conversation ID)
- `participant_igsid` is stored but never used for uniqueness
- Participant selection logic remains for display purposes

---

## Testing

After these changes:
1. **Run inbox sync** - check logs for multi-sender warnings
2. **Send a test message** - verify it uses API conversation ID
3. **Trigger webhook** - verify it uses conversation ID from event or API
4. **Check database** - verify no conversations have same `participant_igsid` but different `id`

---

## Critical Notes

- **DO NOT resync** until this is deployed and verified
- **Existing bad data** may need manual cleanup (run SQL queries from debug report)
- **Webhook events** may not always include conversation ID - API fallback handles this
- **If API lookup fails**, message is skipped (no fake IDs generated)

