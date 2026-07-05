═══════════════════════════════════════════════════════════════════════════════
GlazeUp · Rolling Product Notes
Last updated: 5 July 2026
═══════════════════════════════════════════════════════════════════════════════

PRODUCT VISION
──────────────

GlazeUp is a complete white-label SaaS suite for pottery painting studios worldwide.

Studios subscribe to GlazeUp (£29-79/month) and get:
  ✓ Customer creative tools (colour matcher, transfer preview, print)
  ✓ Staff inventory & firing tracking
  ✓ Admin dashboard (branding, analytics, staff management)
  ✓ Automatic Square sync + Stripe billing
  ✓ QR-based booking integration (coming Phase 3)

Each studio gets their own branding, palette, shapes, and designs.

CURRENT STATUS: Phase 1 built and ready to demo locally
Next: Pilot at The Kiln Cafe, gather feedback, then Phase 2

═══════════════════════════════════════════════════════════════════════════════
PHASE BREAKDOWN
═══════════════════════════════════════════════════════════════════════════════

PHASE 1: Square OAuth + Stripe Billing + Admin Dashboard ✓ DONE
───────────────────────────────────────────────────────────────

Timeline: 4-5 weeks (completed)

Features:
  ✓ Square OAuth flow (studio connects account)
  ✓ Daily Square data sync (transactions, customers, orders)
  ✓ Analytics cache in Supabase
  ✓ Stripe subscription billing setup
  ✓ Admin dashboard (HTML/JS, works locally)
  ✓ Database schema for integration
  ✓ Backend API (Express.js, ready to deploy)
  ✓ Documentation (setup guide, deployment guide)

Files:
  - server.js (880 lines) — Express API
  - admin/dashboard-local.html — Fully functional demo UI (no backend needed)
  - sql/integration-schema.sql — Database tables
  - .env.example — Config template
  - BACKEND_SETUP.md — Step-by-step guide
  - PHASE_1_SUMMARY.md — Overview

Status:
  - Customer app: ✓ Works (colour matcher, transfers, print)
  - Admin dashboard: ✓ Works locally (mock data)
  - Backend: ✓ Built, ready to deploy
  - Database: ✓ Schema written, needs Supabase setup

Next: Test locally, then deploy to Render/Railway

───────────────────────────────────────────────────────────────

PHASE 2: Inventory + Firing Tracker + Staff Dashboard
─────────────────────────────────────────────────────

Timeline: 4 weeks (weeks 5-8)

Purpose: Staff can track pottery pieces through the entire kiln cycle

Features:
  - Inventory tracking (bisque in stock, glaze bottles, supplies)
  - Piece submission (customer finishes painting → staff marks "ready for dip")
  - Dip & glaze management (track which pieces get clear glazed)
  - Kiln session management:
    * Create firing session (e.g. "Kiln A - Tonight 8pm")
    * Add pieces to session (staff scans/selects pieces)
    * Start firing (timer, temperature tracking if kiln has sensors)
    * Mark as complete (pieces come out)
  - Piece status tracking: painting → dip → kiln → fired → pickup
  - Staff dashboard:
    * Today's walk-ins and bookings
    * Pieces awaiting dip
    * Current kiln status
    * Pieces ready for pickup
    * Notifications ("3 pieces ready!")
  - Customer notifications:
    * "Your pottery is in the kiln, fires at 8pm tonight"
    * "Your pieces are done! Come pick up"
  - Analytics updates:
    * Peak firing times
    * Pieces per session
    * Staff efficiency
    * Customer turnaround time

Database additions:
  - kiln_sessions table
  - pottery_pieces table
  - piece_status_history table (audit trail)

Integration:
  - Tie to Square bookings/orders
  - Link to customer_app_activity
  - Store in analytics_cache for dashboard

──────────────────────────────────────────────────────────────

PHASE 3: QR Code Booking Integration + Live Tracking
──────────────────────────────────────────────────────

Timeline: 4 weeks (weeks 9-12)

Purpose: Customers get a unique experience per booking, real-time pottery tracking

