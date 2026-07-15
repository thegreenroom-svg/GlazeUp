═══════════════════════════════════════════════════════════════════════════════
GlazeUp · Rolling Product Notes
Last updated: 5 July 2026
═══════════════════════════════════════════════════════════════════════════════

★ RENAMED (2026-07-06): The product is now called **Link**, not GlazeUp. Logo mark: "LINK" in bold caps, with "NLIK" (KILN spelled backwards) underneath, both right-aligned so the shared K lands in the same column — a nod to the fact KILN and LINK are anagrams (same 4 letters). Renamed everywhere in the staff dashboard (title, sidebar wordmark, welcome banner, server log) and server.js. The customer app (`/app`) already showed studio-specific branding ("The Kiln Cafe") rather than the platform name, so nothing needed changing there. Historical entries below still say "GlazeUp" since they're a dated log of what was actually built at the time — not rewritten, just noting the name going forward is Link.

★ FULL BRAND ROLLOUT (2026-07-06): Daisy provided a complete LINK brand spec (colours, typography, button/icon rules, splash screen requirement, brand voice/taglines). Implemented across both apps:
  - **Palette:** Charcoal #2B2724, Clay #B87946, Sand #E8D9C4, Ivory #F7F4EE, Stone #C8BFB2. Mapped onto the existing `--gu-*` CSS variables (kept variable names, changed values) so every existing usage site updated automatically without touching each one individually.
  - **Typography:** Instrument Sans (Google Fonts) with Inter/system-ui fallback, loaded in both apps. Replaces the old Georgia-display / system-body split — spec calls for one clean sans throughout.
  - **Buttons rebuilt flat** (previously glossy "dipped glaze" gradient system): `.btn-connect` = Primary (charcoal bg, white text), new `.btn-secondary` (white bg, charcoal outline) and `.btn-accent` (clay) classes added per spec. Category-colour variants (`.glaze-ocean/honey/sage`) simplified to flat muted fills.
  - **Sidebar & customer app header** flattened from the oxblood gradient/bevel treatment to solid charcoal.
  - **Nav icon badges** reworked to match "no filled icons unless active": transparent/plain on the dark sidebar normally, clay-filled badge only when that section is active.
  - **New logo:** the sidebar wordmark is now "LINK" stacked above "NLIK" (KILN spelled backwards), both right-aligned so the shared final "K" lands in the same column — since KILN and LINK are literal anagrams. This is a simplified version of Daisy's full connected-wordmark concept (the sophisticated single-stroke logo where the link/kiln arch shapes are integrated into the letterforms) — that fuller vector logo is a natural next step if wanted.
  - **Splash/launch screen — NEW feature, explicitly required by the spec:** customer app now shows a full-screen "LINK / Connect. Create. Belong." splash on every open, fading in over 0.4s. Tap anywhere to continue immediately, or it auto-dismisses after ~2.6s if not tapped, fading out over 0.3s. No spinner, no progress bar. Booking data loads silently underneath during the splash so content is ready the moment it dismisses.
  - Customer app header brand line restructured to "LINK · The Kiln Cafe" (LINK dominant, studio name as secondary label) per the spec's logo rule ("LINK should always dominate, KILN only as endorsement").

  **Not yet done:** the full sophisticated connected-wordmark logo (single continuous stroke integrating the kiln-arch/link-wave shapes into the letterforms, as in the concept artwork) — current logo is a simpler stacked-text version. Icon set across the rest of the app (Bisque tab silhouettes, category tabs, etc.) hasn't been converted to the "2px stroke, rounded ends, no fill unless active" line-icon style yet — only the sidebar nav icons were addressed. The Branding tab's studio-customization colour defaults were deliberately left alone (that's per-studio branding, a different concern from the platform's own identity). GitHub repo name and Render service URL still say "glazeup" — same as the earlier product rename, changing those is a separate infrastructure step outside a normal code push.

★ BRAND ASSET DELIVERABLES + SPLASH REFINEMENT (2026-07-06): Daisy sent a refined spec with three deliverables: Master Logo, App Icon, and an updated Splash Screen behaviour.

**Splash screen refined:** background changed from ivory to dark Charcoal (per spec), added a "Built by KILN" endorsement line below the tagline, fade duration changed to 0.6s (was 0.4s in / 0.3s out). Tap-anywhere-to-continue and the ~2.6s auto-advance both still work.

