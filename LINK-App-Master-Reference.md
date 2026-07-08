# LINK — Master Reference

*Studio management platform, built on top of Square. Pilot studio: The Kiln Cafe, Langport.*
*Last updated: 8 July 2026*

**How to use this file:** keep it on your desktop. Whenever we do more work on the app, tell Claude to update this file so it stays current — it's the one place with everything you need to hand.

---

## 1. Live Infrastructure — the important bit

| What | Where |
|---|---|
| **Live app URL** | https://glazeup-api.onrender.com |
| **Staff dashboard** | https://glazeup-api.onrender.com/admin/dashboard-local.html |
| **Customer app** | https://glazeup-api.onrender.com/app?booking=CODE |
| **GitHub repo** | https://github.com/thegreenroom-svg/GlazeUp *(private; still named GlazeUp — see To-Do)* |
| **Supabase project** | https://mdpchpjnlzlmldtlqrns.supabase.co |
| **Hosting** | Render (Frankfurt), auto-deploys on every push to `main` |
| **The Kiln Cafe Studio ID** | `fab8b2d2-27b5-47ec-8c56-268bbf821dc3` |
| **Square Location ID** | `LWXN6SBRQE191` |

**Render environment variables currently set:** `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SQUARE_CLIENT_ID`, `SQUARE_CLIENT_SECRET`, `SQUARE_ENVIRONMENT=production`, `API_URL`, `STRIPE_SECRET_KEY` (still a placeholder — see To-Do), `PORT`.

---

## 2. Repository File Structure

The whole app lives in one GitHub repo. **Only two files are actually live** — everything else in the repo is either supporting infrastructure or leftover from early prototyping.

```
glazeup/  (repo root)
│
├── server.js                    ← THE BACKEND. All API endpoints live here.
│
├── admin/
│   └── dashboard-local.html     ← ⭐ LIVE: the staff app (everything staff use)
│
├── app/
│   ├── index.html                ← ⭐ LIVE: the customer app
│   ├── manifest.json             ← customer app "Add to Home Screen" config
│   ├── icon-192.png, icon-512.png, apple-touch-icon.png  ← customer app icons
│
├── brand-assets/                 ← All official LINK logo files (SVG/PDF/EPS/PNG)
│   ├── master-logo/              ← Primary LINK wordmark with kiln arch
│   ├── connected-wordmark/       ← Same file, duplicate copy
│   ├── app-icon/                 ← Chain-link app icon, multiple sizes
│   ├── chain-link-glyph/         ← Standalone chain-link graphic
│   └── process-flow-variant/     ← Arrow-flow logo experiment (not currently used live)
│
├── ROLLING_NOTES.md              ← Claude's full build log — every decision, in order
│
└── (legacy/unused — safe to ignore)
    ├── backend/                   ← early prototype backend, replaced by server.js
    ├── css/, js/, index.html      ← early prototype frontend, replaced by admin+app
    ├── admin/dashboard.html       ← earlier draft, replaced by dashboard-local.html
    ├── sw.js                      ← unused service worker
    └── BACKEND_SETUP.md, BOOKING_SYSTEM.md, DASHBOARD_SETUP.md,
        PHASE_1_SUMMARY.md, QR_BOOKING_FLOW.md, QUICKSTART.md, README.md
        ← early planning docs, superseded by ROLLING_NOTES.md
```

**In short: if you (or a future developer) need to change something, it's almost always in `server.js`, `admin/dashboard-local.html`, or `app/index.html`.**

---

## 3. Brand Identity — Quick Reference

**Palette:**
| Name | Hex | Use |
|---|---|---|
| Charcoal | `#2B2724` | Primary text, dark UI, sidebar |
| Clay | `#B87946` | Buttons, accents, the kiln arch |
| Sand | `#E8D9C4` | Backgrounds |
| Ivory | `#F7F4EE` | Main app background |
| Stone | `#C8BFB2` | Borders, secondary text |

**Typography:** Instrument Sans (loaded from Google Fonts), Inter as fallback.

