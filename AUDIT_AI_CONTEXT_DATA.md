# AI Content Generation - Available Context Data Audit

## A) Create page entry points

**File path(s):**
- `app/(app)/social-studio/page.tsx` - Server component that fetches `businessLocationId`
- `components/social-studio/SocialStudioPage.tsx` - Main page wrapper
- `components/social-studio/tabs/CreateTab.tsx` - The Create tab component (lines 1-693)

**Component names:**
- `SocialStudioRoute` (server component)
- `SocialStudioPage` (client component)
- `CreateTab` (client component)

**Where the "Generate with AI" button lives:**
- `components/social-studio/tabs/CreateTab.tsx` lines 599-620
- Currently a mock implementation that randomly selects from hardcoded suggestions
- Button text: "Generate with AI" (underlined, blue text, no background)
- Located in the bottom actions bar, right-aligned

**Any existing state for AI drawer / modal (if any):**
- None found. The current implementation is a simple onClick handler with mock data.

---

## B) Available business context (confirmed from code)

### Business identity

**Source:** `business_locations` table + `business_insights` table (GBP data)

**Fields:**
- `business_locations.name` - Business name
- `business_locations.formatted_address` - Full address
- `business_locations.phone_number` - Phone number
- `business_locations.website` - Website URL
- `business_locations.category` - Primary category (string)
- `business_locations.categories` - Array of categories
- `business_locations.google_location_name` - GBP location name
- `business_insights.gbp_primary_category` - Primary category from GBP
- `business_insights.gbp_additional_categories` - Additional categories (JSON)
- `business_insights.gbp_website_url` - Website from GBP
- `business_insights.gbp_phone` - Phone from GBP
- `business_insights.gbp_address` - Address from GBP (JSON)

**How to fetch:**
- Use `getBusinessContext(locationId)` from `lib/reputation/business-context.ts` (already implemented utility)
- Or query directly:
  ```typescript
  supabase.from('business_locations').select('name, formatted_address, phone_number, website, category, categories').eq('id', locationId)
  supabase.from('business_insights').select('gbp_primary_category, gbp_website_url, gbp_phone, gbp_address').eq('location_id', locationId).eq('source', 'google')
  ```

### Service offerings

**Source:** `business_locations.categories` + `business_insights.gbp_primary_category` + `business_insights.gbp_additional_categories`

**Fields:**
- `business_locations.categories` - Array of category strings
- `business_insights.gbp_primary_category` - Primary service category
- `business_insights.gbp_additional_categories` - Additional service categories (JSON)

**How to fetch:**
- Already included in `getBusinessContext()` as `serviceHighlights` array
- Extracted from categories array

### Location + hours

**Source:** `business_locations` + `business_insights.apify_opening_hours`

**Fields:**
- `business_locations.lat` / `business_locations.lng` - Coordinates
- `business_locations.formatted_address` - Full address
- `business_insights.apify_opening_hours` - Opening hours (JSON format, can be array or object)

**How to fetch:**
- Address: `business_locations.formatted_address`
- Hours: `business_insights.apify_opening_hours` (needs formatting via `formatHoursSummary()`)
- City extraction: `getBusinessContext()` includes `extractCity()` helper

### Brand voice / tone settings

**Source:** Not found in database schema. No dedicated table or fields for brand voice/tone preferences.

**Gap:** This data is not currently stored.

### Existing performance outcomes we track

**Source:** `business_insights` table

**Fields:**
- `gbp_total_call_clicks` - Total call button clicks
- `gbp_total_website_clicks` - Total website clicks
- `gbp_total_directions_requests` - Total directions requests
- `gbp_metrics_raw` - Raw GBP metrics (JSON)
- `instagram_metrics` - Instagram metrics (JSON) - includes: `totalPostsAnalyzed`, `postsLast30Days`, `postsPerWeekApprox`, `avgLikesPerPost`, `maxLikes`, `totalCommentsAnalyzed`, `hasAnyComments`
- `facebook_metrics` - Facebook metrics (JSON)

**How to fetch:**
```typescript
supabase.from('business_insights')
  .select('gbp_total_call_clicks, gbp_total_website_clicks, gbp_total_directions_requests, gbp_metrics_raw, instagram_metrics, facebook_metrics')
  .eq('location_id', locationId)
  .eq('source', 'google')
```

### Reviews insights we have

**Source:** `business_reviews` table + `business_insights` table

**Fields:**
- `business_reviews` table:
  - `rating` - Review rating (1-5)
  - `review_text` - Full review text
  - `author_name` - Reviewer name
  - `published_at` - Review date
  - `source` - Review source (e.g., 'google')
- `business_insights.review_sentiment_summary` - Sentiment analysis summary (JSON)
- `business_insights.top_review_keywords` - Top keywords from reviews (JSON)
- `business_insights.gbp_avg_rating` - Average rating
- `business_insights.gbp_review_count` - Total review count
- `business_insights.gbp_last_review_at` - Last review timestamp

