# TypeScript Build Error Diagnostic Report
## Error: `update()` expects `never` in `app/api/social-studio/posts/[id]/route.ts`

---

## A) Route Snippet

**File:** `app/api/social-studio/posts/[id]/route.ts`

**Imports (lines 1-4):**
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Database, Json } from '@/lib/supabase/database.types'
import { z } from 'zod'
```

**Supabase Client Creation (line 25):**
```typescript
const supabase = await createClient()
```

**The Failing Update Call (lines 121-126):**
```typescript
// Update post - use ts-ignore to bypass strict Supabase typing for dynamic updates
// @ts-ignore - Supabase types are too strict for dynamic update objects
const { data: post, error } = await supabase
  .from('social_studio_posts')
  .update(updatePayload)
  .eq('id', postId)
  .select()
  .single()
```

**Update Payload Construction (lines 73-125):**
```typescript
// Build update object with proper typing
type PostUpdate = Database['public']['Tables']['social_studio_posts']['Update']
const allowedKeys: (keyof PostUpdate)[] = [
  'scheduled_at',
  'status',
  'platforms',
  'topic',
  'caption',
  'media',
  'link_url',
  'utm',
]

const updatePayload: Partial<PostUpdate> = {}
// ... (populated conditionally)
```

---

## B) Supabase Client + Database Import

**Client Helper:** `createClient()` from `@/lib/supabase/server`

**Implementation (`lib/supabase/server.ts` lines 5-30):**
```typescript
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}
```

**Key Finding:**
- ✅ Generic type IS provided: `createServerClient<Database>()`
- ✅ Database is imported from `./database.types` (same file location)
- ✅ The client SHOULD be typed with the Database interface

---

## C) Database Type Inspection

**Source File:** `lib/supabase/database.types.ts`

**Database Interface Structure:**
```typescript
export interface Database {
  public: {
    Tables: {
      // ... other tables ...
      social_studio_posts: {
        Row: { /* ... */ }
        Insert: { /* ... */ }
        Update: {
          id?: string
          business_location_id?: string
          status?: string
          platforms?: string[]
          topic?: string | null
          caption?: string | null
          media?: Json
          link_url?: string | null
          utm?: Json | null
          scheduled_at?: string | null
          published_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}
```

**Key Findings:**
- ✅ `social_studio_posts` EXISTS under `Database['public']['Tables']`
- ✅ `Update` type EXISTS and is properly defined (lines 394-408)
- ✅ All expected fields are present in the Update type
- ❌ **HOWEVER:** The `status` field in Update is typed as `string` (line 397), but should be `'draft' | 'scheduled' | 'published' | 'failed'` to match the schema

**Other "social_studio_*" tables:** None found (only `social_studio_posts` exists)

---

## D) TypeScript Proof (Diagnostic Types)

**Diagnostic Types Added (temporarily, lines 25-30):**
```typescript
type DB = Database
type Tables = DB['public']['Tables']
type HasPosts = 'social_studio_posts' extends keyof Tables ? true : false
type PostUpdate = 'social_studio_posts' extends keyof Tables ? Tables['social_studio_posts']['Update'] : 'MISSING'
type PostUpdateKeys = 'social_studio_posts' extends keyof Tables ? keyof Tables['social_studio_posts']['Update'] : 'MISSING'
```

**Expected Results (if types are correct):**
- `HasPosts` should resolve to `true`
- `PostUpdate` should resolve to the Update type object (not `'MISSING'`)
- `PostUpdateKeys` should resolve to union of keys: `'id' | 'business_location_id' | 'status' | ...`

**Actual Results (from linter):**
- ✅ No linter errors reported for these diagnostic types
- ⚠️ **BUT:** Vercel build still fails, suggesting:
  1. Vercel uses stricter TypeScript settings
  2. Vercel may have cached/stale types
  3. There's a type narrowing issue that only appears in strict mode

---

## E) Multiple Database Type Conflicts

**Search Results:**
- ✅ Only ONE `Database` interface found: `lib/supabase/database.types.ts`
- ✅ All imports use the same path: `@/lib/supabase/database.types` or `./database.types`
- ✅ No conflicting type definitions found

**Other Routes Using Updates:**
- `app/api/cron/apify-refresh/route.ts`: Uses `as any` for `.upsert()`
- `app/api/social/instagram/messages/send/route.ts`: Uses `as any` for `.update()`
- `app/api/integrations/instagram/callback/route.ts`: Uses `upsertPayload: any` for `.upsert()`

**Pattern:** Other routes consistently use `as any` to bypass Supabase's strict typing.

---

## F) Root Cause Hypothesis

Based on the evidence above:

1. **The Database type DOES contain `social_studio_posts`** with a proper `Update` type
2. **The Supabase client IS typed with `Database`** via `createServerClient<Database>()`
3. **The diagnostic types SHOULD resolve correctly** (no local linter errors)
4. **BUT Vercel build fails**, suggesting one of these issues:

   **HYPOTHESIS A: Type Narrowing Failure**
   - TypeScript's type inference for `.from('social_studio_posts')` may be failing in strict mode
   - The string literal `'social_studio_posts'` may not be narrowing correctly to the table key
   - This could cause `.from()` to return a generic/unknown type, making `.update()` expect `never`

   **HYPOTHESIS B: Stale/Cached Types on Vercel**
   - Vercel's build cache may have an older version of `database.types.ts` without `social_studio_posts`
   - The local file has the table, but Vercel's build environment doesn't

   **HYPOTHESIS C: TypeScript Version/Config Difference**
   - Vercel may use a different TypeScript version or stricter `tsconfig.json` settings
   - The `@ts-ignore` directive may not be respected in Vercel's build environment
   - Strict mode may be rejecting the type inference

   **HYPOTHESIS D: Supabase Type Generation Issue**
   - The `@supabase/ssr` package's `createServerClient<Database>()` may not properly propagate the generic type
   - There may be a mismatch between how Supabase expects the Database type and how it's structured
   - The `Update` type may need to be explicitly typed differently for Supabase's type system

5. **The `@ts-ignore` directive is present but not working** in Vercel's build, suggesting:
   - Vercel may strip or ignore `@ts-ignore` comments
   - Or the error occurs before the directive is processed

**MOST LIKELY ROOT CAUSE:**
**Hypothesis A + D combined:** TypeScript in strict mode (Vercel) is failing to narrow the string literal `'social_studio_posts'` to the correct table key in the Database type, causing `.from()` to return a type where `.update()` expects `never`. This is compounded by Supabase's complex generic type system that may not properly infer types from the Database interface in all scenarios.

---

## Evidence Summary

| Check | Status | Details |
|-------|--------|---------|
| Database type exists | ✅ | `lib/supabase/database.types.ts` |
| `social_studio_posts` in Database | ✅ | Lines 363-409 |
| `Update` type defined | ✅ | Lines 394-408 |
| Supabase client typed | ✅ | `createServerClient<Database>()` |
| Multiple Database types | ❌ | Only one found |
| Local linter errors | ❌ | None reported |
| Vercel build errors | ✅ | Type error on line 109/131 |
| `@ts-ignore` working | ❌ | Not effective in Vercel build |

---

## Next Steps (After Root Cause Confirmation)

1. Verify Vercel's TypeScript version and `tsconfig.json` settings
2. Check if Vercel's build cache needs clearing
3. Consider using `as any` cast on the entire query chain (like other routes)
4. Verify the Database type is properly exported and imported
5. Test if explicitly typing the update payload helps: `updatePayload as Database['public']['Tables']['social_studio_posts']['Update']`


