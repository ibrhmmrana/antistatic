# Instagram Webhook Testing Plan

## Prerequisites

1. **Environment Variables** (set in `.env.local` or deployment):
   - `META_WEBHOOK_VERIFY_TOKEN` - Random string for webhook verification
   - `META_APP_SECRET` - Meta App Secret from Meta App Dashboard

2. **Database Migrations**:
   - Run `migrations/create_instagram_dm_tables.sql`
   - Run `migrations/add_instagram_webhook_state_fields.sql`

3. **Meta App Configuration**:
   - Instagram Business Account connected via OAuth
   - "Connected Tools → Allow access to Messages" enabled in Meta Business settings

## Local Testing (with ngrok)

### Step 1: Start Local Server
```bash
npm run dev
```

### Step 2: Expose via ngrok
```bash
ngrok http 3000
```

Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`)

### Step 3: Configure Webhook in Meta
1. Go to Meta App Dashboard → Webhooks
2. Add Webhook:
   - **Callback URL**: `https://abc123.ngrok.io/api/webhooks/meta/instagram`
   - **Verify Token**: Value from `META_WEBHOOK_VERIFY_TOKEN` env var
   - **Subscription Fields**: Select `messages` for Instagram

### Step 4: Verify Webhook
- Meta will send a GET request to verify
- Check server logs for: `[Meta Webhook] Verification successful`
- Check Settings tab in app - should show "Webhook Status: Verified"

### Step 5: Send Test DM
1. From a personal Instagram account, send a DM to the connected business account
2. Check server logs for: `[Meta Webhook] Message processed`
3. Check Inbox tab - message should appear within seconds

## Production Testing

### Step 1: Deploy to Production
- Ensure environment variables are set
- Run database migrations

### Step 2: Configure Production Webhook
1. Go to Meta App Dashboard → Webhooks
2. Add Webhook:
   - **Callback URL**: `https://app.antistatic.ai/api/webhooks/meta/instagram`
   - **Verify Token**: Value from `META_WEBHOOK_VERIFY_TOKEN` env var
   - **Subscription Fields**: Select `messages` for Instagram

### Step 3: Verify
- Check Settings tab - should show "Webhook Status: Verified"
- Send test DM and verify it appears in Inbox

## Verification Checklist

- [ ] Webhook GET verification returns 200 with challenge
- [ ] Settings tab shows callback URL and verify token env var name
- [ ] Settings tab shows "Webhook Status: Verified" after Meta verification
- [ ] Inbox shows empty state with instructions when no webhook configured
- [ ] Inbox shows "No DMs received yet" when webhook configured but no messages
- [ ] Sending a DM to connected account appears in Inbox within seconds
- [ ] Messages display correctly with sender/recipient info
- [ ] Conversation list shows last message preview
- [ ] Unmatched events are stored in `instagram_webhook_unmatched_events` table

## Troubleshooting

### Webhook verification fails
- Check `META_WEBHOOK_VERIFY_TOKEN` matches in env and Meta dashboard
- Check server logs for verification errors
- Ensure callback URL is accessible (not behind firewall)

### Messages not appearing
- Check `META_APP_SECRET` is set correctly
- Verify signature validation in server logs
- Check `instagram_webhook_unmatched_events` table for unmatched events
- Verify Instagram account ID matches in `instagram_connections` table

### Signature validation fails
- Ensure `META_APP_SECRET` matches Meta App Dashboard
- Check that raw body is being read before JSON parsing
- Verify `X-Hub-Signature-256` header is present

