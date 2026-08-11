# GlazeUp Studio App — Specification

**Branch:** `new-app-full` · **Repo:** thegreenroom-svg/GlazeUp
**Last updated:** 9 August 2026
**Status:** Read-only demo app over real production data

---

## 1. What this app is (and isn't)

This is a **second lens on real Kiln Cafe data** — a clean, modern studio app built on Next.js, reading the same live Supabase database and Square connection that the real business runs on.

It is **not** the real GlazeUp. Real GlazeUp lives on the `main` branch: a large single-page admin app with the packing engine, Potter's Desk, kiln stages, customer app, and `/admin/*` pages. Those do not exist here and there is no admin section in this app.

**Read-only by design.** Nothing in this app writes to real production tables. The only writes are to three clearly-labelled isolated tables prefixed `demo_app_*`.

---

## 2. Architecture

### Services (Render)

| Service | Role | Root | Deploy trigger |
|---|---|---|---|
| `glazeup-api` | **Frontend** (Next.js) | `apps/studio` | Manual Deploy |
| `glazeup-backend` | **Backend** (Express) | `backend` | Manual Deploy |

> **Recurring gotcha:** a change touching both sides needs **both** services deployed. Deploying only one is the most common cause of "it's not there."

### Data

- **Supabase project:** `mdpchpjnlzlmldtlqrns`
- **Studio ID:** `fab8b2d2-27b5-47ec-8c56-268bbf821dc3` (The Kiln Cafe, Langport)
- **Square:** live connection, real token, real catalogue (1190 items)

### Environment variables (`glazeup-backend`)

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `SQUARE_CLIENT_ID`, `SQUARE_CLIENT_SECRET`, `SQUARE_ENVIRONMENT`

---

## 3. Pages

Fifteen pages, no login, bottom-sheet nav on mobile / sidebar on desktop.

| Page | What it shows |
|---|---|
| **Dashboard** | Tile-law home screen, live counts, predictive reordering by time of day |
| **Bookings** | All real bookings, sticky search + date picker + Today jump, detail modal |
| **Pieces** | Real photo gallery with descriptions and kiln codes |
| **Kiln Workflow** | Real kiln sessions, morning checks, misfire notes |
| **Inventory** | Derived stats from pieces |
| **Customers** | Derived from real bookings (not the seeded demo table) |
| **Reports** | Real revenue by category |
| **Money** | Daily takings |
| **Alerts** | Real staff alerts, priority-coloured |
| **Team** | Real staff list (no contact details — endpoint is unauthenticated) |
| **Till** | Real table sessions + orders, plus **live** Square API pass-through |
| **Photo Match** | Read a chalk tag → match to a booking → attach the photo |
| **Shelf Sweep** | Photograph a whole table of fired pieces → match to bookings → pack + label |

### Design rules

- **No-scroll:** a page should fit the screen; nav compressed so all 15 items fit without scrolling.
- Brand pink `#E85D8A`, real Kiln Cafe logo, dark-mode toggle, spring transitions, skeleton loaders, pull-to-refresh, swipe-back, jump-to command bar.

---

## 4. The two vision features

Both use OpenAI `gpt-4o-mini` vision. Cost is small but real (~0.3p per photo).

### 4.1 Photo Match — *tag-led*

**Flow:** photograph the table with the chalk tag → AI reads the name and describes the pieces → fuzzy-matches the name against **all** real bookings → you confirm → photo is attached to that booking.

This is the reliable one. It works because it reads *text*, which survives everything.

### 4.2 Shelf Sweep — *appearance-led*

**Flow:** empty the kiln, lay everything on a big table, take one photo → AI lists every piece it can see → matches those against bookings from the last **31 days** → shows each with a confidence band → **Mark packed** / **Print label**.

**Two-step prompt, and the order matters.** Call 1 inventories the table with *no knowledge* of what's being searched for. Call 2 matches that inventory against the wanted list. Asking both at once was previously measured to contaminate the observation — the model reported seeing pieces that weren't in the photograph.

