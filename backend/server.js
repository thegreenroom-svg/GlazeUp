import express from 'express';
import cors from 'express-cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { Client as SquareClient } from 'square';
import Stripe from 'stripe';
import cron from 'node-cron';

import authRoutes from './routes/auth.js';
import squareRoutes from './routes/square.js';
import stripeRoutes from './routes/stripe.js';
import adminRoutes from './routes/admin.js';
import { syncSquareData } from './jobs/sync-square.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ──
app.use(cors());
app.use(express.json());

// ── Initialize clients ──
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY  // service key for server-side ops
);

const squareClient = new SquareClient({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: process.env.SQUARE_ENVIRONMENT || 'production'
});

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ── Share clients globally ──
app.locals.supabase = supabase;
app.locals.squareClient = squareClient;
app.locals.stripe = stripe;

// ── Health check ──
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// ── Routes ──
app.use('/api/auth', authRoutes);
app.use('/api/square', squareRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/admin', adminRoutes);

// ── Scheduled jobs ──
// Every hour at :00, sync Square data for all connected studios
cron.schedule('0 * * * *', async () => {
  console.log('[CRON] Starting Square sync for all studios');
  const { data: studios } = await supabase
    .from('square_connections')
    .select('studio_id')
    .eq('sync_status', 'idle');

  if (studios) {
    for (const { studio_id } of studios) {
      await syncSquareData(studio_id, supabase, squareClient);
    }
  }
});

// ── Error handling ──
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

app.listen(PORT, () => {
  console.log(`GlazeUp backend running on port ${PORT}`);
  console.log(`Square environment: ${process.env.SQUARE_ENVIRONMENT}`);
  console.log(`Supabase URL: ${process.env.SUPABASE_URL}`);
});
