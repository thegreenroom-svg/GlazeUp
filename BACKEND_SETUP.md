# GlazeUp Backend Setup

Phase 1: Square OAuth + Stripe Billing + Admin Dashboard

## What This Does

- **Square OAuth**: Studio owners connect their Square account → GlazeUp reads transaction history and customer data
- **Stripe Billing**: You charge studios monthly subscriptions (£29-79/month)
- **Admin Dashboard**: Studio owners see analytics, revenue trends, app usage, popular designs
- **Data Sync**: Daily job pulls Square data and caches it in Supabase for analytics

## Prerequisites

- Node.js 18+
- npm
- Supabase project (free tier works)
- Square developer account (free)
- Stripe account (free tier works)

## 1. Square Setup

1. Go to [Square Developer Dashboard](https://developer.squareup.com/)
2. Create an application
3. Go to **Credentials** → copy your **Client ID**
4. Go to **OAuth** → set Redirect URI to `https://your-domain.com/api/square/callback`
5. Copy your **Client Secret**
6. Add to `.env`:
   ```
   SQUARE_CLIENT_ID=sq0atp...
   SQUARE_CLIENT_SECRET=sq0csp...
   SQUARE_ENVIRONMENT=sandbox  # or 'production'
   ```

## 2. Stripe Setup

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Create three price IDs for your plans:
   - Starter: £29/month
   - Professional: £49/month
   - Enterprise: £79/month or custom
3. Copy the **Price IDs** from each price
4. Go to **Webhooks** → create endpoint at `https://your-domain.com/api/webhooks/stripe`
5. Add events: `customer.subscription.updated`, `customer.subscription.deleted`
6. Copy your **Webhook Secret**
7. Add to `.env`:
   ```
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_PUBLISHABLE_KEY=pk_live_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   STRIPE_PRICE_STARTER=price_...
   STRIPE_PRICE_PROFESSIONAL=price_...
   STRIPE_PRICE_ENTERPRISE=price_...
   ```

## 3. Supabase Setup

Run the SQL in `sql/integration-schema.sql` in your Supabase SQL editor. This creates:
- `square_connections` (store OAuth tokens)
- `sync_logs` (track data syncs)
- `stripe_subscriptions` (billing records)
- `analytics_cache` (pre-computed metrics)
- `customer_app_activity` (app usage tracking)

## 4. Environment

Copy `.env.example` to `.env` and fill in all values:

```bash
cp .env.example .env
nano .env  # Edit with your keys
```

## 5. Install & Run

```bash
# Install backend dependencies
npm install

# Run locally
npm run dev

# Or start
npm start
```

Server runs on `http://localhost:3000`

## 6. Update App Configuration

In `js/studio-config.js`, update the Supabase credentials:

```javascript
const SUPABASE_URL = 'https://xxxxx.supabase.co';
const SUPABASE_KEY = 'eyJhbGci...';
```

Also update in `admin/dashboard.html`:

```javascript
const API_URL = 'http://localhost:3000';  // Change to your deployed API
```

## 7. Deploy

### Option A: Deploy to Render (recommended for Node.js)

1. Push repo to GitHub
2. Go to [Render](https://render.com/)
3. Create Web Service → select your GitHub repo
4. Set Build Command: `npm install`
5. Set Start Command: `npm start`
6. Add Environment Variables from `.env`
7. Deploy

### Option B: Deploy to Railway

1. Push to GitHub
2. Go to [Railway](https://railway.app/)
3. Create Project → select GitHub repo
4. Add environment variables
5. Deploy

### Option C: Deploy to Vercel (serverless)

1. Vercel can run Node.js but it's better for frontend
2. Instead, use Render or Railway for the backend
3. Set API_URL in `admin/dashboard.html` to your Render/Railway URL

## 8. API Endpoints

**Square**

- `GET /api/square/authorize?studioId=XXX` → Returns OAuth URL
- `GET /api/square/callback` → OAuth callback
- `POST /api/square/sync` → Manually trigger sync
- `GET /api/analytics/dashboard?studioId=XXX` → Get dashboard data

**Stripe**

- `POST /api/stripe/subscribe` → Create subscription
  ```json
  {
    "studioId": "...",
    "plan": "starter",
    "email": "studio@example.com"
  }
  ```
- `GET /api/stripe/subscription?studioId=XXX` → Get subscription status
- `POST /api/webhooks/stripe` → Webhook handler

**Analytics**

- `GET /api/analytics/dashboard?studioId=XXX` → Dashboard metrics
- `POST /api/analytics/activity` → Log app usage (called from customer app)
  ```json
  {
    "studioId": "...",
    "appSessionId": "...",
    "tabUsed": "colours|preview|print",
    "designId": "...",
    "gazeMatchedTo": "..."
  }
  ```

## 9. Testing

**Test Square OAuth**

1. Go to `http://localhost:3000/api/square/authorize?studioId=demo`
2. Should redirect to Square login
3. Approve scopes
4. Should redirect back to dashboard with `?square=connected`

**Test Stripe Subscription**

1. Go to `http://localhost:3000/api/stripe/subscribe` (POST)
2. Pass `studioId`, `plan`, `email`
3. Should return subscription ID

**Test Sync**

1. Go to `http://localhost:3000/api/square/sync` (POST)
2. Pass `studioId`
3. Check `sync_logs` table in Supabase

## 10. Monitoring

Check Supabase SQL Editor to see:

```sql
SELECT * FROM sync_logs ORDER BY created_at DESC LIMIT 10;
SELECT * FROM analytics_cache WHERE studio_id = 'demo';
SELECT * FROM stripe_subscriptions;
```

## Next Steps

- Add more analytics (customer repeat rates, peak times)
- Build student dashboard (see their history)
- Add design upload for studios
- Glaze palette management UI
- Bisque catalogue upload
- Email notifications for failed payments

## Troubleshooting

**Square OAuth not working**

- Check CORS in server.js
- Make sure redirect URI matches in Square dashboard
- Use `sandbox` environment first

**Stripe webhooks not firing**

- Check webhook secret in `.env`
- Test webhook in Stripe dashboard
- Make sure server is accessible (use ngrok for local testing)

**Sync errors**

- Check sync_logs table for error messages
- Make sure Square token isn't expired
- Verify Square API permissions in dashboard

---

Questions? Check Square and Stripe docs, or ask in Slack.