**It does not circle pieces in the photo.** This was attempted four separate ways in real GlazeUp and abandoned every time: rings landed on wrong objects, or didn't render at all. The conclusion that stuck was *show the photo, don't point at it*.

**Confidence is shown plainly** (high / medium / low). A weak match dressed up with a green ring and a strong call-to-action is a false positive regardless of the label next to it — that was a real logged bug elsewhere in the project.

---

## 5. Hard-won findings worth not re-learning

These cost real time to establish. They are constraints, not preferences.

**Firing changes colour, not pattern.** Chalky pastel underglaze fires glossy and saturated. Any matching that leans on colour values breaks across the kiln. Pattern and placement survive; raw colour does not.

**Form is the least useful clue.** These are bought-in blanks — ten different painted mugs are all the *same mug*. What identifies a piece is what the customer painted on it. Descriptions must lead with colour, pattern, and where the colour sits; shape last.

**Pixel matching was abandoned for good reason.** pHash, colour histograms, staged cascades, BRISK keypoints with RANSAC — all tried across two days. Three failures were structural, not tuning problems: viewpoint change, pieces with no contrast or pattern to grip, and the firing shift. Text descriptions beat pixels here.

**A 10MB WASM engine is a poor dependency for a studio phone.** The OpenCV keypoint engine failed twice for two different reasons on one bar of signal and never actually ran on the device.

**Verify reference data before debugging a matcher.** An entire evening was spent tuning detectors against seeded demo rows whose reference photos were of completely different objects. `has_photo = true` says nothing about whether it's a photo of the *right* object.

---

## 6. Known limitations

**Shelf Sweep accuracy is currently modest, by construction.** There are no pre-fire reference photos in this app's data, so the matching step is reasoning from *typical* painting choices rather than recognising specific pieces. This improves only when pieces are photographed at painting time. Tuning will not fix it; data will.

**Historical pieces cannot be linked to bookings.** `pottery_pieces` has `customer_id` null throughout and a free-text `booking_id` that predates the 25 July archive. This is a permanent historical gap, not a bug.

**No automatic photo pipeline.** The Drive "Studio Photos" folder was hand-uploaded in one batch on 23 July. Options for automating iPad → Drive: an IFTTT applet ("new photo in iOS album → upload to Drive") or a native Shortcuts Personal Automation. A dedicated *Piece Photos* album is recommended so it doesn't sweep the whole camera roll.

---

## 7. Data state

- **281 real bookings**, including 47 reconstructed from the Drive photo audit (flagged in `notes` as historical, some date-approximate) and 25 added earlier from screenshot OCR (some carry "verify time").
- **Drive audit complete and conclusive:** 44+ of ~50 photos processed at full resolution. Every one is 16–19 July with 23/7 pickup. ~60 customer names read. Three are genuine repeat customers with separate live bookings: Lorinda Horridge, Tabby Curtis, Helen Eichler.
- **Isolated tables:** `demo_app_photo_matches`, `demo_app_till_items`, `demo_app_session_status`.

---

## 8. Security — needs action

**Five of seven GitHub tokens used in this project are now revoked**, almost certainly picked up by GitHub's automated secret scanning after being used in plain text. Two still work and are equally exposed.

**Recommendation:** revoke all existing tokens and issue one fresh one. Otherwise a future session will hit an authentication wall at an inconvenient moment.

---

## 9. Next steps

1. **Deploy and test Shelf Sweep on a real table** — built but never run on a device.
2. **Start photographing pieces at painting time.** This is the single highest-value change: it's what turns Shelf Sweep from plausible-guessing into real recognition.
3. **Set up the iPad → Drive automation** so photos arrive without manual export.
4. **Rotate the GitHub tokens.**
5. Optional: wire the existing till-workflow endpoints (add item, running total, finish session) into the Booking Detail modal — the backend is built and tested, the UI is not.
