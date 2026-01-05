# Connected Channels Data Audit Report
## For Social Studio → Create Tab Channel Selection

---

## A) Create Tab + Social Studio Entry Points

### Current Placeholder Source

**File:** `components/social-studio/tabs/CreateTab.tsx` (lines 89-121)

**Current Implementation:**
```typescript
// All available channels
const allChannels: ChannelOption[] = [
  {
    id: 'facebook',
    name: 'Facebook',
    iconPath: '/Facebook_f_logo_(2019).svg',
    connected: mockSocialAccounts.some(acc => acc.platform === 'facebook' && acc.status === 'connected'),
  },
  // ... similar for instagram, google_business, linkedin, tiktok
]
```

**Placeholder Data Source:**
- **Imported from:** `@/lib/social-studio/mock` (line 5)
- **Mock data:** `mockSocialAccounts` array (lines 109-134 in `lib/social-studio/mock.ts`)
- **Current logic:** Checks if any mock account matches platform and has `status === 'connected'`

**State Management:**
- `selectedChannels`: `Platform[]` (line 28)
- Initialized with connected channels via `useEffect` (lines 127-131)
- Uses `connectedChannels` memoized from `allChannels.filter(ch => ch.connected)`

### Entry Point Data Flow

**File:** `app/(app)/social-studio/page.tsx`
- Fetches: `businessLocationId` (primary location for user)
- Passes to: `<SocialStudioPage businessLocationId={businessLocation.id} />`

**File:** `components/social-studio/SocialStudioPage.tsx`
- Receives: `businessLocationId: string` as prop
- Passes to: `<CreateTab businessLocationId={businessLocationId} />` (line ~100)
- **No connection data is currently fetched or passed down**

**Available at Runtime in CreateTab:**
- ✅ `businessLocationId: string` (prop)
- ❌ User object (not passed, would need to fetch)
- ❌ Connection data (not fetched)

---

## B) Connection Storage + Existing Helpers

### Database Tables

#### 1. `connected_accounts` Table

**Schema:** `migrations/create_connected_accounts.sql`

**Columns:**
- `id` (UUID, PK)
- `user_id` (UUID, FK to auth.users)
- `business_location_id` (UUID, FK to business_locations)
- `provider` (TEXT) - **Key field for platform identification**
- `provider_account_id` (TEXT, nullable)
- `access_token` (TEXT, nullable)
- `refresh_token` (TEXT, nullable)
- `expires_at` (TIMESTAMPTZ, nullable)
- `scopes` (TEXT[], nullable)
- `display_name` (TEXT, nullable) - **For UI display**
- `avatar_url` (TEXT, nullable) - **For UI avatar**
- `status` (TEXT, default 'connected') - **Connection status**
- `created_at`, `updated_at`

**Unique Constraint:** `(business_location_id, provider)` - one connection per provider per location

**RLS:** Users can only access their own connections (via `user_id`)

**TypeScript Type:** `Database['public']['Tables']['connected_accounts']['Row']`

#### 2. `instagram_connections` Table (Separate Table)

**Schema:** `migrations/create_instagram_connections.sql`

**Columns:**
- `id` (UUID, PK)
- `business_location_id` (UUID, FK)
- `instagram_user_id` (TEXT)
- `instagram_username` (TEXT, nullable) - **For UI display**
- `access_token` (TEXT)
- `token_expires_at` (TIMESTAMPTZ, nullable)
- `scopes` (TEXT[])
- `created_at`, `updated_at`

**Unique Constraint:** `(business_location_id)` - one Instagram connection per location

**Note:** Instagram uses a separate table, NOT `connected_accounts`. This is a special case.

#### 3. `business_locations` Table (Username Fallbacks)

**Schema:** `lib/supabase/database.types.ts` (lines 35-62)

