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
