═══════════════════════════════════════════════════════════════════════════════
GlazeUp: QR Code Structure & Booking Flow
═══════════════════════════════════════════════════════════════════════════════

## Overview

**One QR code per booking** that recognizes returning customers and consolidates loyalty.

The QR code is the single thread that ties:
- Booking (table place card)
- Customer identity (loyalty across visits)
- Pieces (painted → dipped → fired → picked up)
- Payment tracking (incomplete pieces + outstanding balance)

═══════════════════════════════════════════════════════════════════════════════
QR CODE STRUCTURE
═══════════════════════════════════════════════════════════════════════════════

**Format:**
```
https://glazeup.app/scan/{studio-id}/{booking-id}
```

**Example:**
```
https://glazeup.app/scan/kiln-cafe/booking-20260705-table3
```

**What's encoded:**
- `studio-id` — Which studio (e.g. kiln-cafe, london-pottery)
- `booking-id` — Unique per booking/session (e.g. booking-20260705-table3)

That's it. Simple. One QR per booking. The backend handles the rest.

═══════════════════════════════════════════════════════════════════════════════
BOOKING FLOW: VISIT 1 (New Customer)
═══════════════════════════════════════════════════════════════════════════════

1. **Customer arrives**
   - Seated at table
   - Receives printed card: "Table 3: Paint here"
   - Card has QR code printed on it

2. **Customer paints pieces**
   - Chooses from in-studio app
   - Paints 3 pieces (mug, plate, bowl)
   - Takes 45 minutes
   - Decides to leave all 3 (all complete)

3. **Staff submission (end of session)**
   - Staff scans QR code on table card
   - Modal opens: "Table 3"
   - Staff enters customer name: "John Smith"
   - Staff marks pieces:
     - ✓ Mug — Complete
     - ✓ Plate — Complete
     - ✓ Bowl — Complete
   - No outstanding balance (all complete in one session)
   - Clicks "Submit for Dip"

4. **Backend workflow**
   ```
   POST /api/pieces/submit-for-dip
   {
     studioId: "kiln-cafe",
     bookingId: "booking-20260705-table3",
     pieces: [{type: "Mug", isComplete: true}, ...],
     customerName: "John Smith",
     customerEmail: null,
     customerPhone: null
   }
   ```

