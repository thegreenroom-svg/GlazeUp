# kilnLINK — Design Recommendations
**16 July 2026 · written for Daisy · the studio app and the customer app**

---

## The one idea

> **The plan is a picture. Every tile is a verb.**

The floor plan is the only screen in the studio app that isn't tiles, and it earns that
because it is not a decision — it's a *picture of the room*. You read it the way you read
the actual studio: glance, see red at Table 4, know they're finishing.

Everything else is a decision, and a decision is a tile. A tile says what will happen if
you press it. Press it and either the thing happens, or you get the next small set of
things that could happen from there. It stops being tiles only where the physical world
interrupts: a camera, a keyboard, a card machine.

That's the whole grammar. Everything below is consequences.

---

## Ten difficult days

Not the happy path. The happy path designs itself. These are the ones that decide the
architecture, and each one is real.

### 1. A walk-in arrives and every table is full
Nothing in the app knows about them yet. There is no booking to open, no table to tap.
**What the app must do:** show the walk-in as a *thing that exists* before it has a
table — a waiting list, not a booking. The floor plan needs a place for people who are
here but not seated.
**What it reveals:** *arrival* and *seating* are two events, not one. The app currently
assumes they're the same.

### 2. A party of four arrives as six
The table no longer fits. Someone must re-seat them, mid-greeting, while six people
stand there.
**What the app must do:** changing `party_size` should *offer* the re-seat, not just save
a number. "6 people — Table 4 seats 4. Move to Table 7 (6) or combine 4+5?"
**What it reveals:** party size and table are a constraint, not two fields. The app knows
`capacity`. It should do the arithmetic so a human doesn't have to at the worst moment.

### 3. A customer needs step-free access and the accessible table is booked
**What the app must do:** know which tables are step-free *before* anyone arrives, and
never seat a step-free requirement anywhere else.
**What it reveals:** access lives on the **furniture**, not the person. `studio_tables`
should carry `step_free`, `wide_approach`, `near_door`. That's a description of a room —
not personal data at all. The booking carries only "step-free needed". **The reason is
recorded nowhere.** (See *The GDPR spine*, below.)

### 4. The kiln didn't fire overnight
Six pieces delayed. Six customers expecting collection today.
**What the app must do:** one action that flags every affected booking at once, and
produces the list of people to contact.
**What it reveals:** this already exists and is *better than most of the app* — the
overnight check is exactly this. It's the model for everything else: one question, two
buttons, a real consequence.

### 5. Square double-books one table
Two bookings, same slot, same space.
**What the app must do:** surface the clash on the floor plan *before* both parties
arrive. Two bookings resolving to one table should be visually impossible to miss.
**What it reveals:** the floor plan currently matches `bookingByTable[t.name]` — **the
second booking silently overwrites the first**. It doesn't clash. It disappears. This is
a live bug, not a design question.

### 6. A piece breaks during glazing
**What the app must do:** record it against the booking, tell the customer, decide the
remedy. All three, in order, without anyone having to remember the order.
**What it reveals:** the app has no concept of *bad news*. Every flow assumes success.
A tile that says "something went wrong here" needs to exist at every stage.

### 7. Three people at one table want to pay separately and collect separately
**What the app must do:** split a booking into collections without splitting the session.
**What it reveals:** a booking is currently one customer, one name, one collection.
Reality is a table of people. This is the deepest structural gap in the app.

### 8. Someone leaves without paying
**What the app must do:** close the table honestly. "Left without paying" must be a
recordable outcome, not a booking that stays open forever because nobody wants to press
"complete".
**What it reveals:** if the only exit from a flow is the happy one, staff will fake the
happy one. Every flow needs an honest bad exit or the data rots.

### 9. A staff member goes home sick with tables assigned
**What the app must do:** reassign their tables, their duties, their alerts — in one move.
**What it reveals:** `next_role` routing (alerts go to a *role*, not a person) is already
right for exactly this reason. It should be the rule everywhere. Nothing should be
assigned to a human being who can go home.

### 10. A piece comes out of the kiln and nobody knows whose it is
**What the app must do:** photograph it, match it, done.
**What it reveals:** this is the app's best idea and it is *one photograph away from
working*. The on-device hash is real and free. It has never once succeeded, because of a
bug fixed yesterday, and there are zero stored hashes because the schema ran today.
**Every piece photographed from now makes it better. That story sells the product.**

---

## What the ten reveal

Read them together and the same three shapes keep appearing.

**1. Every event is two events.** Arrival/seating. Booking/collection. Firing/collecting.
The app models the second and assumes the first. That's why walk-ins, re-seats and split
collections are all hard — they're the missing half.

**2. Every flow needs an honest bad exit.** Kiln didn't fire. Piece broke. They walked
out. If the only button is the good one, people press the good one anyway and your data
becomes fiction. This is the single highest-value thing to add, and it's cheap.

