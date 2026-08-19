import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import pino from 'pino';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import sharp from 'sharp';
import axios from 'axios';
import path from 'path';
import fs from 'fs';
import registerSpecRoutes from './spec-routes.js';
import registerSpecRoutes2, { registerPinRoutes, registerGapRoutes, registerNetworkRoutes, registerWorkflowRoutes, registerTillMenuRoute, registerKdsRoutes, registerAiCostRoute, registerLiveTotalRoute, registerSquareOpenOrdersDiagnosticRoute, registerSquareBookingsDiagnosticRoute, registerLiveSquareOrderRoute, registerNeedsVerificationRoute, registerRevenueCategorySyncRoute, registerRevenueBreakdownRoute, registerKilnSimplifiedRoute, registerPostalLabelRoute, registerRealBookingSyncRoute, registerLiveTableSyncRoute, registerSquarePaymentFinishRoute, registerCurrentCollectionDateRoute, registerBisqueInventoryRoute, registerStudioFeaturesRoute, registerQuickAddPieceRoute, registerFindOnTableRoute, registerFindAllOnTableRoute, registerEquipmentRequestRoute, registerDesignChargeRoute, registerFulfilmentRoute, registerPartySizeRoute } from './spec-routes-2.js';
import crypto from 'crypto';

// Load environment variables
dotenv.config();

const app = express();
app.set('trust proxy', 1);
const logger = pino({ transport: { target: 'pino-pretty' } });

// ============================================================================
// MIDDLEWARE
// ============================================================================

app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.FRONTEND_URLS?.split(',') || '*',
  credentials: true
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests'
});
app.use('/api/', limiter);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ============================================================================
// DATABASE CLIENT
// ============================================================================

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ============================================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================================

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  const token = authHeader.slice(7);
  
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  } catch (err) {
    logger.error(err);
    res.status(401).json({ error: 'Authentication failed' });
  }
}

async function studioAuthMiddleware(req, res, next) {
  if (!req.user) return authMiddleware(req, res, () => next());
  
  try {
    const { data: userData } = await supabase
      .from('users')
      .select('studio_id, role')
      .eq('auth_id', req.user.id)
      .single();
    
    if (!userData) {
      return res.status(403).json({ error: 'No studio access' });
    }
    
    req.studioId = userData.studio_id;
    req.userRole = userData.role;
    next();
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: 'Auth check failed' });
  }
}

// ============================================================================
// FILE UPLOAD SETUP
// ============================================================================

const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const id = uuidv4();
    cb(null, `${id}-${Date.now()}.jpg`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files allowed'));
    }
  }
});

// ============================================================================
// READ-ONLY DEMO ENDPOINTS
// ============================================================================
// GET-only, hardcoded to a single studio (The Kiln Cafe). No auth required
// since these never write anything. No route here performs INSERT, UPDATE,
// or DELETE -- viewing only. Do not add write logic to this section.

const DEMO_STUDIO_ID = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3';

// Test/junk booking labels created during engine testing (24-26 Jul). Pieces
// carrying these are not real customer work and must never appear in any
// customer-facing or operational view. Defined once here and exported so every
// endpoint filters identically -- previously this list lived inside a single
// handler, so newer endpoints silently showed the test data.
export const JUNK_BOOKING_LABELS = ['Studio shelf', 'Test run', 'Testing', 'Fest', 'Test', 'Run', 'Rum', 'G', 'Test2'];

