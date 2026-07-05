═══════════════════════════════════════════════════════════════════════════════
GlazeUp: Booking System (Square Integration)
═══════════════════════════════════════════════════════════════════════════════

## Overview

Bookings come from Square and drive the entire staff workflow. 

The QR code is the **single source of truth**. Staff scans it, system knows who they are and what they're doing. No name entry needed.

═══════════════════════════════════════════════════════════════════════════════
WORKFLOW
═══════════════════════════════════════════════════════════════════════════════

**Morning: Studio opens**

1. Admin/staff runs: `POST /api/bookings/sync?studioId=kiln-cafe`
2. System pulls today's bookings from Square
3. System generates QR codes for each booking
4. Admin prints QR codes on table place cards
5. Cards set on tables

Example output:
```
Booking: john-smith-table-3
QR Code: https://glazeup.app/scan/kiln-cafe/booking-20260705-0a1b2c3d

Booking: birthday-party-table-5
QR Code: https://glazeup.app/scan/kiln-cafe/booking-20260705-7x8y9z0w
```

**During session: Customer paints**

- Customer uses app, paints pieces
- Staff watches, helps
- End of session approaches

**End of session: Staff submits pieces**

1. Staff scans QR code on table card
2. System looks up: `GET /api/booking/booking-20260705-0a1b2c3d?studioId=kiln-cafe`
3. System returns:
```json
{
  "booking": {
    "customerName": "John Smith",
    "customerEmail": "john@example.com",
    "customerPhone": "07700000000",
    "tableNumber": "3",
    "partySize": 2,
    "notes": "prefers clear glaze"
  },
  "customerHistory": {
    "isReturningCustomer": true,
    "loyaltyPoints": 5,
    "totalPiecesPainted": 5,
    "unfinishedPieces": [
      {
        "id": "uuid",
        "piece_type": "bowl",
        "is_complete": false,
        "created_at": "2026-07-04"
      }
    ],
    "unfinishedCount": 1
  }
}
```

4. Modal opens **pre-populated**:
```
👋 Welcome back John Smith!
You have 5 loyalty points
You painted 5 pieces total

⚠️ You have 1 unfinished piece from last visit:
  - Bowl (painted Jul 4)

Today's pieces:
☑️ Mug — Complete
☑️ Plate — Complete
```

5. Staff confirms pieces, clicks "Submit for Dip"
6. System saves everything

═══════════════════════════════════════════════════════════════════════════════
DATABASE TABLES
═══════════════════════════════════════════════════════════════════════════════

**bookings** table
```
id (UUID)
studio_id (UUID) → studios
square_booking_id (TEXT, unique) — "B123ABC456" from Square
booking_code (TEXT) — "booking-20260705-0a1b2c3d" (for QR)
customer_name (TEXT) — "John Smith"
customer_email (TEXT)
customer_phone (TEXT)
table_number (TEXT) — "3" or "window-seat"
session_start (TIMESTAMPTZ)
session_end (TIMESTAMPTZ)
party_size (INT)
notes (TEXT)
synced_from_square (TIMESTAMPTZ)
created_at, updated_at
```

**customers** table (unchanged)
```
Links bookings → loyalty points via customer_name (for now)
In future: could link bookings → Square customer ID directly
```

═══════════════════════════════════════════════════════════════════════════════
API ENDPOINTS
═══════════════════════════════════════════════════════════════════════════════

### Sync bookings from Square
```
POST /api/bookings/sync
Body: { studioId: "kiln-cafe" }

Response: {
  status: "synced",
  bookingsSynced: 5,
  bookings: [
    {
      bookingCode: "booking-20260705-0a1b2c3d",
      customerName: "John Smith",
      tableNumber: "3"
    },
    ...
  ]
}
```

**When to call:**
- Morning when staff arrives (daily)
- Or: automatic scheduled job (every hour)
- Or: when staff clicks "Refresh bookings"