**How to fetch:**
```typescript
// Individual reviews
supabase.from('business_reviews').select('*').eq('location_id', locationId).order('published_at', { ascending: false }).limit(50)

// Aggregated insights
supabase.from('business_insights')
  .select('review_sentiment_summary, top_review_keywords, gbp_avg_rating, gbp_review_count, gbp_last_review_at')
  .eq('location_id', locationId)
  .eq('source', 'google')
```

### Competitor context

**Source:** `business_insights.apify_competitors` (JSON)

**Fields:**
- `apify_competitors` - JSON structure containing competitor data:
  - `places[]` - Array of competitor places with:
    - `placeId`, `name`, `address`, `categories`, `rating`, `reviewsCount`, `reviewsDistribution`, `reviews[]`, `imageUrl`, `isSelf` flag
- Also available via Google Places API fallback in `app/api/competitors/nearest/route.ts`

**How to fetch:**
```typescript
supabase.from('business_insights')
  .select('apify_competitors')
  .eq('location_id', locationId)
  .eq('source', 'google')
```

### Social connections

**Source:** `connected_accounts` table + `instagram_connections` table

**Fields:**
- `connected_accounts`:
  - `provider` - e.g., 'google_gbp', 'facebook', etc.
  - `display_name` - Account display name
  - `avatar_url` - Profile picture URL
  - `status` - Connection status
- `instagram_connections`:
  - `instagram_user_id` - Instagram account ID
  - `username` - Instagram username (from API, not stored directly in table)
  - `access_token` - OAuth token
  - `token_expires_at` - Token expiry
- `business_locations`:
  - `instagram_username` - Instagram handle
  - `facebook_username` - Facebook handle
  - `linkedin_username`, `x_username`, `tiktok_username` - Other platform handles

**How to fetch:**
```typescript
// Connected accounts
supabase.from('connected_accounts')
  .select('provider, display_name, avatar_url, status')
  .eq('business_location_id', locationId)

// Instagram connection
supabase.from('instagram_connections')
  .select('instagram_user_id, access_token, token_expires_at')
  .eq('business_location_id', locationId)
  .maybeSingle()

// Social handles
supabase.from('business_locations')
  .select('instagram_username, facebook_username, linkedin_username, x_username, tiktok_username')
  .eq('id', locationId)
```

### Any stored "AI analysis" blobs

**Source:** `business_insights` table

**Fields:**
- `gbp_ai_analysis` (JSON) - Structure: `{ headerSummary, positiveSummary, negativeSummary, themes[] }`
  - `gbp_ai_analysis_generated_at` - Timestamp
- `instagram_ai_analysis` (JSON) - Structure: `{ summary, whatWorks[], risksSummary, mainRisks[], metrics }`
  - `instagram_ai_analysis_generated_at` - Timestamp
  - `instagram_username` - Username analyzed
- `facebook_ai_analysis` (JSON) - Structure: `{ summary, whatWorks[], risksSummary, mainRisks[] }`
  - `facebook_ai_analysis_generated_at` - Timestamp
  - `facebook_url` - Page URL analyzed

**How to fetch:**
```typescript
supabase.from('business_insights')
  .select('gbp_ai_analysis, gbp_ai_analysis_generated_at, instagram_ai_analysis, instagram_ai_analysis_generated_at, instagram_username, facebook_ai_analysis, facebook_ai_analysis_generated_at, facebook_url')
  .eq('location_id', locationId)
  .eq('source', 'google')
```

### Any existing "content library" data

**Source:** Not found. No tables for:
- Post templates
- Hashtag sets
- Content queue items
- Media library
- Campaign definitions

**Gap:** Content library data is not currently stored in database. Only mock data exists in `lib/social-studio/mock.ts`.

### Search keywords / Local SEO

**Source:** `search_terms` table

**Fields:**
- `search_terms` table:
  - `term` - Search keyword string
  - `business_location_id` - Location reference
  - `created_at`, `updated_at` - Timestamps
- Also available via GBP Performance API: `app/api/competitors/search-terms/sync/route.ts` fetches last 18 months of search keywords

**How to fetch:**
```typescript
supabase.from('search_terms')
  .select('term')
  .eq('business_location_id', locationId)
  .order('created_at', { ascending: false })
```

### Social media raw data

**Source:** `business_insights` table

**Fields:**
- `instagram_raw_posts` (JSON) - Array of Instagram posts with captions, timestamps, likes, comments
- `instagram_raw_comments` (JSON) - Array of Instagram comments
- `facebook_raw_posts` (JSON) - Array of Facebook posts

**How to fetch:**
```typescript
supabase.from('business_insights')
  .select('instagram_raw_posts, instagram_raw_comments, facebook_raw_posts')
  .eq('location_id', locationId)
  .eq('source', 'google')
```

---

## C) Gaps / missing data we may need