**Social Username Fields:**
- `instagram_username` (TEXT, nullable)
- `facebook_username` (TEXT, nullable)
- `linkedin_username` (TEXT, nullable)
- `x_username` (TEXT, nullable)
- `tiktok_username` (TEXT, nullable)

**Note:** These are just text fields for display, not OAuth connections. Used as fallback when no OAuth connection exists.

### Existing Helper Functions

**Found in codebase:**

1. **`lib/instagram/tokens.ts`**
   - `getInstagramAccessTokenForLocation(businessLocationId)` - fetches from `instagram_connections`
   - Returns: `{ access_token, ig_account_id }`

2. **`lib/instagram/api.ts`**
   - `InstagramAPI.loadConnection(businessLocationId)` - fetches from `instagram_connections`
   - Returns: `{ access_token, instagram_user_id, scopes }`

3. **`lib/gbp/client.ts`**
   - `findGBPConnectedAccount(supabase, businessLocationId, userId?)` - fetches from `connected_accounts`
   - Filters: `provider === 'google_gbp'` (or similar)
   - Returns: `ConnectedAccount | null`

4. **`lib/social-studio/ai/context.ts`** (lines 235-306)
   - Fetches `connected_accounts` for location
   - Fetches `instagram_connections` separately
   - Builds channels array with platform mapping
   - **This is the closest existing pattern to what we need!**

**No existing unified "get all connections" helper found.**

### Existing API Routes

**Found:**

1. **`/api/integrations/instagram/status`** (`app/api/integrations/instagram/status/route.ts`)
   - Returns: `{ connected: boolean, username?: string, instagram_user_id?: string, scopes?: string[] }`
   - Fetches from: `instagram_connections` table
   - Query param: `business_location_id`

2. **`/api/social/instagram/profile`** (`app/api/social/instagram/profile/route.ts`)
   - Returns Instagram profile data
   - Fetches from: `instagram_connections` + `instagram_sync_state`

**No existing API route that returns ALL connections for a location.**

---

## C) API Routes / Server Actions

### Current State

**No unified endpoint exists** that returns all connected channels for Social Studio Create tab.

**Existing patterns:**
- Instagram-specific: `/api/integrations/instagram/status`
- Individual platform checks scattered across codebase
- `lib/social-studio/ai/context.ts` has server-side logic that fetches connections (but not exposed as API)

### Proposed Solution

**Option 1: New API Route (Recommended)**
- **Path:** `/api/social-studio/connections`
- **Method:** GET
- **Query param:** `businessLocationId` (required)
- **Returns:** Unified array of all connected channels

**Option 2: Fetch in Server Component**
- Fetch in `app/(app)/social-studio/page.tsx`
- Pass as props to `SocialStudioPage` → `CreateTab`
- **Pros:** SSR, no client fetch needed
- **Cons:** Requires converting CreateTab to accept props (currently client-only)

**Recommendation:** **Option 1** - Create new API route for flexibility and client-side fetching.

---

## D) DB Type Confirmation

### `connected_accounts` Table

**Exists:** ✅ Yes (`lib/supabase/database.types.ts` lines 117-166)

**Key Fields:**
- `provider: string` - **NOT an enum, just TEXT**
- `status: string` - **NOT an enum, just TEXT** (default: 'connected')
- `display_name: string | null`
- `avatar_url: string | null`
- `business_location_id: string`
- `expires_at: string | null` - for token expiry checking

**Provider Values Found in Codebase:**
- `'google_gbp'` - Google Business Profile (from `lib/social-studio/ai/context.ts:300`)
- `'facebook'` - Facebook (from `lib/social-studio/ai/context.ts:272`)
- **Note:** Provider values are strings, not enums. Need to map to UI platforms.

### `instagram_connections` Table

**Exists:** ❌ **NOT in database.types.ts** (needs to be added or use `as any`)

