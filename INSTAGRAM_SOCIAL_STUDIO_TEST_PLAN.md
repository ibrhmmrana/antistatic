# Instagram Social Studio Test Plan

## Overview
This document outlines the test checklist for the Instagram Social Studio features implemented in the Antistatic webapp.

## Prerequisites
1. Instagram Business account connected via OAuth
2. Required permissions granted:
   - `instagram_business_basic`
   - `instagram_business_manage_insights` (for insights)
   - `instagram_manage_comments` or `instagram_business_manage_comments` (for replies)
   - `instagram_business_content_publish` (for publishing)
   - `instagram_business_manage_messages` (for DMs - optional)

## Test Checklist

### A) Comment Replies
- [ ] **Test: Reply to a comment**
  1. Navigate to `/social` → Instagram tab → Comments sub-tab
  2. Find a comment that hasn't been replied to
  3. Click "Reply" button
  4. Type a reply message
  5. Click "Send Reply"
  6. **Expected**: Reply is sent successfully, toast notification shows "Reply sent successfully!", comment is marked as replied in UI

- [ ] **Test: Permission error handling**
  1. If comment reply fails due to missing permission
  2. **Expected**: Error toast shows with permission name, confirmation dialog offers to reconnect

- [ ] **Test: Reply persists after refresh**
  1. After replying, refresh the page
  2. **Expected**: Comment still shows as replied with reply text

### B) Publishing Content
- [ ] **Test: Publish an image**
  1. Navigate to `/social` → Instagram tab → Content sub-tab
  2. Click "Create Post" button
  3. Upload an image (drag & drop or click to select)
  4. **Expected**: Image uploads to Supabase Storage, preview shows
  5. Add a caption
  6. Click "Publish"
  7. **Expected**: Success toast, post appears in content list after sync

- [ ] **Test: Publish a video**
  1. Repeat above steps with a video file
  2. **Expected**: Video uploads and publishes successfully

- [ ] **Test: Media URL validation**
  1. Try publishing with an invalid/non-public URL
  2. **Expected**: Clear error message about URL needing to be publicly accessible

- [ ] **Test: File size limits**
  1. Try uploading a file larger than 10MB (image) or 100MB (video)
  2. **Expected**: Error message about file size limit

### C) Insights
- [ ] **Test: Insights load after sync**
  1. Navigate to `/social` → Instagram tab → Insights sub-tab
  2. If no data, click "Run Sync" button
  3. **Expected**: After sync completes, insights show KPI cards (Reach, Impressions, Profile Visits, Engagement Rate) and chart

- [ ] **Test: Insights show real error**
  1. If insights permission is missing
  2. **Expected**: Shows exact error message from sync_state, required permission name, and "Reconnect" button

- [ ] **Test: Empty state**
  1. If no insights data exists
  2. **Expected**: Shows "No Insights Data" with "Run Sync" button

- [ ] **Test: Chart visualization**
  1. If insights data exists
  2. **Expected**: Simple bar/line chart shows reach and impressions over last 30 days

### D) Inbox (Direct Messages)
- [ ] **Test: Inbox populates when webhook receives messages**
  1. Set up Instagram webhook pointing to `/api/webhooks/instagram`
  2. Send a test message to the Instagram Business account
  3. **Expected**: Message appears in Inbox tab, thread list shows unread count

- [ ] **Test: Thread list**
  1. Navigate to `/social` → Instagram tab → Inbox sub-tab
  2. **Expected**: Left column shows list of conversation threads with participant names and last message time

- [ ] **Test: View messages in thread**
  1. Click on a thread
  2. **Expected**: Right column shows messages in chronological order, thread is marked as read (unread count resets)

- [ ] **Test: Send reply**
  1. Select a thread
  2. Type a message in reply box
  3. Click "Send" or press Enter
  4. **Expected**: Message is sent (stored in DB), appears in message list

- [ ] **Test: Not enabled state**
  1. If messaging permission is missing and no messages exist
  2. **Expected**: Shows explanation about `instagram_business_manage_messages` permission and webhook setup

### E) General Functionality
- [ ] **Test: Sync Now button**
  1. Navigate to Overview tab
  2. Click "Sync Now"
  3. **Expected**: Sync runs, fetches profile, media, comments, insights, updates last_synced_at

- [ ] **Test: Token expiry handling**
  1. If access token is expired
  2. **Expected**: Shows "Token Expired - Reconnect Required" status, sync button prompts to reconnect

- [ ] **Test: Error states**
  1. All tabs should show appropriate error states if API calls fail
  2. **Expected**: Clear error messages, no blank screens, actionable CTAs

- [ ] **Test: Mobile responsiveness**
  1. Test on mobile viewport
  2. **Expected**: Layout adapts, tabs are accessible, forms are usable

## Database Migrations
Before testing, ensure these migrations have been run:
- [ ] `migrations/add_instagram_comment_reply_fields.sql`
- [ ] `migrations/add_instagram_sync_state_insights_fields.sql`
- [ ] `migrations/create_instagram_messages_tables.sql`

## Environment Variables
Ensure these are set:
- `INSTAGRAM_APP_ID`
- `INSTAGRAM_APP_SECRET`
- `INSTAGRAM_REDIRECT_URI`
- `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` (for webhooks)
- `INSTAGRAM_WEBHOOK_SECRET` (optional, for signature verification)

## Notes
- Comment replies use the official Instagram Graph API endpoint: `POST /{comment-id}/replies`
- Publishing uses 2-step flow: create media container, then publish
- Insights are fetched during sync and stored in `instagram_insights_daily` table
- Messages require webhook setup in Meta Developer Console pointing to `/api/webhooks/instagram`
- All data is cached in Supabase tables for fast UI rendering
