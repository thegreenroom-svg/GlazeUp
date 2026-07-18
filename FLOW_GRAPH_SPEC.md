# GlazeUp — Flow-Graph GUI Rebuild (spec, parked 18 July 2026)

The whole app's navigation, reskinned as ONE navigable flow-graph of
small glazed tiles. Not decorative — the graph IS how you move through
the app. A slight rebrand over architecture that already exists.

## Core idea
- Every function is a NODE, drawn as a small glazed tile.
- Arrows (a "rolling arrow diagram") show real routes between nodes:
  what leads to what.
- Tap a tile → go forward to where that function leads.
- Tap back → return the way you came.
- From any node you can jump ahead 1/2/3+ stages or step back.
- Scrollable when the graph is larger than the screen.
- Applied EVERYWHERE — every page uses this scheme, including the
  home-page slide/pickers, rendered as tiles "as far as possible".

## Hard requirement
- Every tile must GO somewhere real. Every forward and every back must
  resolve to a function that already exists. No dead nodes, no dead
  edges. The graph is generated FROM the real routing
  (GRID_NAV_STRUCTURE + the fn/tab handlers), so it can never drift from
  what the app can actually do.

## Must remain present, as tiles/header
- Persistent header bar with the informational tools: Find My Piece,
  info, and day-stats for the three directors.
- Daisy has her own landing page with her own set.
- Every personal-home picker (tile reorder / add tasks) shown as tiles.
- Cleo present as a character: pops up, suggests things, chats. The AI
  "learnings" must be wired and functional, not cosmetic.

## Demo mode
- Currently for DEMO only. No real data, not connected to live systems.
- NOTE (18 July): 105/106 current bookings have real-looking emails —
  confirm these are seed data, not genuine customers, before demoing.
  A demo-mode flag that forces mock data and blocks live Square/Supabase
  writes should be part of this build.

## Build discipline (learned the hard way, 17-18 July)
- Build the node/edge model first; show ONE screen for sign-off before
  migrating the whole app.
- An audit proving handlers "resolve" does NOT prove they do the right
  thing. Verify on-device, per screen.
- Do not start this mid-panic the night before opening.

## ═══ FULL VISION — captured 18 July 2026 (session 3) ═══

The ENTIRE app becomes the tile-flow tree. Every interface, every page,
every decision point = a page of glazed tiles showing where you can go
next, walking through to every endpoint. Smaller tiles where needed to
fit. All glazed. All simple, fool-proof.

### The one exception
The resting / floor-plan page (the screensaver) stays as it is — the
hand-drawn planner. Tapping a green/red table there clicks THROUGH into
the booking flow for that table. Everything else, everywhere: tiles.

### How the tree walks (confirmed mechanic)
Each page shows where you are + the 2-3 next steps as tiles. Tap one →
you move to THAT page, showing ITS next steps. Unfolds page by page like
a family tree, to each endpoint. Not one big map — a living path.
Already built for Daisy's home + the booking journey (booking →
engagement → completion → kiln, from real FLOW_CHECKS). Extend this same
mechanic to the whole app.

### The persistent top bar (KEEP on every page)
- Find My Piece, info, director day-stats, Cleo — always present.
- BUT contextual: the bar reorganises to match the page you're on and
  how the workflow interacts with it. Booking-stage page surfaces that
  stage's actions; stock flow surfaces stock actions; etc.

### Per-page help tile
- Small grey "Ask Cleo about this" tile on every flow page.
- Context-aware: knows the current node, asks Cleo about THAT thing —
  what it does, where to go, how to do it.

### Jenny's float (separate, personalised)
- Jenny has her OWN contextual Cleo float on her page, specific to her
  tasking, that LEARNS from how she works. Distinct from the general
  help tile. Presence + context buildable now; genuine learning wakes
  when OPENAI_API_KEY is set.

### Commercial (already designed, from July 10 chats — see notes above)
- Multi-studio white-label, Stripe tiers £29/£59/£99, AI billed Option A
  (central OpenAI, studios pay wholesale per generation via Stripe line
  item). Backbone EXISTS in server.js. Needs front-end config/admin.

### Money / director panel (build queued)
- Director revenue panel currently shows PLATFORM revenue (£0, no
  tenants). Real STUDIO till-takings from Square was never built — build
  it: /api/studio/takings reading Square Orders/Payments for today.
- "couldn't connect" = Render cold start + needs staffMemberId for the
  director name-check.

### Demo safety (still open)
- 105/106 bookings have real-looking emails. Confirm seed vs real before
  any live demo. Demo-mode flag to force mock data + block live writes.

## ═══ LIVE STUDIO DATA GAP — 18 July 2026 (next session) ═══
Confirmed root cause of "floor plan doesn't show what's happening now":
- Bookings sync from Square (who/when/which ROOM via space_name) — read
  only, every 5 min. This works.
- The LIVE layer does NOT sync: the table the girls set at the terminal,
  and the drinks/orders they ring up. Those live in Square's ORDERS API,
  which the app never reads. So "table 3 ordered coffees" / "these 6 are
  at table 4" can't show — never fetched.
- Also: staff often don't apportion a table at the terminal at all, so
  the table frequently doesn't exist in Square either.
NEXT (read-only, safe): build a read-only Square Orders sync. First step
is to inspect the real shape of today's Square orders (do they carry any
table/customer/booking reference?) before building the link. Must stay
READ ONLY — never write to Square.
Interim fix shipped 18 July: room-aware provisional placement (bookings
show in their booked room) + self-healing floor-plan refresh heartbeat
(was freezing at "20m ago" because the 30s poll could be cleared and not
recreated).