**3. Constraints should be arithmetic, not memory.** The app knows table capacity, room,
party size, access. It should refuse impossible seatings rather than let a human notice.

---

## The tile grammar

Daisy asked for an arrow diagram — a square, an arrow, options branching below. Here it
is, and the rule is that **every screen in the app is this shape**:

```
                    ┌─────────────────────┐
                    │   WHERE YOU ARE     │   ← one square. states the fact.
                    │   Table 4 · Painting│     never a question.
                    │   Sarah + 3 · 11:20 │
                    └──────────┬──────────┘
                               │
                 ┌─────────────┼─────────────┐
                 ▼             ▼             ▼
            ┌─────────┐   ┌─────────┐   ┌─────────┐
            │ ☕ Add  │   │ ✅ Check│   │ 🎉 Fin- │      ← the verbs.
            │ drinks  │   │ progress│   │ ish up  │        only what's legal
            └─────────┘   └─────────┘   └─────────┘        from HERE.
                 │                            │
                 ▼                            ▼
            (order flow)              ┌─────────────┐
                                      │ 📸 Photo    │      ← chains until the
                                      │ the pieces  │        physical world
                                      └─────────────┘        interrupts.
                                             │
                                        [CAMERA]            ← tiles stop here.
```

**The rules that make it work:**

- **The square states, the tiles ask.** Where you are is never a question. What to do next
  is never an assumption.
- **Only legal verbs appear.** `FLOW_CHECKS` already defines what's possible at each stage.
  The tile screen is a *rendering of the stage*, not a menu someone maintains.
- **Three to five tiles. Never nine.** If a stage needs nine, the stage is wrong.
- **One bad exit, always present, never prominent.** Bottom, quieter, always there.
- **Tiles stop at the physical world.** Camera, keyboard, card. Everything up to that point
  is a tap.

---

## Colour

You already have a colour language and it means something:

| | | |
|---|---|---|
| `#4CAF50` | green | Booked in |
| `#B87946` | clay | Painting |
| `#e53935` | red | Finishing up |
| `#F9A825` | amber | In the kiln |
| `#00897B` | teal | Ready for pickup |

**Colour is a noun. Order is a verb.**

Amber always means kiln — on the floor plan, on a tile, in the to-do list. You learn it
once and it's true everywhere. **Never sort by it.** Order by urgency; colour by kind.
Then a screen reads in two directions at once: position tells you what's urgent, colour
tells you what it is.

**When they disagree, they belong on different screens.** The floor plan is a picture of
the room — journey colours, spatial order. The to-do list is a queue — urgency order,
colour as label. One screen doing both is a pretty grid that fights the day.

---

## The GDPR spine

This is the part a professional would put in bold, so: **you are storing special category
health data today, and nobody decided to.**

`bookings.notes` receives Square's `customerNote` verbatim. Every "mum's in a wheelchair",
every "severe nut allergy", is already in your database — free text, no retention limit,
visible to every member of staff on a shared iPad, forever. That's Article 9 data. Same
legal category as the biometrics this project correctly refused.

**The rule, and it's the same rule that made Face ID acceptable:**

> **Store the accommodation. Never the condition.**

Face ID was fine because the app stores the *assertion*, never the face. Same shape:

| ❌ never | ✅ instead |
|---|---|
| "Customer's mother is a wheelchair user" | "Step-free · ground floor" |
| "Coeliac" | "Gluten-free — kitchen notified" |
| "Autistic child, needs quiet" | "Quiet corner requested" |

Staff need to know **what to do**, not **why**. The reason adds nothing operationally and
creates real liability.

**Three layers, only the middle one personal:**
1. **Table** — what it can accommodate. Furniture. Not personal data.
2. **Booking** — what was asked for. Minimal, operational, retention-limited.
3. **Reason** — nowhere. Ever.

**And the "Tell Daisy" picker is already the model.** `ALERT_TRIGGERS` is a fixed
vocabulary; `message` is a *function of the trigger*, not typed. Which means it **cannot**
carry health data. **That is not a limitation — it is the entire safety property.** The
moment an "Other — type here…" tile exists, it becomes `bookings.notes` and inherits every
problem that column has.

**Before any of this is built:** read what's already in `bookings.notes`. After a year of
Square bookings, expect to find some. That's a cleanup, not a design question.

---

## Brand

The pencil line-work is the product. It's the only thing in the app a competitor can't
copy in an afternoon, and it should therefore appear **wherever the app is being looked at
rather than used**: the floor plan, the splash, the room headings, empty states.

It should **not** appear where the app is being *used*. A tile you press forty times a
shift wants to be legible, not charming. Caveat for headings and names; system type for
anything you read under pressure. The app already does this and should keep doing it.