1. **Brand voice/tone preferences** - No stored settings for preferred writing style (casual, professional, friendly, etc.)
2. **Content pillars** - No explicit storage of content strategy pillars (proof, offer, education, culture) though mock data references them
3. **UTM defaults** - No stored UTM parameter defaults (utm_source, utm_campaign, utm_medium)
4. **Content templates** - No database table for reusable post templates
5. **Hashtag sets** - No storage for hashtag collections
6. **Post performance history** - No table tracking which posts performed well (for repurposing insights)
7. **Target audience persona** - No stored audience demographics or preferences
8. **Content calendar preferences** - No stored preferences for posting frequency or optimal times
9. **Call-to-action preferences** - No stored CTA preferences (Call, WhatsApp, Book, Visit, etc.)

---

## D) Proposed "AI Context Payload" (JSON shape)

```json
{
  "business": {
    "name": "string",
    "address": "string",
    "city": "string",
    "phone": "string",
    "website": "string",
    "primaryCategory": "string",
    "categories": ["string"],
    "hours": "string | null"
  },
  "channels": [
    {
      "platform": "instagram" | "facebook" | "google_business" | "linkedin" | "tiktok",
      "username": "string | null",
      "connected": boolean,
      "status": "connected" | "expired" | "missing_permissions"
    }
  ],
  "performance": {
    "gbp": {
      "callClicks": number,
      "websiteClicks": number,
      "directionsRequests": number,
      "avgRating": number | null,
      "reviewCount": number | null
    },
    "instagram": {
      "postsLast30Days": number | null,
      "avgLikes": number | null,
      "maxLikes": number | null,
      "totalComments": number | null,
      "hasAnyComments": boolean | null
    },
    "facebook": {
      // Structure TBD based on facebook_metrics JSON
    }
  },
  "reviews": {
    "summary": {
      "avgRating": number | null,
      "totalCount": number | null,
      "lastReviewAt": "string | null"
    },
    "sentiment": {
      // From review_sentiment_summary JSON
    },
    "topKeywords": ["string"],
    "recentHighlights": [
      {
        "text": "string",
        "rating": number,
        "author": "string",
        "publishedAt": "string"
      }
    ]
  },
  "competitors": [
    {
      "name": "string",
      "rating": number | null,
      "reviewCount": number | null,
      "categories": ["string"]
    }
  ],
  "localSEO": {
    "topSearchTerms": ["string"]
  },
  "aiAnalysis": {
    "gbp": {
      "positiveSummary": "string | null",
      "negativeSummary": "string | null",
      "themes": [
        {
          "theme": "string",
          "you": "string",
          "competitorName": "string",
          "competitor": "string"
        }
      ]
    },
    "instagram": {
      "summary": "string | null",
      "whatWorks": ["string"],
      "risksSummary": "string | null"
    },
    "facebook": {
      "summary": "string | null",
      "whatWorks": ["string"],
      "risksSummary": "string | null"
    }
  },
  "socialContent": {
    "instagram": {
      "recentPosts": [
        {
          "caption": "string",
          "timestamp": "string",
          "likes": number,
          "comments": number
        }
      ],
      "recentComments": [
        {
          "text": "string",
          "username": "string",
          "timestamp": "string"
        }
      ]
    },
    "facebook": {
      "recentPosts": [
        {
          "message": "string",
          "timestamp": "string"
        }
      ]
    }
  }
}
```

---

## E) Next step recommendation

Based on the available data, the simplest MVP AI generator we can implement is:

**Topic suggestions → Caption generation → Insert into textarea**

1. **Server API route:** `POST /api/social-studio/generate-content`
   - Accepts: `businessLocationId`, `platform` (optional), `topic` (optional), `tone` (optional)
   - Fetches all context data using the payload structure above
   - Calls OpenAI with a system prompt that includes business context, recent reviews highlights, top-performing content insights, and competitor context
   - Returns: `{ topic: string, caption: string, suggestedHashtags: string[] }`

2. **System prompt structure:**
   - Use existing pattern from `lib/ai/gpt.ts` and `lib/social/instagram-ai.ts`
   - Include business identity, recent review highlights, top search terms, competitor context
   - Request JSON response with topic, caption, and hashtags
   - Use `gpt-5-mini` model (consistent with existing AI features)

3. **UI flow:**
   - Click "Generate with AI" → Show loading state
   - Optionally show a simple modal/drawer with:
     - Topic selector (or auto-suggest based on reviews/competitors)
     - Tone selector (Warm, Professional, Friendly, etc.)
   - Generate → Insert caption into textarea
   - Show toast on success/error

4. **MVP features:**
   - Single caption generation (no variations initially)
   - Platform-aware (use Instagram/Facebook analysis if available)
   - Review-driven topics (suggest topics based on positive review themes)
   - Local SEO integration (include top search terms naturally)

This MVP leverages existing data without requiring new schema, uses established OpenAI patterns, and provides immediate value by generating contextually relevant captions.