Customer flow:
  1. Customer books table (or gets assigned walk-in table)
  2. Square creates booking with table ID (e.g. "Table 3")
  3. GlazeUp generates unique QR code for this booking
  4. QR printed on receipt, emailed, or on table display
  5. Customer scans QR → app unlocks booking-specific features:
     - Shows their table number
     - Shows their order total
     - Shows their assigned glaze palette (customized for session)
     - Shows their reserved/available designs
     - Saves designs to this specific booking
  6. Customer paints for 45-90 mins
  7. Before leaving, staff scan customer's piece QR/receipt
     - Links piece to booking order
     - Marks as "ready for dip"
  8. Later, staff scan piece again when loading kiln
     - Assigns to "Kiln Session #47"
     - Links to booking order
  9. Kiln fires, pieces come out
  10. Staff scan piece again → marks "ready for pickup"
  11. Customer gets notification with tracking link
  12. Customer comes in, sees their pieces grouped by booking
  13. Checks out

Staff flow:
  1. Staff scan piece when customer finishes painting
     - Piece → booking order (ties items together)
     - Mark as "ready for dip"
  2. Before dipping, see batch of pieces
     - Group by kiln session
     - Check for any special instructions
  3. Dip in clear glaze
  4. When loading kiln, scan again
     - Assign to "Kiln A - 8pm Session"
     - Timer starts
  5. Kiln complete
  6. Scan piece → mark as "ready for pickup"
  7. Piece moves to pickup area
  8. Customer scans their original booking QR to see their pieces

Analytics:
  - "Table 3 had 4 pieces, average time in kiln 12 hours"
  - "Most popular table times: Friday 5-8pm"
  - "Average pieces per booking: 2.3"
  - "Kiln efficiency: 87% utilization"
  - "Customer satisfaction: pieces ready within X hours"

Database additions:
  - booking_qr_codes table
  - booking_pieces table (junction: which pieces belong to which booking)

Integration:
  - QR code generation (use qrcode.js library)
  - Booking ID linking (from Square)
  - Real-time piece status via WebSocket (optional, nice-to-have)

──────────────────────────────────────────────────────────────

PHASE 4: Design Upload + Advanced Features
───────────────────────────────────────────

Timeline: 6 weeks (weeks 13-18)

