# GlazeUp

**Complete digital toolkit for pottery painting studios: colour matching, transfer preview, printing, billing, and analytics.**

A **white-label PWA + backend** that pottery studios subscribe to. Each studio gets:
- Customer-facing creative tools (colour matcher, transfer preview, design printing)
- Staff dashboard (inventory, booking, firing tracker)
- Admin dashboard (branding, pricing, analytics)
- Automatic Square data sync + Stripe billing

All with studio-specific branding, glaze palette, bisque catalogue, and transfer designs.

## What it does

| Tab | Feature |
|-----|---------|
| **Colours** | Snap a photo of anything → get matched to the studio's underglaze palette |
| **Transfers** | Photo your piece or pick a bisque shape → overlay a decal design → drag, pinch-to-zoom, rotate to position |
| **Print** | Set the real-world size in mm → tile copies → print to transfer paper or save PNG |

## Quick start

### Customer app only (no backend)

```bash
cd glazeup
npx serve .
# or: python3 -m http.server 8000
```

Open on your iPad/phone at `http://localhost:3000` (or `:8000`)

### Full Phase 1 (frontend + Square sync + Stripe billing)

```bash
cd glazeup

# 1. Backend
npm install
cp .env.example .env
# Edit .env with your Square, Stripe, and Supabase credentials
npm start

# 2. Frontend (in another terminal)
npx serve .
```

See **[BACKEND_SETUP.md](BACKEND_SETUP.md)** for detailed instructions on getting Square/Stripe credentials.

## Deployment (Full Stack)

This is a **two-part deployment**: frontend (PWA) + backend (API).

### Frontend (PWA) → Vercel or Netlify

**Vercel (recommended)**:
```bash
npm i -g vercel
vercel
```

