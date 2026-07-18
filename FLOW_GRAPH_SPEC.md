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

## ═══ STOCK + LASER + SUPPLIER-PHOTO SEED — 18 July 2026 (queued) ═══
Three threads captured mid-session, to build in this order after the
live terminal link:

1. LIVE TERMINAL LINK (in progress). The girls ring orders/drinks/
   supplementary glazes against a table at the Square terminal — that IS
   the live signal, and it must reference back to the admin team. The
   July 17 live-Square-orders read (commit 1aacc00) is NOT in this
   branch — /api/floor/active currently reads ONLY our own bookings
   table, zero Square reads. That is why nothing live shows. Rebuild the
   read-only searchOrders merge (reuse existing pattern ~line 498:
   listLocations, cursor paging, sort.sortField=CREATED_AT). An order
   against a table -> table goes live (RED). READ ONLY, never writes to
   Square. Order carries line items (drinks/glazes) + note/referenceId
   (app-created orders already set referenceId=bookingCode, note). This
   builds the full picture — orders, drinks, extra glazes — back to admin.

2. STOCK NAME AMBIGUITY. Jenny names stock differently from the
   supplier's catalogue name. Need an alternative-name layer: supplier's
   real name AND Jenny's name recognised as the same item, with a choice
   for both in the trial flow (the "AI learning list" applied to stock).

3. LASER STAMP DESIGNER (framework only). Copy the existing AI transfer-
   design feature into a parallel output aimed at a laser printer for
   cutting stamps/sponges. Same design features, different output.
   Printer details TBD by Daisy later — build up to the output stage.

SEED SHORTCUT (for #1 recognition + #2 names): before photographing all
stock from scratch, check whether SUPPLIERS (disk/pottery supplies cos)
have product photos in their catalogues. Pull those in to seed the AI
recognition library immediately — clean, consistent, already tied to the
real supplier product name (which is exactly the "supplier name" side of
#2). Then it refines as own photos come in via the stock-arrival flow.

## ═══ THE GUI LAW — final form, 18 July 2026 (Daisy, verbatim intent) ═══
1. EVERYTHING on screen is a glazed tile — big or half-size — except:
   - the persistent header bar (contextual, holds all in-house features:
     photo recognition, breakages, alarms, day-stats, Find My Piece, Cleo)
   - the END function of a flow (a real form/button/text input)
2. NO other writing on screen. No prose, no labels outside tiles.
3. Family-tree layout on every page: tile at top, arrow stem below it
   branching to the next tiles. Colour = meaning, foolproof:
   GREEN tile = branch (more options below) · AMBER = usable action now
   · RED = live booking. Non-usable options NOT lit.
4. Always a way back home — "back with options" as tiny glazed tiles,
   same glaze as the big ones.
5. Big + small tile sizes wherever they fit better.
6. HIGH-FIRE GLAZE everywhere: the maximum ceramic rendering (layered
   specular bloom, wet-sheen band, glaze-pool rim, fired gloss lip) —
   shipped 18 July in .glaze-tile.
7. Cleo's floating character ALWAYS present and tappable (restored 18
   July — she'd been parked in a hidden-CSS list). Jenny gets her OWN
   personalised learning float on her page (learning wakes with the
   OPENAI_API_KEY).
8. Floor plan / screensaver exception: the hand-drawn planner stays.
   All three areas on ONE screen with live state; tapping a table
   actions the booking DIRECTLY (the per-room middle hop is cut —
   still to implement).
9. Terminal defines live state: an order rung against a table = RED.
   Fallow otherwise; GREEN if a booking is coming (session times per
   thekilncafe.com).
STILL TO DO against this law: cut the per-room hop (8); full-width
"assign a table" row; back-home tiles on Daily Bookings + site-wide;
convert remaining plain buttons ("open customer app on this device",
"show customer queue", etc) to glazed tiles; logical ordering pass on
every page; in-app flow view to match the approved preview exactly;
stock-name feature; laser framework; supplier-photo framework.

## ═══ THE FINAL GUI LAW — dictated 18 July 2026 (afternoon) ═══
1. TILES ONLY. Nothing on any screen but glazed tiles + the contextual
   header bar. No stray writing unless absolutely necessary. End screens
   (text entry / final button) are the only non-tile surfaces.
2. HIGH-FIRE GLAZE. Tiles at maximum ceramic rendering (done: layered
   specular bloom, wet-sheen band, glaze-pool rim, saturation lift).
3. TILE SIZES. Big and small glazed tiles; use small ones to fit more
   options; "back with options" as tiny glazed tiles.
4. FAMILY-TREE PAGES. Tile at top, arrow stem branching down to the next
   tiles. Colour = meaning: green branch / amber action / red live.
   Legend on page. (Preview built + approved; in-app view generates
   from real GRID_NAV_STRUCTURE.)
5. CLEO ALWAYS PRESENT. Her floating character tappable on every screen
   (restored from hidden 18 July; fab now glazed). Jenny's personalised
   learning float is separate and specific to her tasking.
6. FLOOR PLAN = SCREENSAVER + HUB. All three areas, live states, tap a
   table -> action it DIRECTLY (cut the per-room middle step). Ledger on
   the screensaver: red live / green coming / cream free / dashed
   provisional (added 18 July).
7. DAISY'S FEEDBACK LOOP. Everything important for the studio-manager
   job reaches back to Daisy as a simple daily glazed-tile digest —
   nothing corporate ("no Bob Mardman"), enhance the existing flows.
8. FULL LOGIC RESCAN (queued for the calm session): most succinct route
   to everything; backflow + cross-links between in-app systems; other
   people's workflows and their interactions; minimal instruction per
   tile. This is the deep pass, to do unhurried with on-device checks.

## Jenny's idea, 18 July evening — captured for the calm session
Package the big app as small apps within it: Jenny's page is "her app"
(all her sequences inside — packing, stocking, piece matching), tied to
the other apps, while the whole still functions as one. NOTE: the
personalised flow-tree home already IS this shape — each person's root
branch = their "mini app" built from their real tiles. The calm-session
work is to make each branch feel self-contained (own header context,
own back-home, sequences chained within the branch) WITHOUT changing
the architecture underneath. Priority stated: seeing Jenny's Packing
working comes first; restructure later.
