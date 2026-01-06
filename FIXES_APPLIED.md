# Instagram Conversation Merge Fix - Files Changed

## Summary

All conversation upserts now use **API conversation ID as primary key only**. Participant-based lookups have been removed to prevent merging.

---

## Files Changed

### 1. `lib/instagram/inbox-sync.ts`

**Lines Changed**: ~772-858

**Before**:
```typescript
// Looked up by participant (CAUSED MERGING)
const { data: existingConv } = await (supabase
  .from('instagram_conversations') as any)
  .select('id')
  .eq('ig_account_id', conv.ig_account_id)
  .eq('participant_igsid', conv.participant_igsid)
  .maybeSingle()

if (existingConv) {
  finalConversationId = existingConv.id // Used existing ID, causing merge
  conv.id = existingConv.id
}
```

**After**:
```typescript
// Direct upsert using API conversation ID only
const { error: convError } = await (supabase
  .from('instagram_conversations') as any)
  .upsert({
    id: conv.id, // API conversation/thread ID - this is the primary key
    ig_account_id: conv.ig_account_id,
    participant_igsid: conv.participant_igsid, // Metadata only, not used for uniqueness
    updated_time: conv.updated_time,
    last_message_at: conv.last_message_at,
    last_message_preview: conv.last_message_preview,
    unread_count: 0,
  }, {
    onConflict: 'id', // ONLY conflict on id, never on participant
  })

const finalConversationId = conv.id // Always use the API conversation ID
```

**Multi-Sender Diagnostic** (lines ~850-863):
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

**Message Guard** (lines ~866-873):
```typescript
// CRITICAL: conversation_id must be the API conversation ID
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

**Lines Changed**: ~31-125 (function renamed and refactored), ~130-260 (handler updated)

**Before**:
```typescript
async function findOrCreateConversation(
  supabase: any,
  igAccountId: string,
  participantIgsid: string
): Promise<string | null> {
  // Looked up by participant
  const { data: existing } = await (supabase
    .from('instagram_conversations') as any)
    .select('id')
    .eq('ig_account_id', igAccountId)
    .eq('participant_igsid', participantIgsid)
    .maybeSingle()

  if (existing) {
    return existing.id // Returned existing ID, causing merge
  }

  // Generated fake ID
  const conversationId = `conv_${igAccountId}_${participantIgsid}`
  // ...
}
```

**After**:
```typescript
async function getOrCreateConversationFromEvent(
  supabase: any,
  igAccountId: string,
  participantIgsid: string,
  conversationIdFromEvent: string | null,
  accessToken: string | null = null
): Promise<string | null> {
  // Priority 1: Use conversation ID from webhook event
  if (conversationIdFromEvent && conversationIdFromEvent.trim() !== '') {
    await (supabase
      .from('instagram_conversations') as any)
      .upsert({
        id: conversationIdFromEvent, // API conversation ID - primary key
        // ...
      }, {
        onConflict: 'id', // ONLY conflict on id
      })
    return conversationIdFromEvent
  }

  // Priority 2: Fetch from API (if access token available)
  if (accessToken && participantIgsid) {
    // Fetch from /me/conversations?user_id={participantIgsid}
    // Use API conversation ID
  }

  // If neither available, return null (no fake IDs)
  return null
}
```

**Handler Update** (lines ~223-260):
```typescript
// Extract conversation ID from event
const conversationIdFromEvent = event.conversation?.id || 
                                 event.thread?.id || 
                                 (event as any).conversation_id ||
                                 (event as any).thread_id ||
                                 null

const conversationId = await getOrCreateConversationFromEvent(
  supabase, 
  igAccountId, 
  participantIgsid,
  conversationIdFromEvent,
  accessToken
)

// Guard before message insert
if (!conversationId || conversationId.trim() === '') {
  console.error('[Instagram Webhook] Cannot insert message - conversation_id is missing')
  return
}
```

---

### 3. `app/api/social/instagram/messages/send/route.ts`

**Lines Changed**: ~148-194

**Before**:
```typescript
// Looked up by participant first
const { data: existingConv } = await (supabase
  .from('instagram_conversations') as any)
  .select('id, participant_igsid')
  .eq('ig_account_id', igAccountId)
  .eq('participant_igsid', recipientIgsid)
  .maybeSingle()

if (existingConv) {
  finalConversationId = existingConv.id // Used existing, could be wrong
}
```

**After**:
```typescript
// Always fetch from API to get real conversation ID
const convUrl = `https://graph.instagram.com/v24.0/me/conversations?platform=instagram&user_id=${recipientIgsid}&access_token=${accessToken}`
const convResponse = await fetch(convUrl)
if (convResponse.ok) {
  const convData = await convResponse.json()
  if (convData.data && convData.data.length > 0) {
    const apiConversation = convData.data[0]
    finalConversationId = apiConversation.id
    
    // Upsert using API conversation ID
    await (supabase
      .from('instagram_conversations') as any)
      .upsert({
        id: apiConversation.id, // API conversation ID - primary key
        // ...
      }, { 
        onConflict: 'id', // ONLY conflict on id
      })
  }
}
```

---

### 4. `app/api/webhooks/meta/instagram/route.ts`

**Lines Changed**: ~715-730

**Before**:
```typescript
await handleWebhookMessage(business_location_id, igAccountId, event)
```

**After**:
```typescript
// Get access token for API fallback if conversation ID not in event
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

## Key Changes Summary

1. ✅ **All upserts use `onConflict: 'id'` only** (never on participant)
2. ✅ **Removed all participant-based lookups** that could cause merging
3. ✅ **Added multi-sender diagnostic** to detect data corruption
4. ✅ **Added guards** to ensure conversation_id is never empty
5. ✅ **Webhook handler** no longer generates fake IDs
6. ✅ **Send route** always fetches from API to get real conversation ID

---

## Testing Checklist

- [ ] Run inbox sync - check logs for multi-sender warnings
- [ ] Verify conversations use API conversation IDs
- [ ] Test sending message - should fetch conversation ID from API
- [ ] Trigger webhook - verify it uses conversation ID from event or API
- [ ] Check database - no conversations should have same participant_igsid but different id

---

## Critical Notes

- **DO NOT resync** until this is deployed and verified
- **Existing bad data** may need cleanup (see SQL queries in debug report)
- **Webhook events** may not always include conversation ID - API fallback handles this
- **If API lookup fails**, message is skipped (no fake IDs generated)