**Host By Post** has a mark (`hostbypost-mark-demo.svg`) — right colour (`#B87946`, your
clay), stamp border, perforations **down one edge only**, and **no typography at all**.
What Daisy describes — perforations both sides, "Host By Post" in nice type — is a
**wordmark, and it doesn't exist**. Decision needed: use the mark consistently, or draw
the wordmark. Don't do both badly.

**And HBP shouldn't feel like a sister business inside the studio app.** It already isn't
one: same server, same login, same tiles, and `showPostBoard()` deliberately mirrors
Floor → Table → Job as Post → Order → Job so staff learn one language twice. The mark is
the only thing making it feel separate.

---

## Recommendations, in order

**1. The honest bad exit.** Every flow, one quiet tile. Cheapest, highest value, and it
stops your data becoming fiction. Do this first.

**2. Fix the silent double-booking.** `bookingByTable[t.name]` overwrites. Two bookings on
one table is currently invisible. This is a bug wearing a design question's clothes.

**3. Access on the furniture.** `studio_tables.step_free` etc. Unblocks scenario 3,
removes an Article 9 exposure, and costs one column.

**4. Arrival ≠ seating.** The missing half of every hard scenario. Structural, so do it
before the tile rebuild, not after.

**5. Then tiles everywhere.** 486 always-on non-tile controls across the two apps
(372 studio, 114 customer). It's mechanical *once 1–4 are decided* and a guess before.

**6. The suggestion card.** The learning engine collects and runs and nothing surfaces it.
Last link in a chain that's otherwise complete.

---

## The staff tour is lying, and animating it would make that worse

The tour has **41 steps**, hand-written as `const STEPS = [...]`. Audited against the app:

```
✗ "🚨 The alert — big, flashing, hard to miss"   the flashing alert was parked 16 July
✗ "Morning opening checklist"                    parked
✗ "☕ Taking a break"                             that button is display:none on phone

'flashing' × 7    'sidebar' × 22    'Cleo' × 27      all stale
```

**Fifty-six stale references — and roughly a third were caused on 16 July alone**, by
changes nobody thought to reflect back into the tour.

**"Update it every time I do an update" is exactly the right instinct, and the answer is
not to update it. It is to stop hand-writing it.** The tour is a second, hand-written
description of the app. That is this week's bug at documentation scale:

- two renderers, one knew about the TRAINING pill → the WI passed for real for days
- two lists of alert kinds → which is why `/api/staff/alert-kinds` is a RENDERING of
  `ALERT_TRIGGERS` and not a second list
- **two descriptions of the app** → the tour teaches a flashing alert that no longer flashes

Anything written twice will drift. It is not discipline, it is arithmetic.

**And the hard part about the animation request:** an animated tour of a screen that does
not exist is *worse* than a plain one. Animation makes a lie more convincing. Polish here
buys staff confidently learning the wrong app.

**Build order:**
1. **Generate what is generatable.** Tile steps from `GRID_NAV_STRUCTURE`, stage steps
   from `FLOW_CHECKS`, alert steps from `ALERT_TRIGGERS`. Change the app, the tour changes.
   That is "link it in" — a single source, not a sync job.
2. **Hand-write only the WHY.** "Photograph the pieces together so the kiln knows whose
   they are" does not drift. "Tap the sidebar" does.
3. **A check that fails when the tour lies** — same shape as the dead-link audit. That is
   how it STAYS true.
4. **Then animate.** On a tour that is true, animation is worth every hour.

---

## The honest ledger

**Real and verified:** floor plan reads live data; whole rooms tap through; Square, Royal
Mail and Stripe all guarded and default-safe; simulations declare themselves; the email
stopped claiming to send; nag parked, bell is the only face; per-person pages seeded by
role; arrows instead of drag (drag never fired on iOS); learning engine collecting and
running Sundays; zero dead links.

**Real but never once exercised:** on-device photo matching. Correct, free, zero stored
hashes. First photograph is its first real test.

**Assumed, not verified:** every timer number (90s ask, 5min home, 15min logout — all my
guesses); the tile priorities; `ROLE_HOME_DEFAULTS` per role. **All of these are
placeholders for what three weeks of trading will tell you.** Don't defend them. Measure
them.

**Known and not fixed:** `server.js:5895` reads `staff_shifts`, a table that has never
existed anywhere in this repo. Permission to see the money is still a first-name string
check across six endpoints — it has misfired twice this week on near-identical names.

---

## The last thing

The five bugs this week — `bookings.status` that never existed, `staff_shifts` I invented,
three Dave/David checks, drag that never worked, an email queued into a void — were **all
the same bug**: something built at speed and never looked at.

The floor plan wasn't broken for a week. It was **unreachable**. Host By Post wasn't
unbuilt. It was **unreachable**. The learning engine wasn't unbuilt. It was **unfed**.
The voice picker wasn't broken. It was **missing its front door**.

**This app's problem has never been that things don't exist. It's that nobody could get
to them.** Which is exactly why tiles are the right answer — and exactly why the ten
scenarios come first.