5. **System automatically**
   - Searches for "John Smith" in database (not found)
   - Creates new customer record: "John Smith"
   - Creates 3 pottery_pieces rows (all linked to John's customer ID)
   - Logs loyalty transaction: "+3 points for painting 3 pieces"
   - John now has: 3 loyalty points, 0 outstanding balance

6. **Customer picks up**
   - Pieces go through: ready_for_dip → dipped → in_kiln → fired → ready_for_pickup
   - Staff calls: "John, your pieces are ready!"
   - Pays if booked as paid session, or nothing due
   - Picks up pieces

**Outcome:** John has account with 3 loyalty points, 3 pieces painted, £0 owed.

═══════════════════════════════════════════════════════════════════════════════
BOOKING FLOW: VISIT 2 (3 Months Later, Same Customer Returns)
═══════════════════════════════════════════════════════════════════════════════

1. **Customer returns**
   - "Hi John! Welcome back!"
   - Seated at new table (Table 5)
   - Gets new QR card for today's booking

2. **Customer paints**
   - Paints 2 pieces (both new)
   - Decides to keep both (both complete)

3. **Staff submission**
   - Staff scans QR (new QR for today's booking)
   - Modal opens: "Table 5: [date]"
   - Staff enters name: "John Smith"
   - Staff marks pieces:
     - ✓ Mug — Complete
     - ✓ Plate — Complete
   - Clicks "Submit for Dip"

4. **Backend workflow**
   ```
   POST /api/pieces/submit-for-dip
   {
     studioId: "kiln-cafe",
     bookingId: "booking-20260905-table5",  ← NEW booking ID
     pieces: [{type: "Mug", isComplete: true}, ...],
     customerName: "John Smith",              ← SAME name
     customerEmail: null,
     customerPhone: null
   }
   ```

5. **System automatically**
   - Searches for "John Smith" in database
   - **FOUND!** (returns customer ID from Visit 1)
   - Creates 2 new pottery_pieces rows (linked to same customer)
   - Logs loyalty transaction: "+2 points" (new total: 5 points)
   - Updates customer record:
     - loyalty_points: 5 (was 3)
     - total_pieces_painted: 5 (was 3)

6. **Pickup**
   - Same process
   - Pieces added to his total

**Outcome:** John now has:
- 5 loyalty points total
- 5 pieces painted total
- 0 pieces outstanding
- One account across both visits

═══════════════════════════════════════════════════════════════════════════════
BOOKING FLOW: VISIT 3 (Customer Doesn't Finish)
═══════════════════════════════════════════════════════════════════════════════

1. **Customer arrives 6 months later**
   - "John, great to see you again!"
   - Seated at Table 2
   - Gets new QR card

2. **Customer paints (partial)**
   - Starts 4 pieces
   - Finishes 2 (mug, plate)
   - **Doesn't finish** 2 (bowl, tile)
   - Says: "I'll come back and finish next month"

3. **Staff submission**
   - Staff scans QR
   - Modal opens
   - Staff enters: "John Smith"
   - Staff marks pieces:
     - ✓ Mug — Complete
     - ✓ Plate — Complete
     - ✗ Bowl — Incomplete
     - ✗ Tile — Incomplete
   - **NO return fee entered yet** (fee only charged if/when he returns)

4. **Backend workflow**
   ```
   pieces: [
     {type: "Mug", isComplete: true, outstandingBalance: 0},
     {type: "Plate", isComplete: true, outstandingBalance: 0},
     {type: "Bowl", isComplete: false, outstandingBalance: 0},  ← NO FEE YET
     {type: "Tile", isComplete: false, outstandingBalance: 0}   ← NO FEE YET
   ]
   ```

5. **System**
   - Finds John Smith (existing customer, 5 points)
   - Creates 4 new pottery_pieces rows
   - Logs transaction: "+2 points for completing 2 pieces" (new total: 7)
   - Marks bowl + tile as is_complete=false, outstanding_balance=0 (fee not charged yet)

6. **Staff dashboard shows**
   ```
   John Smith — Visit 3 (today)
   ✓ Mug — Ready for dip
   ✓ Plate — Ready for dip
   ⚠️ Bowl — Incomplete (needs finishing)
   ⚠️ Tile — Incomplete (needs finishing)
   ```

   Also available on dashboard:
   ```
   John Smith (returning customer)
   ⭐ Total loyalty points: 7
   💳 Outstanding balance: £0 (so far)
   📝 Pieces to finish: 2 (see history)
   ```

   **Important:** Outstanding balance is £0 because John hasn't returned yet. If he never comes back, no fee is charged.

═══════════════════════════════════════════════════════════════════════════════
VISIT 4: COMPLETING UNFINISHED WORK (Return Fee Added)
═══════════════════════════════════════════════════════════════════════════════

1. **John returns next month**
   - Says: "I'm here to finish that bowl and tile"

2. **Staff recognizes him**
   - Enters name: "John Smith"
   - System shows: "John has 2 incomplete pieces from last time"
   - Staff can see them: `/api/customer/{john-id}/unfinished-pieces`
   - No fee charged yet (fee only added when returning to complete)

3. **John finishes his old bowl + tile**
   - Also paints 2 new pieces today

4. **Staff submission — Two steps**

   **Step A: Mark new pieces completed today**
   - Staff scans new booking QR
   - Marks 2 new pieces as complete
   - Same as usual: POST /api/pieces/submit-for-dip

   **Step B: Complete the old unfinished pieces + charge return fee**
   - Staff uses: POST /api/pieces/complete-unfinished
   ```
   {
     studioId: "kiln-cafe",
     customerId: "john-id",
     pieceIds: ["bowl-id-from-visit3", "tile-id-from-visit3"],
     returnFeePerPiece: 5  ← £5 per piece to return and finish
   }
   ```

5. **System**
   - Updates old bowl + tile: is_complete=true, outstanding_balance=5 each
   - Logs: "+2 points for completing unfinished pieces" (new total: 9)
   - **Return fees added now** (£10 total for 2 pieces)

6. **Staff dashboard shows**
   ```
   John Smith — Visit 4 (today)
   ✓ New Mug — Ready for dip
   ✓ New Plate — Ready for dip
   ✓ Old Bowl — Ready for dip (returned to finish)
   ✓ Old Tile — Ready for dip (returned to finish)

   Outstanding balance: £10 (for 2 return fee pieces)
   ```

7. **Payment**
   - John owes £10 (return completion fee for bowl + tile)
   - Pays at pickup or when claiming pieces
   - No loyalty points deducted (he earns +2 for completing them)

═══════════════════════════════════════════════════════════════════════════════
LOYALTY FOUNDATION
═══════════════════════════════════════════════════════════════════════════════

**Current (Phase 2):**
- 1 point per piece painted
- Tracks total points per customer
- Tracks total pieces per customer
- Tracks outstanding balance per incomplete piece

**Future (Phase 4+):**
- Points → rewards: "10 points = 50p off next visit"
- Tier system: Bronze (0-10pts) → Silver (10-20) → Gold (20+)
- Monthly bonus: "Paint 5+ pieces this month, get 2 bonus points"
- Birthday discount: "Free glaze dip this month"
- Email: "John, you're 3 points from a free piece!"
- Referral: "Bring a friend, both get 5 points"

All built into the database already. Just need UI + logic.

═══════════════════════════════════════════════════════════════════════════════
API ENDPOINTS (for Phase 2)
═══════════════════════════════════════════════════════════════════════════════

**Generate QR for booking:**
```
GET /api/qr/booking?studioId=kiln-cafe&bookingId=booking-20260705-table3
→ {
    qrUrl: "https://glazeup.app/scan/kiln-cafe/booking-20260705-table3",
    bookingId: "booking-20260705-table3",
    instruction: "Print this QR code on table place cards..."
  }
```

**Submit pieces (with customer matching):**
```
POST /api/pieces/submit-for-dip
{
  studioId: "kiln-cafe",
  bookingId: "booking-20260705-table3",
  pieces: [{type, isComplete, outstandingBalance}],
  customerName: "John Smith",
  customerEmail: "john@example.com",     ← optional but recommended
  customerPhone: "07700000000"           ← optional but recommended
}

→ {
    status: "saved",
    piecesCount: 3,
    customerId: "uuid-here",
    pointsEarned: 3
  }
```

**Get unfinished pieces for returning customer:**
```
GET /api/customer/{customerId}/unfinished-pieces?studioId=kiln-cafe
→ {
    unfinishedPieces: [
      {id, piece_type, outstanding_balance, created_at},
      ...
    ],
    totalOwed: 10,
    count: 2
  }
```

═══════════════════════════════════════════════════════════════════════════════
IMPLEMENTATION CHECKLIST
═══════════════════════════════════════════════════════════════════════════════

Phase 2:
- ✓ Database schema (customers, pottery_pieces, loyalty_transactions)
- ✓ QR generation endpoint
- ✓ Customer matching (email → phone → name → create)
- ✓ Pieces submission with customer linking
- ✓ Unfinished pieces lookup
- [ ] Display real pieces on Staff dashboard
- [ ] Show unfinished pieces from previous visits
- [ ] Mark incomplete pieces complete on new visit
- [ ] Print QR codes for daily bookings

Phase 3 & beyond:
- [ ] Loyalty points → rewards UI
- [ ] Tier system
- [ ] Customer app showing "Your pieces" + loyalty balance
- [ ] Email notifications ("Your pieces are ready!")
- [ ] Payment integration for incomplete pieces

═══════════════════════════════════════════════════════════════════════════════