app.get('/api/demo/studio', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('studios')
      .select('id, name, slug, city, country, website')
      .eq('id', DEMO_STUDIO_ID)
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/demo/bookings', async (req, res) => {
  try {
    // Show all real bookings, most recent first. (Earlier version filtered
    // to today-onward only, which hid most of the 209 real bookings since
    // most are in the past -- Daisy asked to see everything.)
    const { data, error } = await supabase
      .from('bookings')
      .select('id, booking_code, customer_name, customer_email, party_size, status, session_start, session_end, room, space_name, fulfilment_method, current_stage, table_number, notes, booking_type, arrived_at')
      .eq('studio_id', DEMO_STUDIO_ID)
      .order('session_start', { ascending: false })
      .limit(250);
    if (error) throw error;

    // collection_date can now be set at print time (before a session even
    // starts), not just at Floor completion -- merge it in from
    // demo_app_session_status so daily-cards (and anywhere else using this
    // list) can show/edit whatever's already been chosen. booking_code is
    // the real join key between the two tables (no formal FK, so this is a
    // separate query + in-memory merge rather than relying on PostgREST
    // embedding).
    const codes = data.map((b) => b.booking_code);
    let collectionDates = {};
    if (codes.length) {
      const { data: statuses } = await supabase
        .from('demo_app_session_status')
        .select('booking_code, collection_date')
        .eq('studio_id', DEMO_STUDIO_ID)
        .in('booking_code', codes);
      (statuses || []).forEach((s) => { if (s.collection_date) collectionDates[s.booking_code] = s.collection_date; });
    }
    const merged = data.map((b) => ({ ...b, collection_date: collectionDates[b.booking_code] || null }));

    res.json(merged);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/demo/pieces', async (req, res) => {
  try {
    // booking_id on this table is free-text (often an OCR'd customer name,
    // sometimes a test/junk label like "Studio shelf" or "Test run"). Filter
    // out the known junk values so test data doesn't pollute this view --
    // checked live against the real table before excluding these.

    const { data, error } = await supabase
      .from('pottery_pieces')
      .select('id, piece_type, status, is_complete, created_at, scheduled_firing_date, reference_photo_url, mark_code, description, damaged, requires_second_firing, transfer_stage, glaze_fired_at, photo_phash, booking_id')
      .eq('studio_id', DEMO_STUDIO_ID)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;

    const filtered = data
      .filter((p) => !p.booking_id || !JUNK_BOOKING_LABELS.includes(p.booking_id))
      .slice(0, 50);

    // Real booking context joined in -- per Daisy: "I still don't
    // understand pieces... these are not the pieces from [that date]".
    // The page previously showed only piece_type and status, so there
    // was genuinely no way to tell whose piece it was or when. Joins the
    // real customer name and session date, plus the real collection date
    // from demo_app_session_status.
    const codes = [...new Set(filtered.map((p) => p.booking_id).filter(Boolean))];
    let bookingsByCode = {};
    let collectionByCode = {};
    if (codes.length) {
      const { data: bks } = await supabase
        .from('bookings')
        .select('booking_code, customer_name, session_start')
        .eq('studio_id', DEMO_STUDIO_ID)
        .in('booking_code', codes);
      bookingsByCode = Object.fromEntries((bks || []).map((b) => [b.booking_code, b]));

      const { data: sts } = await supabase
        .from('demo_app_session_status')
        .select('booking_code, collection_date')
        .eq('studio_id', DEMO_STUDIO_ID)
        .in('booking_code', codes);
      collectionByCode = Object.fromEntries((sts || []).map((s) => [s.booking_code, s.collection_date]));
    }

    const enriched = filtered.map((p) => ({
      ...p,
      customer_name: bookingsByCode[p.booking_id]?.customer_name || null,
      session_start: bookingsByCode[p.booking_id]?.session_start || null,
      collection_date: collectionByCode[p.booking_id] || null,
    }));

    res.json(enriched);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Real perceptual-hash matching: compares a piece's photo_phash against
// every other piece with a phash using hamming distance, returns closest
// candidates. This is genuine similarity search over real stored hashes,
// not a mock -- read-only, no writes.
function hexToBinary(hex) {
  return hex
    .split('')
    .map((c) => parseInt(c, 16).toString(2).padStart(4, '0'))
    .join('');
}

function hammingDistance(hashA, hashB) {
  const segmentsA = hashA.split('|');
  const segmentsB = hashB.split('|');
  let totalBits = 0;
  let diffBits = 0;

  for (let i = 0; i < Math.min(segmentsA.length, segmentsB.length); i++) {
    const binA = hexToBinary(segmentsA[i]);
    const binB = hexToBinary(segmentsB[i]);
    const len = Math.min(binA.length, binB.length);
    for (let j = 0; j < len; j++) {
      totalBits++;
      if (binA[j] !== binB[j]) diffBits++;
    }
  }

  return totalBits > 0 ? diffBits / totalBits : 1;
}

app.get('/api/demo/pieces/:id/matches', async (req, res) => {
  try {
    const { data: target, error: targetError } = await supabase
      .from('pottery_pieces')
      .select('id, photo_phash')
      .eq('id', req.params.id)
      .eq('studio_id', DEMO_STUDIO_ID)
      .single();

    if (targetError || !target || !target.photo_phash) {
      return res.json([]);
    }

    const { data: candidates, error: candError } = await supabase
      .from('pottery_pieces')
      .select('id, piece_type, reference_photo_url, photo_phash, mark_code')
      .eq('studio_id', DEMO_STUDIO_ID)
      .not('photo_phash', 'is', null)
      .neq('id', target.id)
      .limit(200);

    if (candError) throw candError;

    const scored = candidates
      .map((c) => ({
        id: c.id,
        piece_type: c.piece_type,
        reference_photo_url: c.reference_photo_url,
        mark_code: c.mark_code,
        distance: hammingDistance(target.photo_phash, c.photo_phash),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5);

    res.json(scored);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/demo/kiln-sessions', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('kiln_sessions')
      .select('id, label, status, batch_code, fired_at, created_at, morning_check_result, morning_check_confirmed_at, misfire_notes')
      .eq('studio_id', DEMO_STUDIO_ID)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/demo/customers', async (req, res) => {
  try {
    // The 'customers' table itself is stale/demo data (literal "Demo: Ivy
    // Whitlock" rows plus a handful of personal test entries with no real
    // spend). Real customer data lives in bookings -- derive customers by
    // grouping real bookings by name/email instead.
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('customer_name, customer_email, customer_phone, session_start')
      .eq('studio_id', DEMO_STUDIO_ID)
      .order('session_start', { ascending: false })
      .limit(500);
    if (error) throw error;

    const byName = new Map();
    (bookings || []).forEach((b) => {
      const key = (b.customer_name || '').trim().toLowerCase();
      if (!key) return;
      if (!byName.has(key)) {
        byName.set(key, {
          id: key,
          name: b.customer_name.trim(),
          email: b.customer_email || null,
          phone: b.customer_phone || null,
          visit_count: 0,
          last_visit: b.session_start,
        });
      }
      const entry = byName.get(key);
      entry.visit_count += 1;
      if (b.session_start > entry.last_visit) entry.last_visit = b.session_start;
      if (!entry.email && b.customer_email) entry.email = b.customer_email;
      if (!entry.phone && b.customer_phone) entry.phone = b.customer_phone;
    });

    const customers = Array.from(byName.values())
      .sort((a, b) => (b.last_visit > a.last_visit ? 1 : -1));

    res.json(customers);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/demo/revenue', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('revenue_category_breakdown')
      .select('metric_date, category, revenue_cents, item_count')
      .eq('studio_id', DEMO_STUDIO_ID)
      .order('metric_date', { ascending: false })
      .limit(200);
    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/demo/alerts', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('staff_alerts')
      .select('id, trigger_type, label, message, priority, acknowledged, created_at, booking_code')
      .eq('studio_id', DEMO_STUDIO_ID)
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/demo/team', async (req, res) => {
  try {
    // Deliberately excludes whatsapp_number and any other contact details --
    // this endpoint has no auth, so staff personal contact info stays out.
    const { data, error } = await supabase
      .from('staff_team')
      .select('id, name, role, active')
      .eq('studio_id', DEMO_STUDIO_ID)
      .order('active', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Real menu catalog, already synced from Square into square_items. Read-only.
app.get('/api/demo/menu', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('square_items')
      .select('item_name, category, price_cents')
      .eq('studio_id', DEMO_STUDIO_ID)
      .order('category', { ascending: true })
      .order('item_name', { ascending: true });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Till workflow -- isolated from real Square/table_session_orders. Lets
// staff add items to a booking's running total for testing the workflow.
// No real payment is processed, no real order is created anywhere.
app.get('/api/demo/bookings/:code/till', async (req, res) => {
  try {
    const { data: items, error: itemsError } = await supabase
      .from('demo_app_till_items')
      .select('id, item_name, category, quantity, unit_price_cents, created_at, person_name')
      .eq('booking_code', req.params.code)
      .eq('studio_id', DEMO_STUDIO_ID)
      .order('created_at', { ascending: true });
    if (itemsError) throw itemsError;

    const { data: status } = await supabase
      .from('demo_app_session_status')
      .select('finished_at, finished_by, payment_method, collection_method, postal_postcode, collection_date, till_total_cents, split_bill_count')
      .eq('booking_code', req.params.code)
      .eq('studio_id', DEMO_STUDIO_ID)
      .maybeSingle();

    // Real per-person collection/payment preferences, if any have been set
    // for this booking -- e.g. someone at the table wanting to collect
    // separately or pay for just their own items.
    const { data: people } = await supabase
      .from('demo_app_person_collection')
      .select('person_name, collection_method, postal_postcode, payment_method')
      .eq('booking_code', req.params.code)
      .eq('studio_id', DEMO_STUDIO_ID);

    res.json({
      items: items || [],
      finished_at: status?.finished_at || null,
      finished_by: status?.finished_by || null,
      payment_method: status?.payment_method || null,
      collection_method: status?.collection_method || null,
      postal_postcode: status?.postal_postcode || null,
      collection_date: status?.collection_date || null,
      people: people || [],
    });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/demo/bookings/:code/till', async (req, res) => {
  try {
    const { item_name, category, unit_price_cents, quantity, added_by, person_name } = req.body;
    if (!item_name || unit_price_cents === undefined) {
      return res.status(400).json({ error: 'item_name and unit_price_cents are required' });
    }
    const { data, error } = await supabase
      .from('demo_app_till_items')
      .insert([
        {
          studio_id: DEMO_STUDIO_ID,
          booking_code: req.params.code,
          item_name,
          category: category || null,
          quantity: quantity || 1,
          unit_price_cents,
          added_by: added_by || null,
          // Real per-person assignment -- null means "shared/whole table",
          // same as every booking before this feature existed, so nothing
          // that doesn't pass this breaks.
          person_name: person_name || null,
        },
      ])
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/demo/till-items/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('demo_app_till_items').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ deleted: true });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Real per-person collection/payment preference within a booking -- per
// Daisy: people at the same table often pay separately and may want
// different collection methods (one collects in person, another wants
// theirs posted). Upserts by (studio, booking_code, person_name) --
// setting this again for the same person just updates their row, doesn't
// duplicate it.
app.post('/api/demo/bookings/:code/people/:personName/collection', async (req, res) => {
  try {
    const { collection_method, postal_postcode, payment_method } = req.body || {};
    if (collection_method && !['studio', 'postal'].includes(collection_method)) {
      return res.status(400).json({ error: "collection_method must be 'studio' or 'postal'" });
    }
    const person_name = decodeURIComponent(req.params.personName).trim();
    if (!person_name) return res.status(400).json({ error: 'person_name is required' });

    const { data, error } = await supabase
      .from('demo_app_person_collection')
      .upsert(
        {
          studio_id: DEMO_STUDIO_ID,
          booking_code: req.params.code,
          person_name,
          collection_method: collection_method || null,
          postal_postcode: postal_postcode || null,
          payment_method: payment_method || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'studio_id,booking_code,person_name' }
      )
      .select()
      .maybeSingle();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/demo/bookings/:code/finish', async (req, res) => {
  try {
    const {
      finished_by,
      payment_method,
      collection_method,
      postal_postcode,
      collection_date,
      till_total_cents,
      split_bill_count,
    } = req.body;
    const { data, error } = await supabase
      .from('demo_app_session_status')
      .upsert([{
        booking_code: req.params.code,
        studio_id: DEMO_STUDIO_ID,
        finished_at: new Date().toISOString(),
        finished_by: finished_by || null,
        payment_method: payment_method || null,
        collection_method: collection_method || null,
        postal_postcode: postal_postcode || null,
        collection_date: collection_date || null,
        till_total_cents: till_total_cents ?? null,
        split_bill_count: split_bill_count ?? null,
      }], { onConflict: 'booking_code' })
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Demo reset -- wipes ONLY the day-to-day demo state that piles up from
// using Start Floor / Till / KDS / Photo Match during a demo: till items,
// finished-session flags, and photo match confirmations. Scoped to
// DEMO_STUDIO_ID exactly like every other route above, so it can never
// touch another studio's data even if this ever ran against a shared DB.
// Deliberately does NOT touch bookings, square_items, pottery_pieces or
// anything else real -- only the three demo_app_* tables that exist
// purely to hold state generated by using this demo app itself.
// No Square call, no real order, nothing external -- pure Supabase deletes.
app.post('/api/demo/reset', async (req, res) => {
  try {
    const results = {};

    const { error: tillErr, count: tillCount } = await supabase
      .from('demo_app_till_items')
      .delete({ count: 'exact' })
      .eq('studio_id', DEMO_STUDIO_ID);
    if (tillErr) throw tillErr;
    results.till_items_deleted = tillCount ?? null;

    const { error: statusErr, count: statusCount } = await supabase
      .from('demo_app_session_status')
      .delete({ count: 'exact' })
      .eq('studio_id', DEMO_STUDIO_ID);
    if (statusErr) throw statusErr;
    results.session_status_deleted = statusCount ?? null;

    const { error: photoErr, count: photoCount } = await supabase
      .from('demo_app_photo_matches')
      .delete({ count: 'exact' })
      .eq('studio_id', DEMO_STUDIO_ID);
    if (photoErr) throw photoErr;
    results.photo_matches_deleted = photoCount ?? null;

    logger.info('[DEMO RESET]', results);
    res.json({ reset: true, ...results });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/demo/bookings/:code/detail', async (req, res) => {
  try {
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, booking_code, customer_name, customer_email, customer_phone, party_size, status, session_start, session_end, room, table_number, current_stage, notes, booking_type, arrived_at')
      .eq('booking_code', req.params.code)
      .eq('studio_id', DEMO_STUDIO_ID)
      .single();

    if (bookingError || !booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const { data: session } = await supabase
      .from('table_sessions')
      .select('id, table_number, status, number_of_places, created_at')
      .eq('booking_id', req.params.code)
      .eq('studio_id', DEMO_STUDIO_ID)
      .maybeSingle();

    let orders = [];
    if (session) {
      const { data: orderData } = await supabase
        .from('table_session_orders')
        .select('id, item_type, item_name, quantity, unit_price_cents, notes')
        .eq('table_session_id', session.id);
      orders = orderData || [];
    }

    // Pieces belonging to this booking, with whatever reference photo they
    // have -- including ones just set via Completion Stamp. booking_id on
    // pottery_pieces holds the customer NAME (free text), not a foreign key,
    // so the match is by name; junk test-run labels are excluded the same
    // way every other piece view excludes them.
    let pieces = [];
    if (!JUNK_BOOKING_LABELS.includes(booking.customer_name)) {
      const { data: pieceData } = await supabase
        .from('pottery_pieces')
        .select('id, piece_type, description, status, reference_photo_url, reference_photo_taken_at, mark_code')
        .eq('studio_id', DEMO_STUDIO_ID)
        .eq('booking_id', booking.customer_name)
        .neq('archived', true);
      pieces = pieceData || [];
    }

    res.json({ booking, session, orders, pieces });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Photo match: uploads a table photo, calls OpenAI vision to read the
// chalk tag name and describe the pieces, then fuzzy-matches the name
// against real recent bookings. Stateless -- nothing is written to any
// table, real or otherwise. This is a test/demo endpoint only.
function nameSimilarity(a, b) {
  const normA = a.toLowerCase().trim().replace(/\s+/g, ' ');
  const normB = b.toLowerCase().trim().replace(/\s+/g, ' ');
  if (normA === normB) return 1;
  const wordsA = normA.split(' ');
  const wordsB = normB.split(' ');
  let matches = 0;
  wordsA.forEach((w) => {
    if (w.length > 1 && wordsB.some((wb) => wb === w || wb.includes(w) || w.includes(wb))) matches++;
  });
  return matches / Math.max(wordsA.length, wordsB.length);
}

// Real gpt-4o-mini rates, confirmed current: $0.15/1M input tokens,
// $0.60/1M output tokens (checked directly rather than assumed, since
// this feeds a real running cost total someone will actually rely on).
// Uses the token counts OpenAI's own response returns -- never estimated.
const GPT4O_MINI_INPUT_PER_TOKEN = 0.15 / 1_000_000;
const GPT4O_MINI_OUTPUT_PER_TOKEN = 0.60 / 1_000_000;

async function logAiUsage(supabase, studioId, kind, usage) {
  if (!usage) return;
  const inputTokens = usage.prompt_tokens || 0;
  const outputTokens = usage.completion_tokens || 0;
  const costUsd = inputTokens * GPT4O_MINI_INPUT_PER_TOKEN + outputTokens * GPT4O_MINI_OUTPUT_PER_TOKEN;
  try {
    await supabase.from('ai_usage').insert([{
      studio_id: studioId,
      kind,
      model: 'gpt-4o-mini',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: costUsd,
    }]);
  } catch (err) {
    // Never let a logging failure break the actual AI feature it's logging.
    logger.error('logAiUsage failed', err);
  }
}

// Real, current Gemini 3.6 Flash pricing, checked directly (not assumed
// to match OpenAI's) -- $1.50/1M input tokens, $7.50/1M output tokens,
// per Google's own pricing docs as of Aug 2026. A genuinely separate
// paid service from the OpenAI calls used elsewhere in this app -- kept
// as its own function rather than folded into logAiUsage, which
// hardcodes the gpt-4o-mini model name and rate for every caller; reusing
// it for Gemini would have mislabelled the cost and calculated it wrong.
const GEMINI_FLASH_INPUT_PER_TOKEN = 1.50 / 1_000_000;
const GEMINI_FLASH_OUTPUT_PER_TOKEN = 7.50 / 1_000_000;

async function logGeminiUsage(supabase, studioId, kind, usage) {
  if (!usage) return;
  const inputTokens = usage.prompt_tokens || 0;
  const outputTokens = usage.completion_tokens || 0;
  const costUsd = inputTokens * GEMINI_FLASH_INPUT_PER_TOKEN + outputTokens * GEMINI_FLASH_OUTPUT_PER_TOKEN;
  try {
    await supabase.from('ai_usage').insert([{
      studio_id: studioId,
      kind,
      model: 'gemini-3.6-flash',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: costUsd,
    }]);
  } catch (err) {
    logger.error('logGeminiUsage failed', err);
  }
}

app.post('/api/demo/photo-match', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No photo uploaded' });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OPENAI_API_KEY not configured on this service' });
    }

    const base64Image = fs.readFileSync(req.file.path).toString('base64');

    const visionResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'This is a photo of finished pottery pieces on a table at a paint-your-own-pottery studio, next to a chalkboard tag with a customer name written on it. Reply with ONLY a JSON object, no other text: {"chalk_tag_name": "<name read from the tag, or null if not legible>", "description": "<brief description of the pieces, colours and patterns, not shapes>"}',
              },
              {
                type: 'image_url',
                image_url: { url: `data:${req.file.mimetype};base64,${base64Image}` },
              },
            ],
          },
        ],
        max_tokens: 300,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const raw = visionResponse.data.choices[0].message.content;
    await logAiUsage(supabase, DEMO_STUDIO_ID, 'photo-match', visionResponse.data.usage);
    let parsed;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    } catch (parseErr) {
      return res.status(500).json({ error: 'Could not parse vision response', raw });
    }

    let candidates = [];
    if (parsed.chalk_tag_name) {
      // Search the full real booking set, not just a date-limited slice --
      // a chalk tag name could match any real booking regardless of how far
      // in the past or future it is. Previously limited to 100 rows ordered
      // by furthest-future date, which silently excluded real matches like
      // older July bookings once enough future bookings existed to push
      // them out of that window.
      const { data: recentBookings } = await supabase
        .from('bookings')
        .select('booking_code, customer_name, session_start, status')
        .eq('studio_id', DEMO_STUDIO_ID);

      candidates = (recentBookings || [])
        .map((b) => ({ ...b, score: nameSimilarity(parsed.chalk_tag_name, b.customer_name) }))
        .filter((b) => b.score > 0.3)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
    }

    res.json({
      chalk_tag_name: parsed.chalk_tag_name,
      description: parsed.description,
      candidates,
    });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.response?.data?.error?.message || err.message });
  }
});

// Confirm a photo match against a booking: uploads the photo to an isolated
// storage path (demo-app-test/, separate from real booking-photos/), then
// inserts a row into the isolated demo_app_photo_matches table. Never
// touches pottery_pieces, bookings, or any real production table/storage path.
app.post('/api/demo/photo-match/confirm', upload.single('photo'), async (req, res) => {
  try {
    const { booking_code, chalk_tag_name, description, confirmed_by } = req.body;
    if (!req.file || !booking_code) {
      return res.status(400).json({ error: 'photo and booking_code are required' });
    }

    const filename = `demo-app-test/photo-matches/${DEMO_STUDIO_ID}/${Date.now()}-${uuidv4()}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from('booking-photos')
      .upload(filename, fs.readFileSync(req.file.path), { contentType: req.file.mimetype });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from('booking-photos').getPublicUrl(filename);

    const { data: inserted, error: insertError } = await supabase
      .from('demo_app_photo_matches')
      .insert([
        {
          studio_id: DEMO_STUDIO_ID,
          booking_code,
          photo_url: urlData.publicUrl,
          chalk_tag_name: chalk_tag_name || null,
          ai_description: description || null,
          confirmed_by: confirmed_by || null,
        },
      ])
      .select()
      .single();

    if (insertError) throw insertError;

    // Real end-to-end connection -- this was the genuine gap in the
    // pipeline. Floor's completion already took one whole-table photo
    // and saved it here against the booking, but never created
    // pottery_pieces rows or set reference_photo_url. Find on Table (the
    // kiln-unpacking tool) searches PIECES, not booking photos -- so the
    // photo was visible on the booking yet invisible to the tool that
    // actually needs it on the 28th. Now one table photo does the whole
    // job: if piece_count is supplied and this booking has no pieces
    // yet, create that many real piece rows, each carrying this photo as
    // its reference. One tap on a busy floor, pipeline complete.
    const pieceCount = parseInt(req.body.piece_count, 10);
    let piecesCreated = 0;
    if (Number.isFinite(pieceCount) && pieceCount > 0) {
      const { count: existing } = await supabase
        .from('pottery_pieces')
        .select('id', { count: 'exact', head: true })
        .eq('studio_id', DEMO_STUDIO_ID)
        .eq('booking_id', booking_code);
      if (!existing) {
        const rows = Array.from({ length: pieceCount }, (_, i) => ({
          studio_id: DEMO_STUDIO_ID,
          booking_id: booking_code,
          piece_type: `Piece ${i + 1} of ${pieceCount}`,
          description: description || null,
          status: 'queued',
          reference_photo_url: urlData.publicUrl,
          reference_photo_taken_at: new Date().toISOString(),
        }));
        const { data: created, error: piecesErr } = await supabase.from('pottery_pieces').insert(rows).select('id');
        if (piecesErr) logger.error('[photo-match/confirm] piece creation failed', piecesErr);
        else piecesCreated = (created || []).length;
      }
    }

    res.json({ ...inserted, pieces_created: piecesCreated });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/demo/bookings/:code/photo-matches', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('demo_app_photo_matches')
      .select('id, photo_url, chalk_tag_name, ai_description, confirmed_by, created_at')
      .eq('booking_code', req.params.code)
      .eq('studio_id', DEMO_STUDIO_ID)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// HEALTH & READY
// ============================================================================

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/ready', async (req, res) => {
  try {
    const { data } = await supabase.from('studios').select('id').limit(1);
    res.json({ ready: true });
  } catch (err) {
    res.status(503).json({ ready: false, error: err.message });
  }
});

// ============================================================================
// STUDIO MANAGEMENT
// ============================================================================

// Create studio (onboarding)
app.post('/api/studios', async (req, res) => {
  try {
    const { name, email, phone, address, city, postcode, country, website } = req.body;
    
    const { data, error } = await supabase
      .from('studios')
      .insert([{
        name,
        email,
        phone,
        address,
        city,
        postcode,
        country,
        website,
        table_count: 10,
        seats_per_table: 4
      }])
      .select()
      .single();
    
    if (error) throw error;
    
    // Create initial tables
    const tables = Array.from({ length: 10 }, (_, i) => ({
      studio_id: data.id,
      table_number: i + 1,
      capacity: 4
    }));
    
    await supabase.from('studio_tables').insert(tables);
    
    logger.info(`Studio created: ${data.id}`);
    res.status(201).json(data);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get studio
app.get('/api/studios/:studioId', authMiddleware, studioAuthMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('studios')
      .select('*')
      .eq('id', req.params.studioId)
      .single();
    
    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// BOOKINGS
// ============================================================================

// Create booking
app.post('/api/bookings', authMiddleware, studioAuthMiddleware, async (req, res) => {
  try {
    const {
      customer_id,
      booking_type,
      scheduled_at,
      party_size,
      duration_minutes,
      notes,
      total_amount
    } = req.body;
    
    const { data, error } = await supabase
      .from('bookings')
      .insert([{
        studio_id: req.studioId,
        customer_id,
        booking_type,
        scheduled_at,
        party_size: party_size || 1,
        duration_minutes: duration_minutes || 120,
        notes,
        total_amount,
        status: 'confirmed'
      }])
      .select()
      .single();
    
    if (error) throw error;
    
    // Award loyalty points
    await supabase.rpc('award_loyalty_points', {
      p_customer_id: customer_id,
      p_studio_id: req.studioId,
      p_amount: Math.floor((total_amount || 0) / 5),
      p_activity: 'visit'
    }).catch(() => null); // Fail gracefully if RPC doesn't exist yet
    
    logger.info(`Booking created: ${data.id}`);
    res.status(201).json(data);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get bookings for studio
app.get('/api/bookings', authMiddleware, studioAuthMiddleware, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let query = supabase
      .from('bookings')
      .select('*, customers(display_name, email), ceramic_pieces(*)')
      .eq('studio_id', req.studioId)
      .order('scheduled_at', { ascending: false });
    
    if (startDate) query = query.gte('scheduled_at', startDate);
    if (endDate) query = query.lte('scheduled_at', endDate);
    
    const { data, error } = await query.limit(500);
    if (error) throw error;
    
    res.json(data);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Check in booking
app.patch('/api/bookings/:bookingId/check-in', authMiddleware, studioAuthMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .update({
        status: 'checked-in',
        checked_in_at: new Date().toISOString()
      })
      .eq('id', req.params.bookingId)
      .eq('studio_id', req.studioId)
      .select()
      .single();
    
    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Complete booking
app.patch('/api/bookings/:bookingId/complete', authMiddleware, studioAuthMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .update({
        status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.bookingId)
      .eq('studio_id', req.studioId)
      .select()
      .single();
    
    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// CERAMIC PIECES
// ============================================================================

// Create ceramic piece
app.post('/api/pieces', authMiddleware, studioAuthMiddleware, async (req, res) => {
  try {
    const {
      booking_id,
      customer_id,
      piece_name,
      item_type,
      base_color
    } = req.body;
    
    const { data, error } = await supabase
      .from('ceramic_pieces')
      .insert([{
        studio_id: req.studioId,
        booking_id,
        customer_id,
        piece_name,
        item_type,
        base_color,
        status: 'created',
        history: [{
          from: null,
          to: 'created',
          at: new Date().toISOString(),
          note: 'Piece created'
        }]
      }])
      .select()
      .single();
    
    if (error) throw error;
    logger.info(`Piece created: ${data.id}`);
    res.status(201).json(data);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Upload piece photo
app.post('/api/pieces/:pieceId/photos', authMiddleware, studioAuthMiddleware, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No photo provided' });
    }
    
    const { stage = 'painted' } = req.body;
    const filePath = req.file.path;
    
    // Resize/optimize
    const resizedPath = `${filePath}-optimized.jpg`;
    await sharp(filePath)
      .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85, progressive: true })
      .toFile(resizedPath);
    
    // Upload to Supabase Storage
    const fileBuffer = fs.readFileSync(resizedPath);
    const storagePath = `pieces/${req.studioId}/${uuidv4()}.jpg`;
    
    const { error: uploadError } = await supabase.storage
      .from('piece-photos')
      .upload(storagePath, fileBuffer, { contentType: 'image/jpeg' });
    
    if (uploadError) throw uploadError;
    
    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('piece-photos')
      .getPublicUrl(storagePath);
    
    // Record in database
    const { data, error } = await supabase
      .from('piece_photos')
      .insert([{
        studio_id: req.studioId,
        piece_id: req.params.pieceId,
        storage_path: storagePath,
        photo_url: publicUrl,
        taken_at: new Date().toISOString(),
        stage
      }])
      .select()
      .single();
    
    if (error) throw error;
    
    // Clean up local files
    fs.unlinkSync(filePath);
    fs.unlinkSync(resizedPath);
    
    res.json(data);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Update piece status
app.patch('/api/pieces/:pieceId/status', authMiddleware, studioAuthMiddleware, async (req, res) => {
  try {
    const { status, staff_notes } = req.body;
    
    const { data, error } = await supabase
      .from('ceramic_pieces')
      .update({
        status,
        staff_notes,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.pieceId)
      .eq('studio_id', req.studioId)
      .select()
      .single();
    
    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get pieces for customer
app.get('/api/customers/:customerId/pieces', authMiddleware, studioAuthMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('ceramic_pieces')
      .select('*, piece_photos(*), piece_designs(*)')
      .eq('customer_id', req.params.customerId)
      .eq('studio_id', req.studioId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// KILN MANAGEMENT
// ============================================================================

// Create kiln batch
app.post('/api/kiln-batches', authMiddleware, studioAuthMiddleware, async (req, res) => {
  try {
    const {
      fire_temperature,
      firing_program,
      duration_hours,
      scheduled_fire_at,
      notes
    } = req.body;
    
    // Get next batch number
    const { data: lastBatch } = await supabase
      .from('kiln_batches')
      .select('batch_number')
      .eq('studio_id', req.studioId)
      .order('batch_number', { ascending: false })
      .limit(1)
      .single();
    
    const nextBatchNumber = (lastBatch?.batch_number || 0) + 1;
    
    const { data, error } = await supabase
      .from('kiln_batches')
      .insert([{
        studio_id: req.studioId,
        batch_number: nextBatchNumber,
        fire_temperature,
        firing_program,
        duration_hours,
        scheduled_fire_at,
        notes,
        status: 'planning'
      }])
      .select()
      .single();
    
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get kiln batches
app.get('/api/kiln-batches', authMiddleware, studioAuthMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('kiln_batches')
      .select('*')
      .eq('studio_id', req.studioId)
      .order('scheduled_fire_at', { ascending: false })
      .limit(100);
    
    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Update kiln batch status
app.patch('/api/kiln-batches/:batchId/status', authMiddleware, studioAuthMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    const now = new Date().toISOString();
    
    let update = { status, updated_at: now };
    if (status === 'firing') update.fired_at = now;
    if (status === 'unloaded') update.unloaded_at = now;
    
    const { data, error } = await supabase
      .from('kiln_batches')
      .update(update)
      .eq('id', req.params.batchId)
      .eq('studio_id', req.studioId)
      .select()
      .single();
    
    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// NOTIFICATIONS
// ============================================================================

// Get customer notifications
app.get('/api/notifications', authMiddleware, async (req, res) => {
  try {
    // Find customer for this user
    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .eq('user_id', (
        await supabase.from('users').select('id').eq('auth_id', req.user.id).single()
      ).data.id)
      .single();
    
    if (!customer) {
      return res.json([]);
    }
    
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Mark notification as read
app.patch('/api/notifications/:notificationId/read', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .update({
        is_read: true,
        read_at: new Date().toISOString()
      })
      .eq('id', req.params.notificationId)
      .select()
      .single();
    
    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Real booking sync from Square Appointments (used by Print Booking Cards
// "Check for new" button) -- registerRealBookingSyncRoute, called further
// down where all the other spec routes are wired in. This used to be a
// dead stub here (own comment admitted 'For now, just return success') --
// removed rather than left behind now that the real one exists.

// ============================================================================
// ERROR HANDLING
// ============================================================================

app.use((err, req, res, next) => {
  logger.error(err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

registerSpecRoutes(app, supabase, DEMO_STUDIO_ID, logger, JUNK_BOOKING_LABELS);
registerSpecRoutes2(app, supabase, DEMO_STUDIO_ID, logger, JUNK_BOOKING_LABELS);
registerPinRoutes(app, supabase, DEMO_STUDIO_ID, logger, crypto);
registerGapRoutes(app, supabase, DEMO_STUDIO_ID, logger, JUNK_BOOKING_LABELS);
registerNetworkRoutes(app, supabase, DEMO_STUDIO_ID, logger);
registerWorkflowRoutes(app, supabase, DEMO_STUDIO_ID, logger, upload, fs);
registerTillMenuRoute(app, supabase, DEMO_STUDIO_ID, logger, axios);
registerKdsRoutes(app, supabase, DEMO_STUDIO_ID, logger);
registerAiCostRoute(app, supabase, DEMO_STUDIO_ID, logger);
registerLiveTotalRoute(app, supabase, DEMO_STUDIO_ID, logger, axios);
registerSquareOpenOrdersDiagnosticRoute(app, supabase, DEMO_STUDIO_ID, logger, axios);
registerSquareBookingsDiagnosticRoute(app, supabase, DEMO_STUDIO_ID, logger, axios);
registerLiveSquareOrderRoute(app, supabase, DEMO_STUDIO_ID, logger, axios);
registerNeedsVerificationRoute(app, supabase, DEMO_STUDIO_ID, logger);
registerRevenueCategorySyncRoute(app, supabase, DEMO_STUDIO_ID, logger, axios);
registerRevenueBreakdownRoute(app, supabase, DEMO_STUDIO_ID, logger);
registerKilnSimplifiedRoute(app, supabase, DEMO_STUDIO_ID, logger);
registerPostalLabelRoute(app, supabase, DEMO_STUDIO_ID, logger);
registerEquipmentRequestRoute(app, supabase, DEMO_STUDIO_ID, logger);
registerDesignChargeRoute(app, supabase, DEMO_STUDIO_ID, logger, axios);
registerFulfilmentRoute(app, supabase, DEMO_STUDIO_ID, logger);
registerPartySizeRoute(app, supabase, DEMO_STUDIO_ID, logger, axios);
registerRealBookingSyncRoute(app, supabase, DEMO_STUDIO_ID, logger, axios);
registerLiveTableSyncRoute(app, supabase, DEMO_STUDIO_ID, logger, axios);
registerSquarePaymentFinishRoute(app, supabase, DEMO_STUDIO_ID, logger, axios);
registerCurrentCollectionDateRoute(app, supabase, DEMO_STUDIO_ID, logger);
registerBisqueInventoryRoute(app, supabase, DEMO_STUDIO_ID, logger);
registerStudioFeaturesRoute(app, supabase, DEMO_STUDIO_ID, logger);
registerQuickAddPieceRoute(app, supabase, DEMO_STUDIO_ID, logger);
registerFindOnTableRoute(app, supabase, DEMO_STUDIO_ID, logger, axios, upload, fs, logGeminiUsage);
registerFindAllOnTableRoute(app, supabase, DEMO_STUDIO_ID, logger, axios, upload, fs, logGeminiUsage);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ============================================================================
// START SERVER
// ============================================================================

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  logger.info(`GlazeUp backend running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);

  // Real periodic auto-sync -- per Daisy: 'I need this live data fed', not
  // a manual button someone has to remember to press. Every 5 minutes,
  // pulls new bookings from Square (registerRealBookingSyncRoute) then
  // syncs any real table assignment set on the physical till
  // (registerLiveTableSyncRoute) -- calls its own real endpoints
  // internally rather than duplicating the logic. One honest caveat: if
  // this specific Render service is on a tier that spins down after
  // inactivity, this interval only runs while the process is actually
  // awake -- genuine real user traffic (or a manual trigger) keeps it
  // running, but this isn't a guaranteed-always-on external cron.
  const SELF_URL = `http://localhost:${PORT}`;
  setInterval(async () => {
    try {
      const bookingRes = await fetch(`${SELF_URL}/api/bookings/sync`, { method: 'POST' });
      const bookingData = await bookingRes.json().catch(() => ({}));
      if (bookingData.synced) logger.info(`[auto-sync] ${bookingData.synced} new booking(s) pulled from Square`);

      const tableRes = await fetch(`${SELF_URL}/api/spec/bookings/sync-tables-from-square`, { method: 'POST' });
      const tableData = await tableRes.json().catch(() => ({}));
      if (tableData.updated) logger.info(`[auto-sync] table updated from real Square ticket`, tableData.changes);

      // Per Daisy directly: the physical Square terminal stays the real
      // day-to-day tool -- this app runs alongside it, watching its real
      // events rather than replacing them. When staff take payment at a
      // table, that's a genuine signal the session is over.
      const finishRes = await fetch(`${SELF_URL}/api/spec/bookings/sync-finished-from-square`, { method: 'POST' });
      const finishData = await finishRes.json().catch(() => ({}));
      if (finishData.finished) logger.info(`[auto-sync] ${finishData.finished} booking(s) marked finished from real Square payment`, finishData.changes);
    } catch (err) {
      logger.warn('[auto-sync] periodic sync failed', err.message);
    }
  }, 5 * 60 * 1000);
});
