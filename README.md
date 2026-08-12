# GlazeUp 🎨

Complete SaaS platform for pottery studios. Track bookings, manage pieces, recognize fired pottery on shelves, and streamline studio operations.

## Features

✓ Staff authentication (PIN-based)  
✓ Booking management (walk-ins, reservations, cancellations)  
✓ Piece tracking (photo + AI description)  
✓ Shelf recognition (8×8 grid, piece matching)  
✓ Revenue analytics & reporting  
✓ Cleo's Club loyalty program  
✓ QR code printing (booking + piece cards)  

## Tech Stack

**Frontend**
- React 18 + Vite
- Tailwind CSS
- Lucide icons
- Anthropic API (vision)

**Backend**
- Express.js (ESM)
- Supabase PostgreSQL
- Node.js 18+

**Deployment**
- Render (API + Frontend)
- Supabase (Database)
- Docker (local development)

## Quick Start

### Prerequisites
- Node.js 18+
- Supabase account
- Anthropic API key
- Docker (optional)

### 1. Clone & Install

```bash
git clone https://github.com/thegreenroom-svg/GlazeUp.git
cd GlazeUp
```

### 2. Environment Setup

**Backend**
```bash
cd backend
cp .env.example .env
# Edit .env with your keys
```

```env
SUPABASE_URL=https://mdpchpjnlzlmldtlqrns.supabase.co
SUPABASE_KEY=your-anon-key
ANTHROPIC_API_KEY=sk-ant-...
STUDIO_ID=fab8b2d2-27b5-47ec-8c56-268bbf821dc3
PORT=3001
```

**Frontend**
```bash
cd ../frontend
cp .env.example .env
```

### 3. Database Setup

Run migrations in Supabase SQL editor:
```bash
# Copy contents of backend/migrations.sql
# Paste into Supabase SQL editor and execute
```

Or use Supabase CLI:
```bash
supabase db push
```

### 4. Install Dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 5. Start Development

**Option A: Local (separate terminals)**

Terminal 1:
```bash
cd backend
npm run dev
# API runs on http://localhost:3001
```

Terminal 2:
```bash
cd frontend
npm run dev
# App runs on http://localhost:5173
```

**Option B: Docker**
```bash
docker-compose up
# API: http://localhost:3001
# App: http://localhost:5173
```

## API Endpoints

### Bookings
```
GET    /api/bookings              # List all bookings
POST   /api/bookings              # Create booking
```

### Pieces
```
GET    /api/pieces                # List pieces
POST   /api/pieces                # Create piece
```

### Shelf Recognition
```
POST   /api/shelf/scan            # Upload & scan shelf photo
```

### Staff
```
POST   /api/staff/login           # Staff PIN login
```

### Analytics
```
GET    /api/analytics/revenue     # Revenue summary
```

## Database Schema

**bookings** - Customers, times, spaces, sizes  
**pieces** - Shape, colour, pattern, photo, QR  
**shelf_scans** - Photo + inventory JSON  
**staff** - Name, email, PIN hash, role  
**takings** - Revenue by category  
**analytics_cache** - Daily snapshots  
**cleos_club_config** - Loyalty pricing  

## Usage

### For Staff

1. **Login**: Enter PIN (0000 for demo)
2. **Start Floor**: Loads today's bookings
3. **Select Booking**: Pick customer from list
4. **Add Pieces**: Record number painted
5. **Hand-off**: Print booking + piece cards
6. **Next**: Loop to next customer

### Shelf Scan

1. Tap "Shelf Scan" from home
2. Photograph shelf with pottery pieces
3. AI identifies each piece
4. Matches to existing bookings
5. 8×8 grid shows piece locations
6. Export/print matched results

## Staff Credentials

**Demo PIN**: `0000`  
**Studio**: The Kiln Cafe, Langport, Somerset  
**Studio ID**: `fab8b2d2-27b5-47ec-8c56-268bbf821dc3`

## Deployment

### Deploy to Render

1. Push to GitHub
2. Connect repo to Render
3. Use `render.yaml` for config
4. Set environment variables in Render dashboard
5. Deploy!

```bash
# Manual deploy
git push origin main
# Render auto-deploys from main branch
```

### Environment Variables (Render)

- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_KEY` - Supabase anon key
- `ANTHROPIC_API_KEY` - Anthropic API key
- `VITE_API_URL` - Backend URL (e.g., https://glazeup-api.onrender.com)

## File Structure

```
GlazeUp/
├── backend/
│   ├── server.js           # Express API
│   ├── migrations.sql      # Database schema
│   ├── package.json
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   ├── index.html
│   ├── main.jsx            # React entry
│   ├── App.jsx             # Main app component
│   ├── vite.config.js
│   └── package.json
├── docker-compose.yml
├── render.yaml
└── README.md
```

## Brand Palette

```
Charcoal  #2B2724  (primary dark)
Clay      #B87946  (primary warm)
Sand      #E8D9C4  (secondary light)
Ivory     #F7F4EE  (background)
Stone     #C8BFB2  (tertiary)
```

## Real Data Integration

**Bookings**: From Supabase `bookings` table  
**Takings**: From Square via `takings` table  
**Photos**: Stored in Supabase Storage  
**Staff**: From `staff` table (PIN-authenticated)  

## Testing

```bash
# Test API health
curl http://localhost:3001/api/health

# Test bookings endpoint
curl http://localhost:3001/api/bookings

# Test staff login
curl -X POST http://localhost:3001/api/staff/login \
  -H "Content-Type: application/json" \
  -d '{"pin":"0000"}'
```

## Performance

- 8×8 shelf grid renders instantly
- Photo upload < 2s (with AI description)
- Booking list loads in < 500ms
- Piece matching uses client-side ring-drawing (fast)

## Security

- Staff PINs hashed (SHA-256, upgrade to bcrypt)
- Supabase RLS for row-level access
- CORS restricted to studio domain
- API routes auth-gated
- Environment variables for all secrets

## Known Limitations

- Current PIN auth is basic (for MVP)
- Photo storage requires Supabase bucket setup
- Shelf recognition works best with good lighting
- QR code printing requires thermal printer integration

## Future Enhancements

- Barcode scanning (customer loyalty cards)
- Multi-studio support
- Advanced analytics dashboard
- Mobile app (React Native)
- Piece archive & gallery
- Customer-facing booking portal

## Support

For issues, open a GitHub issue or contact Daisy at The Kiln Cafe.

## License

MIT - Daisy Green 2026
