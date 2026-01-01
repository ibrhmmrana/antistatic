# Antistatic – Project Status

## 1. Summary

- **Onboarding & Account Setup**: Fully functional 3-step onboarding flow (business search → connect channels → choose tools) with Google Places API integration and business location storage in Supabase.
- **Google Business Profile Integration**: Complete OAuth flow, token management with refresh, and API endpoints for fetching reviews, posting replies, and listing locations. Connection state tracked in database.
- **Dashboard Foundation**: Basic dashboard UI with metrics cards, business summary, and next steps checklist. Navigation shell in place with routes to Reviews, Messaging, Social, Listings, Automations, and Settings (pages not yet built).
- **Technical Stack**: Next.js 14 (App Router) + Supabase (Auth, Database, RLS) + TypeScript + Tailwind CSS + Material-UI icons. Google APIs: Places, Maps, Business Profile (My Business API v4).
- **Core Infrastructure**: Database schema with profiles, business_locations, and connected_accounts tables. Row-level security policies. Token refresh mechanism for GBP OAuth.

## 2. Feature Map – What Exists vs What's Missing

### 2.1 Onboarding & Account Setup

**Completed**
- ✓ User authentication via Supabase Auth with email/password
- ✓ 3-step onboarding flow: Business Info → Connect Channels → Choose Tools
- ✓ Business search using Google Places Autocomplete API
- ✓ Business location selection with preview (address, rating, photos, map)
- ✓ Business location data stored in `business_locations` table with place_id, rating, review_count, etc.
- ✓ Tool selection UI (Reputation Hub, Social Studio, Competitor Radar) with enabled_tools stored as array
- ✓ Onboarding completion tracking via `onboarding_completed` flag in profiles table
- ✓ Onboarding step routing logic that redirects users to correct step based on progress
- ✓ Social media username inputs (Facebook, Instagram, LinkedIn, X) stored in business_locations

**In Progress / Partial**
- ⚙ LinkedIn OAuth callback route exists (`app/auth/callback/linkedin/route.ts`) but connection UI not wired up in connect-accounts component

**Planned / Missing**
- ☐ Multi-location support (currently only supports one location per user)
- ☐ Business location editing/updating after onboarding
- ☐ Onboarding skip/resume functionality for returning users
- ☐ Business verification/validation step (Assumption)

### 2.2 Google Business Profile (GBP) Integration

**Completed**
- ✓ Dedicated GBP OAuth client (separate from Supabase Auth) with `business.manage` scope
- ✓ OAuth flow with state parameter for CSRF protection
- ✓ Token storage (access_token, refresh_token, expires_at, scopes) in `connected_accounts` table
- ✓ Automatic token refresh when expired using refresh_token
- ✓ GBP API client with `getValidAccessToken()` helper that handles refresh automatically
- ✓ API endpoint to fetch GBP locations (`/api/gbp/locations`)
- ✓ API endpoint to fetch reviews for a location (`/api/gbp/reviews`) with pagination
- ✓ API endpoint to post/update review replies (`/api/gbp/replies`)
- ✓ Connection verification (smoke test) after OAuth callback
- ✓ Connection status display in onboarding UI (Connected/Not connected pill)
- ✓ Error handling with specific error messages for OAuth failures

**In Progress / Partial**
- ⚙ Location matching logic uses first location returned (TODO comment mentions matching by placeId)

**Planned / Missing**
- ☐ GBP Messages API integration (for inbox functionality)
- ☐ GBP Insights/Analytics API integration
- ☐ Multi-account GBP support (currently uses first account)
- ☐ GBP location selection UI if user has multiple locations
- ☐ GBP connection management (disconnect, reconnect, view connection details)

### 2.3 Reviews & Messaging

**Completed**
- ✓ Backend API to fetch GBP reviews with pagination, filtering, sorting
- ✓ Backend API to post replies to GBP reviews
- ✓ Review data structure defined in TypeScript (GBPReview interface)

**In Progress / Partial**
- ⚙ Dashboard metrics card shows placeholder "0" for new reviews (TODO: Get from reviews API)
- ⚙ Navigation includes `/reviews` route but page doesn't exist
- ⚙ Navigation includes `/messaging` route but page doesn't exist

