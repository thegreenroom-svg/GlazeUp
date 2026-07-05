# GlazeUp Quick Start

Get the full stack running locally in 10 minutes.

## 1. Clone and setup

```bash
git clone <your-repo>
cd glazeup
npm install  # top-level, if you have any
cd backend
npm install
cd ..
```

## 2. Create Supabase project

1. Go to [supabase.com](https://supabase.com)
2. Create a new project (free tier is fine)
3. Go to **Settings → API**
4. Copy **Project URL** and **Service Role Key**

## 3. Run database schema

1. In Supabase, go to **SQL Editor**
2. Click "New Query"
3. Paste contents of `sql/schema.sql`
4. Click "Run"

## 4. Set up environment

Create `backend/.env`:

```bash
cd backend
cp .env.example .env
```

Edit `.env` and fill in:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGci...  # the long key from settings
SQUARE_APPLICATION_ID=sq0atp-xxx  # or leave blank for demo
STRIPE_SECRET_KEY=sk_test_xxx     # or leave blank for demo
API_URL=http://localhost:3001
FRONTEND_URL=http://localhost:3000
NODE_ENV=development
```

You can leave Square and Stripe blank for now — the app will still work.

## 5. Start the backend

```bash
cd backend
npm run dev
```

You should see:
```
GlazeUp backend running on port 3001
```

## 6. Start the frontend

In a new terminal, from the `glazeup` root:

```bash
npx serve .
```

Or if you have Python:
```bash
python3 -m http.server 8000
```

You should see:
```
HTTP server listening at http://localhost:8000
```

## 7. Test it

1. Open **http://localhost:8000** on your phone or iPad
2. Try the **Colours** tab:
   - Take a photo or upload an image
   - See colour matching (uses demo Stroke & Coat palette)
3. Try **Transfers**:
   - Pick a bisque shape or upload a photo
   - Choose a transfer design
   - Drag, pinch to zoom, rotate
   - Send to print

## 8. (Optional) Connect to your Square account

For analytics to work:

1. Get **Application ID** and **Application Secret** from [Square Dashboard](https://developer.squareup.com)
2. Add to `backend/.env`:
   ```
   SQUARE_APPLICATION_ID=sq0atp-xxx
   SQUARE_APPLICATION_SECRET=sq0csp-xxx
   SQUARE_ENVIRONMENT=sandbox  # for testing
   ```
3. Restart backend with `npm run dev`

## 9. (Optional) Set up Stripe for billing

1. Create account at [stripe.com](https://stripe.com)
2. Go to **Dashboard → API keys**
3. Copy test keys into `backend/.env`:
   ```
   STRIPE_PUBLIC_KEY=pk_test_xxx
   STRIPE_SECRET_KEY=sk_test_xxx
   ```
4. Create product "GlazeUp" and a price for £29/month (test mode)
5. Add price ID to `.env`:
   ```
   STRIPE_PRICE_STARTER=price_1234567890
   ```

## 10. Test studio creation

1. Backend health check:
   ```bash
   curl http://localhost:3001/health
   ```

2. Create a studio:
   ```bash
   curl -X POST http://localhost:3001/api/auth/signup \
     -H "Content-Type: application/json" \
     -d '{
       "studioName": "The Kiln Cafe",
       "studioSlug": "the-kiln-cafe",
       "email": "daisy@thekilncafe.com",
       "phone": "+44123456789"
     }'
   ```

3. Should return a `studioId` — save it

4. Check studio:
   ```bash
   curl http://localhost:3001/api/auth/studio/the-kiln-cafe
   ```

## Stopping

Press `Ctrl+C` in each terminal to stop the servers.

## Next steps

- Read `backend/README.md` for API details
- Read `backend/.env.example` for all env vars
- Check `sql/schema.sql` to understand the database
- Explore `js/designs.js` to add your own transfer designs

## Troubleshooting

**"Cannot find module @supabase/supabase-js"**
```bash
cd backend
npm install
```

**"Supabase connection failed"**
Check `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` in `.env`

**"Port 3001 already in use"**
```bash
PORT=3002 npm run dev
```

**"CORS error from frontend"**
Check `FRONTEND_URL` in `.env` matches where you're running the frontend

## Questions?

Check README.md for full documentation, or see `backend/README.md` for API details.
