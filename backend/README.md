# GlazeUp Backend

**Express.js server** with Square OAuth, Stripe billing, and Supabase integration.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Environment variables

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

You'll need:
- **Supabase**: Project URL and service key (from Settings → API)
- **Square**: Application ID and secret (from Developer Dashboard)
- **Stripe**: API key and webhook secret (from Dashboard → API keys)

### 3. Database

Ensure your Supabase project has the schema from `../sql/schema.sql` applied.

In Supabase SQL Editor, run:

```sql
-- Paste contents of sql/schema.sql here
```

### 4. Run locally

```bash
npm run dev
```

Server runs on `http://localhost:3001`.

## API Endpoints

### Authentication
- `POST /api/auth/signup` — Create new studio account
- `POST /api/auth/studio-exists` — Check if slug is available
- `GET /api/auth/studio/:slug` — Get public studio info

### Square Integration
- `POST /api/square/oauth/start` — Initiate OAuth flow
- `GET /api/square/oauth/callback` — OAuth callback (redirected from Square)
- `GET /api/square/connection/:studioId` — Get connection status
- `POST /api/square/disconnect/:studioId` — Disconnect account

### Stripe Billing
- `POST /api/stripe/create-subscription` — Create subscription
- `GET /api/stripe/subscription/:studioId` — Get subscription status
- `POST /api/stripe/cancel/:studioId` — Cancel subscription
- `POST /api/stripe/webhook` — Stripe webhook handler

### Admin Dashboard
- `GET /api/admin/dashboard/:studioId` — Get analytics dashboard
- `GET /api/admin/sync-status/:studioId` — Check Square sync status
- `GET /api/admin/sync-logs/:studioId` — Get recent sync logs
- `POST /api/admin/manual-sync/:studioId` — Trigger manual sync

## Scheduled Jobs

The server runs a **Square sync job every hour** (at :00) using `node-cron`. 

The job:
1. Fetches all transactions from Square since last sync
2. Aggregates by date
3. Computes daily analytics (revenue, transaction count, app users)
4. Stores in `studio_analytics` table

To run manually:

```bash
npm run sync-square
```

## Deployment

### Vercel

```bash
vercel
```

### Heroku

```bash
heroku create glazeup-api
git push heroku main
heroku config:set SUPABASE_URL=... STRIPE_SECRET_KEY=... # etc
heroku ps:scale web=1
```

### Railway

Connected repo → auto-deploys on push. Add env vars in project settings.

### Environment for production

Set `SQUARE_ENVIRONMENT=production` and use live API keys (not sandbox).

## Stripe Setup

### Create price IDs

1. Go to Stripe Dashboard → Products
2. Create product "GlazeUp"
3. Add prices:
   - **Starter**: £29/month → copy `price_...`
   - **Pro**: £59/month → copy `price_...`
4. Add to `.env`:

```
STRIPE_PRICE_STARTER=price_1234567890
STRIPE_PRICE_PRO=price_0987654321
```

### Webhook

1. Go to Stripe Dashboard → Webhooks
2. Add endpoint: `https://your-api.com/api/stripe/webhook`
3. Select events: `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.deleted`
4. Copy signing secret to `.env` as `STRIPE_WEBHOOK_SECRET`

## Square Setup

### OAuth

1. Go to Square Developer Dashboard → Applications
2. Copy **Application ID**
3. Copy **Application Secret**
4. Set **Redirect URL** to: `https://your-api.com/api/square/oauth/callback`
5. Add to `.env`:

```
SQUARE_APPLICATION_ID=sq0atp-...
SQUARE_APPLICATION_SECRET=sq0csp-...
```

## Testing

### Test OAuth flow locally

```bash
curl -X POST http://localhost:3001/api/square/oauth/start \
  -H "Content-Type: application/json" \
  -d '{"studioId": "studio-uuid-here"}'
```

Returns an `authUrl` — visit it to authorize.

### Test Stripe subscription

```bash
curl -X POST http://localhost:3001/api/stripe/create-subscription \
  -H "Content-Type: application/json" \
  -d '{
    "studioId": "studio-uuid",
    "email": "studio@example.com",
    "planTier": "starter"
  }'
```

### Check sync status

```bash
curl http://localhost:3001/api/admin/sync-status/studio-uuid
```

## Debugging

Logs go to stdout. Set `LOG_LEVEL=debug` in `.env` for verbose output.

### Common issues

**Square OAuth error**: Check Application ID/Secret are correct and redirect URL is configured.

**Stripe webhook not firing**: Ensure webhook secret is correct. Use Stripe CLI to test locally:

```bash
stripe listen --forward-to localhost:3001/api/stripe/webhook
```

**Sync failing**: Check Square connection tokens aren't expired. The sync job will auto-retry on next cycle.

## Architecture

```
Client (PWA)
    ↓
Backend (Express)
    ├→ Supabase (auth, data, RLS)
    ├→ Square API (transaction sync)
    └→ Stripe API (billing)
```

Each studio has:
- One row in `studios`
- One row in `square_connections` (if linked)
- Daily rows in `studio_analytics` (for dashboards)
- Sync logs in `sync_logs`

All data is row-level secured by `studio_id`.