**What it does:**
- Pulls all bookings from Square API
- Filters for today (by date)
- Generates unique booking_code for QR
- Stores in database (upsert, so won't duplicate)

---

### Lookup booking when QR scanned
```
GET /api/booking/booking-20260705-0a1b2c3d?studioId=kiln-cafe

Response: {
  booking: {
    bookingCode: "booking-20260705-0a1b2c3d",
    squareBookingId: "B123ABC456",
    customerName: "John Smith",
    customerEmail: "john@example.com",
    customerPhone: "07700000000",
    tableNumber: "3",
    partySize: 2,
    sessionStart: "2026-07-05T14:00:00Z",
    sessionEnd: "2026-07-05T15:30:00Z",
    notes: "prefers clear glaze"
  },
  customerHistory: {
    customerId: "uuid-john",
    loyaltyPoints: 5,
    totalPiecesPainted: 5,
    isReturningCustomer: true,
    unfinishedPieces: [
      { id: "uuid", piece_type: "bowl", is_complete: false, ... }
    ],
    unfinishedCount: 1
  }
}
```

**Called when:**
- Staff scans QR code on table card
- Modal opens and uses this data to pre-populate

---

### Pieces submission (unchanged but enhanced)
```
POST /api/pieces/submit-for-dip
Body: {
  studioId: "kiln-cafe",
  bookingId: "booking-20260705-0a1b2c3d",  ← from QR scan
  pieces: [
    { type: "Mug", isComplete: true, ... },
    ...
  ],
  customerName: "John Smith",  ← pre-populated from booking lookup
  customerEmail: "john@example.com",
  customerPhone: "07700000000"
}

Response: {
  status: "saved",
  piecesCount: 2,
  customerId: "uuid-john",
  pointsEarned: 2
}
```

═══════════════════════════════════════════════════════════════════════════════
WORKFLOW SEQUENCE
═══════════════════════════════════════════════════════════════════════════════

**Daily morning:**
```
1. POST /api/bookings/sync  → pulls Square bookings for today
2. Print QR codes on table cards
3. Set cards on tables
```

**During sessions:**
```
Customer paints...
```

**End of session:**
```
1. Staff scans QR code
2. System: GET /api/booking/{bookingCode}  → returns customer + history
3. Modal pre-populated with:
   - Customer name, email, phone
   - Loyalty points
   - Unfinished pieces (if returning)
4. Staff marks pieces complete/incomplete
5. Staff clicks Submit
6. System: POST /api/pieces/submit-for-dip  → saves with customer ID
7. Loyalty points updated
```

**Customer returns next month:**
```
1. New booking created in Square for "John Smith"
2. Staff syncs bookings: POST /api/bookings/sync
3. New QR code generated
4. Staff scans new QR
5. System recognizes "John Smith" (existing customer)
6. Modal shows: "You have 1 unfinished piece from last time"
7. John finishes it, staff marks complete + adds return fee
8. Points updated, balance tracked
```

═══════════════════════════════════════════════════════════════════════════════
IMPLEMENTATION NOTES
═══════════════════════════════════════════════════════════════════════════════

**Current (Phase 2):**
- Bookings table stores Square data
- booking_code generated: `booking-{YYYYMMDD}-{first8charOfSquareID}`
- Customer matched by name (could improve later)
- QR lookup returns all needed data

**Future improvements:**
- Link bookings → Square customer ID directly (don't rely on name)
- Auto-sync bookings every hour (scheduled job)
- Display QR codes in web interface (don't print manually)
- Mobile barcode scanner integration
- Booking notes (e.g. "allergies", "special request") shown to staff

**Why this design:**
- Square is source of truth (already has bookings, customer data)
- QR code is single entry point (staff scans once, everything else is automation)
- No manual customer entry (data pulled from booking)
- Returning customers recognized automatically (by name + loyalty lookup)
- Unfinished work visible immediately (staff knows what customer left undone)

═══════════════════════════════════════════════════════════════════════════════
TESTING
═══════════════════════════════════════════════════════════════════════════════

**Without Square connected:**
- Can't sync real bookings
- Use mock data for testing

**With Square sandbox:**
1. Create test bookings in Square sandbox
2. Call: POST /api/bookings/sync?studioId=kiln-cafe
3. Check database for bookings
4. Call: GET /api/booking/{bookingCode}?studioId=kiln-cafe
5. Should return booking data

**End-to-end:**
1. Sync bookings
2. Print QR codes (or just copy booking_code)
3. Scan QR in modal
4. See customer pre-populated
5. Mark pieces
6. Submit
7. Check database for pieces + loyalty points

═══════════════════════════════════════════════════════════════════════════════
