# Instagram Profile Picture Fetching - Debug Analysis

## Problem Summary
Profile pictures are not being fetched for Instagram DM participants. The cache correctly detects missing profile pics and attempts to force a refetch, but `resolveMessagingUserProfile` returns `null` without making the API call.

## Evidence from Server Logs

### Key Log Entries

1. **Cache Detection Working** (Line 113):
   ```json
   {"location":"messaging-user-profile.ts:332","message":"Cache missing profile pic - forcing refetch","data":{"messagingUserId":"1463464772093025","recipientIgAccountId":"33319215521056190","hasUsername":true,"hasName":false,"hasProfilePic":false}}
   ```
   ✅ The cache correctly detects missing profile pics and attempts to force a refetch.

2. **Function Returns Null** (Line 116):
   ```json
   {"location":"inbox-sync.ts:805","message":"resolveMessagingUserProfile returned","data":{"igAccountId":"33319215521056190","participantIgsid":"1463464772093025","hasResult":false,"hasProfilePicUrl":false,"hasProfilePic":false}}
   ```
   ❌ `resolveMessagingUserProfile` returns `null` (`hasResult:false`) without making the API call.

3. **No API Call Logs**:
   - ❌ No log from `messaging-user-profile.ts:82` ("Fetching user profile API call")
   - ❌ No log from `messaging-user-profile.ts:95` ("Profile API response received")
   - ❌ No log from `messaging-user-profile.ts:168` ("Profile fetch succeeded")
   - ❌ No log from `messaging-user-profile.ts:114` ("Profile fetch failed")
   - ❌ No log from `messaging-user-profile.ts:400` ("Auth error")
   - ❌ No log from `messaging-user-profile.ts:428` ("No connection found")

## Root Cause Hypothesis

The function `resolveMessagingUserProfile` in `lib/instagram/messaging-user-profile.ts` is returning `null` somewhere between:
1. **Line 332**: Cache check detects missing profile pic and logs "forcing refetch"
2. **Line 82**: Should log "Fetching user profile API call" (but never does)

### Possible Early Return Points

1. **Fail Count Cooldown** (Lines 352-392):
   - If `cached.fail_count >= MAX_FAIL_COUNT`, the function may return cached data without fetching
   - No logs indicate this path is taken, but it's possible the cache has a high fail_count

2. **Access Token Loading Failure** (Lines 394-446):
   - `getInstagramAccessTokenForAccount(recipientIgAccountId)` may be throwing an error
   - If it's NOT an `InstagramAuthError`, it goes to the catch block at line 428 which logs "No connection found" and returns `null`
   - **BUT**: We don't see this log, so either:
     - The error is being swallowed somewhere
     - The function is returning early before reaching the access token loading

3. **Silent Error/Exception**:
   - An unhandled exception might be causing the function to return `null` without logging
   - The timeout promise (line 456-458) might be resolving to `null` before the fetch completes

## Code Flow Analysis

```
resolveMessagingUserProfile()
  ├─> Check cache (line 293-298)
  ├─> Cache has username but no profile pic (line 332) ✅ LOGGED
  ├─> Check fail_count cooldown (line 352-392) ❓ NO LOGS
  ├─> Load access token (line 397) ❓ NO LOGS
  ├─> Call fetchIgMessagingUserProfile (line 450) ❓ NEVER REACHED
  └─> Return null (line 116) ❌ RESULT
```

## Missing Instrumentation

We need to add logs at:
1. **After fail_count check** - to see if it's returning early due to cooldown
2. **Before/after access token loading** - to see if `getInstagramAccessTokenForAccount` is failing
3. **Inside the catch block** - to see what error is being caught
4. **Before calling fetchIgMessagingUserProfile** - to confirm we reach that point

## Next Steps for LLM

Ask the LLM to:
1. Add instrumentation logs at the missing points above
2. Check if `cached.fail_count` is high in the database (causing cooldown)
3. Verify `getInstagramAccessTokenForAccount` is working correctly
4. Check if there's a silent exception or early return we're missing
5. Verify the timeout promise logic isn't causing premature null returns