**Planned / Missing**
- ☐ Reviews page UI (list view, filters, search, pagination)
- ☐ Review detail view with reply history
- ☐ Review reply templates system
- ☐ Bulk reply actions
- ☐ Review sentiment analysis/classification
- ☐ Review notifications/alerts
- ☐ Messaging inbox UI (unified inbox for GBP messages + reviews)
- ☐ Message threading and conversation view
- ☐ Message templates for common responses
- ☐ WhatsApp Business API integration (Assumption - mentioned in tool description)
- ☐ Meta/Facebook Messenger integration (Assumption)
- ☐ SMS integration for review requests (mentioned in tool description)
- ☐ Email integration for review requests (mentioned in tool description)

### 2.4 Social Media & Content

**Completed**
- ✓ Social username fields in database (facebook_username, instagram_username, linkedin_username, x_username)
- ✓ Social username input UI in onboarding (manual entry only)

**In Progress / Partial**
- ⚙ Dashboard metrics card shows placeholder "0" for social posts (TODO: Get from social API)
- ⚙ Navigation includes `/social` route but page doesn't exist
- ⚙ Tool selection includes "Social Studio" with description of AI content generation and scheduling

**Planned / Missing**
- ☐ Social media posting/scheduling system
- ☐ Content calendar UI
- ☐ AI content generation (mentioned in Social Studio tool description)
- ☐ Multi-channel posting (Facebook, Instagram, LinkedIn, X)
- ☐ Social media account connections (OAuth for Facebook, Instagram, LinkedIn, X)
- ☐ Post scheduling with timezone support
- ☐ Content library/templates
- ☐ Social analytics (reach, engagement tracking mentioned in tool description)
- ☐ Content approval workflow (Assumption)

### 2.5 Competitor & Analytics Features

**Completed**
- ✓ Tool selection includes "Competitor Radar" with description

**In Progress / Partial**
- ⚙ Tool selection includes "Insights Lab" marked as "Coming soon"

**Planned / Missing**
- ☐ Competitor watchlist functionality
- ☐ Competitor alerts (review spikes, high-performing content)
- ☐ Competitor comparison UI (ratings, review volume)
- ☐ Insights Lab: Cross-channel performance dashboard
- ☐ Insights Lab: Sentiment analysis across reviews and social
- ☐ Insights Lab: Report generation and sharing
- ☐ Analytics charts and visualizations
- ☐ Export reports (PDF, CSV) (Assumption)

### 2.6 Listings & Presence Management

**Completed**
- ✓ Tool selection includes "Presence & Listings" marked as "Coming soon"

**In Progress / Partial**
- ⚙ Navigation includes `/listings` route but page doesn't exist

**Planned / Missing**
- ☐ Business listings management UI
- ☐ Directory sync (Google, Yelp, etc.) (Assumption)
- ☐ Listing health monitoring (broken links, incorrect hours, missing profiles)
- ☐ Bulk listing updates
- ☐ NAP (Name, Address, Phone) consistency checking

### 2.7 Automations & AI

**Completed**
- ✓ Dashboard includes "AI Assist" card with links to automations
- ✓ Navigation includes `/automations` route but page doesn't exist

**In Progress / Partial**
- ⚙ AI Assist card mentions: "Auto-reply to new reviews", "Draft social posts", "Set alerts for competitors"

**Planned / Missing**
- ☐ Automation rules engine
- ☐ Auto-reply to reviews based on sentiment/rules
- ☐ AI-powered reply suggestions
- ☐ AI content generation for social posts
- ☐ Alert/notification system for competitors and keywords
- ☐ Workflow builder UI for automations
- ☐ Automation templates
- ☐ AI model integration (OpenAI, Anthropic, etc.) (Assumption)

### 2.8 Billing & Subscription

**Completed**
- ✓ Dashboard includes "Plan Card" component with trial information

**In Progress / Partial**
- ⚙ Plan card shows placeholder data (TODO: Wire up to real billing data)
- ⚙ Plan card links to `/settings/billing` but page doesn't exist

