# kilnLINK v1.1.0 — Pre-Market Checklist

**Status:** In Progress
**Target:** Pilot with The Kiln Cafe before other studios

---

## 1. CODE & CONFIGURATION

### Demo Mode Disabled ✓
- [x] `DEMO_MODE = false` in admin/dashboard-local.html
- [x] Committed and pushed

### Real PINs for Staff
- [ ] Set individual PINs for all staff via Team & Duties screen (replaces universal 0000)
- [ ] Daisy, David, Jenny: set director PINs
- [ ] Dave (barista), Lucy, Ruby: set staff PINs
- [ ] Disable the demo PIN notice banner in UI once all PINs are set

### SQL Cleanup — remove_trial_accounts.sql
- [ ] Run SELECT to identify duplicate Elliott entry (if any)
- [ ] Run UPDATE to set active = false on trial Dave (Studio Assistant)
- [ ] Confirm no orphaned test accounts in staff_team

---

## 2. ENVIRONMENT VARIABLES (Render)

### Stripe (kilnLINK SaaS billing)
- [ ] Replace `STRIPE_SECRET_KEY=sk_test_placeholder` with live secret key (starts `sk_live_`)
- [ ] Add `STRIPE_WEBHOOK_SECRET` for webhook signing
- [ ] Add `STRIPE_PRICE_STANDARD`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_ENTERPRISE` (Stripe price IDs)
- [ ] Test Stripe connection: run health check endpoint

### Royal Mail (Host By Post labels)
- [ ] Obtain Royal Mail API key from Click & Drop (Settings → API → Generate)
- [ ] Add `ROYAL_MAIL_API_KEY` to Render env vars
- [ ] Test label generation for a Host By Post order

### Square (Booking sync — already configured)
- [ ] Verify `SQUARE_CLIENT_ID` and `SQUARE_ENVIRONMENT=sandbox` are correct
- [ ] Migrate to live mode once all bookings sync correctly from The Kiln Cafe's production Square account
- [ ] Update `SQUARE_ENVIRONMENT=production` in Render when ready

### OpenAI (AI features)
- [ ] Verify `OPENAI_API_KEY` is set in Render (not in .env — don't commit API keys)
- [ ] Test piece matching: upload a photo, verify AI identification works

---

## 3. LEGAL & COMPLIANCE

### Privacy Policy
- [ ] Create `/privacy-policy` page (or link from footer)
- [ ] Cover data collection, storage, GDPR rights, retention
- [ ] Include data processing for AI piece matching (OpenAI API)
- [ ] Mention email (Square/Stripe) and SMS (Royal Mail tracking) recipients

### GDPR Data Processing Agreement (DPA)
- [ ] Ensure DPA is in place for Supabase (database)
- [ ] Ensure DPA is in place for OpenAI (AI piece matching)
- [ ] Ensure DPA is in place for Square (booking/payment data)
- [ ] Ensure DPA is in place for Stripe (subscription billing)

### Terms & Conditions (for kilnLINK studio subscribers)
- [ ] Create T&Cs for kilnLINK SaaS (separate from The Kiln Cafe customer T&Cs)
- [ ] Cover subscription terms, cancellation, data access, liability
- [ ] Reference white-label nature: studio branding, customization

### ICO Registration (UK)
- [ ] Register kilnLINK as a data controller with the Information Commissioner's Office (ICO)
- [ ] ICO reference number to display on privacy policy
- [ ] Estimated annual fee: £40–£20,000 depending on turnover (check your threshold)

### Accessibility Statement
- [ ] Create accessibility statement for WCAG 2.1 AA compliance (or note gaps if applicable)

---

## 4. BRAND & ASSETS

### Real Logo
- [ ] Obtain high-res SVG or master file from Daisy (Canva or Mac)
- [ ] Replace `/brand-assets/kiln-cafe-logo-demo/kiln-cafe-mark-demo.svg` everywhere:
  - Favicon (16px, 32px, SVG)
  - Header (36px)
  - Splash screen (60px)
  - Tour modal (72px)
- [ ] Test at multiple sizes and on iPhone

### Favicon
- [ ] Regenerate favicon with real logo (currently using demo mark)
- [ ] Verify in browser: `/favicon.ico`, `/favicon.png`

---

## 5. TESTING & QA

### Core Journeys (on iPhone)
- [ ] Splash screen: cycles through 5 floor plan demo scenes, "Enter" button works
- [ ] Login: PIN entry, 4 digits, rate-limited after 3 failures
- [ ] Floor plan: tables load, refresh every 30s, tap to open booking detail
- [ ] Create booking: dates, times, party size, table select, save to Supabase
- [ ] Piece photo: take photo at completion, upload, AI matches, returns name + date
- [ ] Returns: photograph any piece, AI identifies from photo database

### Integrations
- [ ] Square: test booking sync (push to Square if enabled)
- [ ] Royal Mail: generate label for Host By Post order
- [ ] OpenAI: piece matching latency, accuracy
- [ ] Stripe: create a test subscription (if testing pilot billing)

### Edge Cases
- [ ] Offline behavior: floor plan caches, bookings queue
- [ ] Network loss during booking save: retry mechanism
- [ ] Large party size (30+): UI doesn't break
- [ ] Multiple pieces in one session: photo matching handles batch

---

## 6. DOCUMENTATION & COMMS

### Setup Guide (for Daisy/David/Jenny)
- [ ] "Getting Started with kilnLINK" — PIN login, floor plan, create booking, AI features
- [ ] FAQ: "How do I...?" (add staff, reset PIN, export data, etc.)
- [ ] Support email/contact: where to send bugs or feature requests

### API Documentation (if opening to other studios)
- [ ] Endpoint specs for floor plan sync, booking create, piece matching
- [ ] Authentication (API key vs. session)
- [ ] Rate limits, error codes
- [ ] Example cURL/JS requests

---

## 7. DEPLOYMENT & GO-LIVE

### Render Health
- [ ] All env vars set and verified
- [ ] No failed deployments in last 5 builds
- [ ] Response time < 500ms on main endpoints
- [ ] Database connection pool healthy

### Backup Strategy
- [ ] Supabase automated backups enabled (check backup retention)
- [ ] Test restore from backup (before go-live)

### Monitoring
- [ ] Error tracking enabled (Sentry, or Render logs)
- [ ] Uptime monitoring enabled
- [ ] Daily health check email configured

### Go-Live Steps
1. Disable DEMO_MODE ✓ (already done)
2. Set real PINs for all staff
3. Run SQL cleanup
4. Configure all Render env vars (Stripe, Royal Mail, etc.)
5. Final iPhone test on production
6. Announce to Daisy, David, Jenny with setup guide
7. Monitor logs closely for first 48 hours

---

## Notes

- **Stripe:** Do not go live with Stripe until kilnLINK billing model is finalized (fixed monthly? per-booking? API call limits?)
- **Royal Mail:** Labels are read-only until API key is configured; Host By Post orders will show "Label unavailable"
- **OpenAI:** Each piece match costs ~$0.001–0.01 depending on image size; monitor usage
- **Data Retention:** Decide on log retention policy (e.g., keep for 90 days) before launch

---

**Last Updated:** 2026-07-13 (Day 4, v1.1.0)
**Owner:** Daisy Green
**Contact:** hello@thekilncafe.com
