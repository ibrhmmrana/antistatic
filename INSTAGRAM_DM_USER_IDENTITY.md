# Instagram DM User Identity

## Overview

The Instagram Direct Messages (DM) feature in Social Studio displays user identities (usernames, names, profile pictures) for conversation participants. User identities are fetched from Meta's Graph API and cached in the `instagram_user_cache` table.

## How It Works

1. **Webhook Ingestion**: When a new DM arrives via webhook, the system attempts to fetch the sender's identity from Meta's Graph API using `graph.facebook.com/v18.0/{messaging-user-id}`.

2. **Caching**: User identities are cached in `instagram_user_cache` with a 7-day TTL. Failed fetches are tracked with `fail_count` and retries stop after 5 failures.

3. **Display Logic**: The Inbox UI displays user identities in this priority order:
   - `@username` (if available)
   - `name` (if username is not available)
   - `@user_XXXX` (fallback using last 6 digits of user ID)

## Limitations

- **Username Availability**: Usernames may be unavailable for some users due to privacy settings or API limitations. The system gracefully falls back to the user's name or a short ID.

- **API Endpoint**: The identity fetch uses `graph.facebook.com` (not `graph.instagram.com`) for messaging user profiles. This requires the Instagram access token from `instagram_connections`.

- **Rate Limiting**: Identity fetches are rate-limited and have a 2-second timeout to prevent blocking webhook processing.

## Backfill Endpoint

The `/api/social/instagram/messages/backfill` endpoint can be used to resolve user profiles for recent messages that don't have cached identities. This is useful for recovery or backfilling after initial setup.

**Usage:**
```
POST /api/social/instagram/messages/backfill?locationId={locationId}&days=7
```

**Limits:**
- Maximum 50 profiles per request
- Days parameter: 1-90 (default: 7)

## Troubleshooting

If usernames are not appearing:

1. Check server logs for identity fetch errors. Look for `[Instagram Messaging Profile]` log entries.
2. Verify the Instagram access token is valid and has messaging permissions.
3. Check `instagram_user_cache` table for cached entries and `fail_count` values.
4. Use the backfill endpoint to resolve profiles for existing messages.

## Database Schema

The `instagram_user_cache` table stores:
- `ig_user_id` (primary key): The messaging user ID
- `username`: Instagram username (if available)
- `name`: Display name (if available)
- `profile_pic_url`: Profile picture URL (if available)
- `last_fetched_at`: Timestamp of last successful fetch
- `fail_count`: Number of consecutive failures
- `last_failed_at`: Timestamp of last failure
- `raw`: Full API response for debugging