**Planned / Missing**
- ☐ Subscription plans definition (Free Trial, Starter, Pro, Enterprise) (Assumption)
- ☐ Payment processing integration (Stripe, etc.) (Assumption)
- ☐ Billing page UI
- ☐ Plan upgrade/downgrade flow
- ☐ Usage limits enforcement (e.g., "1 of 3 locations connected")
- ☐ Trial expiration handling
- ☐ Invoice generation and history
- ☐ Payment method management
- ☐ Subscription cancellation flow

### 2.9 Team & Collaboration

**Completed**
- ✓ Next steps checklist includes "Invite a teammate" item

**In Progress / Partial**
- ⚙ Checklist links to `/settings/team` but page doesn't exist

**Planned / Missing**
- ☐ Team member invitation system
- ☐ Role-based access control (RBAC)
- ☐ User permissions management
- ☐ Team member management UI
- ☐ Activity logs/audit trail
- ☐ Shared inbox/workload distribution

### 2.10 Settings & Configuration

**Completed**
- ✓ Navigation includes `/settings` route but page doesn't exist
- ✓ Next steps checklist includes "Configure review reply templates" linking to `/settings/templates`

**In Progress / Partial**
- ⚙ Settings routes referenced but not implemented

**Planned / Missing**
- ☐ Settings page with tabs/sections
- ☐ Account settings (profile, password, preferences)
- ☐ Business location settings (edit, add, remove)
- ☐ Connected accounts management (view, disconnect, reconnect)
- ☐ Notification preferences
- ☐ Review reply templates management
- ☐ Brand voice/tone configuration for AI
- ☐ API keys/integrations management
- ☐ Data export/deletion (GDPR compliance) (Assumption)

### 2.11 Influencer Layer

**Completed**
- (No code found related to influencer features)

**Planned / Missing**
- ☐ Influencer discovery/search
- ☐ Influencer profile management
- ☐ Campaign creation and management
- ☐ Influencer outreach/messaging
- ☐ Performance tracking for influencer campaigns
- ☐ Payment/compensation tracking (Assumption)

## 3. Technical & Infrastructure Work

### 3.1 Completed
- ✓ Next.js 14 App Router setup with TypeScript
- ✓ Supabase integration (Auth, Database, RLS policies)
- ✓ Environment variable configuration
- ✓ Database migrations for core tables (profiles, business_locations, connected_accounts)
- ✓ Row-level security (RLS) policies for data isolation
- ✓ Server-side Supabase client creation pattern
- ✓ Client-side Supabase client for browser usage
- ✓ Middleware for auth protection
- ✓ Google Places API integration
- ✓ Google Maps Static API integration
- ✓ Token refresh mechanism for GBP OAuth
- ✓ Error handling patterns in API routes
- ✓ TypeScript type definitions for database schema

### 3.2 In Progress / Partial
- ⚙ Logging: Console.log statements throughout, no structured logging system
- ⚙ Error handling: Basic try/catch, no centralized error tracking (Sentry, etc.)

### 3.3 Planned / Missing
- ☐ Structured logging system (Winston, Pino, etc.) (Assumption)
- ☐ Error tracking/monitoring (Sentry, LogRocket, etc.) (Assumption)
- ☐ Analytics tracking (Mixpanel, Amplitude, etc.) (Assumption)
- ☐ Background job system (for scheduled tasks, webhooks, etc.) (Assumption)
- ☐ Webhook handling for GBP events (Assumption)
- ☐ Rate limiting on API routes (Assumption)
- ☐ API documentation (OpenAPI/Swagger) (Assumption)
- ☐ Database backups strategy (Supabase handles this, but verify)
- ☐ CI/CD pipeline (GitHub Actions, etc.) (Assumption)
- ☐ Testing suite (unit, integration, e2e) (Assumption)
- ☐ Performance monitoring (APM)
- ☐ Caching strategy (Redis, etc.) for API responses (Assumption)
- ☐ CDN setup for static assets
- ☐ Environment-specific configurations (dev, staging, prod)

## 4. Known TODOs from the Codebase