**Schema from migration:**
- `instagram_user_id: TEXT`
- `instagram_username: TEXT | null`
- `access_token: TEXT`
- `token_expires_at: TIMESTAMPTZ | null`
- `scopes: TEXT[]`
- `business_location_id: UUID`

**Status:** Table exists in DB but TypeScript types are missing. Code uses `as any` workaround.

### Status Values

**From codebase analysis:**
- `'connected'` - Active connection (default)
- `'expired'` - Token expired (from mock types: `lib/social-studio/mock.ts:7`)
- `'missing_permissions'` - Missing scopes (from mock types)
- `'needs_reauth'` - Needs reconnection (from mock types)

**Note:** Status is TEXT field, not enum. Values may vary.

---

## E) Platform Mapping Required for UI

### UI Platform IDs (CreateTab)

**From `lib/social-studio/mock.ts` and `CreateTab.tsx`:**
```typescript
type Platform = 'instagram' | 'facebook' | 'linkedin' | 'tiktok' | 'google_business'
```

### Database Provider → UI Platform Mapping

**Required mapping:**

| Database Provider | UI Platform ID | Notes |
|-------------------|----------------|-------|
| `'google_gbp'` | `'google_business'` | Google Business Profile |
| `'facebook'` | `'facebook'` | Direct match |
| `'instagram'` | `'instagram'` | **Special case: uses `instagram_connections` table, NOT `connected_accounts`** |
| `'linkedin'` | `'linkedin'` | Assumed (not found in codebase yet) |
| `'tiktok'` | `'tiktok'` | Assumed (not found in codebase yet) |

**Special Cases:**
1. **Instagram:** Uses separate `instagram_connections` table, not `connected_accounts`
2. **Google Business:** Provider is `'google_gbp'` but UI uses `'google_business'`
3. **LinkedIn/TikTok:** No OAuth connections found in codebase yet (may only have usernames in `business_locations`)

### Supported Platforms Today

**From codebase analysis:**

**OAuth Connected (have tables/APIs):**
- ✅ **Instagram** - `instagram_connections` table + OAuth flow
- ✅ **Google Business Profile** - `connected_accounts` with `provider='google_gbp'`
- ❓ **Facebook** - Referenced in `connected_accounts` but no OAuth flow found
- ❌ **LinkedIn** - Only username field, no OAuth
- ❌ **TikTok** - Only username field, no OAuth

**Username-Only (stored in `business_locations`):**
- `facebook_username`
- `instagram_username` (fallback if no OAuth)
- `linkedin_username`
- `tiktok_username`
- `x_username`

### Status Handling for UI

**Recommended logic:**

1. **Show as Connected (selectable):**
   - `status === 'connected'` AND token not expired (if `expires_at` exists and is in future)
   - For Instagram: row exists in `instagram_connections` AND `token_expires_at` is null or future

2. **Show as Disabled (not selectable, with "Fix connection" link):**
   - `status === 'expired'` OR token expired (`expires_at` in past)
   - `status === 'missing_permissions'`
   - `status === 'needs_reauth'`

3. **Show as Not Connected (with "Connect" CTA):**
   - No row exists in `connected_accounts`/`instagram_connections`
   - Only username exists in `business_locations` (no OAuth)

4. **Hide Completely:**
   - No username AND no connection (optional - could show as "Connect" instead)

---

## F) Connected Channels Data Map

### Source of Truth

**Primary Sources:**
1. **`connected_accounts` table** - For Facebook, Google GBP, LinkedIn, TikTok (if OAuth exists)
2. **`instagram_connections` table** - For Instagram (separate table)
3. **`business_locations` table** - For username fallbacks (if no OAuth)

### Query Pattern

**For `connected_accounts`:**
```typescript
const { data: accounts } = await supabase
  .from('connected_accounts')
  .select('provider, display_name, avatar_url, status, expires_at')
  .eq('business_location_id', businessLocationId)
```

