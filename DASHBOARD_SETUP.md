═══════════════════════════════════════════════════════════════════════════════
GlazeUp Admin Dashboard · Quick Setup
═══════════════════════════════════════════════════════════════════════════════

The admin dashboard (`admin/dashboard-local.html`) is now connected to the backend API.

It works in three modes:

1. **With API running** — Fetches real data from your backend
2. **Without API** — Falls back to mock data (for prototyping)
3. **Anywhere** — Works in browser or served via HTTP

═══════════════════════════════════════════════════════════════════════════════
QUICKSTART
═══════════════════════════════════════════════════════════════════════════════

### Option A: Frontend only (mock data, no backend)

```bash
cd glazeup
npx serve .
```

Visit: `http://localhost:3000/admin/dashboard-local.html?studio=demo`

You'll see mock data. API status shows "✗ Using Mock Data".

### Option B: Frontend + Backend (real data)

Terminal 1 — Start backend:
```bash
npm start
```

Terminal 2 — Start frontend:
```bash
cd glazeup
npx serve .
```

Visit: `http://localhost:3000/admin/dashboard-local.html?studio=demo`

You'll see real data if backend is connected. API status shows "✓ API Connected".

### Option C: Direct file (no server needed)

Just download `admin/dashboard-local.html` and open it in your browser:
```bash
open admin/dashboard-local.html
# or: firefox admin/dashboard-local.html
```

This will use mock data. Good for presentations or offline work.

═══════════════════════════════════════════════════════════════════════════════
HOW IT WORKS
═══════════════════════════════════════════════════════════════════════════════

1. **Page loads** → Tries to connect to API (`localhost:3000`)
2. **API responds** → Dashboard fetches real data, shows "✓ API Connected"
3. **API doesn't respond** → Uses mock data, shows "✗ Using Mock Data"
4. **Data displayed** → Either real or mock, you can't tell the difference
5. **Form submit** → Attempts to POST to API, falls back gracefully

All data updates are real-time if the API is running.

═══════════════════════════════════════════════════════════════════════════════
URL PARAMETERS
═══════════════════════════════════════════════════════════════════════════════

`?studio=STUDIO_ID` — Which studio to view

Examples:
  - `?studio=demo` — Demo studio (default)
  - `?studio=kiln-cafe` — The Kiln Cafe
  - `?studio=london-pottery` — London Pottery Studio

───────────────────────────────────────────────────────────────────────────────

`?api=http://your-api.com` — Override API URL (saved to localStorage)

Examples:
  - `?api=http://localhost:3000` — Local backend
  - `?api=https://api.glazeup.app` — Production backend

Or change it in the browser console:
```javascript
localStorage.setItem('glazeup_api_url', 'http://your-api.com');
location.reload();
```

═══════════════════════════════════════════════════════════════════════════════
WHAT THE DASHBOARD CAN DO
═══════════════════════════════════════════════════════════════════════════════

✓ Read
  - Get dashboard metrics (revenue, sessions, designs, tools)
  - Load studio branding settings
  - View sync logs and Square connection status

✓ Write
  - Save branding changes (name, colours, tagline, footer)
  - Connect Square account (OAuth flow)
  - Set up Stripe billing
  - Trigger manual sync

✓ Display
  - Real-time revenue chart
  - Popular designs list
  - Tool usage breakdown
  - App session count
  - Square/Stripe connection status

═══════════════════════════════════════════════════════════════════════════════
TESTING
═══════════════════════════════════════════════════════════════════════════════

1. Open dashboard with mock data:
   - http://localhost:3000/admin/dashboard-local.html?studio=demo
   - API Status: ✗ Using Mock Data
   - Metrics show: £1,240 revenue, 47 sessions, Transfers most popular

2. Start backend:
   - npm start
   - Refresh dashboard

3. API Status should change to: ✓ API Connected
   - If it doesn't, check backend logs
   - Make sure CORS is enabled (it is in server.js)

4. Test forms:
   - Try saving branding changes
   - Should show success message if API is running
   - Should show error if API is down

5. Test with different studio ID:
   - ?studio=kiln-cafe
   - API will return 404 if studio doesn't exist
   - Dashboard falls back to mock data

═══════════════════════════════════════════════════════════════════════════════
TROUBLESHOOTING
═══════════════════════════════════════════════════════════════════════════════

**API Status shows "✗ Using Mock Data"**

- Is backend running? `npm start` in terminal
- Is backend on port 3000? Check for errors
- Firewall blocking? Try `localhost` vs `127.0.0.1`
- Check browser console (F12) for CORS errors

**Mock data shows but I want real data**

- Make sure backend is running BEFORE you load the dashboard
- Refresh page (Ctrl+R or Cmd+R)
- Check that `http://localhost:3000/health` returns `{"status":"ok"}`

**Forms don't save**

- Check API status indicator
- Check browser console for error messages
- Make sure Supabase is set up (for API to save to database)

**Different studio, different data**

- Add `?studio=kiln-cafe` to URL
- API will fetch data for that studio from Supabase
- If studio doesn't exist, you see mock data

═══════════════════════════════════════════════════════════════════════════════
API ENDPOINTS USED
═══════════════════════════════════════════════════════════════════════════════

GET /health
  Check if API is running

GET /api/analytics/dashboard?studioId=STUDIO_ID
  Fetch dashboard metrics

POST /api/studio/branding
  Save branding settings
  Body: { studioId, name, tagline, primaryColour, secondaryColour, footer }

GET /api/square/authorize?studioId=STUDIO_ID
  Start Square OAuth (redirects to Square login)

POST /api/stripe/subscribe
  Create Stripe subscription
  Body: { studioId, plan, email }

All endpoints support CORS. No auth token needed (yet).

═══════════════════════════════════════════════════════════════════════════════
NEXT STEPS
═══════════════════════════════════════════════════════════════════════════════

1. Get Square API credentials (sandbox first)
2. Get Stripe API credentials
3. Set up Supabase project
4. Fill in .env file
5. Test OAuth flows
6. Deploy backend to Render/Railway
7. Update API_URL in dashboard to production
8. Invite first studios to try it

═══════════════════════════════════════════════════════════════════════════════