- `components/dashboard/metrics-cards.tsx` (line 30) – Replace with real data once integrations are wired up
- `components/dashboard/metrics-cards.tsx` (line 38) – Get new reviews count from reviews API
- `components/dashboard/metrics-cards.tsx` (line 48) – Get inbox count from messaging API
- `components/dashboard/metrics-cards.tsx` (line 58) – Get social posts count from social API
- `components/dashboard/business-summary-card.tsx` (line 19) – Get locations count from database
- `components/dashboard/plan-card.tsx` (line 9) – Wire up to real billing data
- `lib/gbp/social-profiles.ts` (deleted, but was referenced) – Location matching by placeId instead of first location

## 5. Suggested Project Backlog (for Notion)

- **Name** – Complete Onboarding Flow  
  **Category** – Product  
  **Status** – Done  
  **Priority** – High  
  **Description** – Implemented 3-step onboarding: business search with Google Places, channel connection (GBP OAuth), and tool selection. Data persisted to Supabase with proper RLS policies.  
  **Notes** – Multi-location support is a future enhancement.

- **Name** – Google Business Profile OAuth Integration  
  **Category** – Integrations  
  **Status** – Done  
  **Priority** – High  
  **Description** – Built dedicated GBP OAuth flow separate from Supabase Auth, with token storage, automatic refresh, and API client for reviews/replies/locations.  
  **Notes** – Uses business.manage scope. Token refresh tested. Consider adding multi-account support.

- **Name** – Reviews Page & Management UI  
  **Category** – Product  
  **Status** – Not started  
  **Priority** – High  
  **Description** – Build reviews list page with filters, search, pagination, and detail view. Integrate with existing `/api/gbp/reviews` endpoint. Add reply UI using `/api/gbp/replies`.  
  **Notes** – Backend APIs exist. Need frontend components and state management.

- **Name** – Messaging Inbox  
  **Category** – Product  
  **Status** – Not started  
  **Priority** – High  
  **Description** – Unified inbox for GBP messages and review conversations. Threading, conversation view, quick replies, and templates.  
  **Notes** – GBP Messages API integration needed. Consider WhatsApp/Meta Messenger for future.

- **Name** – Social Media Posting & Scheduling  
  **Category** – Product  
  **Status** – Not started  
  **Priority** – Medium  
  **Description** – Content calendar, post composer, scheduling system, and multi-channel publishing (Facebook, Instagram, LinkedIn, X).  
  **Notes** – Requires OAuth connections for each platform. Social Studio tool is selected in onboarding but not built.

- **Name** – AI Content Generation  
  **Category** – Product  
  **Status** – Not started  
  **Priority** – Medium  
  **Description** – AI-powered social post generation and review reply suggestions. Integrate with OpenAI/Anthropic API.  
  **Notes** – Mentioned in tool descriptions. Need brand voice configuration UI.

- **Name** – Review Reply Templates  
  **Category** – Product  
  **Status** – Not started  
  **Priority** – Medium  
  **Description** – Template management system for review replies. CRUD UI, template variables, and quick-apply in reviews page.  
  **Notes** – Referenced in next steps checklist. Should integrate with AI suggestions.

- **Name** – Competitor Radar  
  **Category** – Product  
  **Status** – Not started  
  **Priority** – Low  
  **Description** – Competitor watchlist, alerts for review spikes and content performance, and comparison dashboard.  
  **Notes** – Tool is selectable in onboarding but not implemented. Requires competitor data source (Google Places, manual entry, etc.).

- **Name** – Billing & Subscription System  
  **Category** – Billing  
  **Status** – Not started  
  **Priority** – High  
  **Description** – Stripe integration, plan management, upgrade/downgrade flows, usage limits, and invoice generation.  
  **Notes** – Plan card exists with placeholder data. Critical for monetization.

- **Name** – Team Management  
  **Category** – Product  
  **Status** – Not started  
  **Priority** – Medium  
  **Description** – Team member invitations, role-based access control, permissions management, and activity logs.  
  **Notes** – Referenced in next steps checklist. Important for multi-user accounts.

- **Name** – Settings Pages  
  **Category** – Product  
  **Status** – Not started  
  **Priority** – Medium  
  **Description** – Comprehensive settings UI: account, business locations, connected accounts, notifications, templates, and integrations.  
  **Notes** – Navigation includes settings but no pages exist. Many features depend on this.