**For `instagram_connections`:**
```typescript
const { data: instagram } = await supabase
  .from('instagram_connections')
  .select('instagram_username, token_expires_at')
  .eq('business_location_id', businessLocationId)
  .maybeSingle()
```

**For usernames (fallback):**
```typescript
const { data: location } = await supabase
  .from('business_locations')
  .select('instagram_username, facebook_username, linkedin_username, tiktok_username')
  .eq('id', businessLocationId)
  .maybeSingle()
```

### Returned Data Shape (Example)

**From `connected_accounts`:**
```typescript
{
  provider: 'google_gbp',
  display_name: 'My Business',
  avatar_url: 'https://...',
  status: 'connected',
  expires_at: '2024-12-31T23:59:59Z' | null
}
```

**From `instagram_connections`:**
```typescript
{
  instagram_username: '@mybusiness',
  token_expires_at: '2024-12-31T23:59:59Z' | null
}
```

**From `business_locations` (fallback):**
```typescript
{
  instagram_username: '@mybusiness' | null,
  facebook_username: 'MyBusinessPage' | null,
  linkedin_username: 'my-business' | null,
  tiktok_username: '@mybusiness' | null
}
```

---

## G) CreateTab Wiring Plan

### Recommended Approach: Client-Side Fetch via API Route

**Why:**
- CreateTab is already a client component (`'use client'`)
- Keeps data fetching logic centralized
- Works for both SSR initial load and client navigation
- No need to convert CreateTab to server component

### Implementation Steps

#### Step 1: Create API Route

**File:** `app/api/social-studio/connections/route.ts`

**Endpoint:** `GET /api/social-studio/connections?businessLocationId={id}`

**Returns:**
```typescript
{
  channels: Array<{
    platform: 'instagram' | 'facebook' | 'google_business' | 'linkedin' | 'tiktok'
    name: string
    iconPath: string
    connected: boolean
    status: 'connected' | 'expired' | 'missing_permissions' | 'needs_reauth' | 'not_connected'
    displayName?: string | null
    avatarUrl?: string | null
    username?: string | null
    canSelect: boolean // true if connected and not expired
    needsReconnect: boolean // true if expired/missing_permissions/needs_reauth
  }>
}
```

**Logic:**
1. Fetch `connected_accounts` for `businessLocationId`
2. Fetch `instagram_connections` for `businessLocationId`
3. Fetch `business_locations` usernames for `businessLocationId`
4. Map providers to UI platforms
5. Determine connection status (check `expires_at` for token expiry)
6. Build unified channels array

#### Step 2: Update CreateTab Component

**File:** `components/social-studio/tabs/CreateTab.tsx`

**Changes:**
1. Remove `mockSocialAccounts` import
2. Add state: `const [channels, setChannels] = useState<ChannelOption[]>([])`
3. Add state: `const [loadingChannels, setLoadingChannels] = useState(true)`
4. Add `useEffect` to fetch from `/api/social-studio/connections?businessLocationId=${businessLocationId}`
5. Replace `allChannels` constant with `channels` state
6. Update preselection logic to use real `connected` status

**Preselection Logic:**
```typescript
// Preselect all channels where connected=true AND canSelect=true
useEffect(() => {
  const connected = channels
    .filter(ch => ch.connected && ch.canSelect)
    .map(ch => ch.id as Platform)
  setSelectedChannels(connected)
}, [channels])
```

#### Step 3: Handle Connection States in UI

**Update channel chips to show:**
- ✅ **Connected + Selectable:** Normal chip, can toggle
- ⚠️ **Connected but Expired:** Disabled chip, show "Fix connection" tooltip/link
- ❌ **Not Connected:** Show "Connect" CTA (or hide if preferred)

**Empty State:**
- If `channels.filter(ch => ch.connected && ch.canSelect).length === 0`
- Show: "No channels connected. Connect a channel to get started."
- Link to: `/onboarding/connect` or `/settings/integrations`

---

## H) Minimal Code Change List

