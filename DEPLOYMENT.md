# GlazeUp Deployment Guide

Complete instructions for deploying GlazeUp to production on Render.

## Prerequisites

✓ GitHub account (repo pushed)  
✓ Render account (free or paid)  
✓ Supabase project setup  
✓ Anthropic API key  
✓ All environment variables ready  

## Step 1: Prepare GitHub Repository

```bash
# Initialize git (if not done)
git init
git add .
git commit -m "Initial GlazeUp commit"

# Create repository on GitHub
# Push to GitHub
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/glazeup.git
git push -u origin main
```

## Step 2: Create Render Services

### Backend API

1. Go to https://render.com/dashboard
2. Click "New +" → "Web Service"
3. Connect your GitHub repo
4. Fill in settings:
   - **Name**: `glazeup-api`
   - **Runtime**: Node
   - **Build Command**: `cd backend && npm install`
   - **Start Command**: `cd backend && npm start`
   - **Instance Type**: Free (or Starter+)

5. Add Environment Variables:
   - `SUPABASE_URL` = https://mdpchpjnlzlmldtlqrns.supabase.co
   - `SUPABASE_KEY` = your-anon-key
   - `ANTHROPIC_API_KEY` = sk-ant-...
   - `STUDIO_ID` = fab8b2d2-27b5-47ec-8c56-268bbf821dc3
   - `NODE_ENV` = production
   - `PORT` = 3001

6. Click "Create Web Service"

### Frontend Static Site

1. In Render dashboard, click "New +" → "Static Site"
2. Connect GitHub repo
3. Fill in settings:
   - **Name**: `glazeup-studio`
   - **Build Command**: `cd frontend && npm install && npm run build`
   - **Publish Directory**: `frontend/dist`
   - **Instance Type**: Free

4. Add Environment Variable:
   - `VITE_API_URL` = https://glazeup-api.onrender.com (your backend URL from Step 2)

5. Click "Create Static Site"

## Step 3: Set Up Supabase

### Create Database Tables

1. Log in to Supabase: https://app.supabase.com
2. Select your project
3. Go to SQL Editor
4. Create new query
5. Copy contents of `backend/migrations.sql`
6. Execute

### Set Up RLS (Row Level Security) - Optional

```sql
-- Enable RLS on all tables
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE pieces ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE takings ENABLE ROW LEVEL SECURITY;
ALTER TABLE shelf_scans ENABLE ROW LEVEL SECURITY;

-- Create policies (example for bookings)
CREATE POLICY "View studio bookings" ON bookings
  FOR SELECT USING (studio_id = '{{ studio_id }}');

CREATE POLICY "Insert studio bookings" ON bookings
  FOR INSERT WITH CHECK (studio_id = '{{ studio_id }}');
```

### Upload Storage Bucket - Optional

For piece photos:

1. Go to Storage in Supabase
2. Click "New Bucket"
3. Name: `pieces`
4. Make public
5. Set up CORS for your domain

## Step 4: Set Render Environment Variables

In Render dashboard for **backend** service:

1. Settings → Environment
2. Add each variable:

```
SUPABASE_URL=https://mdpchpjnlzlmldtlqrns.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
ANTHROPIC_API_KEY=sk-ant-...
STUDIO_ID=fab8b2d2-27b5-47ec-8c56-268bbf821dc3
NODE_ENV=production
PORT=3001
```

For **frontend** service:

1. Settings → Environment
2. Add:

```
VITE_API_URL=https://glazeup-api.onrender.com
```

## Step 5: Deploy

### Automatic (Recommended)

Push to GitHub → Render auto-deploys:

```bash
git push origin main
```

### Manual Deployment

1. In Render dashboard
2. Select service (backend or frontend)
3. Click "Redeploy"

## Step 6: Verify Deployment

### Check Backend

```bash
curl https://glazeup-api.onrender.com/api/health
# Expected: {"status":"ok","timestamp":"..."}
```

### Check Frontend

Visit: https://glazeup-studio.onrender.com

Login with PIN: `0000`

## Troubleshooting

### "Cannot find module"

```bash
# Ensure package-lock.json is committed
git add package-lock.json
git commit -m "Add package lock"
git push
```

### Deployment Fails

1. Check Render logs: Dashboard → Service → Logs
2. Verify environment variables are set
3. Ensure `render.yaml` is in root
4. Check GitHub token hasn't expired

### API Timeouts

1. Verify Supabase project is active
2. Check network connectivity in Render logs
3. Increase timeout in vite.config.js if needed

### CORS Errors

Add to backend `server.js`:

```javascript
app.use(cors({
  origin: 'https://glazeup-studio.onrender.com',
  credentials: true
}));
```

Then redeploy.

## Performance Tuning

### Caching

Enable caching on frontend static assets (automatic in Render).

### Database

Create indexes (in `migrations.sql` already included):

```sql
CREATE INDEX idx_bookings_studio ON bookings(studio_id);
CREATE INDEX idx_pieces_booking ON pieces(booking_id);
```

### Monitoring

1. Go to Render Service → Metrics
2. Monitor CPU, memory, requests
3. Upgrade plan if consistently >80% usage

## Custom Domain

1. Render dashboard → Static Site Settings
2. Add custom domain
3. Update DNS with Render's CNAME records

Example:
```
glazeup.thekilncafe.co CNAME glazeup-studio.onrender.com
api.glazeup.thekilncafe.co CNAME glazeup-api.onrender.com
```

## SSL/TLS

Render provides free SSL by default. No additional setup needed.

## Backups

### Supabase Backups

1. Supabase Dashboard → Settings → Backups
2. Enable automated backups
3. Download backups regularly

### Manual Backup

```sql
-- Export data (Supabase SQL)
SELECT * FROM bookings;
SELECT * FROM pieces;
```

## Update Process

### Deploy Updates

1. Make code changes locally
2. Test locally: `npm run dev`
3. Commit and push: `git push origin main`
4. Render auto-deploys (2-5 minutes)

### Database Migrations

1. Create new SQL file in `backend/migrations/`
2. Run in Supabase SQL editor
3. Test locally first
4. Push to production

## Monitoring & Logging

### View Logs

**Backend**:
```bash
# In Render dashboard
Glazeup-api → Logs
```

**Frontend**:
```bash
# Browser DevTools Console
F12 → Console
```

### Error Tracking

Add Sentry (optional):

```bash
npm install @sentry/react
```

## Security Checklist

- [ ] All environment variables set
- [ ] Supabase RLS enabled
- [ ] CORS configured correctly
- [ ] API keys rotated monthly
- [ ] Backups automated
- [ ] HTTPS enabled (automatic)
- [ ] PIN auth in use (not demo)
- [ ] No secrets in GitHub
- [ ] .env in .gitignore

## Support

For issues:

1. Check Render logs first
2. Verify environment variables
3. Test locally with `npm run dev`
4. Contact Anthropic API support if vision fails
5. Contact Supabase support for database issues

## Rollback

If deployment breaks:

1. Render dashboard → Service
2. Click "..." menu
3. Select "Redeploy" with previous working commit

```bash
git revert HEAD
git push origin main
```

---

**Deployment Guide v1.0** — 11 Aug 2026