**Netlify**:
1. Push code to GitHub
2. Connect repo in Netlify
3. Set build command: (none — it's static)
4. Set publish directory: `/`

### Backend (API) → Vercel, Railway, or Heroku

**Vercel**:
```bash
cd backend
vercel
# Or use git push if connected to GitHub
```

**Railway**:
1. Connect GitHub repo
2. Add env vars in project settings
3. Auto-deploys on push

**Heroku**:
```bash
cd backend
heroku create glazeup-api
heroku config:set SUPABASE_URL=... STRIPE_SECRET_KEY=... # etc
git push heroku main
```

### Environment Setup

1. **Supabase**: Create free project at [supabase.com](https://supabase.com)
   - Run `sql/schema.sql` in SQL Editor
   - Copy project URL + service key

2. **Stripe**: Set up at [stripe.com](https://stripe.com)
   - Create product "GlazeUp"
   - Create prices for tiers (Starter £29, Pro £59)
   - Add webhook endpoint to `/api/stripe/webhook`
   - Copy API key + webhook secret

3. **Square**: Set up at [squareup.com](https://squareup.com/developers)
   - Create OAuth application
   - Copy Application ID + Secret
   - Set redirect URI to `https://your-api.com/api/square/oauth/callback`

4. **Environment variables**:
   - Frontend: Add `VITE_API_URL=https://your-api.com` to `.env`
   - Backend: Copy `.env.example` to `.env` and fill all variables
   - See `backend/README.md` for full list

### Deployment Flow

```
GitHub repo
    ├→ Push → Vercel → Frontend (PWA)
    └→ Push → Railway/Heroku → Backend (API)

Studio visits → https://the-kiln-cafe.glazeup.app (white-label)
    ↓
Loads branding from → https://api.glazeup.app/api/auth/studio/the-kiln-cafe
    ↓
Uses API for → Square sync, Stripe billing, analytics
```

## Costs

| Service | Cost | Notes |
|---------|------|-------|
| Supabase | Free tier → $5-50/mo | Database, auth, storage |
| Vercel | Free tier → $20/mo | Frontend + backend hosting |
| Railway | Free tier → $7/mo | Or use Vercel for both |
| Stripe | Per transaction | 2.9% + £0.30 |
| Square | Your POS system | Studios keep using their own |
| Domain | £5-15/year | `glazeup.app` or white-label domains |

With free tiers, you can run the whole thing for £0 until you have paying customers.

## Project structure

```
glazeup/
├── index.html                    ← Customer PWA entry point
├── manifest.json                 ← PWA manifest
├── sw.js                         ← Service worker (offline)
├── css/
│   └── app.css                   ← Styles (CSS custom properties for white-label)
├── js/
│   ├── app.js                    ← Main app logic
│   ├── studio-config.js          ← Load studio branding from Supabase
│   ├── designs.js                ← 22 built-in transfer designs
│   └── glazes.js                 ← Colour matching + Stroke & Coat palette
├── admin/                        ← Studio admin dashboard (coming soon)
├── assets/icons/                 ← PWA icons
├── backend/                      ← Express.js API server
│   ├── server.js                 ← Main server
│   ├── routes/
│   │   ├── auth.js               ← Studio signup/login
│   │   ├── square.js             ← Square OAuth + connection
│   │   ├── stripe.js             ← Stripe subscription billing
│   │   └── admin.js              ← Analytics dashboard
│   ├── jobs/
│   │   └── sync-square.js        ← Hourly Square data sync
│   ├── middleware/
│   │   └── auth.js               ← Studio authentication
│   ├── package.json
│   ├── .env.example
│   └── README.md                 ← Backend setup guide
├── sql/
│   └── schema.sql                ← Supabase database + RLS
└── README.md                     ← This file
```

## White-label system

Every colour, font, and studio name is driven by CSS custom properties (`--gu-*`). Studios configure their branding in the admin dashboard, which is stored in Supabase and loaded on app start.

For demos or single-studio use, edit `DEMO_CONFIG` in `js/studio-config.js`:

```javascript
const DEMO_CONFIG = {
  studio: {
    name: 'My Pottery Studio',
    tagline: 'Create Something Beautiful',
    footer: 'My Studio · 123 High Street · London'
  },
  branding: {
    primaryColour: '#2E7D32',    // your brand colour
    secondaryColour: '#F1F8E9',  // background
    accentColour: '#1B5E20',     // headings
    textColour: '#212121',       // body text
    fontDisplay: 'Georgia, serif',
    fontBody: 'system-ui, sans-serif',
    logoUrl: null  // URL to your logo image
  }
};
```

## Adding new designs

Open `js/designs.js` and add to the `BUILTIN_DESIGNS` array:

```javascript
makeDesign('my-design', 'My Design', 'Florals', (ctx, w, h) => {
  // ctx = Canvas 2D context
  // w, h = drawing area dimensions
  // Use 'currentColor' for strokes/fills to pick up studio branding

  ctx.strokeStyle = 'currentColor';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, Math.min(w, h) * 0.3, 0, Math.PI * 2);
  ctx.stroke();
});
```

The design auto-appears in its category. Categories are created from whatever category names exist in the designs array.

## Adding new bisque shapes

Same file, `BUILTIN_SHAPES` array:

```javascript
{
  id: 'my-shape', name: 'My Shape', category: 'Tableware',
  draw(ctx, w, h) {
    ctx.fillStyle = '#f0e0d6';
    ctx.strokeStyle = '#c8a898';
    ctx.lineWidth = 2;
    // Draw your shape...
  }
}
```

## Adding a custom glaze palette

Edit `js/glazes.js` to change `STROKE_AND_COAT` or add a new palette. Each colour needs:

```javascript
{ code: "SC-74", name: "Hot Tamale", hex: "#D94030" }
```

When Supabase is connected, studios manage their own palettes via the admin dashboard.

## Supabase setup (for multi-studio)

1. Create a free project at [supabase.com](https://supabase.com)
2. Go to SQL Editor → paste contents of `sql/schema.sql` → Run
3. Copy your project URL and anon key
4. Paste them into `js/studio-config.js`:

```javascript
const SUPABASE_URL = 'https://xxxxx.supabase.co';
const SUPABASE_KEY = 'eyJhbGci...';
```

## Roadmap

- [ ] Studio admin dashboard (branding, palette, shapes, designs)
- [ ] Stripe subscription billing
- [ ] Customer "save my design" with email share
- [ ] Studio-uploaded SVG/PNG designs
- [ ] Custom domain support per studio
- [ ] Design marketplace (studios share/sell designs)
- [ ] Analytics dashboard for studios

## Tech stack

| Layer | Technology | Cost |
|-------|-----------|------|
| Frontend | Vanilla JS PWA | Free |
| Backend | Supabase (Postgres, Auth, Storage) | Free tier → scales |
| Hosting | Vercel or Netlify | Free tier → scales |
| Billing | Stripe | Pay per transaction |
| Domain | glazeup.app (or similar) | ~£10/year |

## Licence

Proprietary — © GlazeUp. All rights reserved.