### Files to Edit

1. **`app/api/social-studio/connections/route.ts`** (NEW)
   - Create new API route
   - Fetch from `connected_accounts`, `instagram_connections`, `business_locations`
   - Map to unified channel format
   - Return channels array

2. **`components/social-studio/tabs/CreateTab.tsx`**
   - Remove `mockSocialAccounts` import (line 5)
   - Remove `allChannels` constant (lines 89-121)
   - Add `channels` state and `loadingChannels` state
   - Add `useEffect` to fetch connections on mount
   - Update preselection logic
   - Update channel rendering to handle disabled states

3. **`lib/supabase/database.types.ts`** (OPTIONAL)
   - Add `instagram_connections` table type definition
   - Currently using `as any` workaround, but proper types would be better

### New API Route Details

**File:** `app/api/social-studio/connections/route.ts`

**Method:** GET

**Query Params:**
- `businessLocationId` (required, UUID)

**Response Shape:**
```typescript
{
  channels: Array<{
    platform: string // 'instagram' | 'facebook' | 'google_business' | 'linkedin' | 'tiktok'
    name: string // Display name
    iconPath: string // Path to icon
    connected: boolean // Has OAuth connection
    status: string // 'connected' | 'expired' | 'missing_permissions' | 'needs_reauth' | 'not_connected'
    displayName?: string | null // From connected_accounts.display_name or instagram_username
    avatarUrl?: string | null // From connected_accounts.avatar_url
    username?: string | null // From business_locations username fields
    canSelect: boolean // Can be selected for posting
    needsReconnect: boolean // Needs user action to fix
  }>
}
```

**Error Handling:**
- 401 if user not authenticated
- 404 if business location not found or doesn't belong to user
- 500 for server errors

---

## I) Root Cause Answer

**Question:** "Where is the placeholder channel list currently coming from in CreateTab, and what is the correct data source for real connected channels?"

**Answer:**

1. **Current Placeholder Source:**
   - **File:** `components/social-studio/tabs/CreateTab.tsx` lines 89-121
   - **Data:** Hardcoded `allChannels` array that checks `mockSocialAccounts` from `@/lib/social-studio/mock`
   - **Mock Source:** `lib/social-studio/mock.ts` lines 109-134 (static array with fake data)

2. **Correct Data Source:**
   - **Primary:** `connected_accounts` table (for Facebook, Google GBP, LinkedIn, TikTok OAuth)
   - **Special Case:** `instagram_connections` table (for Instagram OAuth - separate table)
   - **Fallback:** `business_locations` table username fields (if no OAuth exists)
   - **Query Key:** `business_location_id` (already available as prop in CreateTab)

3. **Why Two Tables:**
   - Instagram uses dedicated `instagram_connections` table (legacy/OAuth-specific)
   - Other platforms use generic `connected_accounts` table with `provider` field
   - Both need to be queried and merged for complete picture

4. **Current Gap:**
   - No API route exists to fetch all connections
   - No helper function to unify the two table sources
   - CreateTab has no way to fetch real data (client component, needs API route)

---

## Summary

**Current State:**
- ✅ Database tables exist (`connected_accounts`, `instagram_connections`)
- ✅ `businessLocationId` is available in CreateTab
- ❌ Placeholder data from mock file
- ❌ No API route to fetch connections
- ❌ No unified helper to merge both table sources

**Required Changes:**
1. Create `/api/social-studio/connections` route
2. Update CreateTab to fetch from API instead of mock
3. Map database providers to UI platforms
4. Handle connection states (connected/expired/not_connected)
5. Preselect connected + selectable channels by default

**Platform Support Status:**
- ✅ Instagram: Full OAuth support
- ✅ Google Business: Full OAuth support (`provider='google_gbp'`)
- ❓ Facebook: Referenced but OAuth flow not found
- ❌ LinkedIn/TikTok: Username-only (no OAuth)