**Master Logo — built as genuine editable vector artwork, not text-with-a-font-dependency:** downloaded the real Instrument Sans Bold font (via the `@fontsource/instrument-sans` npm package, converted WOFF2→TTF with fontTools since that's what was available), then used matplotlib's `TextPath` to convert "LINK" and "NLIK" into actual bezier curve outlines — real vector paths, not `<text>` elements — so the file is genuinely portable/editable without needing the font installed wherever it's opened. Saved to `brand-assets/master-logo/`:
  - `LINK-master-logo.svg` (source of truth)
  - `LINK-master-logo.pdf`, `LINK-master-logo.eps` (converted via ghostscript, installed for this)
  - `LINK-master-logo@1x/@2x/@3x.png`
  - **No native `.ai` file** — that's Adobe's proprietary format and can't be genuinely produced outside Illustrator itself. The SVG/PDF/EPS are the correct open equivalents and open natively in Illustrator (File → Open).

**App Icon — built fresh, a "simplified chain/link icon without text" per spec:** a classic two-interlocking-rounded-rectangle chain-link glyph (the universal hyperlink icon shape), rotated diagonally, in Ivory + Clay on a Charcoal background, at 1024×1024. Saved to `brand-assets/app-icon/`: `LINK-app-icon.svg`, `LINK-app-icon-1024.png`, `LINK-app-icon.pdf`. **This replaced the actual live PWA icons** (`app/icon-192.png`, `icon-512.png`, `apple-touch-icon.png`) — the old glazed-pot silhouette is gone, customers' home-screen icon now shows the new chain-link mark. `manifest.json` theme/background colours also updated to Charcoal/Ivory.

★ COMMUNITY / SOCIALS FEATURE (2026-07-08): First step toward Daisy's "drive the whole app worldwide, viral growth, low/no cost" ask. Architected as: (1) studio-level customer feed [BUILT], (2) shareable piece cards driving external social sharing [not yet built], (3) global cross-studio feed [not yet built], (4) studio-to-studio referral loop [not yet built] — deliberately phased since each layer's content feeds the next layer's marketing value.

**Built (customer app only so far):**
- New tables `community_posts` + `community_post_likes` (Daisy needs to run the CREATE TABLE SQL)
- `POST /api/community/posts` — customer opts in to share a finished piece (piece photo only, first-name-only display — deliberate child-safety consideration since real kids paint at the studio; no login/face required)
- `GET /api/community/feed?studioId=` — studio's gallery, newest first
- `POST /api/community/posts/:id/like` — simple like, deduped via a localStorage device fingerprint (no account system needed)
- Customer app: "📸 Share to Community" button appears on the Ready-for-Collection banner; new "Community" tile opens the studio's gallery feed (full-screen overlay, same slide-up pattern as Design Preview)
- Photos currently stored as base64 directly in the `photo_url` column (works, but not optimal at scale — revisit with real Supabase Storage upload if the feed gets busy)

**Not yet built:** staff dashboard has no community/moderation view yet (worth adding — studios will want to see/moderate their own feed); shareable external piece cards (the actual growth-engine layer); global cross-studio feed; studio referral program; any reporting/moderation flow for inappropriate content (needed before this goes fully public-facing at scale).

★ COLOUR PICKER BUILT (2026-07-08): Activated the third design-tool tile in the customer app. Used real colours, not a generic palette — extracted the actual 34-swatch glaze tile from Rosalie's "Painting Process" instruction sheet (found in Google Drive) via OpenCV Hough circle detection + direct pixel sampling of each swatch's fill colour. Attempted OCR (tesseract) to read the exact printed bottle numbers too, but it only reliably confirmed a handful (~9 of 34) on the rotated source photo — not solid enough to present as a precise number-to-colour lookup, since a wrong number could send a customer to the wrong physical bottle in-studio. Decision: show the real sampled colours with descriptive auto-generated names (e.g. "Red 1", "Deep Teal") rather than fabricated bottle numbers, with an explicit on-screen note that these are a browsing/inspiration guide and customers should still check the number on the real bottle. Two tabs: Browse (all 34 real swatches, tap to heart/favourite) and My Palette (favourited colours, stored in localStorage — no account needed). If Daisy can get an official Mayco Stroke & Coat colour chart or a straight-on (non-angled) photo of the tile later, the OCR/numbering could be redone properly.

★ SWITCHED TO REAL MAYCO BRANDING (2026-07-08): Daisy: "we need the Mayco again, it's what we sell." Replaced the photo-sampled 34-swatch palette with the actual **Mayco Stroke & Coat® product range** — 82 real colours with genuine official product codes and names (e.g. "SC-73 Candy Apple Red", "SC-16 Cotton Tail") sourced from maycocolors.com's official colour listing. Honest limitation: web_fetch can't pull raw image bytes, so exact hex values couldn't be sampled from Mayco's own chip photos — the on-screen shades are reasonable approximations based on each name, clearly caveated in the tool ("fired colour can vary by kiln, always check the number on the physical bottle"). The names/codes themselves are 100% real and official, which is the part that actually matters for customers matching to bottles. Found and fixed a real bug while doing this: several official names contain apostrophes ("Jack O'Lantern", "It's Sage", "Leapin' Lizard") which broke both the file's JS syntax and, more subtly, would have broken the onclick handlers at runtime even after the syntax was fixed (interpolating raw strings with quotes into inline onclick attributes). Fixed properly by switching swatch click handlers to pass an array index instead of raw string values — eliminates this whole class of bug regardless of what characters future colour names contain.

★ MY BOOKINGS + NEW BOOKING FLOW (2026-07-08): Two pieces, deliberately split by risk level since Square access has been read-only this whole project.

**My Bookings (real, live):** `GET /api/customer/my-bookings` finds a customer's other bookings by matching phone/email from their current booking (no login system exists, so this is how "their" bookings get identified). Customer app tile shows Upcoming/Past sections. Fully real, works with existing read-only Square access.

**New Booking flow (preview only, explicitly not real yet):** Date-strip + time-slot picker UI, fully built and usable, but availability is **mock data generated client-side** (`generateMockAvailability()` — deterministic per-day so it doesn't jump around, not random each render). Confirming shows a "preview only" alert rather than creating anything. This was a deliberate choice: Daisy wanted to see/test the actual booking UX now without committing to Square write-access yet. When ready to go live, swap `generateMockAvailability()` for a real Square availability call and `confirmNewBooking()` for a real POST — the UI/flow around them doesn't need to change. Needs: Square reconnected with booking-write scope (currently READ-only: MERCHANT_PROFILE_READ CUSTOMERS_READ ORDERS_READ INVENTORY_READ ITEMS_READ APPOINTMENTS_READ APPOINTMENTS_ALL_READ TIMECARDS_READ — no WRITE scopes at all currently).

★ FORWARD-LOOKING NOTES — NOT YET ACTIONED (2026-07-08): Daisy flagged three things to return to before this is fully market-ready, explicitly "not finished" items to track rather than build now:
  1. **Security review** — hasn't had a dedicated pass yet (beyond the credential-rotation items already flagged). Worth a proper audit before onboarding studios beyond Kiln Cafe: auth/access control between studios' data, input sanitization, rate limiting, the exposed-then-rotated credentials, etc.
  2. **Multi-platform integrations** — currently hard-wired to Square (POS/bookings) and implicitly assumes Wix (website). Other studios may use different POS/stock systems (Clover, Shopify POS, Lightspeed, etc.) or website builders (Squarespace, WordPress). File structure/architecture should be organized to make adding alternate integrations realistic later, not just Square-only.
  3. **Internationalization** — "at some point, return to the international aspect" for worldwide sales. Daisy has a contact in translation software. Not started — currently English-only, GBP-only, UK date/phone formats hardcoded in places.

★ PRINT AS TRANSFER — CERAMIC TRANSFER PRINTER WORKFLOW, PROTOTYPE (2026-07-08): Daisy wants any customer-facing creative tool (Design Preview, Transfer Designer, future ones) to offer printing the finished design onto a real ceramic transfer via the studio's own printer — staff review design/sizing first, £1/transfer flat regardless of size, explicit disclaimer that printed errors can't be corrected.

**New table** `transfer_print_requests` (studio_id, booking_code, customer_name, source_tool, image_data, status: pending/approved/rejected, timestamps).

**Customer side — "🖨️ Print as Transfer — £1" button in both tools:**
- Flattens the ENTIRE current design into one real image before submitting — not just the canvas. This was the genuinely hard part: Design Preview and Transfer Designer both layer draggable DOM elements (coloured stickers; draggable text and motif shapes) on top of the drawing canvas, so a proper export needs compositing all of it into one flat picture, not just `canvas.toDataURL()` on its own.
  - `flattenDesignPreviewImage()` — draws base photo + paint layer, then redraws each `.dp-sticker` as a coloured circle at its real on-screen position/size/opacity
  - `flattenTransferDesignerImage()` — draws base photo + paint layer, then for each `.td-element` reads its real position and rotation and redraws either the text (matching font/weight/colour) or the motif (serializes its SVG, loads it as an Image, draws it) at the correct spot
- Shows a preview of the flattened image + the confirmation modal with the exact wording requested: staff will check design/sizing, £1 regardless of size, mistakes can't be corrected once printed
- Submits via `POST /api/print-requests` — **not charged yet at this point**, since staff haven't reviewed it

**Staff side — new "Print Queue" nav item:**
- Shows all pending submissions with the actual design image, customer name, source tool, and time
- **"✅ Approve & Print — £1"** — marks approved AND records the £1 charge (via the same `app_extra_charges` tally used elsewhere), with a confirmation dialog restating it can't be undone
- **"❌ Reject"** — marks rejected, no charge

Tested the full pipeline end-to-end with Playwright: added real text + a motif in Transfer Designer, flattened it, confirmed the resulting image was a genuine non-empty PNG (not blank), submitted it, then loaded the staff Print Queue and confirmed the design/name displayed correctly and approving called the backend with the right data.

★ TABLET/STYLUS REQUEST — NOW ALSO CUSTOMER-FACING (2026-07-08): Daisy noted the £3 tablet/stylus charge wasn't in the customer app — it had only been built as a staff-triggered checkbox in Section 1. Added a matching customer-facing "📱 Studio Tablet & Stylus" tile (top of Getting Started, £3 badge). Generalized `PAID_TOOLS` to support a "request" style entry (`isRequest: true`) alongside the existing "unlock a screen" style entries — wording adapts automatically ("Request Studio Tablet & Stylus" / "Request for £3.00" vs "Unlock Design Preview" / "Unlock for £1.00"), and confirming shows a friendly "✅ Request sent! A member of staff will bring you a tablet and stylus shortly" message instead of opening a tool screen. Both the staff checkbox and the customer tile write to the same `app_extra_charges` tally, so either path shows up together on the Dashboard's Extra Charges Today card. Tested end-to-end: correct modal wording, correct charge payload, correct confirmation message.

★ POINTER EVENTS UPGRADE — REAL STYLUS PRESSURE SENSITIVITY (2026-07-08): Daisy confirmed pressure-sensitivity matters for the creative tools (planning to issue Android tablets + stylus pens as studio kit), so upgraded both drawing canvases (Design Preview's brush, Transfer Designer's brush/pen) from basic Touch Events to the Pointer Events API (`pointerdown`/`pointermove`/`pointerup`/`pointercancel` + `canvas.setPointerCapture()`), which unifies mouse/touch/pen input AND exposes real `pressure` data (0–1) from active styluses.

Pressure scales the effective stroke size around the chosen nib/brush size: `pressureScale = max(0.3, pressure * 2)`. Mouse and finger touch report pressure as 0 (browsers vary) which is treated as 0.5 ("normal") — meaning `pressureScale = 1.0`, so **existing finger/mouse drawing behaviour is completely unchanged**, confirmed via direct testing (22px stroke for Design Preview's default brush size, 16px for Transfer Designer's — both exactly matching the old fixed sizes at normal pressure). A real pressure-sensitive stylus pressing harder now genuinely thickens the line; pressing lightly thins it.

Tested properly: verified real mouse-based drawing still paints correctly through the new pointer events, and verified the pressure-scaling math directly (light press 0.1 → thin ~6px stroke, normal 0.5 → exactly the old fixed size, heavy 1.0 → exactly double). Couldn't fully simulate a real stylus's pressure via synthetic PointerEvents in headless testing (`setPointerCapture` needs a genuine OS-level active pointer session, which synthetic dispatched events don't have) — that's a test-harness limitation, not an app issue; real hardware will have valid pointer sessions.

★ STUDIO TABLET/STYLUS SESSION CHARGE — PROTOTYPE (2026-07-08): Daisy's planning to issue cheap Android tablets + stylus pens as studio equipment. **Compatibility check:** confirmed fine — the app's drawing tools use standard touch events, which cheap Android tablets and most bundled styluses (capacitive/passive ones) support identically to finger touch. Flagged one honest gap: we're on basic touch events, not the Pointer Events API, so pressure-sensitivity/tilt on active styluses wouldn't be picked up yet — not needed for basic drawing, worth revisiting if pressure-sensitive lines matter later.

Built the actual charge: **£3/session** for providing the tablet+stylus, reusing the same `app_extra_charges` tally infrastructure as the tool paywalls, but triggered by STAFF (not the customer) — a checkbox ("📱 Providing studio tablet & stylus +£3.00") in Section 1's result step, ticked when handing over the equipment, charged when "Open Table" is tapped. Renamed the Dashboard tally card from "App Extras Today" to "Extra Charges Today" since it now covers both tool unlocks and equipment fees. Tested with `apiConnected` forced true (since the local test environment's health-check against the real Render URL fails via CORS) to confirm the charge fires with the correct booking code and amount.

★ DAILY BOOKINGS & CUSTOMER ENGAGEMENT — RENAMED + SECTION 1 REDESIGNED AS A PROPER STEP FLOW (2026-07-08): Daisy: the "Staff" nav label was confusing, and Section 1 felt "clumsy" — everything (today's bookings list, lookup box, walk-in box) shown at once instead of a clear step-by-step flow.

**Renamed:** sidebar nav label "Staff" → "Daily Bookings", page header → "Daily Bookings & Customer Engagement".

**Section 1 rebuilt as a proper 3-step flow, matching the customer app's chunky tile feel:**
1. **Start** — a single prominent "Customer Name" input, then a big two-tile fork: "🚶 New Walk-in" / "📅 Existing Booking" (using the `.till-tile` style from the earlier till-screen pass)
2. **Existing Booking** (only shown if that's chosen) — Today's/Next-7-days bookings list + lookup-by-code, with a "← Back" to return to the fork
3. **Result** — customer found/created, returning-pieces warning, QR button, table+places, open table — with a "← Start Over" to reset everything

Each step hides the others (`display:none` toggling via `s1ChooseWalkIn()`, `s1ChooseExisting()`, `s1BackToStart()`), so only one step is ever visible at a time — genuinely "press button, next step" rather than a wall of options. `startWalkIn()` now takes the name as a parameter (from the top field) rather than its own separate input field, since that field no longer exists. Tested the full flow (start→walk-in→result, start→existing→back, start-over resets everything correctly) with Playwright before pushing.

★ PAID TOOLS PAYWALL — PROTOTYPE FOR APPRAISAL (2026-07-08): Daisy wants some customer app tools free, others chargeable, tallied against the booking rather than charged directly — real payment processing to be wired up once billing is properly sorted. Built as a genuine working prototype:

**Free:** Colour Picker only. **Paid:** Design Preview AND Transfer Designer, £1/visit each (Daisy's follow-up: "make the palette colour selector free and make the other one a pound as well" — generalized the paywall from a single hardcoded tool to a `PAID_TOOLS` config object so adding/removing paid tools is now a one-line change rather than duplicated logic).

- New table `app_extra_charges` (studio_id, booking_code, item_name, amount_cents, created_at) — deliberately NOT tied to `table_session_id`, since a customer may open the app before staff have opened their table in Section 1/2; this works regardless of that timing.
- `GET /api/extras/unlocked` — checks if this booking already paid for this tool this visit (so reopening the app later doesn't charge again)
- `POST /api/extras/charge` — records the £1 charge
- `GET /api/extras/today` — staff-facing tally, grouped by booking
- Customer app: tapping the Transfer Designer tile (now shows a small "£1" badge) checks unlock status first; if not yet unlocked, shows a confirmation modal ("Unlock for £1 — added to your bill, no payment needed now") before opening; if already unlocked this visit, opens straight away. Fails open (opens the tool anyway) if the network check itself fails, so a backend hiccup never blocks a paying customer from something they may have already unlocked.
- Staff dashboard: new "📱 App Extras Today (prototype)" card on the Dashboard tab, tallied per booking, so staff can add it to the bill at checkout.

**Tested properly before pushing** (learned from the last two rounds): used Playwright with mocked API responses to confirm the actual flow works end-to-end — booking context loads, modal shows when not unlocked, confirming calls the charge endpoint, tool opens after. All confirmed working, not just assumed.

**Explicitly a prototype, not final billing:** no real payment is taken through the app; this only tallies what's owed for staff to add to the till at checkout, per Daisy's brief ("for testing purposes").

★ TRANSFER DESIGNER: FREEHAND DRAWING ADDED (2026-07-08): Daisy wanted a proper Canva/Paint-style drawing layer (brush, pen, fill, colours) added to Transfer Designer, alongside the existing text/motif tools, with clear on-screen messaging that it's a planning sketch, not the real painting. Built as a new "✏️ Sketch" mode (now the default tab, before Add Text/Add Motif):
  - **Brush** — soft, semi-transparent strokes at the chosen nib size (3 sizes)
  - **Pen** — half the chosen nib size, fully opaque (hard-edged fineliner feel)
  - **Fill** — tap-to-fill, same proven flood-fill algorithm as Design Preview (samples the original photo so repeat fills stay accurate, paints onto a separate layer so the photo itself is never altered)
  - **Undo** button added (wasn't there before)
  - Reused the existing colour row (was already built for motifs)
  - Clear banner at the top of the screen: "✏️ This is a quick sketch to plan your idea — not the real thing! Once you've got a design you like, you'll do the actual painting with real glaze in the studio."

Technically: replaced the plain `<img>` photo display with a base+paint canvas pair (matching Design Preview's proven architecture) so pixel-level drawing and fill are possible, while the draggable text/motif DOM elements still layer on top as before.

**Found and fixed a real bug while building this** — tested properly in a real headless browser (Playwright) rather than assuming it worked: the two new canvases had **no CSS positioning at all**, so instead of overlapping (photo underneath, drawing layer on top), they stacked vertically in normal document flow, pushing the interactive paint layer out of alignment with the visible photo. Confirmed via pixel-level testing before and after the fix — brush/pen/fill all painted transparent (nothing) before, all painted correctly (verified exact RGBA values matching intended colour/opacity) after.

★ TRANSFER DESIGNER BUG FIX (2026-07-08): Daisy reported it "seems non-functional." Rather than guess, actually tested it in a real headless browser (Playwright) — opened the screen, added text, added a motif, dragged, resized, and rotated elements, all confirmed genuinely working correctly at the code level (drag moved position correctly, resize changed scale 1→2.06, rotate changed angle to 16.3°). The real bug found: the "📷 Take Photo" button had **zero CSS styling at all** — a copy-paste gap meant the shared photo-prompt button styling only targeted Design Preview's `#dp-photo-prompt` id, not Transfer Designer's `#td-photo-prompt` id. So the primary button — the first thing anyone would tap — rendered as a tiny, unstyled, barely-visible default grey browser button on a dark background, while "Choose Photo" next to it looked fine (it had its own inline style override). That's almost certainly what read as "non-functional." Fixed by extending the shared CSS rule to cover both ids. Good reminder: when a screen reuses another screen's patterns, check EVERY shared selector actually covers the new id, not just the JS function names.

★ SELF-SERVICE WALK-IN ENTRY POINT (2026-07-08): Researched how other paint-your-own pottery studios actually work (several independent studios + an industry consultant who's opened 600+) — the core workflow (choose bisque → paint → leave with staff → glaze/fire → return to collect, 3-14 days) is genuinely near-universal, validating LINK's model. The one real structural gap found: several US studios are pure walk-in, no booking system at all — LINK's whole flow assumed a booking/QR existed first. Fixed: `POST /api/bookings/self-checkin` — a customer-facing endpoint (unlike the existing staff-only `/api/bookings/manual`) that lets a customer create their own session record directly, no staff action needed first. Customer app: visiting `/app` with no booking code now shows a simple "Start My Visit" form (name + party size) instead of a dead-end "ask staff" message. Staff app: new "🚶 Walk-in QR" card in Setup — a single static QR (just the bare `/app` URL, no booking-specific code) that can be printed once and left permanently on tables/by the door, landing customers straight on the self-checkin form. Reuses the existing QR modal UI.

Also surfaced two smaller real-world variations worth knowing about but not yet acted on: (a) some studios charge per-time-painting rather than flat piece+firing fee (Kiln Cafe/LINK currently assumes flat fee); (b) some studios treat glazing/dipping as its own visible workflow stage before firing, which LINK's Kiln Room currently doesn't surface as a distinct step.

★ TRANSFER DESIGNER BUILT (2026-07-08): The last remaining "Coming soon" customer app tool activated — completes the full set of three design tools (Design Preview, Colour Picker, Transfer Designer). Photo of the real piece as the base (same camera-capture pattern as Design Preview/Community share), then customers add draggable/resizable/rotatable elements on top: typed text (4 font choices) or simple motif shapes (star, heart, flower, swirl, dot), any of 7 colours. Each element has three handles when selected — a rotate handle (top), resize handle (bottom-right corner), and remove handle (top-right, red ✕). Genuinely full drag+resize+rotate (not just drag+resize like Design Preview's stickers) since transfers commonly need rotating for placement on curved pottery. Elements are plain DOM divs (not canvas), so text stays live/editable-feeling rather than being baked into pixels.

★ COMMUNITY EXPANSION (2026-07-08): Three new community/income stream features built together:

1. **Shareable Piece Cards** — after sharing to the studio community, customers can tap "✨ Create Instagram/TikTok Card" to generate a branded 1080×1080px image: piece photo fills the frame, dark gradient footer with kilnLINK wordmark, "Made by [FirstName]", studio name, and hashtags. Saves directly to camera roll. Each card shared to social media is free viral marketing that reaches people who've never heard of kilnLINK.

2. **Global 🌍 Worldwide feed** — community feed now has two tabs: "Our Studio" (per-studio as before) and "🌍 Worldwide" (all posts from all studios on kilnLINK, ordered by recency). Staff can "✨ Feature" any post, which marks `is_featured=true` and promotes it to global visibility. Featured posts shown with a clay-coloured border in the moderation panel.

3. **Design Marketplace** — new "🎨 Design Marketplace" tile on the home screen (golden gradient, stands out). Two-tab screen: Browse (grid of community designs, tap to load into Transfer Designer) and List a Design (customer lists their Transfer Designer work for others to use, sets a price £1–£5). Transfer Designer now has a "🏪 List in Design Marketplace" button. Uses new `marketplace_designs` table. Income model: when a customer uses someone else's design, the studio can add the price to their bill (full billing integration a future step).

**New SQL to run in Supabase:**
```sql
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE;
CREATE TABLE IF NOT EXISTS marketplace_designs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  booking_code TEXT, customer_display_name TEXT,
  title TEXT NOT NULL, description TEXT, image_data TEXT NOT NULL,
  price_cents INT DEFAULT 100, download_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_marketplace_designs_global ON marketplace_designs(created_at DESC);
```

★ ARCHITECTURE (as of 2026-07-05): GlazeUp is now TWO frontends on ONE shared backend:
  • STAFF app  → /admin/dashboard-local.html  (bookings, tables, kiln, catalog — iPad)
  • CUSTOMER app → /app?booking=CODE  (customer's phone, booking-linked)
  Both served by server.js (express.static on /admin and /app). Customer app entry:
  staff open a table in Section 1 → a "Scan to start painting" QR modal appears
  (QR generated client-side via qrcodejs CDN) encoding /app?booking=CODE → customer
  scans with phone camera → lands on their own session, greeted by name, sees loyalty
  points + unfinished pieces + design-tool tiles. Design tools (Colour Picker, Design
  Preview, Transfer Designer) are currently "Coming soon" placeholder tiles — these are
  the previously-built Netlify single-file apps to be rebuilt INTO the customer app,
  one per session next. STUDIO_ID is hardcoded to Kiln Cafe in app/index.html for now
  (white-label studios would inject their own).

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

**Logo added (same session):** built a proper icon mark — a glazed pot silhouette (inline SVG) using the same specular-highlight + gravity-pooled gradient technique as the buttons, with a small glaze-drip detail hanging off the base (a nod to real excess glaze dripping during dipping). Sits beside a bolder "GlazeUp" wordmark in the sidebar, sized up and given a drop-shadow so it reads clearly against the crimson sidebar background — replaces the old plain text-only header.

---

## QR System, Step by Step (2026-07-05)

Building toward Daisy's "kiln to grave" QR tracking idea: QR generated at booking creation, present everywhere, and embedded directly into collection photos so a piece can always be traced back to its booking even after firing destroys any physical QR.

**Step 1 — QR available immediately, not gated behind table-open:**
- Section 1 now has a **"📱 Show Customer QR"** button available right after a booking is found/created, before a table is even assigned (`showCustomerQRFromResult()`).
- Customer app (`/app`) now shows a **persistent small QR badge** in the header on every screen, tap to enlarge to full-size with the customer's name — so they can show it to staff again anytime during their visit, not just once at arrival.

**Step 2 — QR + customer details + dates stamped directly onto the collection photo:**
When staff take the collection photo (in the pieces-submission modal), it's no longer just a plain photo — it's composited on-device (via HTML canvas) with:
  - The booking's QR code (drawn as raw pixels using the `qrcode-generator` library — deliberately NOT a fetched image, since a cross-origin image would taint the canvas and block export; this library computes the QR grid locally with zero network calls)
  - Customer name + table number
  - **Finished date** (today, automatic)
  - **Scheduled firing date** — a new optional date-picker field in the modal (`#modal-firing-date`), since staff usually know the firing schedule at collection time even though it's not always knowable (volume-dependent)
This solves the "kiln gap" from the earlier phone-QR brainstorm: the physical QR can't survive firing, but the *photo* does, and now the photo carries the QR + all identifying details baked permanently into the image itself — turning photo-matching at kiln-unload from eyeballing into something exact and scannable.

**Schema update needed (Daisy to run):**
```sql
ALTER TABLE pottery_pieces ADD COLUMN IF NOT EXISTS scheduled_firing_date DATE;
```

**Not yet built:** a staff-side tool to actually scan/decode the QR back out of a stored photo at the kiln-unload step (currently staff would just read the stamped text/QR by eye, which is already a big improvement, but a proper scan-to-lookup tool is the natural next step).

**Step 3 — Kiln unload scan-to-confirm (2026-07-05):** Added the actual staff-side tool from the note above. New "Kiln Unload — Confirm Ready for Collection" card in Kiln & Inventory: staff scan (or paste) the QR/link from a piece's stamped photo → `POST /api/pieces/confirm-ready-by-scan` looks up the booking, marks that booking's dipped/in-kiln pieces as `fired` individually (finer-grained than bulk-firing a whole kiln session), and returns the customer name + count confirmed.

---

## Kiln Section Simplified: One "Kiln Room" Card (2026-07-05)

Daisy pointed out the "Firing Pipeline" (ready-for-dip → dipped-waiting-for-kiln-with-checkboxes → create-kiln-session → kiln-sessions-list) was too messy — in reality, a booking's pieces are photographed at the table, then go to the kiln room and dip + fire together as one batch. No need to track dip and fire as separate manual steps.

**Collapsed to one simple card**, styled consistently with Ready for Pickup (grouped by booking, one action button per group — no more checkboxes, no more naming/creating a "kiln session"):
- New endpoint `GET /api/pieces/in-kiln-room` — everything with status `ready_for_dip`/`dipped`/`in_kiln`, grouped by booking
- New endpoint `POST /api/pieces/mark-fired-by-booking` — one button fires an entire booking's batch straight to `fired`, no intermediate session object needed
- Removed the old `loadPiecesAwaitingDip`/`loadDippedPieces`/`createKilnSession`/`loadKilnSessions`/`fireKilnSession` functions and their UI (checkboxes, "Create Kiln Session" naming prompt, separate sessions list) — all replaced by `loadKilnRoom()` + `markBookingFired()`.
- The old `kiln_sessions` table/endpoints (`/api/kiln-sessions*`) are left in place in `server.js` but are now unused by the UI — harmless, not deleted, in case multi-batch kiln-load tracking is wanted again later.

**Bonus fix caught while doing this:** `pottery_pieces` has no `customer_name` column, so both Ready for Pickup and the old dip list were silently falling back to showing the raw booking code instead of the customer's actual name. Added a shared `enrichPiecesWithCustomerName()` helper (joins `booking_id` against `bookings.booking_code`) used by both `/api/pieces/in-kiln-room` and `/api/pieces/ready-for-pickup` now, so real names show correctly in both.

---

## Kiln Firing Batch QR (2026-07-05)

Daisy's insight: individual customer QR codes work fine day-to-day, but a firing often combines 2-3 days' worth of accumulated pieces from different bookings. Rather than firing per-booking one at a time, she wanted a single code representing the whole physical kiln load — generated when loading starts, scanned once when firing is done to close out everything in it together, regardless of how many days/bookings it spans.

**Brought back the existing (previously unused) `kiln_sessions` table + `pottery_pieces.kiln_session_id` link** for this, rather than building new plumbing — this is exactly what that machinery was for.

**Schema update (Daisy to run):**
```sql
ALTER TABLE kiln_sessions ADD COLUMN IF NOT EXISTS batch_code TEXT UNIQUE;
```

**New endpoints:**
- `POST /api/kiln-batches/start` — pulls in EVERY piece currently sitting in the kiln room (any status among ready_for_dip/dipped/in_kiln, not already in another batch), regardless of which day/booking it came from, and gives the whole batch a short scannable code (format `KILN-YYYYMMDD-XXXX`)
- `GET /api/kiln-batches/active` — lists not-yet-fired batches with piece counts, so staff can re-view a batch's QR later
- `POST /api/kiln-batches/fire-by-code` — fires every piece in a batch at once by its code

**UI (Kiln Room card):** new "🔥 Start New Firing (combine all pending)" button shows the resulting batch's QR in a modal (honey-glazed, matching the batch's colour distinct from the customer QR's oxblood) — meant to be screenshotted, printed, or hand-written onto a tag kept with the physical kiln load. An "Active Kiln Batches" mini-list shows any batches still firing, each with "View QR" (re-show it) and "🔥 Mark Fired" (fire directly without scanning) buttons.

**Kiln Unload scan card now handles both code types in one input:** codes starting `KILN-` are detected and routed to fire the whole batch; anything else is treated as an individual booking code (existing per-booking behaviour unchanged, still useful for single-booking/no-batch fires). No separate scan flows to remember — one input does both.

**Zero-external-service notification, as agreed:** no email/SMS. Instead, `GET /api/booking/:bookingCode` now also returns `piecesReadyForPickup` — any fired-but-not-collected pieces for that booking. The customer app shows a celebratory "🎉 Ready for collection!" banner automatically the next time they open their page (home-screen icon or saved tab), reflecting live status with zero manual send step.

**Add to Home Screen (2026-07-05):** solves "how does the customer get back in after leaving the studio" without any account/login. Added `app/manifest.json`, generated real PNG icons (192/512/apple-touch, using the same glazed-pot design, rendered via cairosvg since ImageMagick's SVG delegate wasn't available in the sandbox), and a platform-aware banner: real one-tap install button on Android/Chrome (`beforeinstallprompt`), manual "tap Share → Add to Home Screen" instructions on iOS (which doesn't allow programmatic install). Saves a proper home-screen icon pointing at the customer's exact booking URL — dismissible, remembered per-booking via localStorage so it doesn't nag.

---

## Design Preview Tool Built (Customer App) — 2026-07-06

Daisy's call on the old "overlay" design-preview concept: rather than a customer picking from a fixed illustrated shape/overlay (the old, dated approach), they **photograph their own real physical piece** and preview colours directly on that actual photo. More personal and accurate than a generic template.

**Activated the "Design Preview" tile** in the customer app (`/app`) — was a "Coming soon" placeholder, now a full working tool, full-screen overlay (`#design-preview-screen`):

- **Photo capture** — same camera-capture pattern used elsewhere (`capture="environment"`), photo becomes the base layer on an HTML canvas
- **Three tools, all requested together:**
  1. **Brush** — freehand painting, translucent colour strokes directly onto the photo. 3 brush sizes (fine/medium/thick) + an opacity slider
  2. **Fill area** — tap-to-fill, a real flood-fill algorithm (stack-based, tolerance-based colour similarity) that samples the *original photo* to decide which pixels belong together, but paints onto a separate transparent layer — so the photo itself is never destructively altered and repeat fills stay accurate
  3. **Colour sticker** — a draggable, resizable translucent circle customers can position and scale by hand over any part of the photo (drag to move, corner handle to resize, × to remove)
- **Palette:** a starter set of ~14 common Stroke & Coat colours (Really Red, Kiwi, Turquoise Delight, etc.) — **PLACEHOLDER**, needs swapping for Daisy's exact confirmed-in-stock shades when she has the list to hand
- **Undo** (steps back through brush/fill actions via saved canvas snapshots) and **Clear All**
- Two-canvas architecture: `dp-base-canvas` (the photo, read-only) + `dp-paint-canvas` (everything the customer paints), so the flood-fill can always sample true original photo colours regardless of what's already been painted

**Not yet done:** no save/export of the finished preview (customer can screenshot for now); palette is a placeholder, not Daisy's real stocked colours.

---

## Real Square Connected (Production, Read-Only) — 2026-07-05

Daisy connected her real Kiln Cafe Square account. Confirmed the entire codebase only ever makes read calls to Square (retrieveMerchant, searchOrders, listCatalog, searchTeamMembers, listBookings — no create/update/delete/charge/refund anywhere), and OAuth scopes requested are all `_READ` only. Production credentials added to Render (`SQUARE_CLIENT_ID`, `SQUARE_CLIENT_SECRET`, `SQUARE_ENVIRONMENT=production`), plus `API_URL` (was missing, causing an invalid redirect_uri error on first attempt) and the Production OAuth Redirect URL registered on Square's side (`https://glazeup-api.onrender.com/api/square/callback`).

**Bug found and fixed during connection testing:** `node-fetch` v3 is ESM-only and silently breaks when loaded via `require()` — it returns a module namespace object instead of a callable function, causing "fetch is not a function" during the OAuth token exchange. Fix: removed the `node-fetch` import entirely and rely on Node's native global `fetch` (confirmed available — Render runs Node 26.4.0, well above the v18 threshold where native fetch was introduced).

Square OAuth consent completed successfully by Daisy. Real production connection should now be live — next step is confirming real catalog items/prices are flowing into Section 2 (Customer Engagement) instead of the demo Mug/Coffee/Brownie placeholders.

---

## Depth/Blur + Micro-Interactions Pass — Both Apps (2026-07-06)

First step toward Daisy's "more modern app feel" request. Kept scoped and buildable in plain CSS/JS (no framework rebuild) rather than attempting the full native-app-feel list in one go. Covered:

**Staff dashboard:**
- Tab switches (`goToTab`) and Staff sub-section switches (`showStaffSection`) now fade+slide in (`.fade-in` class, `viewFadeIn` keyframe) instead of snapping instantly
- All modal overlays (customer QR, batch QR, pieces-submission modal) now have `backdrop-filter: blur(6px)` — genuine frosted-glass feel instead of a flat dark tint — plus a fade-in animation on open
- Shimmer skeleton loading state (`.skeleton-line`, animated gradient sweep) replacing plain "Loading..." text in Kiln Room, Ready for Pickup, and Open Tables cards
- `.tap-row` utility class (subtle scale-down on `:active`) added to plain list-row buttons that had no press feedback (e.g. today's bookings rows)

**Customer app:**
- Initial "Loading your session…" replaced with a shimmer skeleton that mimics the real header + card layout about to appear (`.skel-header`, `.skel-block`)
- My QR modal now has the same frosted-glass blur treatment
- Design Preview now slides up from the bottom (`transform: translateY(100%)` → `0`, eased with `cubic-bezier(0.32, 0.72, 0, 1)` — the standard "sheet" motion feel) instead of instantly appearing/disappearing

All animations respect `prefers-reduced-motion`.

**Not yet done (from the fuller "modern app" list discussed):** a bottom nav bar for the customer app (currently everything lives on one scrolling page — the biggest remaining "feels native" gap), a consistent spacing grid pass, and broader micro-interactions across every remaining button/card. Good next steps when picking this up again.

---
Multiple bugs fixed during the connection session (all pushed live): node-fetch ESM issue; `retrieveMerchant()` needed a `'me'` argument; OAuth callback redirected to a non-existent dashboard route (now shows an inline "Square Connected" success page); and the server now serves the admin dashboard as static files so it has a real browser URL (`https://glazeup-api.onrender.com` → redirects to the dashboard).

---

## ⚠️ OUTSTANDING TIDY-UP (Daisy said "tidy all that up later" — 2026-07-05)

Things to come back and finish/verify — deferred to keep momentum:

1. **Confirm real Square data is actually flowing** — ✓ DONE. Fixed by adding `ITEMS_READ` scope (was missing — Square returned 403 on catalog reads) and having Daisy revoke + reconnect so a fresh token carried the new scope. Real full Kiln Cafe catalog now flows (Hot/Cold Drinks, Cakes, and ~20 "PB" bisque categories with correct prices). Section 2 category tabs made horizontally scrollable to handle ~23 categories on iPad; item-type inference (drink/cake/piece) confirmed correct against real category names.
2. **Rotate the exposed Square Production Access Token** — Daisy pasted her full Production Access Token (`EAAAl...`) into chat earlier before we clarified we needed the Application Secret instead. That token grants full account access. She should click "Replace" on it in the Square dashboard to invalidate it (good hygiene — it was never used by the app, but it was exposed).
3. **The GitHub PAT (`ghp_...`) used for pushes this session** should ideally be rotated too, since it appeared in the working environment.
4. **Wire real bookings sync** — ✓ DONE. Confirmed Kiln Cafe bookings ARE in Square Appointments (booking policy language on thekilncafe.com/bookonline matches Square's no-show protection). Fixed a cascade of issues to get it working: (a) needed `APPOINTMENTS_ALL_READ` scope (seller-level) not just `APPOINTMENTS_READ` (buyer-level) — customer bookings were invisible without it; (b) Square caps the bookings query window at 31 days — using now→+28 days; (c) `listBookings` uses positional args `(limit, cursor, customerId, teamMemberId, locationId, startAtMin, startAtMax)`; (d) global `BigInt.prototype.toJSON` patch added since Square SDK returns BigInts that crash JSON serialization. Rewrote `/api/bookings/sync` against the real data shape: customer name looked up via Customers API (`retrieveCustomer` by `customerId`), table mapped from `appointmentSegments[0].teamMemberId` → team member name, session end derived from `durationMinutes`. Added `GET /api/bookings/today` + a "Today's Bookings" list with "🔄 Sync from Square" button in Section 1 — tap a booking to auto-fill the lookup and table. NOTE: temporary `/api/square/bookings-debug` endpoint still in server.js — remove it later.
5. **Set the studio's `table_tracking_mode`** to `staff_as_tables` — ✓ DONE by Daisy via Setup tab dropdown.
6. **Consider adding real Stripe keys** when ready (still `sk_test_placeholder`), so billing/subscription features work.
7. **General UI polish pass** deferred — the glaze redesign covered buttons/nav/cards/logo but not full layout/typography/headers.
8. **`mark-picked-up` UI** — ✓ DONE. Added `GET /api/pieces/ready-for-pickup` (lists fired, uncollected pieces) and a "Ready for Pickup" card in the Kiln & Inventory section: fired pieces grouped by booking/customer, each group with a sage "✓ Mark Picked Up" button that flips pieces to `picked_up` status.

---

## Brainstorm Captured (not yet built — 2026-07-05): Phone-QR + Per-Studio Kiln Reconciliation

**Physical QR — decided against a physical card entirely.** No plastic/printed card. Instead: the iPad displays a QR the customer scans with their own phone at arrival. That loads *their* booking/pieces page onto their phone → both sides now hold it (studio in DB, customer on phone). The customer's phone effectively becomes the QR; staff scan it off the phone screen at each stage. Benefits: no printing/lamination cost, nothing to survive water/glaze, and the customer gets a live link to their pieces (status, photos, loyalty).

**The unavoidable kiln gap:** a scannable QR cannot survive the kiln, and the customer's phone isn't in the fire. So reconciling *which fired piece belongs to whom* at the unload step needs its own solution. Decision: make this a **per-studio setting** (`kiln_reconciliation_mode`), same pattern as `table_tracking_mode`, since studios fire differently. Three modes to offer:
  1. **Photo-matching** (Kiln Cafe's current way) — tech eyeballs the pre-fire collection photos against the batch. No marking on pieces. (Bones already built: kiln sessions group by booking, collection photos already captured.)
  2. **Written base number** — staff write a kiln-safe underglaze code on each piece base pre-fire; tech reads + enters it post-fire to pull up the booking.
  3. **Booking-batch grouping** — a booking's pieces always fired together and kept physically grouped (labelled shelf/bat); tech identifies by batch, not individual piece.

Implementation shape when built: the setting just changes what the tech sees at the "unload kiln" step (photos to eyeball / a number-entry box / a batch-shelf label). Everything downstream (mark fired → notify customer on their phone → ready for pickup) is the same regardless of mode.

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

---

## Session — 14 July 2026: Splash, login picker, animated staff cast

**Splash white gap (fixed).** The gap was never the splash — `#splash-screen` is
`position:fixed; inset:0`, which iOS sizes to the SMALL viewport. When Safari's
toolbar collapses, the extra strip at the bottom is painted by `body`, which is
ivory (`--gu-secondary`). Fix: `html/body.splash-showing` painted `#0E1A18`,
added by an inline script the moment the splash renders and removed after it
fades; splash also now uses `100dvh`. Covers both the initial load and the idle
re-show via `showSplash()`.

**Login picker (fixed).** `loadLoginNamePicker()` had a dead-end: if the team
fetch failed or returned empty it rendered "Could not load the team list" with a
skip link as the only way out — so you never saw the picker and landed in shared
view. It now always resolves to a team: real from Supabase, or `DEMO_STAFF` as an
offline fallback. The "Skip — use shared/manager view" button has been removed
from the picker; the avatar picker is the only route in.

**Demo PIN — it is 0000, not 000.** `reset_all_pins_to_0000.sql` sets every Kiln
Cafe PIN to the SHA-256 of "0000" and the server checks against that. The old
`DEMO_STAFF` `pin: '000'` was dead data — nothing read it. Now aligned to 0000.
Also: `submitShiftPin()` always POSTed to the API, so in the exact situation the
fallback exists for (API down) picking a face then failed at the PIN. It now
validates locally when `isDemoFallback` is set, and sets no `currentShiftId` so
the timesheet stays honest.

**Staff avatars — rebuilt and rigged.** All eight (David, Jenny, Daisy, Lucy,
Ruby, Elliott, Dave, Cleo) redrawn with head/arms/hair/brows/mouth as separate
groups so they actually perform rather than the badge rotating. Real hair per
Daisy's descriptions: Daisy a number-three crew cut, Jenny long slightly wavy
auburn, Lucy light brown gone blonde with the studio bun, Ruby very long very
straight grey-blonde. **Cleo added** — Daisy's daughter, one year old, brown
ringlets, big brown eyes, mid-babble, flaps and giggles and winks; role "Chief
Taster". Motion is CSS-only, staggered per person, `transform-box: view-box` for
the SVG parts, and fully disabled under `prefers-reduced-motion`. Avatars render
at 56px in the picker — the detail doesn't read at that size; bumping to ~76px is
open.

**Opening hours — the website is not a source of truth.** thekilncafe.com says
three different things: home Thu-Sat 10-5, FAQ Thu-Sat 10-3:30, contact Thu 10-3:30
/ Fri 10-3:30 / Sat 10-5 / Sun 10-2:30. Contact reconciles the other two. Evenings
are discontinued but What We Offer still advertises monthly Thursday 6-9pm sessions.
**Decision: read hours from Square (what's bookable IS the hours), add a "Closed
today" staff toggle for ad-hoc closures, website stays for humans only.** Do not
scrape the site.

**Agreed next — auto-learning, and the blocker.** The app should learn from real
usage and suggest changes, with Claude shipping them. Bones already exist:
`staff_task_usage` (per-tab counts) and `staff_home_screens` (`tile_order`,
`promoted_tiles`). Approach: a **local rules engine, no model, no API cost** —
plain arithmetic over counted tables — plus a dev-diary table Claude reads at the
start of each session. **The app must not write or deploy its own code.**
*The blocker:* `GRID_NAV_STRUCTURE` is hardcoded in the client (~line 10119), so
"recondense the tiles" is a code change every time. Move it to a table and tile
structure becomes data the engine can reshape with no deploy. Same for the seating
plan (coordinates in a table, not in the drawing code). This gates both the 9 → 2-3
mega-tile consolidation and the learning engine.

*Cadence caution:* the studio trades Thu-Sun only, so "daily learning" is four
days of signal a week. Fire suggestions on confidence, not on a nightly timer.

---

## Session — 14 July 2026 (cont): Update banner, drawn floor plan

**Green update banner (fixed).** `#update-available-banner` was `position:fixed;
top:0` at `z-index:99999` with **no safe-area padding** — so on iPhone it sat under
the notch/status bar and covered everything including the revenue strip. Commit
0b2ac47 ("Update bar: safe area padding") fixed the *platform revenue strip*, not
this element; the banner was missed. Moved to the bottom with
`padding-bottom: calc(12px + env(safe-area-inset-bottom))` — clear of the notch,
above the home indicator, "What's new?" in thumb reach.
*Outstanding:* Daisy reports it "is moving" — unexplained, nothing animates on it.
The revenue strip nearby does shimmer (tickerShimmer 8s) and has a pulsing dot.
Needs a look on device.

**Floor plan — built properly.** `showHomeScreen()` was not a plan at all: three
grids of rectangular buttons labelled "Table 1", "Lounge 1". Nothing to populate.
Replaced with a drawn SVG plan per room — real tables sized by seat count, chairs
around the edges (outlined = empty, filled = a cover), stage colours matching the
booking flow. Tap a table → `enterBookingFlow(room, id)`.
**Resting state:** never empty. With no live bookings it shows `DEMO_COVERS` on the
same drawing, so the room still reads as a room — always behind an amber "Example
layout — no live bookings yet" pill so nobody mistakes an example for a real table.
Drops to real data the moment `_liveCovers` has anything.
*Outstanding:* table positions and seat counts in `FLOOR_PLAN` are **guessed** —
Daisy to correct which tables are 2s/4s/6s/8s and roughly where they sit.
*Not yet wired:* `_liveCovers` has no producer — the booking layer must populate it.

**Auto-learning — status: not built.** Nothing installed, nothing learning.
BUT the counter is already wired: the dashboard posts to
`/api/staff/log-task-usage` (dashboard ~6138) and the server upserts into
`staff_task_usage` (server.js ~4187). If that SQL was ever run on Supabase it has
been collecting all along. The only consumer was Cleo's chat context
(server.js ~4070), and Cleo is disabled — so it counts into a void.
**First job next session: query `staff_task_usage` and find out whether there is
real data banked.** Unverified: whether the schema was ever run, and whether the
client call fires on every tab or only some.

---

## Session — 14 July 2026 (cont): Learning engine — foundation built

**Built, not yet verified against real data.**

`learning_engine_schema.sql` (NEW — needs running on Supabase):
- `staff_task_transitions` — what follows what. `staff_task_usage` counts opens;
  this records ordering, which is where the workflow actually lives.
- `studio_suggestions` — the dev diary. `kind='layout'` applies in-app on approval;
  `kind='code'` is what Claude picks up at the start of a session. Carries the
  arithmetic in `evidence` so any suggestion can be challenged, plus `dismiss_count`.

`server.js` (NEW endpoints, no model, no API cost — plain arithmetic):
- `POST /api/staff/log-transition` — records from_tab → to_tab
- `GET  /api/studio/learning/report` — honest diagnostic: is anything collecting,
  how much, since when, and is there enough to learn from yet
- `POST /api/studio/learning/run` — runs the rules, writes suggestions (deduped)
- `GET  /api/studio/learning/suggestions` — what is waiting for a human
- `POST /api/studio/learning/respond` — approve / dismiss

**Rules v1:**
1. *Habit → shortcut.* If leaving tab A means opening B ≥60% of the time over ≥12
   moves, suggest putting B one tap from A. Per person.
2. *Quiet tile.* Untouched by the whole team for ≥45 days → suggest demoting it.

**Thresholds** (`LEARN` in server.js): MIN_TRANSITIONS 12, MIN_SHARE 0.6,
MIN_TAB_USES 15, QUIET_DAYS 45, CONFIDENCE_FLOOR 0.55. Tuned deliberately slow —
the studio trades Thu-Sun, so signal accrues over roughly a fortnight of trading.
Firing nightly would produce noise, and noise gets ignored.

**Three hard rules, enforced in code:** nothing applies itself without a tap;
nothing shows below the confidence floor; a suggestion dismissed twice is never
raised again.

**STILL OUTSTANDING:**
- Client does not yet call `log-transition` — needs wiring into `goToTab`.
- No suggestion UI yet — nothing surfaces to staff.
- Approval does not yet apply anything; `respond` returns `applied:false`.
  The client must action `layout` suggestions against `staff_home_screens`.
- `GRID_NAV_STRUCTURE` still hardcoded (~10119). Until tile *structure* is data,
  the engine can only reorder/promote what already exists — it cannot recondense
  the tiles without a deploy. **This is still the gate.**

---

## Session — 14 July 2026 (cont): Hand-drawn plan + Table detail page

**Agreed navigation model — three levels, nothing else:**
`SPLASH → LOGIN (avatars, PIN) → FLOOR PLAN (home, always on) → TABLE → JOB (tile grid)`
Every route back to the floor is one tap. Studio (stock/team/settings/revenue) hangs
off the nav rail, not off the floor.

**Floor plan redrawn.** Thin black line, hand-drawn: an feTurbulence displacement
filter (`#pencil`) wobbles every stroke so it reads as drawn, not plotted. Chairs are
properly drawn — seat, back, legs, facing the table — heavier stroke when occupied,
with a dot for a cover. Ivory ground (#F4ECE0), ink #2B2724.
**Restraint that matters:** the stage colour appears ONLY as a stripe along the front
edge of a busy table. It is the only colour on the page, so it reads across a room at
a glance. Resist adding more.

**Table detail page (NEW) — `showTableDetail(room, id)`.** The middle level. Shows
what is actually true of a table (who, stage, covers of seats, how long) then five
next steps. It is a junction and does no work itself — keep it that way.

**Decision — per-person tile splitting is being removed.** Daisy: too cumbersome.
Consequence flagged and accepted: the learning engine's Rule 1 promoted tiles per
person into `staff_home_screens` — that target is going.
**New model: studio-wide tile order by default, split per-person ONLY where one
person's behaviour diverges from the team's by a wide margin over a real sample.**
Rationale: on a shared iPad six divergent layouts break "it's the third tile" and make
training harder; and per-person signal is thin when the studio trades four days a week.

**STILL OUTSTANDING (next session, in this order):**
1. **Excise the tile splitter** — `_personalScreen`, `promotedTiles`, `tileOrder`,
   `_layoutHistory`/`_layoutFuture`, `_layoutUndo`/`_layoutRedo`, `ROLE_HOME_DEFAULTS`,
   `showPersonalHomeScreen`, `savePersonalHomeScreen`, and the undo/redo buttons in
   `_updateNavControls`. ~200 interlinked lines through the nav stack — **its own
   commit**, so it can be reverted alone if it breaks the floor.
2. Repoint the engine at studio-wide order + divergence threshold.
3. Nav rail (Back · Home · Refresh · You) + shift actions under the avatar
   (Break / Stepping out / Clock out).
4. `GRID_NAV_STRUCTURE` → data. Still the gate for mega-tiles and for the engine
   changing tile structure without a deploy.
5. `_liveCovers` has no producer — booking layer must populate it.
6. `FLOOR_PLAN` seat counts and positions are still **guessed**. Daisy to correct.
