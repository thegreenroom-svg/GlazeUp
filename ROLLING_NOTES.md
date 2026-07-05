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