**Logo concept:** "LINK" wordmark where the N is replaced by an open-stroke arch (matching KILN's own arch icon) — L, I, K are real Instrument Sans letterforms converted to vector outlines; the arch is hand-drawn. Files in `brand-assets/master-logo/`.

**App icon:** simplified two-interlocking-rings chain-link glyph (no text), Ivory + Clay on Charcoal. Files in `brand-assets/app-icon/`.

**Splash screen:** shown on app open and after ~2–3 minutes idle. Letters spin in with a bounce, taglines fade in ("Studio · Community · Ritual", "Connect. Create. Belong.", "Built by KILN"), holds until tapped.

---

## 4. What's Built — Staff App (`admin/dashboard-local.html`)

**Navigation:** Dashboard → Setup → Staff → Community → Branding → Colours → Bisque → Designs → Account

**Staff tab — the core daily workflow, shown as a connected flow diagram (①→②→③→④):**
1. **Booking Details** — today's/next-7-days bookings synced live from Square Appointments, walk-in creation, customer QR generation
2. **Customer Engagement** — real Square catalogue browsing (drinks/pottery/cakes), running bill, big till-screen style item tiles
3. **Completion** — photograph finished pieces, stamps QR + customer name + date onto the photo
4. **Kiln & Inventory** — Kiln Room (mark fired), Kiln Firing Batches (combine multiple bookings into one firing, batch QR code), Ready for Pickup (mark collected), real Bisque catalogue reference tiles

**Community tab (new):**
- **Our Feed** — moderate what customers have publicly shared, remove inappropriate posts
- **Our Profile** — connect Instagram/Facebook/TikTok/website, bio, location, toggle directory visibility
- **Studios Worldwide** — directory of all studios on LINK, with a "🔥 X shared this month" activity signal — the B2B network/sales layer

**Design system:** flat charcoal/clay buttons, big bold "till-screen" tiles throughout Staff, real-time API connection status indicator.

---

## 5. What's Built — Customer App (`app/index.html`)

Opened via QR code scan or direct link with a booking code (`?booking=CODE`).

- **Splash screen** — branded opening moment (see Brand section above)
- **Home screen** — greeting, loyalty status, unfinished pieces, "Ready for collection!" banner when pieces are fired
- **My Bookings** *(new)* — past and upcoming visits, matched automatically by phone/email
- **Book a New Session** *(new, preview only)* — date + time slot picker, currently showing **mock availability** — not yet connected to real Square booking creation (see To-Do)
- **Painting Guide** — links to your existing how-to video page
- **Community** *(new)* — opt-in photo sharing of finished pieces to a studio gallery, with likes; "Share to Community" button appears when pieces are ready
- **Colour Picker** — the real Mayco Stroke & Coat® range (82 official colours/codes), browse + build a personal favourites palette
- **Design Preview** — photograph your actual piece, then paint/fill/sticker colour previews directly onto the real photo
- **Transfer Designer** — photograph your piece, then add draggable/resizable/**rotatable** text (4 fonts) and simple motif shapes (star, heart, flower, swirl, dot) to plan real transfer placement before applying decals

---

## 6. Database (Supabase) — Tables in Use

`studios`, `bookings`, `customers`, `pottery_pieces`, `table_sessions`, `table_session_orders`, `kiln_sessions`, `booking_photos`, `loyalty_transactions`, `square_connections`, `sync_api_keys`, `stripe_subscriptions`, `analytics_cache`, `customer_app_activity`, **`community_posts`**, **`community_post_likes`** *(new)*.

Studio profile fields added: `instagram_handle`, `facebook_url`, `tiktok_handle`, `website_url`, `public_bio`, `city`, `country`, `directory_visible`.

---

## 7. ✅ Your To-Do List

- [ ] **Security review** — hasn't had a dedicated audit pass yet. Worth doing properly before onboarding studios beyond Kiln Cafe (data isolation between studios, input handling, rate limiting, general hardening).
- [ ] **Plan for multi-platform support** — currently built around Square + (implicitly) Wix. Other studios may use different POS/stock systems or website builders. Worth deciding how much flexibility to build in before selling widely.
- [ ] **International/translation groundwork** — worldwide sales means non-English, non-GBP support eventually. You mentioned a contact in translation software — worth looping in when this becomes the priority.

- [ ] **Rotate the exposed Square Production Access Token** — you pasted this into chat early on; click "Replace" on it in your Square dashboard. It was never actually used by the app, but it was exposed and should be invalidated.
- [ ] **Rotate the GitHub PAT** used during this build for the same reason.
- [ ] **Rename the GitHub repo** from "GlazeUp" to "Link" if you want full consistency (Settings → repository name on GitHub — I can't do this myself).
- [ ] **Add real Stripe keys** when you're ready to actually charge studios (currently a test placeholder).
- [ ] **Check the Square "Forms" trick** (Appointments → Settings → Communications → Forms) — see if a Form can just be a link-out, which would let booking confirmation texts carry a link to the app for free.
- [ ] **Decide on Square write-access** — needed before "Book a New Session" can create real bookings, not just show mock availability.
- [ ] **Fill in your own Community profile** (Community → Our Profile in the staff app) so the Studios Worldwide directory has real content to show.
- [ ] **Remove the temporary `/api/square/bookings-debug` endpoint** in `server.js` when convenient (flagged, harmless, just tidy-up).

---

## 8. 🔮 Suggested Next Steps — Getting to "Fully Functional & Sellable"

**To make it genuinely multi-studio (currently it's built *for* multi-studio but only Kiln Cafe uses it):**
- Build a proper studio onboarding flow (currently studios are set up manually)
- Finish Stripe billing so studios can actually be charged a subscription
- Connect Square write-access so "Book a New Session" is real, not preview

**To make it "go viral" the way we discussed:**
- Shareable external piece cards (the actual growth-engine layer — a nice branded image customers post to Instagram/TikTok)
- Global cross-studio feed (not just per-studio)
- A public "Studios on LINK" webpage — low-cost marketing, shows off the network to studios who haven't joined yet

**Polish still worth doing:**
- A full connected-wordmark logo pass on remaining smaller icons (category tabs, Bisque silhouettes still use the old style)
- Full app-wide "till-screen" button treatment — Setup/Branding forms weren't touched (they're form-heavy, less suited to the tile treatment)
- Kiln reconciliation modes (photo-matching vs written code vs batch-grouping) — captured as a brainstorm, not built yet
- Split bills / multi-customer loyalty for group bookings — noted as a Phase 3/4 feature, not built yet

**Business-side, not code:**
- First real second-studio onboarding (Elliott/Hattie's Falmouth branch would be the natural first test of the multi-studio model)
- Decide the actual pricing tiers before selling to anyone outside Kiln Cafe

---

*This file is a snapshot. For the full blow-by-blow history of every decision made, see `ROLLING_NOTES.md` in the repo — this document is the readable summary of it. For go-to-market thinking, see `LINK-Marketing-Strategy.md`.*
