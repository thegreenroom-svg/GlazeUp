# GlazeUp - Quick Start Guide

Get the complete GlazeUp system running locally or deployed in under 30 minutes.

## Prerequisites

- Node.js 18+ installed
- A Supabase account (free tier OK)
- A Square account (optional, for payments)
- Git installed

## 5 Minute Setup (Local Development)

### 1. Database Setup (3 min)

```bash
# Create Supabase project at https://app.supabase.com

# Copy the project URL and anon key from project settings
# Create a storage bucket: go to Storage → Create Bucket → name: "piece-photos"

# In the SQL editor, run:
# (Copy entire content of supabase_schema.sql)
# Click "Run" to apply schema
```

### 2. Environment Configuration (2 min)

```bash
# At project root
cp .env.example .env.local

# Edit .env.local and fill in:
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

### 3. Start Services (2 min)

In 3 separate terminal windows:

```bash
# Terminal 1 - Backend
cd backend
npm install
npm run dev
# Runs on http://localhost:3001

# Terminal 2 - Customer App
cd apps/customer
npm install
npm run dev
# Runs on http://localhost:3000

# Terminal 3 - Studio App
cd apps/studio
npm install
npm run dev
# Runs on http://localhost:3001
```

### Done!

- **Customer App**: http://localhost:3000
- **Studio App**: http://localhost:3001 (configured in package.json)
- **Backend**: http://localhost:3001/health

Try signing up in the customer app or logging in (auth defaults to Supabase).

---

## 15 Minute Production Deployment

### Option A: Render + Vercel (Recommended)

#### 1. Deploy Backend to Render (5 min)

```bash
# Push to GitHub (if not already)
git push origin main

# Go to https://render.com/dashboard
# Click "New" → "Web Service"
# Connect GitHub repository
# Settings:
#   - Root: backend
#   - Build: npm install
#   - Start: npm start
#   - Environment: Add all from .env.example (mark secrets)
#   - Instance: Standard (minimum recommended)

# Click "Create Web Service"
# Copy the deployed URL (e.g., https://glazeup-backend.onrender.com)
```

#### 2. Deploy Customer App to Vercel (5 min)

```bash
# Go to https://vercel.com/new
# Import GitHub repository
# Settings:
#   - Framework: Next.js
#   - Root: apps/customer
#   - Environment Variables:
#     - NEXT_PUBLIC_SUPABASE_URL=<your_url>
#     - NEXT_PUBLIC_SUPABASE_ANON_KEY=<your_key>
#     - NEXT_PUBLIC_API_URL=https://glazeup-backend.onrender.com

# Click "Deploy"
# Your app is live at <project>.vercel.app
```

#### 3. Deploy Studio App to Vercel (5 min)

```bash
# Go to https://vercel.com/new
# Import same GitHub repository
# Settings:
#   - Framework: Next.js
#   - Root: apps/studio
#   - Same environment variables

# Click "Deploy"
# Your studio app is live at <project>.vercel.app
```

### Option B: Docker + Railway (Alternative)

```bash
# Create docker-compose.yml in project root
# (Not included in this guide - use Render/Vercel for simplicity)
```

---

## Common Issues & Fixes

### "Connection refused" on backend

**Problem**: Apps can't connect to backend
**Fix**: Update `NEXT_PUBLIC_API_URL` in Vercel env vars to actual backend URL

### "Supabase auth failed"

**Problem**: Auth not working
**Fix**: 
- Verify `NEXT_PUBLIC_SUPABASE_ANON_KEY` is set in app env vars
- Check Supabase project is active
- Verify URL has no trailing slash

### "RLS policy violation"

**Problem**: Database queries returning empty
**Fix**:
- Ensure user has `studio_id` set in the users table
- Check RLS policies in `supabase_schema.sql`
- Review Supabase audit logs

### "Photos not uploading"

**Problem**: Piece photo uploads fail
**Fix**:
- Verify `piece-photos` bucket exists in Storage
- Check bucket permissions are public (if needed)
- Ensure multer storage path is writable on backend

### "Real-time updates not working"

**Problem**: Changes not reflecting instantly
**Fix**:
- Enable Realtime in Supabase settings
- Check subscriptions in database logs
- Verify RLS policies allow read access

---

## Next Steps

1. **Create a test studio**: Go to studio app, sign up as owner
2. **Create test customer**: Go to customer app, sign up
3. **Make a test booking**: Book through customer app
4. **Create pieces**: Use studio app to create ceramic pieces
5. **Test photos**: Upload a photo of a piece
6. **Manage kiln**: Create kiln batch, move pieces through lifecycle

---

## Customization Checklist

After deployment, customize:

- [ ] **Branding**: Update logo, colors in `globals.css`
- [ ] **Emails**: Configure SendGrid for notifications (optional)
- [ ] **Payments**: Set up Square merchant account and location
- [ ] **Loyalty**: Configure point values in database
- [ ] **Tables**: Adjust studio table count and seating
- [ ] **Storage**: Configure CDN for piece photos (optional)

---

## Monitoring

### Production Monitoring

```bash
# Monitor backend health
curl https://your-backend.onrender.com/health

# Monitor database
# Go to Supabase dashboard → Query Logs

# Monitor frontend errors
# Vercel dashboard shows deployment logs and errors
```

### Common Endpoints to Test

```bash
# Health check
curl https://your-backend.onrender.com/health

# Get studios (public)
curl https://your-backend.onrender.com/api/studios

# Get bookings (requires auth token)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://your-backend.onrender.com/api/bookings
```

---

## Database Backup

```bash
# Supabase automatic backups (free tier: 7 days)
# Premium backups available in project settings

# Manual backup:
# Settings → Backups → Create backup

# Restore: Contact Supabase support
```

---

## Support

- **Documentation**: See README.md
- **Database Help**: https://supabase.io/docs
- **Deployment Help**: https://render.com/docs
- **Frontend Framework**: https://nextjs.org/docs

---

**You're now running a complete pottery studio SaaS!**

Next: Customize branding, configure payments, and invite your first studio.