- **Name** – Presence & Listings Management  
  **Category** – Product  
  **Status** – Not started  
  **Priority** – Low  
  **Description** – Business listings sync across directories, health monitoring, and bulk updates.  
  **Notes** – Marked "Coming soon" in tool selection. Lower priority than core review/messaging features.

- **Name** – Insights Lab  
  **Category** – Analytics  
  **Status** – Not started  
  **Priority** – Low  
  **Description** – Cross-channel analytics dashboard, sentiment analysis, and report generation.  
  **Notes** – Marked "Coming soon". Requires data from reviews, social, and messaging first.

- **Name** – Automation Rules Engine  
  **Category** – Product  
  **Status** – Not started  
  **Priority** – Medium  
  **Description** – Workflow builder for auto-replies, alerts, and scheduled actions. Integration with AI for smart triggers.  
  **Notes** – AI Assist card references this. Core value proposition for time-saving.

- **Name** – WhatsApp & Meta Messenger Integration  
  **Category** – Integrations  
  **Status** – Not started  
  **Priority** – Medium  
  **Description** – OAuth connections for WhatsApp Business API and Facebook Messenger. Message handling in unified inbox.  
  **Notes** – Mentioned in Reputation Hub tool description. Requires Meta Business API setup.

- **Name** – LinkedIn Connection  
  **Category** – Integrations  
  **Status** – In progress  
  **Priority** – Low  
  **Description** – Wire up LinkedIn OAuth callback that already exists. Add connection UI in connect-accounts component.  
  **Notes** – Callback route exists but not integrated into main flow.

- **Name** – Error Tracking & Monitoring  
  **Category** – Engineering  
  **Status** – Not started  
  **Priority** – High  
  **Description** – Integrate Sentry or similar for error tracking, performance monitoring, and alerting.  
  **Notes** – Critical for production reliability. Currently only console.log.

- **Name** – Structured Logging  
  **Category** – Engineering  
  **Status** – Not started  
  **Priority** – Medium  
  **Description** – Replace console.log with structured logging system (Winston/Pino). Add log levels and context.  
  **Notes** – Improves debugging and observability.

- **Name** – Testing Suite  
  **Category** – Engineering  
  **Status** – Not started  
  **Priority** – Medium  
  **Description** – Unit tests for utilities, integration tests for API routes, and E2E tests for critical flows (onboarding, GBP connection).  
  **Notes** – Important for maintaining code quality as features grow.

- **Name** – CI/CD Pipeline  
  **Category** – Ops  
  **Status** – Not started  
  **Priority** – Medium  
  **Description** – GitHub Actions workflow for automated testing, building, and deployment to staging/production.  
  **Notes** – Assumes deployment target (Vercel, etc.). Standard for SaaS apps.

- **Name** – API Rate Limiting  
  **Category** – Engineering  
  **Status** – Not started  
  **Priority** – Medium  
  **Description** – Add rate limiting to API routes to prevent abuse. Use middleware or service like Upstash Redis.  
  **Notes** – Important for API cost control and security.

- **Name** – Database Backup Strategy  
  **Category** – Ops  
  **Status** – Not started  
  **Priority** – High  
  **Description** – Verify Supabase automatic backups and set up manual backup schedule. Document recovery procedures.  
  **Notes** – Critical for data safety. Supabase may handle this automatically.

- **Name** – Multi-Location Support  
  **Category** – Product  
  **Status** – Not started  
  **Priority** – Medium  
  **Description** – Allow users to add and manage multiple business locations. Update onboarding, dashboard, and all features to support location switching.  
  **Notes** – Current schema supports it (business_location_id in connected_accounts), but UI assumes single location.

- **Name** – Influencer Discovery & Management  
  **Category** – Product  
  **Status** – Not started  
  **Priority** – Low  
  **Description** – Build influencer layer: search, profiles, campaign management, outreach, and performance tracking.  
  **Notes** – Mentioned in product description but no code exists. Likely Phase 2 feature.

_Generated by Cursor audit on 2024-12-19_