Features:
  - Studios upload SVG/PNG designs
  - Palette builder (add custom glaze names)
  - Bisque shape photo uploads
  - Design marketplace (studios share/sell designs)
  - Customer email sharing ("save & share my design")
  - Design history (customers see past designs they've made)
  - Mobile staff app (iOS/Android native or PWA)
  - Advanced analytics:
    * Customer lifetime value
    * Churn prediction
    * Design ROI (which designs drive repeat visits)
    * Staff performance metrics

═══════════════════════════════════════════════════════════════════════════════
ARCHITECTURE
═══════════════════════════════════════════════════════════════════════════════

Frontend Stack:
  - Vanilla JS (no build tools)
  - HTML5 PWA (offline capable)
  - CSS custom properties for white-label branding
  - Canvas 2D for design rendering

Backend Stack:
  - Node.js + Express.js
  - Supabase (PostgreSQL + Auth + Storage)
  - Stripe (subscriptions)
  - Square (POS sync)

Hosting:
  - Frontend: Vercel or Netlify
  - Backend: Render or Railway
  - Database: Supabase (free tier)
  - Domain: glazeup.app (or white-label per studio)

Data Flow:
  Studio Setup
    ↓
  [Studio signs up] → Stripe customer created
    ↓
  [Studio connects Square] → OAuth flow → token stored → initial sync
    ↓
  [Daily sync job] → Pulls Square transactions → caches in Supabase
    ↓
  [Admin dashboard] → Loads analytics from cache
    ↓
  [Customer app loads] → Fetches branding + palette + designs from Supabase
    ↓
  [Customer uses app] → Activity logged to customer_app_activity
    ↓
  [Staff tracking] → Pieces logged, kiln sessions updated, notifications sent

═══════════════════════════════════════════════════════════════════════════════
BUSINESS MODEL
═══════════════════════════════════════════════════════════════════════════════

Pricing Tiers:
  Starter (£29/month):
    - Customer colour/transfer/print app
    - Basic analytics (revenue, sessions, designs)
    - 1 staff account
    - Email support
    - 500 customer sessions/month

  Professional (£49/month):
    - Starter features +
    - Inventory & firing tracker
    - Piece tracking (Phase 2)
    - 5 staff accounts
    - Priority email support
    - 2,000 customer sessions/month

  Enterprise (£79/month):
    - Professional features +
    - Custom domain (theirname.com)
    - QR booking integration (Phase 3)
    - Advanced analytics (churn, ROI, forecasting)
    - Unlimited staff accounts
    - Phone support
    - API access
    - Unlimited sessions

Free Trial:
  - First 30 days free
  - All features (Starter tier)
  - No credit card required
  - Auto-downgrade to Starter after trial if no payment

Revenue Model:
  - Monthly subscriptions (recurring)
  - Optional: white-label domain setup (£50 one-time)
  - Future: design marketplace (30% commission)
  - Future: advanced analytics upsell

Target Market:
  - Paint-your-own-pottery studios (PYOP)
  - Pottery painting studios
  - Ceramic painting studios
  - Wheel throwing + painting hybrid studios
  - Estimated 2,000+ studios in UK/US alone

Pilot Strategy:
  1. Free for The Kiln Cafe (friends & family rate)
  2. Get 3-5 studios to join at Starter tier (month 2-3)
  3. Iterate based on feedback
  4. Charge all studios month 3+
  5. Aim for 50+ studios by year 1 (£29,400+ revenue)

═══════════════════════════════════════════════════════════════════════════════
KEY DECISIONS MADE
═══════════════════════════════════════════════════════════════════════════════

White-label approach:
  ✓ Each studio gets own subdomain (theirname.glazeup.app)
  ✓ All branding (colours, fonts, logo) configurable per studio
  ✓ CSS custom properties for easy theming
  Benefit: Can sell to studios without competing with them

Separate billing from POS:
  ✓ GlazeUp charged via Stripe (recurring subscription)
  ✓ Studios keep their Square account (POS, inventory)
  ✓ We read Square data only (no write-back)
  Benefit: Studios don't have to change their workflow, we integrate cleanly

Built-in designs + custom upload:
  ✓ Phase 1-2: 22 built-in designs (no external images needed)
  ✓ Phase 3-4: Studios can upload SVG/PNG designs
  Benefit: Ships with value, no setup needed; extensible

Vanilla JS frontend:
  ✓ No build tools, no npm for frontend
  ✓ Entire PWA is single HTML file (or few files)
  ✓ Works offline via service worker
  Benefit: Instant deployment, no toolchain complexity

Supabase as backend:
  ✓ PostgreSQL database
  ✓ Built-in auth
  ✓ Row-level security
  ✓ Free tier supports dozens of studios
  Benefit: Scales easily, no server complexity, cost-effective

═══════════════════════════════════════════════════════════════════════════════
CURRENT BLOCKERS / DECISIONS NEEDED
═══════════════════════════════════════════════════════════════════════════════

None currently. Phase 1 is built and ready.

When ready for Phase 2, decide:
  - Real-time updates for kiln status? (WebSocket or polling?)
  - SMS notifications in addition to email?
  - Integration with specific kiln brands (kiln sensors)?

═══════════════════════════════════════════════════════════════════════════════
TESTING & LAUNCH CHECKLIST
═══════════════════════════════════════════════════════════════════════════════

Phase 1 (before going live):
  [ ] Square OAuth works end-to-end
  [ ] Square sync pulls real transactions without error
  [ ] Stripe subscription creates successfully
  [ ] Webhooks update subscription status on payment failures
  [ ] Admin dashboard loads analytics correctly
  [ ] Customer app logs activity to Supabase
  [ ] Admin sees activity in dashboard
  [ ] Customer app works offline
  [ ] PWA installs on iOS and Android
  [ ] Branding loads correctly for demo studio
  [ ] Free trial doesn't auto-charge (billing starts month 2)
  [ ] No data loss on app crash/close

Phase 1 deployment:
  [ ] Create GitHub repo
  [ ] Push code
  [ ] Set up Supabase project
  [ ] Run integration-schema.sql
  [ ] Get Square API credentials (sandbox first)
  [ ] Get Stripe API credentials + webhook secret
  [ ] Create .env file with all credentials
  [ ] Deploy backend to Render/Railway
  [ ] Deploy frontend to Vercel/Netlify
  [ ] Test OAuth flow on live domain
  [ ] Test Stripe payment on live
  [ ] Test sync to Supabase
  [ ] Get custom domain (glazeup.app)
  [ ] Set up SSL certificate
  [ ] Monitor logs for 48 hours
  [ ] Email beta studios an invite link

═══════════════════════════════════════════════════════════════════════════════
NICE-TO-HAVES (Future)
═══════════════════════════════════════════════════════════════════════════════

- SMS notifications (Twilio integration)
- WhatsApp notifications
- Customer photo upload (see actual kiln result)
- Design collaboration (multiple people design together)
- Gamification (badges for designs, repeat customer milestones)
- Integration with pottery supply shops (one-click reorder glazes)
- Kiln sensor integration (real-time temperature logging)
- Staff scheduling (who's working when)
- Payroll integration
- Review/rating system (designs, studio)
- Design licensing (studios can monetize designs)
- Analytics export (CSV, PDF reports)

═══════════════════════════════════════════════════════════════════════════════
NOTES FOR NEXT SESSIONS
═══════════════════════════════════════════════════════════════════════════════

Session 1 (5 July):
  ✓ Decided on white-label SaaS model
  ✓ Built Phase 1: Square OAuth + Stripe billing + admin dashboard (server.js)
  ✓ Created local demo of admin UI (dashboard-local.html)
  ✓ Connected dashboard to backend API with graceful fallback
  ✓ Added branding save endpoint to backend
  ✓ Discussed QR booking integration + full piece tracking flow (Phase 3)
  ✓ Agreed on free trial model
  ✓ Created rolling notes document (this one)
  ✓ Started Phase 2 Step 1: Staff tab with pieces awaiting dip + inventory view

Session 2 (TBD):
  ✓ Phase 2 Step 1: QR Scan Modal (mock data) — staff scan booking QR, mark pieces complete/incomplete, enter outstanding balance
  ✓ Phase 2 Step 1: Wire modal to database — POST /api/pieces/submit-for-dip saves pieces to pottery_pieces table
  ✓ Added pottery_pieces table to database schema (tracks pieces through kiln cycle)
  ✓ Fallback: if API not running, still shows summary alert (graceful degradation)
  ✓ **LOYALTY FOUNDATION**: Added customers table + loyalty_transactions table
  ✓ Modal now captures customer name, email, phone (for loyalty card structure)
  ✓ API automatically creates/finds customer and links pieces to them
  ✓ Loyalty points earned: 1 point per piece painted (foundation ready for future features)
  ✓ Future-ready: Can add tier system, redemption, rewards without schema changes
  ✓ **QR STRUCTURE DESIGN**: One QR per booking (not per customer)
  ✓ QR format: https://glazeup.app/scan/{studio-id}/{booking-id}
  ✓ Intelligent customer matching: email → phone → name → create new
  ✓ Supports return visits: same customer = same loyalty account, different booking QR
  ✓ Unfinished pieces tracked across visits: customer can return to complete work
  ✓ **Return fee only charged when they return**: No fee on first submission of incomplete pieces
  ✓ GET /api/qr/booking endpoint generates QR codes for printing on table place cards
  ✓ GET /api/customer/{customerId}/unfinished-pieces shows incomplete pieces from previous visits
  ✓ POST /api/pieces/complete-unfinished marks old pieces complete + adds return fee
  ✓ Created QR_BOOKING_FLOW.md documenting full flow (Visit 1-4 scenarios)
  ✓ **BOOKING SYSTEM**: QR code now drives workflow (not staff recognition)
  ✓ Added `bookings` table (stores Square bookings with customer info)
  ✓ GET /api/booking/{bookingCode} — Lookup booking when QR scanned
  ✓ Returns: customer info + unfinished pieces if returning customer
  ✓ POST /api/bookings/sync — Pulls today's bookings from Square automatically
  ✓ Generates booking_code for QR from booking data
  ✓ **MODAL WIRED TO BOOKING LOOKUP**: Staff scans QR → loads customer data automatically
  ✓ Modal pre-populated with: customer name, email, phone, loyalty points
  ✓ Shows unfinished pieces from previous visits (if returning customer)
  ✓ Staff just marks pieces complete/incomplete, no manual entry needed
  ✓ QR input listener extracts booking code and loads data
  ✓ Fallback to mock data if API not connected
  ✓ Created BOOKING_SYSTEM.md documenting entire workflow
  ✓ **MANUAL ENTRY FALLBACK**: Added for studios without QR infrastructure
  ✓ Two entry methods: "Scan QR Code" or "Enter Manually"
  ✓ Manual entry searches by customer name/email/phone
  ✓ Same loyalty + pieces tracking regardless of entry method
  ✓ Both paths lead to identical piece marking + submission workflow
  ✓ **PIECES LIST DISPLAY**: Real data from database now shows on Staff dashboard
  ✓ GET /api/pieces/awaiting-dip fetches pieces from database
  ✓ Pieces grouped by booking + customer
  ✓ Shows piece types, count, time submitted
  ✓ Fallback to mock data if API not connected
  ✓ Refresh button to reload pieces list
  ✓ Auto-loads when Staff tab opened

---

## Phase 2 Complete ✓

All booking/QR/pieces submission/loyalty system now built and integrated.

---

## Phase 1 Polish — LIVE ✓ (Session: 2026-07-05)

- ✓ GitHub repo created: github.com/thegreenroom-svg/GlazeUp (private)
- ✓ Supabase project created: mdpchpjnlzlmldtlqrns.supabase.co
- ✓ Database schema deployed (studios, customers, bookings, pottery_pieces, loyalty_transactions, square_connections, stripe_subscriptions)
- ✓ Fixed package.json "type: module" conflict (server.js uses CommonJS require())
- ✓ Backend deployed live on Render: https://glazeup-api.onrender.com
- ✓ Environment variables configured (SUPABASE_URL, SUPABASE_SERVICE_KEY, etc.)
- ✓ Health check confirmed: /health returns {"status":"ok"}
- ✓ Real database round-trip confirmed via /api/pieces/awaiting-dip
- ✓ **The Kiln Cafe created as first real studio**
  - **Studio ID: fab8b2d2-27b5-47ec-8c56-268bbf821dc3**
  - slug: kiln-cafe

**Live URLs:**
- Backend API: https://glazeup-api.onrender.com
- GitHub repo: https://github.com/thegreenroom-svg/GlazeUp
- Supabase project: https://mdpchpjnlzlmldtlqrns.supabase.co

**Note:** Stripe and Square are still placeholder values — real keys needed before those features work (billing, Square sync). Everything else (bookings, pieces, loyalty) is fully live.

**Dashboard wired to live API (2026-07-05):**
- ✓ admin/dashboard-local.html default API_URL changed to https://glazeup-api.onrender.com
- ✓ Default studioId changed to The Kiln Cafe's real UUID (fab8b2d2-27b5-47ec-8c56-268bbf821dc3)
- ✓ Confirmed Square/Stripe "connect" buttons are demo-only alerts, not wired to real endpoints — safe to test dashboard without any risk to live Square account
- ⚠️ IMPORTANT: Do not add real Square credentials until Daisy explicitly confirms — she wants this running alongside the live Square system for testing only, no integration/billing yet

---

## Kiln Session Tracking + Collection Photos (2026-07-05)

**Piece lifecycle simplified** to: `ready_for_dip` → `dipped` → `fired` → `picked_up`
(No separate `in_kiln`/`ready_for_pickup` states — a piece's kiln status is implied by its linked kiln_session's status. Pieces are fired as whole batches, not individually.)

**DB tables added:**
- `kiln_sessions` (id, studio_id, label, status: loading/firing/fired, fired_at)
- `pottery_pieces.kiln_session_id` (nullable FK — pieces can sit dipped/unassigned until there's room in a batch, supporting real batching behaviour where leftover pieces wait for a later firing)
- `booking_photos` (id, studio_id, booking_id, photo_url, taken_at) + Supabase Storage bucket `booking-photos` (public)
- ⚠️ PENDING: Daisy still needs to run this SQL to properly constrain the simplified status values (not yet confirmed done):
  ```sql
  ALTER TABLE pottery_pieces ADD CONSTRAINT pottery_pieces_status_check 
    CHECK (status IN ('ready_for_dip', 'dipped', 'fired', 'picked_up'));
  ```

**API endpoints added:**
- `GET /api/pieces/dipped` — dipped pieces not yet assigned to a kiln session
- `POST /api/pieces/mark-dipped` — bulk move pieces ready_for_dip → dipped
- `POST /api/kiln-sessions` — create a session + optionally assign pieces at creation
- `POST /api/kiln-sessions/:id/add-pieces` — add more dipped pieces to an existing session
- `GET /api/kiln-sessions` — list sessions with piece counts
- `POST /api/kiln-sessions/:id/fire` — bulk-fires the whole batch (session → fired, all its pieces → fired)
- `POST /api/pieces/mark-picked-up` — mark fired pieces as collected
- `POST /api/booking-photos/upload` — upload a photo (base64) linked to a booking_id, stored in Supabase Storage
- `GET /api/booking-photos/:bookingId` — fetch photos for a booking (used at kiln-unload time to ID whose pieces are whose)

**Also fixed a pre-existing bug:** loyalty points/total_pieces_painted update was overwriting those fields with the customer's UUID instead of incrementing — now correctly increments.

**Dashboard UI added:**
- Staff tab → "Mark as Dipped" button per booking group in the Pieces Ready for Dip list
- Staff tab → new "Kiln Firing" section: shows dipped pieces (checkboxes) → "Create Kiln Session" → lists sessions with status + "Mark Fired" bulk action
- Pieces submission modal → camera capture ("Take Photo") of the table/nameplate at collection time, uploaded alongside piece submission
- Booking lookup (QR or manual) → shows any previously-taken collection photos for that booking, so staff can scan the same QR at kiln-unload time to instantly see who the pieces belong to

**Not yet built:** UI for `mark-picked-up` (currently API-only, no button in dashboard yet) — flag for a future session if wanted.

---

## Real Studio Connect Flow + Flexible Table Tracking (2026-07-05)

**Context:** Investigated Kiln Cafe's actual Wix Bookings setup — tables ARE configured there as resources (Table 1-6, Pottery Wheel), but only one old test booking exists (Oct 2022). Confirmed with Daisy: **Square is the real, live booking system**, not Wix. Table numbers there are represented by Square "staff members" (a workaround).

**Design decision:** table-tracking must be **per-studio configurable**, since other studios won't necessarily use Square staff members to mean tables. Added `studios.table_tracking_mode` column: `'staff_as_tables'` or `'none'` (extensible later for other studios' conventions).

**DB change (Daisy to run if not already done):**
```sql
ALTER TABLE studios ADD COLUMN table_tracking_mode TEXT DEFAULT 'none' 
  CHECK (table_tracking_mode IN ('staff_as_tables', 'none'));
```

**Bugs fixed while building this:**
- `/api/bookings/sync` was selecting `access_token` from `square_connections` — actual column is `square_access_token`. Sync would have silently failed. Fixed.
- Square OAuth authorize/token-exchange URLs were hardcoded to sandbox — now environment-aware via `SQUARE_ENVIRONMENT` env var (sandbox vs production).

**New/updated API endpoints:**
- `POST /api/studio/settings` — save `table_tracking_mode` per studio
- `GET /api/studio/connection-status` — real Square/Stripe connection state + table tracking mode (used to replace hardcoded "Connected" placeholder in dashboard)
- `POST /api/bookings/sync` — now resolves table names via Square Team API lookup when `table_tracking_mode = 'staff_as_tables'`; otherwise leaves table_number null (flexible for studios that don't track tables this way)

**Dashboard (Setup tab) rebuilt:**
- Real "Connect Square Account" button → opens actual Square OAuth consent screen (via `/api/square/authorize`) in a new tab — no longer a placeholder alert
- Live status badges for both Square and Stripe, pulled from `/api/studio/connection-status` (was hardcoded "✓ Connected")
- New dropdown: "How does your studio track tables in Square?" — lets each studio choose `staff_as_tables` or `none`, saved via `/api/studio/settings`

**Still on placeholder credentials by design** (per Daisy: "keep it remote for now, go live later") — SQUARE_CLIENT_ID/SECRET remain placeholders in Render env vars, so clicking "Connect Square Account" won't complete a real OAuth handshake yet. All the plumbing is real and ready; flipping to production just needs real Square app credentials added to Render's environment variables when Daisy's ready.

**Reminder for later:** when going live with real Square credentials, also add `SQUARE_CLIENT_SECRET` to Render env vars (currently not set — only `SQUARE_CLIENT_ID` exists in the .env template) and set `SQUARE_ENVIRONMENT=production` when ready to leave sandbox.

---

## Staff Tab Restructured into 3-Section Table Workflow (2026-07-05)

Staff tab now mirrors the actual customer journey, with sub-tab navigation: **1. Booking Details → 2. Customer Engagement → 3. Completion**, plus a separate **Kiln & Inventory** area for back-of-house work (previously the whole staff tab).

**New DB tables (Daisy to run if not already done):**
```sql
CREATE TABLE table_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  booking_id TEXT NOT NULL,
  table_number TEXT,
  number_of_places INT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'completed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_table_sessions_studio ON table_sessions(studio_id);
CREATE INDEX idx_table_sessions_booking ON table_sessions(booking_id);
CREATE INDEX idx_table_sessions_status ON table_sessions(status);

CREATE TABLE table_session_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_session_id UUID NOT NULL REFERENCES table_sessions(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('piece', 'drink', 'glaze')),
  item_name TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_session_orders_session ON table_session_orders(table_session_id);
```

**Section 1 — Booking Details (arrival):** staff look up a booking by code or customer name → shows party size + any returning/unfinished pieces with "studio fee payable" flag (reuses existing unfinished-pieces logic) → staff enter table number + number of places → "Open Table" creates a `table_sessions` row (status `open`).

**Section 2 — Customer Engagement (live, all session):** staff pick an open table from a dropdown → add pieces chosen / drinks / extra glazes to a running list (`table_session_orders`) → can return anytime during the session to add more. **No pricing yet** (per Daisy — billing integration still on hold).

**Section 3 — Completion:** lists all open tables → "Take Photo & Submit Pieces" on any table **reuses the existing QR/manual pieces-submission modal** (same photo capture + dip submission built earlier) pre-loaded with that table's booking code → on successful submission, the table session is automatically marked `completed` via `/api/table-sessions/:id/complete`.

**New API endpoints:**
- `POST /api/table-sessions` — open a table (Section 1)
- `GET /api/table-sessions?studioId=&status=` — list sessions, filterable by open/completed
- `POST /api/table-sessions/:id/orders` — add a piece/drink/glaze to the running list (Section 2)
- `GET /api/table-sessions/:id/orders` — fetch the running list
- `DELETE /api/table-sessions/orders/:orderId` — remove a mistakenly-added item
- `POST /api/table-sessions/:id/complete` — close a table session (called automatically from Section 3)

**Not yet built:** pricing/totals for drinks+glazes (deliberately deferred — ties into the Phase 3/4 iPad billing + Square terminal idea flagged earlier). Section 2 is currently a simple staff-facing checklist only.

---

## Section 2 Upgraded: Square Catalog Browser + Running Bill (2026-07-05)

**Important bug found and fixed:** the installed Square SDK (v38.2.0) uses **property access** for its APIs (`client.catalogApi`, `client.merchantsApi`, `client.ordersApi`, `client.bookingsApi`, `client.teamApi`), not the `client.getXApi()` method-call pattern used throughout the earlier Square integration code. All 4 existing call sites (`getMerchantApi`, `getOrdersApi`, `getBookingsApi`, `getTeamApi`) would have thrown "not a function" errors the moment real Square credentials were connected. Fixed all of them to use the correct property access.

**Schema update (Daisy to run if not already done):**
```sql
ALTER TABLE table_session_orders ADD COLUMN IF NOT EXISTS quantity INT DEFAULT 1;
ALTER TABLE table_session_orders ADD COLUMN IF NOT EXISTS unit_price_cents INT;
ALTER TABLE table_session_orders ADD COLUMN IF NOT EXISTS square_catalog_id TEXT;

ALTER TABLE table_session_orders DROP CONSTRAINT IF EXISTS table_session_orders_item_type_check;
ALTER TABLE table_session_orders ADD CONSTRAINT table_session_orders_item_type_check
  CHECK (item_type IN ('piece', 'drink', 'glaze', 'cake'));
```

**Decision confirmed with Daisy:** running bill stays **GlazeUp-only for now** — nothing is sent to or created in Square. Sending the finished bill to Square Terminal for payment is a deliberate future step (ties into the Phase 3/4 billing reminder above), not built yet.

**New endpoint:**
- `GET /api/square/catalog?studioId=` — read-only fetch of the studio's real Square catalog (items + categories, e.g. Pottery/Drinks/Cakes), with prices. Returns `{connected: false, categories: []}` gracefully if Square isn't connected yet, so the dashboard falls back to a demo catalog for testing.

**Section 2 (Customer Engagement) rebuilt:**
- Category tabs (from Square, or demo Pottery/Drinks/Cakes if not connected) with tap-to-add items showing price
- "+ Add custom item" fallback for anything not in the Square catalog (e.g. bespoke extra glazes)
- Running bill list now shows price per item and a **running total** at the bottom, clearly labelled "Not yet sent to Square — for internal reference only"
- `table_session_orders` now stores `unit_price_cents` and `square_catalog_id` (for when we do eventually wire this to a real Square order)

---

## "Dipped Glaze" Visual Design System (2026-07-05)

Daisy asked for a "jazzier, funky, dynamic" look for iPhone/iPad with buttons that look like shiny glazed ceramic. Design approach: rather than a generic UI reskin, buttons are rendered to actually behave like dipped glaze — since that's literally the studio's own material and product.

**Design language:**
- Kept Daisy's real established brand (cream #faf4ef, oxblood #b03a2e, Georgia display) rather than replacing it — this is a genuine working cafe's existing identity, not a blank slate
- Added 3 jewel-tone "glaze" colour families as CSS custom properties, each a base/highlight/deep-pool triad (mimicking how real glaze pools darker at the bottom of a dip): **Ocean** (teal, used for Drinks), **Honey** (amber, used for Cakes), **Sage** (green, used for "Fired"/success actions). Oxblood (the existing brand crimson) remains the default/primary glaze.
- **Signature element — "dipped glaze" buttons:** layered radial specular highlight (top-left, like light catching wet glaze) over a linear gradient that darkens toward the bottom (gravity-pooled colour), a soft *coloured* ambient shadow (not grey) matching the button's own glaze hue, organic asymmetric border-radius (not a uniform rounded rect), and a tactile press animation (scale down + brightness dip on `:active`, lift + brighten on `:hover`) — built for touchscreen use on iPad/iPhone.
- **Sub-tab nav buttons** get a matching but quieter metaphor: unfired/matte "bisque" look (soft white-to-cream gradient) when inactive, switching to the full glossy oxblood glaze treatment when active — literally "unglazed vs glazed," tying the UI directly to the pottery process.
- Cards (`.chart-container`, `.setup-card`) got a subtle sheen and softer coloured shadow for cohesion, deliberately kept quiet so the buttons stay the one bold, memorable element (not competing for attention).
- `prefers-reduced-motion` respected — animations disable cleanly for anyone who needs that.
- Colour variant classes (`.glaze-ocean`, `.glaze-honey`, `.glaze-sage`) reused across: catalog item buttons in Section 2 (colour-coded by item type: pottery=oxblood, drinks=ocean, cakes=honey, extra glaze=sage), and the "Mark Fired" kiln button (sage, since firing = success/completion).
- All existing `onclick` wiring untouched — the redesign only changed CSS classes/tokens, so every button across the whole app upgraded automatically without touching markup logic.

**Not yet done:** this pass covered buttons, sub-tab nav, and cards. Full-page layout/typography wasn't touched (kept scope to what was asked — "buttons that look glazed/shiny"). If Daisy wants a broader pass (headers, spacing, a hero moment) that's a natural next step.

---

## Future Feature Reminder (Phase 3/4: Billing)

**SPLIT BILLS + MULTI-CUSTOMER LOYALTY**
- Problem: Group books under "Mrs Jones" but wants to split bill at end
- Solution needed:
  - Staff can split same booking into multiple bills at payment time
  - Assign pieces to different people at billing
  - Create new customer accounts for off-booking customers (Person B, Person C)
  - Send multiple Square transactions
  - Each person gets own loyalty account + points
  - Pieces tracked to correct customer regardless of original booking
- **Reminder:** Build this when creating iPad billing/payment system (Phase 3)

---

Next: Main feature development (decide what's next)

Session 4+ (TBD):
  - Phase 3: iPad billing + split bills + pieces tallying
  - Design Phase 4 features
  - First customer onboarding
  - Scale to 10+ studios

═══════════════════════════════════════════════════════════════════════════════
