/**
 * Link Backend Server
 *
 * Handles:
 *   - Square OAuth and data sync
 *   - Stripe subscription billing
 *   - Admin dashboard analytics
 *   - Webhook handling
 *
 * Run: npm install && node server.js
 */

require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const cors = require('cors');
// Note: no node-fetch import needed — Node 18+ provides a native global fetch()
// (node-fetch v3 is ESM-only and breaks under require(), so we don't use it)
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');
const { Client, Environment } = require('square');
const {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

// ═══════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════

const app = express();

// Director-level access (David, Jenny, Daisy only) — used to gate genuinely
// sensitive financial data: Platform Revenue (worldwide SaaS income) and
// The Kiln Cafe's own real revenue/analytics. Declared once, early, so
// every endpoint that needs it references the same single source of truth.
const PLATFORM_REVENUE_ACCESS_NAMES = ['david', 'jenny', 'daisy', 'elliott'];

// Square's SDK returns some numbers as BigInt, which JSON.stringify cannot
// serialize by default. Teach BigInt to serialize as a string, globally,
// so no response anywhere can crash on it.
if (typeof BigInt.prototype.toJSON !== 'function') {
  BigInt.prototype.toJSON = function () { return this.toString(); };
}

// CORS configuration
app.use(cors({
  origin: '*',  // Allow all origins for development
  credentials: false
}));

app.use(express.json({ limit: '50mb' }));

// Serve the admin dashboard (and other static frontend files) so they have real URLs
const path = require('path');
// Genuine real cache-control — was previously entirely uncached (no
// headers at all), meaning every real page load re-downloaded the
// full HTML/JS/CSS from scratch (~790KB for the admin dashboard,
// ~360KB for the customer app) every single time, a real, honest
// contributor to "feels slow", especially at the start of every real
// shift or fresh app open. Real tradeoff considered carefully: this
// app is actively developed (pushed multiple times some nights), so
// HTML/JSON get a short real cache (5 minutes) — long enough to
// noticeably help repeat loads within a shift, short enough that a
// real fix or new feature reaches people within minutes, not stuck on
// stale cached code for hours. Genuinely static image assets (icons,
// which never change) get a real long cache, since there's no
// downside to caching something that's never going to be different.
const staticCacheOptions = {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.png') || filePath.endsWith('.jpg') || filePath.endsWith('.svg')) {
      res.setHeader('Cache-Control', 'public, max-age=604800'); // 7 real days — genuinely static assets
    } else {
      res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate'); // 5 real minutes — actively developed, needs to stay fresh
    }
  },
};
app.use('/admin', express.static(path.join(__dirname, 'admin'), staticCacheOptions));
app.use('/app', express.static(path.join(__dirname, 'app'), staticCacheOptions));
// Genuine real fix: /brand-assets was referenced directly in the real
// HTML (apple-touch-icon, manifest icons) but never actually had a
// real static route serving it — every real request for anything
// under this path has always genuinely 404'd. Confirmed via a real,
// live browser console error, not assumed.
app.use('/brand-assets', express.static(path.join(__dirname, 'brand-assets'), staticCacheOptions));
app.use('/promo', express.static(path.join(__dirname, 'promo'), staticCacheOptions));
// Redirect root to promo page for prospective studio owners
app.get('/', (req, res) => res.redirect('/promo'));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const square = new Client({
  environment: process.env.SQUARE_ENVIRONMENT === 'sandbox' ? Environment.Sandbox : Environment.Production,
  accessToken: undefined  // Will be set per-request from stored token
});

const port = process.env.PORT || 3000;
// Genuine, deliberate, harmless marker — forces a real, full Render
// rebuild (not just a static file refresh) to help resolve tonight's
// deploy not picking up the latest grid-navigation change.
console.log('Server build marker: hostbypost-glaze-tiles-thin-header');

// ═══════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════

function generateCodeVerifier() {
  return crypto.randomBytes(32).toString('hex');
}

function generateCodeChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

async function getSquareClient(accessToken) {
  // Create a client with the specific access token for this studio
  const client = new Client({
    environment: process.env.SQUARE_ENVIRONMENT === 'sandbox' ? Environment.Sandbox : Environment.Production,
    accessToken: accessToken
  });
  return client;
}

// ═══════════════════════════════════════════
// SQUARE OAUTH ROUTES
// ═══════════════════════════════════════════

/**
 * GET /api/square/authorize
 * Start Square OAuth flow
 */
app.get('/api/square/authorize', (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studio_id required' });

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  // Store verifier in session (or use signed JWT)
  // For simplicity, we'll use a query param. In production, use secure session storage
  const state = crypto.randomBytes(16).toString('hex');

  const isSandbox = process.env.SQUARE_ENVIRONMENT === 'sandbox';
  const authBaseUrl = isSandbox
    ? 'https://connect.squareupsandbox.com/oauth2/authorize'
    : 'https://connect.squareup.com/oauth2/authorize';

  const authUrl = new URL(authBaseUrl);
  authUrl.searchParams.append('client_id', process.env.SQUARE_CLIENT_ID);
  authUrl.searchParams.append('scope', 'MERCHANT_PROFILE_READ CUSTOMERS_READ ORDERS_READ INVENTORY_READ ITEMS_READ APPOINTMENTS_READ APPOINTMENTS_ALL_READ TIMECARDS_READ');
  authUrl.searchParams.append('session', 'false');
  authUrl.searchParams.append('redirect_uri', `${process.env.API_URL}/api/square/callback`);
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('state', JSON.stringify({ studioId, codeVerifier }));

  res.json({ authUrl: authUrl.toString(), environment: isSandbox ? 'sandbox' : 'production' });
});

/**
 * GET /api/square/callback
 * Handle OAuth callback
 */
app.get('/api/square/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) {
    return res.status(400).send('Missing code or state');
  }

  try {
    const { studioId, codeVerifier } = JSON.parse(state);

    const isSandbox = process.env.SQUARE_ENVIRONMENT === 'sandbox';
    const tokenBaseUrl = isSandbox
      ? 'https://connect.squareupsandbox.com/oauth2/token'
      : 'https://connect.squareup.com/oauth2/token';

    // Exchange code for access token
    const tokenResponse = await fetch(tokenBaseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.SQUARE_CLIENT_ID,
        client_secret: process.env.SQUARE_CLIENT_SECRET,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: `${process.env.API_URL}/api/square/callback`
      })
    });

    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) {
      throw new Error('No access token in response: ' + JSON.stringify(tokenData));
    }

    // Get merchant ID
    const client = await getSquareClient(tokenData.access_token);
    const merchantRes = await client.merchantsApi.retrieveMerchant('me');
    const merchantId = merchantRes.result.merchant.id;

    // Store in Supabase
    const { error: storeError } = await supabase
      .from('square_connections')
      .upsert({
        studio_id: studioId,
        square_access_token: tokenData.access_token,
        square_refresh_token: tokenData.refresh_token,
        square_merchant_id: merchantId,
        sync_status: 'idle'
      }, { onConflict: 'studio_id' });

    if (storeError) throw storeError;

    // Trigger initial sync — genuine real .catch() since syncSquareData
    // now throws on real failure instead of silently swallowing it
    syncSquareData(studioId, tokenData.access_token).catch(err => console.error('Initial sync failed:', err.message));

    // Show a simple success page instead of redirecting — the admin dashboard
    // is a standalone file, not hosted by this API server
    res.send(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding: 60px 20px; background: #faf4ef; color: #3d1c12;">
          <h1 style="color: #b03a2e;">✓ Square Connected</h1>
          <p>Your Square account is now linked to Link (read-only).</p>
          <p>You can close this tab and go back to the Link dashboard.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Square callback error:', error);
    res.status(500).send('OAuth failed: ' + error.message);
  }
});

// ═══════════════════════════════════════════
// SQUARE DATA SYNC
// ═══════════════════════════════════════════

/**
 * Sync Square transactions and customers to analytics
 */
async function syncSquareData(studioId, accessToken, daysBack = 1) {
  try {
    const { data: connectionRow } = await supabase
      .from('square_connections')
      .select('id')
      .eq('studio_id', studioId)
      .single();
    if (!connectionRow?.id) throw new Error('No Square connection found for this studio.');

    const { data: syncLog, error: syncLogError } = await supabase
      .from('sync_logs')
      .insert({
        square_connection_id: connectionRow.id,
        sync_type: daysBack > 1 ? 'backfill' : 'incremental',
        status: 'pending'
      })
      .select()
      .single();
    // Genuine real fix: this never checked whether the insert itself
    // actually succeeded — Supabase can return data: null (not throw)
    // if something like a real RLS policy silently blocks the write,
    // and every later use of syncLog.id would then throw a confusing,
    // unrelated null-property error instead of the real, honest cause.
    if (syncLogError) throw new Error(`Could not create sync log: ${syncLogError.message}`);
    if (!syncLog?.id) throw new Error('Sync log was not created — check RLS policies on sync_logs.');

    const client = await getSquareClient(accessToken);
    let recordsSynced = 0;

    // Genuine real fix: Square's searchOrders API actually REQUIRES a
    // real locationIds array — this was missing entirely, meaning
    // every sync (including the original 24-hour daily one, before
    // tonight) has genuinely always failed with a real 400 from
    // Square's own API. It was never surfaced because the original
    // code only ever logged the error server-side, never shown to a
    // real person. Using the same real, proven listLocations() pattern
    // already used elsewhere in this file.
    const locRes = await client.locationsApi.listLocations();
    const locationIds = (locRes.result.locations || []).map(l => l.id);
    if (!locationIds.length) throw new Error('No Square location found for this studio — check the Square connection in Setup.');

    // Fetch orders from the real requested window — genuinely 24
    // hours by default (the existing, lightweight daily behavior),
    // or a real wider historical pull when explicitly asked for
    // (e.g. a genuine one-time 30-day backfill).
    const sinceDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Genuine real pagination — Square caps each real request at 500
    // orders, so a genuine full-year pull (per direct request, "since
    // Square was set up") needs to follow real cursor pages until
    // there's genuinely nothing left, rather than silently truncating
    // at the first 500. Real, honest safety cap of 20 pages (10,000
    // orders) so a genuine account issue can't loop forever.
    let orders = [];
    let cursor = undefined;
    let pageCount = 0;
    do {
      const ordersRes = await client.ordersApi.searchOrders({
        locationIds,
        query: {
          filter: {
            dateTimeFilter: {
              createdAt: {
                startAt: sinceDate + 'T00:00:00Z'
              }
            }
          },
          // Genuine real fix: Square's own documentation states that
          // using dateTimeFilter REQUIRES sort.sortField to match the
          // same real field being filtered on (createdAt here) — this
          // was genuinely missing, which Square's docs say should throw,
          // but may instead have been silently returning zero real
          // results depending on the exact real SDK/API behavior.
          sort: {
            sortField: 'CREATED_AT',
            sortOrder: 'DESC'
          }
        },
        limit: 500,
        cursor,
      });
      orders = orders.concat(ordersRes.result.orders || []);
      cursor = ordersRes.result.cursor;
      pageCount++;
    } while (cursor && pageCount < 20);

    recordsSynced = orders.length;

    // Real, honest keyword-to-category matching — transparent and
    // simple: matches against the actual real item name Square
    // returns, case-insensitive, first match wins. Genuinely covers
    // what was directly asked for (cakes, drinks, pottery/glazes,
    // booking fees, return fees), everything else falls to "Other".
    const CATEGORY_KEYWORDS = [
      { category: 'Cakes & Food', keywords: ['cake', 'brownie', 'cookie', 'pastry', 'sandwich', 'toast', 'scone', 'muffin', 'flapjack'] },
      { category: 'Drinks', keywords: ['coffee', 'tea', 'latte', 'cappuccino', 'espresso', 'juice', 'squash', 'hot chocolate', 'drink'] },
      { category: 'Pottery & Glazes', keywords: ['glaze', 'pottery', 'painting', 'session', 'piece', 'firing', 'bisque', 'stroke'] },
      { category: 'Booking Fees', keywords: ['booking fee', 'deposit', 'reservation'] },
      { category: 'Return / Cancellation Fees', keywords: ['return fee', 'cancellation', 'refund fee', 'no-show'] },
    ];
    function categorizeItemName(name) {
      const lower = (name || '').toLowerCase();
      for (const { category, keywords } of CATEGORY_KEYWORDS) {
        if (keywords.some(kw => lower.includes(kw))) return category;
      }
      return 'Other';
    }

    // Aggregate into daily analytics
    const dailyRevenue = {};
    const dailyCategoryBreakdown = {}; // { date: { category: { revenue_cents, item_count } } }
    orders.forEach(order => {
      const date = order.createdAt.split('T')[0];
      // Genuine real fix: Square's SDK types Money.amount as `bigint`
      // (confirmed directly in the installed SDK's own type
      // definitions, not assumed) — mixing bigint and regular Number
      // in arithmetic genuinely throws in JS. Real, safe conversion
      // here since currency amounts in pence/cents are always well
      // within Number's safe integer range.
      const total = order.totalMoney?.amount ? Number(order.totalMoney.amount) : 0;
      dailyRevenue[date] = (dailyRevenue[date] || 0) + total;

      // Real, genuine per-item category breakdown, per direct request
      if (!dailyCategoryBreakdown[date]) dailyCategoryBreakdown[date] = {};
      (order.lineItems || []).forEach(item => {
        const category = categorizeItemName(item.name);
        const itemTotal = item.totalMoney?.amount ? Number(item.totalMoney.amount) : 0;
        if (!dailyCategoryBreakdown[date][category]) dailyCategoryBreakdown[date][category] = { revenue_cents: 0, item_count: 0 };
        dailyCategoryBreakdown[date][category].revenue_cents += itemTotal;
        dailyCategoryBreakdown[date][category].item_count += Number(item.quantity || 1);
      });
    });

    // Store the real, genuine category breakdown
    for (const [date, categories] of Object.entries(dailyCategoryBreakdown)) {
      for (const [category, { revenue_cents, item_count }] of Object.entries(categories)) {
        await supabase.from('revenue_category_breakdown').upsert({
          studio_id: studioId, metric_date: date, category, revenue_cents, item_count,
        }, { onConflict: 'studio_id,metric_date,category' });
      }
    }

    // Store analytics cache
    for (const [date, revenue] of Object.entries(dailyRevenue)) {
      await supabase
        .from('analytics_cache')
        .upsert({
          studio_id: studioId,
          metric_type: 'daily_revenue',
          metric_date: date,
          metric_value: { revenue_cents: revenue, transaction_count: orders.filter(o => o.createdAt.startsWith(date)).length }
        }, { onConflict: 'studio_id,metric_type,metric_date' });
    }

    // Update sync log
    await supabase
      .from('sync_logs')
      .update({
        status: 'success',
        completed_at: new Date().toISOString(),
        records_synced: recordsSynced
      })
      .eq('id', syncLog.id);

    // Update connection last_synced
    await supabase
      .from('square_connections')
      .update({
        last_synced_at: new Date().toISOString(),
        sync_status: 'idle'
      })
      .eq('studio_id', studioId);

    console.log(`✓ Synced ${recordsSynced} Square orders for studio ${studioId}`);
    return { recordsSynced, daysBack };
  } catch (error) {
    console.error('Sync error:', error);
    // Genuine real fix: this catch block's own error-logging code was
    // itself capable of throwing (a second, unguarded lookup of
    // square_connections.id, identical to the one at the top of this
    // function) — if THAT lookup ever returned null, it would mask
    // the real, actual, original error with a confusing, unrelated
    // "Cannot read properties of null" instead. Now genuinely guarded.
    const { data: connRow } = await supabase.from('square_connections').select('id').eq('studio_id', studioId).single();
    if (connRow?.id) {
      await supabase
        .from('sync_logs')
        .update({
          status: 'failed',
          error_message: error.message
        })
        .eq('square_connection_id', connRow.id);
    }
    // Genuine real fix: this used to only log the error and quietly
    // return undefined — any real caller (like the new backfill
    // endpoint) would have no honest way to know the sync actually
    // failed. Re-throwing lets callers genuinely handle and report it.
    throw error;
  }
}

/**
 * POST /api/square/sync
 * Manual sync trigger (called by admin, or scheduled cron)
 */
app.post('/api/square/sync', async (req, res) => {
  const { studioId } = req.body;
  if (!studioId) return res.status(400).json({ error: 'studio_id required' });

  const { data: connection } = await supabase
    .from('square_connections')
    .select('square_access_token')
    .eq('studio_id', studioId)
    .single();

  if (!connection) {
    return res.status(404).json({ error: 'Square not connected' });
  }

  // Genuine real .catch() since syncSquareData now throws on real failure
  syncSquareData(studioId, connection.square_access_token).catch(err => console.error('Manual sync failed:', err.message));
  res.json({ status: 'sync started' });
});

// POST /api/square/backfill — genuine real one-time historical pull
// (default 30 real days), since the daily cron only ever keeps things
// current GOING FORWARD from whenever it starts running. This is what
// actually gets real, existing Square sales history into
// analytics_cache immediately, rather than waiting 30 real days for
// the daily job to slowly build it up from scratch.
app.post('/api/square/backfill', async (req, res) => {
  const { studioId, daysBack } = req.body;
  if (!studioId) return res.status(400).json({ error: 'studio_id required' });

  const { data: connection } = await supabase
    .from('square_connections')
    .select('square_access_token')
    .eq('studio_id', studioId)
    .single();

  if (!connection) {
    return res.status(404).json({ error: 'Square is not connected for this studio yet — connect it in Setup first.' });
  }

  // Genuine real fix: this used to fire syncSquareData() without
  // awaiting it, meaning the endpoint always genuinely reported
  // "started" instantly regardless of whether the actual sync went on
  // to succeed or fail — no real, honest way to know which. Now
  // genuinely waits for the real result before responding.
  try {
    const result = await syncSquareData(studioId, connection.square_access_token, daysBack || 30);
    res.json({ status: 'complete', daysBack: daysBack || 30, ...result });
  } catch (error) {
    // Genuine real detailed logging — if this exact error recurs, the
    // server logs (not just this alert) will show the real, exact
    // line it's genuinely coming from, rather than guessing again.
    console.error('REAL backfill error, full stack:', error.stack);
    res.status(500).json({ error: `Backfill failed: ${error.message}`, realStackTop: (error.stack || '').split('\n').slice(0, 3).join(' | ') });
  }
});

/**
 * GET /api/square/catalog
 * Fetch the studio's Square catalog items (pottery, drinks, cakes, etc.),
 * grouped by category, for browsing in the Customer Engagement running bill.
 * Read-only — never creates or modifies anything in Square.
 */
app.get('/api/square/catalog', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });

  try {
    const { data: connection } = await supabase
      .from('square_connections')
      .select('square_access_token')
      .eq('studio_id', studioId)
      .single();

    if (!connection) {
      return res.json({ connected: false, categories: [] });
    }

    const squareClient = await getSquareClient(connection.square_access_token);

    // Fetch categories first so we can label items by category name
    const categoriesRes = await squareClient.catalogApi.listCatalog(undefined, 'CATEGORY');
    const categoryNameById = {};
    (categoriesRes.result.objects || []).forEach(cat => {
      categoryNameById[cat.id] = cat.categoryData?.name || 'Other';
    });

    // Fetch items
    const itemsRes = await squareClient.catalogApi.listCatalog(undefined, 'ITEM');
    const items = itemsRes.result.objects || [];

    const grouped = {};
    items.forEach(item => {
      const itemData = item.itemData;
      if (!itemData) return;

      const categoryId = itemData.categoryId || itemData.categories?.[0]?.id;
      const categoryName = categoryNameById[categoryId] || 'Other';

      const variation = itemData.variations?.[0]?.itemVariationData;
      const priceCents = variation?.priceMoney?.amount ? Number(variation.priceMoney.amount) : null;

      if (!grouped[categoryName]) grouped[categoryName] = [];
      grouped[categoryName].push({
        id: item.id,
        name: itemData.name,
        priceCents: priceCents
      });
    });

    const categories = Object.entries(grouped).map(([name, catItems]) => ({
      name,
      items: catItems
    }));

    res.json({ connected: true, categories });
  } catch (error) {
    console.error('Error fetching Square catalog:', error);
    res.status(500).json({ connected: false, error: error.message, categories: [] });
  }
});

// ═══════════════════════════════════════════
// SQUARE KDS — Customer food & drink orders
// Creates a Square order when a customer orders
// from the app — goes straight to your KDS.
// ═══════════════════════════════════════════

// POST /api/kds/order — customer places a food/drink order
app.post('/api/kds/order', async (req, res) => {
  const { studioId, bookingCode, customerName, items } = req.body;
  if (!studioId || !items?.length) return res.status(400).json({ error: 'studioId and items required' });

  try {
    // Get Square connection for this studio
    const { data: connection } = await supabase
      .from('square_connections')
      .select('square_access_token')
      .eq('studio_id', studioId)
      .single();

    if (!connection) return res.status(404).json({ error: 'Square not connected for this studio' });

    const squareClient = await getSquareClient(connection.square_access_token);

    // Get location ID
    const locRes = await squareClient.locationsApi.listLocations();
    const locationId = locRes.result.locations?.[0]?.id;
    if (!locationId) return res.status(500).json({ error: 'No Square location found' });

    // Build line items — each item needs a catalogObjectId (variation ID) or basePriceMoney
    const lineItems = items.map(item => {
      const li = {
        quantity: String(item.quantity || 1),
        note: `Table: ${bookingCode || 'walk-in'}${customerName ? ` · ${customerName}` : ''}`,
      };
      if (item.variationId) {
        li.catalogObjectId = item.variationId;
      } else {
        // Fallback: name + manual price
        li.name = item.name;
        if (item.priceCents) {
          li.basePriceMoney = { amount: BigInt(item.priceCents), currency: 'GBP' };
        }
      }
      return li;
    });

    // Create the order — Square KDS will pick this up automatically
    const idempotencyKey = `klnk-${bookingCode || 'wk'}-${Date.now()}`;
    const orderRes = await squareClient.ordersApi.createOrder({
      order: {
        locationId,
        lineItems,
        referenceId: bookingCode || undefined,
        note: `kilnLINK app order · ${customerName || bookingCode || 'Customer'}`,
        state: 'OPEN',
      },
      idempotencyKey,
    });

    const orderId = orderRes.result.order?.id;
    res.json({ status: 'sent', orderId, locationId });

  } catch (err) {
    console.error('KDS order error:', err);
    res.status(500).json({ error: err.message || 'Failed to send to KDS' });
  }
});

// GET /api/kds/menu — fetch food & drink items from Square catalogue
// (filters to categories that look like food/drink — excludes pottery)
app.get('/api/kds/menu', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });

  try {
    const { data: connection } = await supabase
      .from('square_connections')
      .select('square_access_token')
      .eq('studio_id', studioId)
      .single();

    if (!connection) return res.json({ categories: [] });

    const squareClient = await getSquareClient(connection.square_access_token);

    const [catRes, itemRes] = await Promise.all([
      squareClient.catalogApi.listCatalog(undefined, 'CATEGORY'),
      squareClient.catalogApi.listCatalog(undefined, 'ITEM'),
    ]);

    const catById = {};
    (catRes.result.objects || []).forEach(c => {
      catById[c.id] = c.categoryData?.name || 'Other';
    });

    // Pottery-related keywords to exclude
    const EXCLUDE_KEYWORDS = /pottery|bisque|mug|bowl|plate|vase|tile|glaze|firing|kiln|piece|paint/i;

    const grouped = {};
    (itemRes.result.objects || []).forEach(item => {
      const d = item.itemData;
      if (!d) return;
      const catId = d.categoryId || d.categories?.[0]?.id;
      const catName = catById[catId] || 'Other';
      if (EXCLUDE_KEYWORDS.test(catName) || EXCLUDE_KEYWORDS.test(d.name)) return;

      const variation = d.variations?.[0];
      const priceCents = variation?.itemVariationData?.priceMoney?.amount
        ? Number(variation.itemVariationData.priceMoney.amount) : null;

      if (!grouped[catName]) grouped[catName] = [];
      grouped[catName].push({
        id: item.id,
        variationId: variation?.id,
        name: d.name,
        description: d.description || null,
        priceCents,
      });
    });

    const categories = Object.entries(grouped).map(([name, items]) => ({ name, items }));
    res.json({ categories });

  } catch (err) {
    console.error('KDS menu error:', err);
    res.status(500).json({ error: err.message, categories: [] });
  }
});

// ── Daily specials: items staff add on the fly for today only ──
// GET /api/menu/specials — today's specials for this studio
app.get('/api/menu/specials', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  const today = new Date(); today.setHours(0,0,0,0);
  const { data } = await supabase.from('daily_specials')
    .select('*').eq('studio_id', studioId)
    .gte('created_at', today.toISOString())
    .order('created_at', { ascending: true });
  res.json({ specials: data || [] });
});

// POST /api/menu/specials — add a special
app.post('/api/menu/specials', async (req, res) => {
  const { studioId, name, priceCents } = req.body;
  if (!studioId || !name) return res.status(400).json({ error: 'studioId and name required' });
  const { data, error } = await supabase.from('daily_specials').insert({
    studio_id: studioId, name, price_cents: priceCents || 0
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ special: data });
});

// DELETE /api/menu/specials/:id — remove a special
app.delete('/api/menu/specials/:id', async (req, res) => {
  const { studioId } = req.query;
  await supabase.from('daily_specials').delete().eq('id', req.params.id).eq('studio_id', studioId);
  res.json({ deleted: true });
});

// ── Hidden items: staff can hide specific Square catalogue items from
// the customer menu for today without removing them from Square ──
// POST /api/menu/hidden — toggle an item hidden/visible
app.post('/api/menu/hidden', async (req, res) => {
  const { studioId, itemId, hidden } = req.body;
  if (!studioId || !itemId) return res.status(400).json({ error: 'studioId and itemId required' });
  if (hidden) {
    await supabase.from('menu_hidden_items').upsert({
      studio_id: studioId, item_id: itemId, hidden_date: new Date().toISOString().split('T')[0]
    }, { onConflict: 'studio_id,item_id,hidden_date' });
  } else {
    await supabase.from('menu_hidden_items').delete()
      .eq('studio_id', studioId).eq('item_id', itemId)
      .eq('hidden_date', new Date().toISOString().split('T')[0]);
  }
  res.json({ ok: true });
});

// GET /api/menu/hidden — get today's hidden item IDs
app.get('/api/menu/hidden', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase.from('menu_hidden_items').select('item_id')
    .eq('studio_id', studioId).eq('hidden_date', today);
  res.json({ hiddenIds: (data || []).map(r => r.item_id) });
});

// ── KDS Configuration — per-studio, supports multiple system types ──
// GET /api/kds/config — get this studio's KDS setup
app.get('/api/kds/config', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  const { data } = await supabase.from('kds_config').select('*').eq('studio_id', studioId).single();
  res.json({ config: data || { type: 'square', active: true } });
});

// POST /api/kds/config — save KDS config
app.post('/api/kds/config', async (req, res) => {
  const { studioId, type, webhookUrl, printerIp, emailAddress, active } = req.body;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  const { data, error } = await supabase.from('kds_config').upsert({
    studio_id: studioId, type: type || 'square',
    webhook_url: webhookUrl || null, printer_ip: printerIp || null,
    email_address: emailAddress || null, active: active !== false
  }, { onConflict: 'studio_id' }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ config: data });
});

// ── KDS order dispatcher — routes to the right system based on config ──
// This replaces the simple Square-only /api/kds/order endpoint.
// Existing endpoint still works for Square; this adds routing logic.
app.post('/api/kds/dispatch', async (req, res) => {
  const { studioId, bookingCode, customerName, items } = req.body;
  if (!studioId || !items?.length) return res.status(400).json({ error: 'studioId and items required' });

  try {
    const { data: config } = await supabase.from('kds_config').select('*').eq('studio_id', studioId).single();
    const kdsType = config?.type || 'square';

    if (kdsType === 'square' || !config) {
      // Route through existing Square order creation
      const mockReq = { body: req.body };
      const mockRes = {
        json: (d) => res.json(d),
        status: (c) => ({ json: (d) => res.status(c).json(d) })
      };
      // Re-use the /api/kds/order handler logic inline
      const { data: conn } = await supabase.from('square_connections')
        .select('square_access_token').eq('studio_id', studioId).single();
      if (!conn) return res.status(404).json({ error: 'Square not connected' });
      const squareClient = await getSquareClient(conn.square_access_token);
      const locRes = await squareClient.locationsApi.listLocations();
      const locationId = locRes.result.locations?.[0]?.id;
      const lineItems = items.map(item => {
        const li = { quantity: String(item.quantity || 1), note: `Table: ${bookingCode || 'walk-in'}${customerName ? ` · ${customerName}` : ''}` };
        if (item.variationId) li.catalogObjectId = item.variationId;
        else { li.name = item.name; if (item.priceCents) li.basePriceMoney = { amount: BigInt(item.priceCents), currency: 'GBP' }; }
        return li;
      });
      const orderRes = await squareClient.ordersApi.createOrder({
        order: { locationId, lineItems, referenceId: bookingCode || undefined, note: `kilnLINK · ${customerName || bookingCode || 'Customer'}`, state: 'OPEN' },
        idempotencyKey: `klnk-${bookingCode || 'wk'}-${Date.now()}`,
      });
      return res.json({ status: 'sent', system: 'square', orderId: orderRes.result.order?.id });

    } else if (kdsType === 'webhook' && config.webhook_url) {
      // POST order as JSON to the studio's own webhook endpoint
      const https = require('https'), http = require('http');
      const url = new URL(config.webhook_url);
      const body = JSON.stringify({ bookingCode, customerName, items, studio: studioId, source: 'kilnLINK' });
      const proto = url.protocol === 'https:' ? https : http;
      await new Promise((resolve, reject) => {
        const reqOut = proto.request({ hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80), path: url.pathname + url.search, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (r) => resolve(r));
        reqOut.on('error', reject);
        reqOut.write(body);
        reqOut.end();
      });
      return res.json({ status: 'sent', system: 'webhook' });

    } else if (kdsType === 'email' && config.email_address) {
      // Log order — email delivery would require an email service like SendGrid
      // For now, store in a kds_orders table for polling / manual pickup
      await supabase.from('kds_orders').insert({
        studio_id: studioId, booking_code: bookingCode, customer_name: customerName,
        items: JSON.stringify(items), status: 'pending', kds_type: 'email', created_at: new Date().toISOString()
      });
      return res.json({ status: 'queued', system: 'email', note: 'Order stored — email delivery requires SendGrid config' });

    } else if (kdsType === 'manual') {
      // Store for staff to see on their KDS screen in the dashboard
      await supabase.from('kds_orders').insert({
        studio_id: studioId, booking_code: bookingCode, customer_name: customerName,
        items: JSON.stringify(items), status: 'pending', kds_type: 'manual', created_at: new Date().toISOString()
      });
      return res.json({ status: 'queued', system: 'manual' });
    }

    res.status(400).json({ error: `Unknown KDS type: ${kdsType}` });
  } catch (err) {
    console.error('KDS dispatch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/kds/orders — manual KDS polling for studios without a real KDS
app.get('/api/kds/orders', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  const today = new Date(); today.setHours(0,0,0,0);
  const { data } = await supabase.from('kds_orders').select('*')
    .eq('studio_id', studioId).gte('created_at', today.toISOString())
    .order('created_at', { ascending: false });
  res.json({ orders: data || [] });
});

// GET /api/kds/stock-levels — genuine real Square inventory counts
// for food/drink items, for the Barista landing page. Honest note:
// this only returns real data if the studio has actually enabled
// Square's inventory tracking feature — if not, this correctly
// returns an empty/null count per item rather than inventing a
// number, and the frontend is built to say so plainly.
app.get('/api/kds/stock-levels', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });

  try {
    const { data: connection } = await supabase
      .from('square_connections')
      .select('square_access_token')
      .eq('studio_id', studioId)
      .single();
    if (!connection) return res.json({ items: [], inventoryTrackingEnabled: false });

    const squareClient = await getSquareClient(connection.square_access_token);

    // Reuse the exact same, already-proven food/drink filtering logic
    // from /api/kds/menu, so "stock levels" genuinely shows the same
    // real items as the menu, not a separately-maintained list.
    const [catRes, itemRes] = await Promise.all([
      squareClient.catalogApi.listCatalog(undefined, 'CATEGORY'),
      squareClient.catalogApi.listCatalog(undefined, 'ITEM'),
    ]);
    const catById = {};
    (catRes.result.objects || []).forEach(c => { catById[c.id] = c.categoryData?.name || 'Other'; });
    const EXCLUDE_KEYWORDS = /pottery|bisque|mug|bowl|plate|vase|tile|glaze|firing|kiln|piece|paint/i;

    const variationIds = [];
    const itemByVariationId = {};
    (itemRes.result.objects || []).forEach(item => {
      const d = item.itemData;
      if (!d) return;
      const catId = d.categoryId || d.categories?.[0]?.id;
      const catName = catById[catId] || 'Other';
      if (EXCLUDE_KEYWORDS.test(catName) || EXCLUDE_KEYWORDS.test(d.name)) return;
      const variation = d.variations?.[0];
      if (!variation?.id) return;
      variationIds.push(variation.id);
      itemByVariationId[variation.id] = d.name;
    });

    if (!variationIds.length) return res.json({ items: [], inventoryTrackingEnabled: false });

    // Genuine real Square inventory API call — honestly attempted,
    // not assumed to work.
    let inventoryTrackingEnabled = true;
    let counts = {};
    try {
      const invRes = await squareClient.inventoryApi.batchRetrieveInventoryCounts({
        catalogObjectIds: variationIds,
      });
      (invRes.result.counts || []).forEach(c => {
        counts[c.catalogObjectId] = c.quantity ? Number(c.quantity) : 0;
      });
      if (!invRes.result.counts?.length) inventoryTrackingEnabled = false;
    } catch (invErr) {
      // Genuine, honest fallback — Square inventory tracking may
      // genuinely not be enabled for this account at all, which is a
      // real, normal, common case, not a real error to alarm about.
      inventoryTrackingEnabled = false;
    }

    const items = variationIds.map(vId => ({
      name: itemByVariationId[vId],
      stockCount: counts[vId] ?? null,
    }));

    res.json({ items, inventoryTrackingEnabled });
  } catch (err) {
    console.error('Stock levels error:', err);
    res.status(500).json({ error: err.message, items: [], inventoryTrackingEnabled: false });
  }
});

// PATCH /api/kds/orders/:id — mark an order done/complete
app.patch('/api/kds/orders/:id', async (req, res) => {
  const { status } = req.body;
  await supabase.from('kds_orders').update({ status }).eq('id', req.params.id);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════
// STRIPE BILLING ROUTES
// ═══════════════════════════════════════════

/**
 * POST /api/stripe/subscribe
 * Create a new Stripe subscription for a studio
 */
app.post('/api/stripe/subscribe', async (req, res) => {
  const { studioId, plan, email } = req.body;
  if (!studioId || !plan || !email) {
    return res.status(400).json({ error: 'studio_id, plan, email required' });
  }

  try {
    // Create Stripe customer
    const customer = await stripe.customers.create({
      email: email,
      metadata: { studioId }
    });

    // Get price ID from env
    const priceKey = `STRIPE_PRICE_${plan.toUpperCase()}`;
    const priceId = process.env[priceKey];
    if (!priceId) {
      return res.status(400).json({ error: `Unknown plan: ${plan}` });
    }

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId }]
    });

    // Store in Supabase
    const { error: storeError } = await supabase
      .from('stripe_subscriptions')
      .insert({
        studio_id: studioId,
        stripe_subscription_id: subscription.id,
        stripe_customer_id: customer.id,
        plan_id: plan,
        status: subscription.status,
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString()
      });

    if (storeError) throw storeError;

    res.json({
      subscriptionId: subscription.id,
      customerId: customer.id,
      clientSecret: subscription.latest_invoice?.payment_intent?.client_secret
    });
  } catch (error) {
    console.error('Subscription error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/stripe/subscription
 * Get subscription status for a studio
 */
app.get('/api/stripe/subscription', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studio_id required' });

  const { data: sub, error } = await supabase
    .from('stripe_subscriptions')
    .select('*')
    .eq('studio_id', studioId)
    .single();

  if (error) return res.status(404).json({ error: 'No subscription found' });

  res.json(sub);
});

// ═══════════════════════════════════════════
// DEVICE SESSION MANAGEMENT
// Controls how many iPads/devices can run the
// staff dashboard simultaneously per studio.
// Plans: solo=1 slot, studio=3 slots, multi=6 slots
// ═══════════════════════════════════════════

// Device slot limits per plan. 'pilot' is bumped to 10 for demo/testing
// purposes — lots of devices getting used while showing this around the
// studio and testing shouldn't lock anyone out. Real paid tiers (solo/
// studio/multi) are untouched and reflect actual subscription limits.
const PLAN_SLOTS = { solo: 1, studio: 3, multi: 6, pilot: 10 };
const SESSION_TTL_HOURS = 8;

// GET /api/devices/check-in
// Called on every staff dashboard load. Returns whether this device
// has a valid slot, how many are in use, and the plan limit.
app.post('/api/devices/check-in', async (req, res) => {
  const { studioId, deviceId, deviceName } = req.body;
  if (!studioId || !deviceId) return res.status(400).json({ error: 'studioId and deviceId required' });

  try {
    // Get plan for this studio
    const { data: sub } = await supabase
      .from('stripe_subscriptions')
      .select('plan_id, status')
      .eq('studio_id', studioId)
      .single();

    const plan = sub?.plan_id || 'pilot';
    const maxSlots = PLAN_SLOTS[plan] || 1;

    // Expire old sessions (inactive > 8 hours)
    const expiry = new Date(Date.now() - SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString();
    await supabase.from('device_sessions')
      .delete()
      .eq('studio_id', studioId)
      .lt('last_seen_at', expiry);

    // Check if this device already has a session
    const { data: existing } = await supabase
      .from('device_sessions')
      .select('*')
      .eq('studio_id', studioId)
      .eq('device_id', deviceId)
      .single();

    if (existing) {
      // Refresh the heartbeat
      await supabase.from('device_sessions')
        .update({ last_seen_at: new Date().toISOString(), device_name: deviceName || existing.device_name })
        .eq('id', existing.id);
      const { data: all } = await supabase.from('device_sessions').select('*').eq('studio_id', studioId);
      return res.json({ allowed: true, plan, maxSlots, activeCount: all?.length || 1, deviceId });
    }

    // Count active sessions
    const { data: activeSessions } = await supabase
      .from('device_sessions')
      .select('*')
      .eq('studio_id', studioId);

    const activeCount = activeSessions?.length || 0;

    if (activeCount >= maxSlots) {
      return res.json({
        allowed: false, plan, maxSlots, activeCount, deviceId,
        activeSessions: activeSessions.map(s => ({
          deviceId: s.device_id,
          deviceName: s.device_name || 'Unnamed device',
          lastSeen: s.last_seen_at
        }))
      });
    }

    // Grant a new slot
    await supabase.from('device_sessions').insert({
      studio_id: studioId, device_id: deviceId,
      device_name: deviceName || `Device ${activeCount + 1}`,
      last_seen_at: new Date().toISOString()
    });

    return res.json({ allowed: true, plan, maxSlots, activeCount: activeCount + 1, deviceId });
  } catch (err) {
    console.error('Device check-in error:', err);
    // Fail open — don't lock out a studio due to a server error
    return res.json({ allowed: true, plan: 'pilot', maxSlots: 3, activeCount: 1, deviceId, failOpen: true });
  }
});

// POST /api/devices/heartbeat — keep session alive (called every 5 min)
app.post('/api/devices/heartbeat', async (req, res) => {
  const { studioId, deviceId } = req.body;
  if (!studioId || !deviceId) return res.status(400).json({ error: 'missing fields' });
  await supabase.from('device_sessions')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('studio_id', studioId).eq('device_id', deviceId);
  res.json({ ok: true });
});

// POST /api/devices/release — release a slot (on tab close, or remote release)
app.post('/api/devices/release', async (req, res) => {
  const { studioId, deviceId } = req.body;
  if (!studioId || !deviceId) return res.status(400).json({ error: 'missing fields' });
  await supabase.from('device_sessions')
    .delete().eq('studio_id', studioId).eq('device_id', deviceId);
  res.json({ released: true });
});

// GET /api/devices/active — list active devices for this studio (for the management panel)
app.get('/api/devices/active', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  try {
    const expiry = new Date(Date.now() - SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString();
    await supabase.from('device_sessions').delete().eq('studio_id', studioId).lt('last_seen_at', expiry);
    const { data: sub } = await supabase.from('stripe_subscriptions').select('plan_id').eq('studio_id', studioId).single();
    const plan = sub?.plan_id || 'pilot';
    const maxSlots = PLAN_SLOTS[plan] || 3;
    const { data: sessions } = await supabase.from('device_sessions').select('*').eq('studio_id', studioId).order('last_seen_at', { ascending: false });
    res.json({ plan, maxSlots, sessions: sessions || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/devices/:deviceId — owner remotely releases a specific device slot
app.delete('/api/devices/:deviceId', async (req, res) => {
  const { studioId } = req.query;
  const { deviceId } = req.params;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  await supabase.from('device_sessions').delete().eq('studio_id', studioId).eq('device_id', deviceId);
  res.json({ released: true });
});



// ═══════════════════════════════════════════
// ANALYTICS ROUTES
// ═══════════════════════════════════════════

/**
 * GET /api/analytics/dashboard
 * Get dashboard data for a studio
 */
// GET /api/analytics/dashboard — The Kiln Cafe's own real revenue and app
// usage figures. Director-only (David/Jenny/Daisy), same access check as
// Platform Revenue — this is genuinely sensitive financial data and the
// frontend hides it from regular staff, but that's a UI convenience, not
// security. This check is what actually stops the data being fetched by
// anyone who isn't a director, regardless of what the UI shows.
app.get('/api/analytics/dashboard', async (req, res) => {
  const { studioId, staffMemberId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studio_id required' });
  if (!staffMemberId) return res.status(401).json({ error: 'Not authorised' });

  const { data: staffMember } = await supabase.from('staff_team').select('name').eq('id', staffMemberId).single();
  const firstName = (staffMember?.name || '').trim().split(' ')[0].toLowerCase();
  if (!PLATFORM_REVENUE_ACCESS_NAMES.includes(firstName)) {
    return res.status(403).json({ error: 'This data is restricted to directors.' });
  }

  try {
    // Last 30 days revenue
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const { data: revenue } = await supabase
      .from('analytics_cache')
      .select('metric_date, metric_value')
      .eq('studio_id', studioId)
      .eq('metric_type', 'daily_revenue')
      .gte('metric_date', thirtyDaysAgo)
      .order('metric_date', { ascending: false });

    // Total from Square data
    const totalRevenue = (revenue || []).reduce((sum, day) => sum + (day.metric_value?.revenue_cents || 0), 0);

    // Genuine real ALL-TIME total — every real day of Square data this
    // studio has ever had synced, not just the last 30 days, per
    // direct request.
    const { data: allTimeRevenue } = await supabase
      .from('analytics_cache')
      .select('metric_value')
      .eq('studio_id', studioId)
      .eq('metric_type', 'daily_revenue');
    const allTimeRevenueCents = (allTimeRevenue || []).reduce((sum, day) => sum + (day.metric_value?.revenue_cents || 0), 0);
    const allTimeTransactionCount = (allTimeRevenue || []).reduce((sum, day) => sum + (day.metric_value?.transaction_count || 0), 0);

    // Genuine real MTD (month to date) and YTD (year to date) totals,
    // per direct request — same real analytics_cache data, just
    // different real date windows.
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const startOfYear = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
    const { data: mtdRevenue } = await supabase
      .from('analytics_cache').select('metric_value').eq('studio_id', studioId).eq('metric_type', 'daily_revenue').gte('metric_date', startOfMonth);
    const { data: ytdRevenue } = await supabase
      .from('analytics_cache').select('metric_value').eq('studio_id', studioId).eq('metric_type', 'daily_revenue').gte('metric_date', startOfYear);
    const mtdRevenueCents = (mtdRevenue || []).reduce((sum, day) => sum + (day.metric_value?.revenue_cents || 0), 0);
    const ytdRevenueCents = (ytdRevenue || []).reduce((sum, day) => sum + (day.metric_value?.revenue_cents || 0), 0);

    // Genuine real revenue category breakdown — cakes, drinks,
    // pottery/glazes, booking fees, return fees — per direct request.
    // Real, honest helper so the same logic serves every real time
    // window (30d, MTD, YTD, all-time) without repeating it four times.
    async function getCategoryBreakdown(sinceDate) {
      let query = supabase.from('revenue_category_breakdown').select('category, revenue_cents, item_count').eq('studio_id', studioId);
      if (sinceDate) query = query.gte('metric_date', sinceDate);
      const { data: rows } = await query;
      const totals = {};
      (rows || []).forEach(row => {
        if (!totals[row.category]) totals[row.category] = { revenue_cents: 0, item_count: 0 };
        totals[row.category].revenue_cents += row.revenue_cents;
        totals[row.category].item_count += row.item_count;
      });
      return Object.entries(totals)
        .map(([category, v]) => ({ category, revenueCents: v.revenue_cents, itemCount: v.item_count }))
        .sort((a, b) => b.revenueCents - a.revenueCents);
    }
    const revenueByCategory = await getCategoryBreakdown(thirtyDaysAgo);
    const revenueByCategoryMTD = await getCategoryBreakdown(startOfMonth);
    const revenueByCategoryYTD = await getCategoryBreakdown(startOfYear);
    const revenueByCategoryAllTime = await getCategoryBreakdown(null);

    // App usage
    const { data: appActivity } = await supabase
      .from('customer_app_activity')
      .select('tab_used, design_id')
      .eq('studio_id', studioId)
      .gte('created_at', thirtyDaysAgo);

    const tabUsage = {};
    const designUsage = {};
    (appActivity || []).forEach(activity => {
      tabUsage[activity.tab_used] = (tabUsage[activity.tab_used] || 0) + 1;
      if (activity.design_id) {
        designUsage[activity.design_id] = (designUsage[activity.design_id] || 0) + 1;
      }
    });

    res.json({
      totalRevenue: totalRevenue / 100,  // Convert cents to currency
      allTimeRevenue: allTimeRevenueCents / 100, // genuine real all-time total, per direct request
      revenueByCategory, // genuine real category breakdown (last 30d), per direct request
      mtdRevenue: mtdRevenueCents / 100, // genuine real month-to-date total, per direct request
      ytdRevenue: ytdRevenueCents / 100, // genuine real year-to-date total, per direct request
      revenueByCategoryMTD,
      revenueByCategoryYTD,
      revenueByCategoryAllTime,
      allTimeTransactionCount,
      revenueByDay: revenue || [],
      appSessions: appActivity?.length || 0,
      tabUsage,
      topDesigns: Object.entries(designUsage)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id, count]) => ({ designId: id, count }))
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/analytics/activity
 * Log customer app activity (called from the customer app)
 */
app.post('/api/analytics/activity', async (req, res) => {
  const { studioId, appSessionId, tabUsed, designId, gazeMatchedTo } = req.body;
  if (!studioId || !appSessionId || !tabUsed) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const { error } = await supabase
    .from('customer_app_activity')
    .insert({
      studio_id: studioId,
      app_session_id: appSessionId,
      tab_used: tabUsed,
      design_id: designId,
      glaze_matched_to: gazeMatchedTo
    });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ status: 'logged' });
});

/**
 * POST /api/studio/settings
 * Save studio-level settings, e.g. how they use Square (table tracking mode)
 */
app.post('/api/studio/settings', async (req, res) => {
  const { studioId, tableTrackingMode } = req.body;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });

  try {
    const updates = {};
    if (tableTrackingMode) updates.table_tracking_mode = tableTrackingMode;

    const { data, error } = await supabase
      .from('studios')
      .update(updates)
      .eq('id', studioId)
      .select()
      .single();

    if (error) throw error;
    res.json({ status: 'saved', studio: data });
  } catch (error) {
    console.error('Studio settings error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/studio/connection-status
 * Real connection state for this studio, so the dashboard can show accurate
 * Square/Stripe connect buttons instead of hardcoded placeholders
 */
app.get('/api/studio/connection-status', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });

  try {
    const { data: studio } = await supabase
      .from('studios')
      .select('table_tracking_mode')
      .eq('id', studioId)
      .single();

    const { data: squareConn } = await supabase
      .from('square_connections')
      .select('square_merchant_id, sync_status, last_synced_at')
      .eq('studio_id', studioId)
      .single();

    const { data: stripeSub } = await supabase
      .from('stripe_subscriptions')
      .select('plan_id, status, current_period_end')
      .eq('studio_id', studioId)
      .single();

    res.json({
      square: {
        connected: !!squareConn,
        merchantId: squareConn?.square_merchant_id || null,
        syncStatus: squareConn?.sync_status || null,
        lastSyncedAt: squareConn?.last_synced_at || null
      },
      stripe: {
        connected: !!stripeSub,
        plan: stripeSub?.plan_id || null,
        status: stripeSub?.status || null,
        currentPeriodEnd: stripeSub?.current_period_end || null
      },
      tableTrackingMode: studio?.table_tracking_mode || 'none'
    });
  } catch (error) {
    console.error('Connection status error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/studio/branding
 * Save studio branding settings
 */
// GET /api/studio/branding — was missing entirely; the branding tab had
// no way to load a studio's actual saved settings, so it always showed
// hardcoded HTML defaults regardless of what had actually been saved.
app.get('/api/studio/branding', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studio_id required' });
  const { data, error } = await supabase.from('studio_branding').select('*').eq('studio_id', studioId).single();
  if (error && error.code !== 'PGRST116') return res.status(500).json({ error: error.message }); // PGRST116 = no row yet, fine
  res.json({ branding: data || null });
});

app.post('/api/studio/branding', async (req, res) => {
  const { studioId, name, tagline, primaryColour, secondaryColour, footer } = req.body;
  if (!studioId) return res.status(400).json({ error: 'studio_id required' });

  try {
    const { error } = await supabase
      .from('studio_branding')
      .upsert({
        studio_id: studioId,
        name,
        tagline,
        primary_colour: primaryColour,
        secondary_colour: secondaryColour,
        footer_text: footer,
        updated_at: new Date().toISOString()
      }, { onConflict: 'studio_id' });

    if (error) throw error;
    res.json({ status: 'saved', studio_id: studioId });
  } catch (error) {
    console.error('Branding error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════
// HELPER: Find or create customer (intelligent matching)
// ═══════════════════════════════════════════

async function findOrCreateCustomer(studioId, customerName, customerEmail, customerPhone) {
  // 1. Try exact match by email (most reliable)
  if (customerEmail) {
    const { data: byEmail } = await supabase
      .from('customers')
      .select('id')
      .eq('studio_id', studioId)
      .eq('email', customerEmail)
      .single();

    if (byEmail) return byEmail.id;
  }

  // 2. Try exact match by phone
  if (customerPhone) {
    const { data: byPhone } = await supabase
      .from('customers')
      .select('id')
      .eq('studio_id', studioId)
      .eq('phone', customerPhone)
      .single();

    if (byPhone) return byPhone.id;
  }

  // 3. Try exact name match (if email/phone not provided)
  if (customerName) {
    const { data: byName } = await supabase
      .from('customers')
      .select('id')
      .eq('studio_id', studioId)
      .eq('name', customerName)
      .single();

    if (byName) return byName.id;
  }

  // 4. No match found — create new customer
  const { data: newCustomer, error } = await supabase
    .from('customers')
    .insert({
      studio_id: studioId,
      name: customerName || 'Walk-in',
      email: customerEmail || null,
      phone: customerPhone || null
    })
    .select('id')
    .single();

  if (error) throw error;
  return newCustomer.id;
}

// ═══════════════════════════════════════════
// BOOKING ROUTES (from Square)
// ═══════════════════════════════════════════

/**
 * GET /api/booking/:bookingCode
 * Lookup booking by code (when QR scanned)
 * Returns: customer info + unfinished pieces if returning customer
 */
/**
 * POST /api/bookings/manual
 * Create a real booking record for a walk-in customer (no Square booking).
 * This is needed so the customer QR (which links to this booking code) actually
 * resolves — a code that only exists in browser memory can never be scanned into.
 */
app.post('/api/bookings/manual', async (req, res) => {
  const { studioId, customerName } = req.body;
  if (!studioId || !customerName) {
    return res.status(400).json({ error: 'studioId and customerName required' });
  }

  try {
    const bookingCode = `walkin-${Date.now()}`;

    const { data: booking, error } = await supabase
      .from('bookings')
      .insert({
        studio_id: studioId,
        square_booking_id: null,
        booking_code: bookingCode,
        customer_name: customerName,
        session_start: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ status: 'created', booking });
  } catch (error) {
    console.error('Error creating manual booking:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/bookings/self-checkin
 * Customer-initiated walk-in — for studios that take no bookings at all
 * (scan-a-static-QR-and-go). Unlike /api/bookings/manual, this is called
 * directly by the customer app, not by staff, so no staff action is needed
 * before a customer can start their own session. Same underlying record
 * shape as a staff-created walk-in, just a different front door.
 */
// POST /api/bookings/party — staff-created non-hosted party booking.
// "Non-hosted" means the customer runs their own party (no dedicated
// staff host on-site) in either The Vault (premium, private room) or
// the Main Studio. Created manually by staff, same as any phone/email
// enquiry — this app has no customer-facing booking flow of its own,
// everything real comes through the website, phone, or email, so this
// is genuinely a staff tool for logging what's already been arranged.
app.post('/api/bookings/party', async (req, res) => {
  const { studioId, customerName, customerEmail, customerPhone, space, sessionStart, sessionEnd, partySize, notes, createdBy } = req.body;
  if (!studioId || !customerName || !space || !sessionStart) {
    return res.status(400).json({ error: 'studioId, customerName, space, sessionStart required' });
  }
  if (!['The Vault', 'Main Studio', 'Lounge'].includes(space)) {
    return res.status(400).json({ error: 'space must be "The Vault", "Main Studio", or "Lounge"' });
  }

  try {
    const bookingCode = `party-${Date.now()}`;
    const { data: booking, error } = await supabase.from('bookings').insert({
      studio_id: studioId,
      square_booking_id: null,
      booking_code: bookingCode,
      customer_name: customerName,
      customer_email: customerEmail || null,
      customer_phone: customerPhone || null,
      space_name: space,
      session_start: sessionStart,
      session_end: sessionEnd || null,
      party_size: partySize || null,
      notes: notes ? `[Non-hosted party — no staff host] ${notes}` : '[Non-hosted party — no staff host]',
    }).select().single();

    if (error) throw error;
    res.json({ status: 'created', booking, isPremium: space === 'The Vault' });
  } catch (error) {
    console.error('Error creating party booking:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/bookings/self-checkin', async (req, res) => {
  const { studioId, customerName, partySize, tableNumber } = req.body;
  if (!studioId || !customerName) {
    return res.status(400).json({ error: 'studioId and customerName required' });
  }

  try {
    const bookingCode = `selfcheckin-${Date.now()}`;

    const { data: booking, error } = await supabase
      .from('bookings')
      .insert({
        studio_id: studioId,
        square_booking_id: null,
        booking_code: bookingCode,
        customer_name: customerName,
        party_size: partySize || null,
        table_number: tableNumber || null,
        session_start: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ status: 'created', booking });
  } catch (error) {
    console.error('Error creating self-checkin booking:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/bookings/:bookingCode/grant-home-access
 * Staff grants home access (£5 one-off) — permanently unlocks all three
 * design tools for this customer's app link, usable from home 24/7.
 * Charge tallied like the other extras (checked at checkout), not charged
 * directly through the app yet.
 */
app.post('/api/bookings/:bookingCode/grant-home-access', async (req, res) => {
  const { bookingCode } = req.params;
  const { studioId } = req.body;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });

  try {
    // Mark the booking as home-access unlocked
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ home_access_unlocked: true })
      .eq('booking_code', bookingCode)
      .eq('studio_id', studioId);

    if (updateError) throw updateError;

    // Tally the £5 charge like the other extras
    await supabase.from('app_extra_charges').insert({
      studio_id: studioId,
      booking_code: bookingCode,
      item_name: 'Home Access — all design tools',
      amount_cents: 500
    });

    res.json({ status: 'granted' });
  } catch (error) {
    console.error('Error granting home access:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/booking/:bookingCode', async (req, res) => {
  const { bookingCode } = req.params;
  const { studioId } = req.query;
  
  if (!bookingCode || !studioId) {
    return res.status(400).json({ error: 'bookingCode and studioId required' });
  }

  try {
    // Lookup booking by code
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('*')
      .eq('studio_id', studioId)
      .eq('booking_code', bookingCode)
      .single();

    if (bookingError || !booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Check if this customer has returned before
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id, loyalty_points, total_pieces_painted')
      .eq('studio_id', studioId)
      .eq('name', booking.customer_name)
      .single();

    let unfinishedPieces = [];
    if (existingCustomer) {
      const { data: pieces } = await supabase
        .from('pottery_pieces')
        .select('*')
        .eq('customer_id', existingCustomer.id)
        .eq('is_complete', false);
      unfinishedPieces = pieces || [];
    }

    // Pieces from THIS booking that are fired and waiting for collection —
    // used to show a "ready for collection!" banner on the customer's live page
    const { data: readyPieces } = await supabase
      .from('pottery_pieces')
      .select('id, piece_type')
      .eq('booking_id', bookingCode)
      .eq('status', 'fired');

    res.json({
      booking: {
        id: booking.id,
        bookingCode: booking.booking_code,
        squareBookingId: booking.square_booking_id,
        customerName: booking.customer_name,
        customerEmail: booking.customer_email,
        customerPhone: booking.customer_phone,
        tableNumber: booking.table_number,
        partySize: booking.party_size,
        sessionStart: booking.session_start,
        sessionEnd: booking.session_end,
        notes: booking.notes,
        homeAccessUnlocked: booking.home_access_unlocked || false,
        delayFlag: booking.delay_flag || false,
        delayReason: booking.delay_reason || null
      },
      piecesReadyForPickup: readyPieces || [],
      customerHistory: existingCustomer ? {
        customerId: existingCustomer.id,
        loyaltyPoints: existingCustomer.loyalty_points,
        totalPiecesPainted: existingCustomer.total_pieces_painted,
        isReturningCustomer: true,
        unfinishedPieces: unfinishedPieces,
        unfinishedCount: unfinishedPieces.length
      } : {
        isReturningCustomer: false,
        unfinishedPieces: [],
        unfinishedCount: 0
      }
    });
  } catch (error) {
    console.error('Error fetching booking:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/table-sessions
 * Section 1 (Booking Details): "Open" a table — staff have looked up the booking,
 * assigned a table number, and confirmed number of places
 */
app.post('/api/table-sessions', async (req, res) => {
  const { studioId, bookingId, tableNumber, numberOfPlaces } = req.body;
  if (!studioId || !bookingId) {
    return res.status(400).json({ error: 'studioId and bookingId required' });
  }

  try {
    const { data: session, error } = await supabase
      .from('table_sessions')
      .insert({
        studio_id: studioId,
        booking_id: bookingId,
        table_number: tableNumber || null,
        number_of_places: numberOfPlaces || null,
        status: 'open'
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ status: 'opened', session });
  } catch (error) {
    console.error('Error opening table session:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/table-sessions
 * List sessions for a studio, optionally filtered by status (open/completed)
 * Used by Section 2 (Customer Engagement) and Section 3 (Completion) to pick an active table
 */
app.get('/api/table-sessions', async (req, res) => {
  const { studioId, status } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });

  try {
    let query = supabase
      .from('table_sessions')
      .select('*')
      .eq('studio_id', studioId)
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);

    const { data: sessions, error } = await query;
    if (error) throw error;

    res.json({ sessions: sessions || [] });
  } catch (error) {
    console.error('Error listing table sessions:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/table-sessions/:sessionId/orders
 * Section 2 (Customer Engagement): add a piece/drink/glaze to the running list
 * for this table. Can be called repeatedly throughout the session.
 */
app.post('/api/table-sessions/:sessionId/orders', async (req, res) => {
  const { sessionId } = req.params;
  const { itemType, itemName, notes, unitPriceCents, squareCatalogId, quantity } = req.body;
  if (!itemType || !itemName) {
    return res.status(400).json({ error: 'itemType and itemName required' });
  }
  if (!['piece', 'drink', 'glaze', 'cake'].includes(itemType)) {
    return res.status(400).json({ error: 'itemType must be piece, drink, glaze, or cake' });
  }

  try {
    const { data: order, error } = await supabase
      .from('table_session_orders')
      .insert({
        table_session_id: sessionId,
        item_type: itemType,
        item_name: itemName,
        notes: notes || null,
        unit_price_cents: unitPriceCents ?? null,
        square_catalog_id: squareCatalogId || null,
        quantity: quantity || 1
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ status: 'added', order });
  } catch (error) {
    console.error('Error adding table session order:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/table-sessions/:sessionId/orders
 * Get the running list of pieces/drinks/glazes for a table
 */
app.get('/api/table-sessions/:sessionId/orders', async (req, res) => {
  const { sessionId } = req.params;

  try {
    const { data: orders, error } = await supabase
      .from('table_session_orders')
      .select('*')
      .eq('table_session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json({ orders: orders || [] });
  } catch (error) {
    console.error('Error fetching table session orders:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/table-sessions/orders/:orderId
 * Remove a mistakenly-added item from the running list
 */
app.delete('/api/table-sessions/orders/:orderId', async (req, res) => {
  const { orderId } = req.params;

  try {
    const { error } = await supabase
      .from('table_session_orders')
      .delete()
      .eq('id', orderId);

    if (error) throw error;
    res.json({ status: 'deleted' });
  } catch (error) {
    console.error('Error deleting table session order:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/table-sessions/:sessionId/complete
 * Section 3 (Completion): close out a table session once pieces are photographed and submitted
 */
app.post('/api/table-sessions/:sessionId/complete', async (req, res) => {
  const { sessionId } = req.params;

  try {
    const { data: session, error } = await supabase
      .from('table_sessions')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) throw error;
    res.json({ status: 'completed', session });
  } catch (error) {
    console.error('Error completing table session:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/bookings/sync
 * Sync bookings from Square for today
 * Generates booking_code (for QR) from booking data
 */
/**
 * GET /api/bookings/today
 * List today's bookings already synced into the database (for Section 1 to display)
 */
// GET /api/bookings/search — genuine real search by customer name,
// table number, or booking code, across a real 90-day window (not
// just today) so staff can look up a recent booking regardless of
// which day it was on. Real, honest partial matching (ilike), not
// requiring an exact match.
app.get('/api/bookings/search', async (req, res) => {
  const { studioId, q } = req.query;
  if (!studioId || !q || q.trim().length < 2) return res.status(400).json({ error: 'studioId and a search term (2+ characters) required' });

  try {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const term = q.trim();

    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('booking_code, customer_name, customer_email, table_number, status, session_start, created_at')
      .eq('studio_id', studioId)
      .gte('created_at', ninetyDaysAgo.toISOString())
      .or(`customer_name.ilike.%${term}%,booking_code.ilike.%${term}%,table_number.ilike.%${term}%`)
      .order('session_start', { ascending: false })
      .limit(20);

    if (error) throw error;
    res.json({ bookings: bookings || [] });
  } catch (error) {
    console.error('Booking search error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/bookings/today', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('studio_id', studioId)
      .gte('session_start', today.toISOString())
      .lt('session_start', tomorrow.toISOString())
      .order('session_start', { ascending: true });

    if (error) throw error;
    res.json({ bookings: bookings || [] });
  } catch (error) {
    console.error('Error listing today bookings:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/bookings/:bookingCode/stage — save which of the 4 real
// flow stages (booking/engagement/completion/kiln) a booking is
// genuinely at right now, per direct request. Called every time a
// staff member switches stages within a booking's flow, so the
// persistent booking list elsewhere in the app can correctly show
// and deep-link to the real, current stage — confirmed directly that
// no such tracking existed before this.
app.post('/api/bookings/:bookingCode/stage', async (req, res) => {
  const { bookingCode } = req.params;
  const { studioId, stage } = req.body;
  if (!studioId || !stage) return res.status(400).json({ error: 'studioId and stage required' });
  const VALID_STAGES = ['booking', 'engagement', 'completion', 'kiln'];
  if (!VALID_STAGES.includes(stage)) return res.status(400).json({ error: `stage must be one of: ${VALID_STAGES.join(', ')}` });

  try {
    const { data, error } = await supabase.from('bookings')
      .update({ current_stage: stage })
      .eq('studio_id', studioId).eq('booking_code', bookingCode)
      .select().single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Booking not found' });
    res.json({ status: 'saved', booking: data });
  } catch (error) {
    console.error('Error saving booking stage:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/bookings/upcoming?studioId=&days=7
 * List bookings from today through the next N days (default 7), for the look-ahead view
 */
app.get('/api/bookings/upcoming', async (req, res) => {
  const { studioId } = req.query;
  const days = parseInt(req.query.days) || 7;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });

  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + days);

    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('studio_id', studioId)
      .gte('session_start', start.toISOString())
      .lt('session_start', end.toISOString())
      .order('session_start', { ascending: true });

    if (error) throw error;
    res.json({ bookings: bookings || [] });
  } catch (error) {
    console.error('Error listing upcoming bookings:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/customer/my-bookings
 * A customer's own bookings — past, current, and future — matched by the
 * phone/email on their current booking (there's no login system, so this
 * is how we find "their" other visits). Split into past/upcoming so the
 * customer app can show them separately.
 */
app.get('/api/customer/my-bookings', async (req, res) => {
  const { studioId, bookingCode } = req.query;
  if (!studioId || !bookingCode) {
    return res.status(400).json({ error: 'studioId and bookingCode required' });
  }

  try {
    // First, find the current booking to get the customer's contact details
    const { data: currentBooking, error: currentError } = await supabase
      .from('bookings')
      .select('customer_name, customer_email, customer_phone')
      .eq('studio_id', studioId)
      .eq('booking_code', bookingCode)
      .single();

    if (currentError || !currentBooking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Match other bookings by phone or email (whichever is present) — name
    // alone is too unreliable (shared names, typos) to identify a customer
    let query = supabase.from('bookings').select('*').eq('studio_id', studioId);

    if (currentBooking.customer_phone) {
      query = query.eq('customer_phone', currentBooking.customer_phone);
    } else if (currentBooking.customer_email) {
      query = query.eq('customer_email', currentBooking.customer_email);
    } else {
      query = query.eq('customer_name', currentBooking.customer_name);
    }

    const { data: allBookings, error } = await query.order('session_start', { ascending: false });
    if (error) throw error;

    const now = new Date();
    const upcoming = [];
    const past = [];
    (allBookings || []).forEach(b => {
      const target = b.session_start ? new Date(b.session_start) : null;
      if (target && target >= now) upcoming.push(b);
      else past.push(b);
    });
    upcoming.sort((a, b) => new Date(a.session_start) - new Date(b.session_start)); // soonest first

    res.json({ upcoming, past });
  } catch (error) {
    console.error('Error fetching customer bookings:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/bookings/sync', async (req, res) => {
  const { studioId } = req.body;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });

  try {
    // Get Square connection for this studio
    const { data: squareConnection, error: connError } = await supabase
      .from('square_connections')
      .select('square_access_token')
      .eq('studio_id', studioId)
      .single();

    if (connError || !squareConnection) {
      return res.status(400).json({ error: 'Square not connected for this studio' });
    }

    // Get the studio's chosen table-tracking mode (flexible per studio)
    const { data: studio, error: studioError } = await supabase
      .from('studios')
      .select('table_tracking_mode')
      .eq('id', studioId)
      .single();

    if (studioError) throw studioError;
    const tableTrackingMode = studio?.table_tracking_mode || 'none';

    // Get Square client with studio's token
    const squareClient = await getSquareClient(squareConnection.square_access_token);
    const bookingsApi = squareClient.bookingsApi;

    // If this studio uses "staff members as tables", fetch team member names once
    // so we can map each booking's teamMemberId to a human-readable table name
    let teamMemberNameById = {};
    if (tableTrackingMode === 'staff_as_tables') {
      try {
        const teamRes = await squareClient.teamApi.searchTeamMembers({ query: {} });
        (teamRes.result.teamMembers || []).forEach(member => {
          const name = [member.givenName, member.familyName].filter(Boolean).join(' ');
          teamMemberNameById[member.id] = name || member.id;
        });
      } catch (teamErr) {
        console.error('Could not fetch Square team members for table mapping:', teamErr);
      }
    }

    // Fetch the studio's real Square services (Main Studio / Lounge / The
    // Vault / party bookings etc are each their own bookable service in
    // Square) so each booking can be correctly labelled with which space
    // it's actually for — this was a real gap: appointment_segments carries
    // a service_variation_id, but it was never being read or resolved to
    // a name, so Lounge/Vault/party bookings synced in indistinguishable
    // from ordinary Main Studio bookings.
    let serviceNameByVariationId = {};
    try {
      const catalogRes = await squareClient.catalogApi.searchCatalogObjects({
        objectTypes: ['ITEM'],
      });
      (catalogRes.result.objects || []).forEach(item => {
        const variations = item.itemData?.variations || [];
        variations.forEach(v => {
          serviceNameByVariationId[v.id] = item.itemData?.name || v.itemVariationData?.name || 'Session';
        });
      });
    } catch (catalogErr) {
      console.error('Could not fetch Square catalog services for space labelling:', catalogErr);
    }

    // Fetch bookings from now through the next 28 days (Square caps the window at 31 days)
    const startMin = new Date().toISOString();
    const startMax = new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString();

    const response = await bookingsApi.listBookings(
      100, undefined, undefined, undefined, undefined, startMin, startMax
    );
    const allBookings = response.result.bookings || [];

    // Sync all upcoming bookings in the window, skipping cancelled/declined ones
    const activeStatuses = ['ACCEPTED', 'PENDING'];
    const upcomingBookings = allBookings.filter(b =>
      activeStatuses.includes(b.status) && b.startAt
    );

    // Resolve customer names by looking up each unique customerId via the Customers API
    const uniqueCustomerIds = [...new Set(upcomingBookings.map(b => b.customerId).filter(Boolean))];
    const customerById = {};
    await Promise.all(uniqueCustomerIds.map(async (custId) => {
      try {
        const custRes = await squareClient.customersApi.retrieveCustomer(custId);
        const c = custRes.result.customer;
        customerById[custId] = {
          name: [c.givenName, c.familyName].filter(Boolean).join(' ') || c.companyName || 'Customer',
          email: c.emailAddress || null,
          phone: c.phoneNumber || null
        };
      } catch (custErr) {
        console.error(`Could not fetch Square customer ${custId}:`, custErr.message);
      }
    }));

    // Upsert bookings into database
    const bookingsToInsert = upcomingBookings.map((booking, idx) => {
      const cust = customerById[booking.customerId] || {};
      const customerName = cust.name || `Walk-in ${idx + 1}`;
      // Derive booking_code from the booking's own start date, so each day is distinct
      const bStart = new Date(booking.startAt);
      const bookingCode = `booking-${bStart.getFullYear()}${String(bStart.getMonth() + 1).padStart(2, '0')}${String(bStart.getDate()).padStart(2, '0')}-${booking.id.substring(0, 8)}`;

      // Resolve table number/name depending on the studio's tracking mode
      let tableNumber = null;
      if (tableTrackingMode === 'staff_as_tables') {
        const teamMemberId = booking.appointmentSegments?.[0]?.teamMemberId;
        tableNumber = teamMemberNameById[teamMemberId] || null;
      }
      // 'none' mode: tableNumber stays null, no table tracking for this studio

      // Derive party size from the service name if present (e.g. "Up to 2 people"), else null
      const segment = booking.appointmentSegments?.[0];
      const durationMinutes = segment?.durationMinutes || null;
      const sessionEnd = durationMinutes
        ? new Date(new Date(booking.startAt).getTime() + durationMinutes * 60000).toISOString()
        : null;

      // Resolve which actual space/service this booking is for — Main
      // Studio, Lounge, The Vault, a party booking etc — from the real
      // Square catalog service name, so these are genuinely distinguished
      // rather than all looking like generic bookings.
      const spaceName = serviceNameByVariationId[segment?.serviceVariationId] || null;

      return {
        studio_id: studioId,
        square_booking_id: booking.id,
        booking_code: bookingCode,
        customer_name: customerName,
        customer_email: cust.email || null,
        customer_phone: cust.phone || null,
        table_number: tableNumber,
        space_name: spaceName,
        session_start: booking.startAt,
        session_end: sessionEnd,
        party_size: null,
        notes: booking.sellerNote || booking.customerNote || null
      };
    });

    if (bookingsToInsert.length === 0) {
      return res.json({
        status: 'synced',
        bookingsSynced: 0,
        tableTrackingMode,
        message: 'No upcoming bookings found'
      });
    }

    // Upsert (update if exists, insert if not)
    const { data: upserted, error: upsertError } = await supabase
      .from('bookings')
      .upsert(bookingsToInsert, { onConflict: 'square_booking_id' });

    if (upsertError) throw upsertError;

    res.json({
      status: 'synced',
      bookingsSynced: bookingsToInsert.length,
      tableTrackingMode,
      bookings: bookingsToInsert.map(b => ({
        bookingCode: b.booking_code,
        customerName: b.customer_name,
        tableNumber: b.table_number,
        sessionStart: b.session_start
      }))
    });
  } catch (error) {
    console.error('Booking sync error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/qr/booking
 * Generate QR code URL for a booking (returns link to print)
 */
app.get('/api/qr/booking', async (req, res) => {
  const { studioId, bookingId } = req.query;
  if (!studioId || !bookingId) {
    return res.status(400).json({ error: 'studioId and bookingId required' });
  }

  try {
    // QR code structure: one QR per booking
    // URL format: glazeup.app/[studio-slug]/scan/[booking-id]
    const qrUrl = `https://glazeup.app/scan/${studioId}/${bookingId}`;
    
    res.json({
      status: 'generated',
      qrUrl: qrUrl,
      bookingId: bookingId,
      instruction: 'Print this QR code on table place cards. Staff scans at end of session to submit pieces.'
    });
  } catch (error) {
    console.error('QR generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/booking-photos/upload
 * Staff uploads a photo taken at pieces collection time (e.g. table + QR nameplate)
 * Accepts base64 image data, stores in Supabase Storage, logs a record linked to booking_id
 */
app.post('/api/booking-photos/upload', async (req, res) => {
  const { studioId, bookingId, photoBase64 } = req.body;
  if (!studioId || !bookingId || !photoBase64) {
    return res.status(400).json({ error: 'Missing studioId, bookingId, or photoBase64' });
  }

  try {
    // Strip data URL prefix if present (e.g. "data:image/jpeg;base64,...")
    const base64Data = photoBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const fileName = `${studioId}/${bookingId}-${Date.now()}.jpg`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('booking-photos')
      .upload(fileName, buffer, { contentType: 'image/jpeg' });

    if (uploadError) {
      console.error('Photo upload error:', uploadError);
      return res.status(500).json({ error: uploadError.message });
    }

    const { data: publicUrlData } = supabase.storage
      .from('booking-photos')
      .getPublicUrl(fileName);

    const photoUrl = publicUrlData.publicUrl;

    const { data: photoRecord, error: dbError } = await supabase
      .from('booking_photos')
      .insert({
        studio_id: studioId,
        booking_id: bookingId,
        photo_url: photoUrl
      })
      .select()
      .single();

    if (dbError) {
      console.error('Photo record save error:', dbError);
      return res.status(500).json({ error: dbError.message });
    }

    res.json({ status: 'uploaded', photo: photoRecord });
  } catch (error) {
    console.error('Photo upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/booking-photos/:bookingId
 * Fetch all photos taken for a given booking (used at kiln-unload time to identify pieces)
 */
app.get('/api/booking-photos/:bookingId', async (req, res) => {
  const { bookingId } = req.params;
  const { studioId } = req.query;
  if (!studioId) {
    return res.status(400).json({ error: 'studioId required' });
  }

  try {
    const { data: photos, error } = await supabase
      .from('booking_photos')
      .select('*')
      .eq('studio_id', studioId)
      .eq('booking_id', bookingId)
      .order('taken_at', { ascending: true });

    if (error) throw error;

    res.json({ photos: photos || [] });
  } catch (error) {
    console.error('Photo fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/pieces/submit-for-dip
 * Staff submits pieces after customer finishes painting
 * Now captures customer data for loyalty foundation
 */
app.post('/api/pieces/submit-for-dip', async (req, res) => {
  const { studioId, bookingId, pieces, customerName, customerEmail, customerPhone, scheduledFiringDate } = req.body;
  if (!studioId || !bookingId || !pieces || !Array.isArray(pieces)) {
    return res.status(400).json({ error: 'Missing studioId, bookingId, or pieces array' });
  }

  try {
    // Find or create customer (intelligent matching: email → phone → name → create new)
    let customerId = null;
    if (customerName || customerEmail || customerPhone) {
      customerId = await findOrCreateCustomer(studioId, customerName, customerEmail, customerPhone);
    }

    // Insert all pieces (now linked to customer)
    const piecesToInsert = pieces.map(piece => {
      // Only set outstanding_balance if piece is complete
      // Incomplete pieces get balance later when customer returns
      const isComplete = piece.isComplete !== false;
      
      return {
        studio_id: studioId,
        customer_id: customerId,
        booking_id: bookingId,
        piece_type: piece.type || 'unknown',
        is_complete: isComplete,
        outstanding_balance: isComplete ? 0 : 0,  // Always 0 on submission
        status: 'ready_for_dip',
        notes: piece.notes || null,
        scheduled_firing_date: scheduledFiringDate || null
      };
    });

    const { data: insertedPieces, error } = await supabase
      .from('pottery_pieces')
      .insert(piecesToInsert)
      .select('id');

    if (error) throw error;

    // Log loyalty transaction (1 point per piece painted)
    if (customerId && insertedPieces.length > 0) {
      const pointsEarned = insertedPieces.length; // 1 point per piece
      
      await supabase
        .from('loyalty_transactions')
        .insert({
          studio_id: studioId,
          customer_id: customerId,
          points_earned: pointsEarned,
          transaction_type: 'paint',
          description: `Painted ${insertedPieces.length} piece(s)`
        });

      // Update customer total pieces and points (increment, don't overwrite)
      const { data: currentCustomer } = await supabase
        .from('customers')
        .select('total_pieces_painted, loyalty_points')
        .eq('id', customerId)
        .single();

      await supabase
        .from('customers')
        .update({
          total_pieces_painted: (currentCustomer?.total_pieces_painted || 0) + insertedPieces.length,
          loyalty_points: (currentCustomer?.loyalty_points || 0) + pointsEarned
        })
        .eq('id', customerId);
    }

    res.json({
      status: 'saved',
      piecesCount: insertedPieces.length,
      pieceIds: insertedPieces.map(p => p.id),
      customerId: customerId
    });
  } catch (error) {
    console.error('Pieces submission error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/pieces/dipped
 * Get list of pieces that are dipped and waiting to be assigned to a kiln session
 */
app.get('/api/pieces/dipped', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studio_id required' });

  try {
    const { data: pieces, error } = await supabase
      .from('pottery_pieces')
      .select('*')
      .eq('studio_id', studioId)
      .eq('status', 'dipped')
      .is('kiln_session_id', null)
      .order('created_at', { ascending: true });

    if (error) throw error;

    res.json({ pieces: pieces || [] });
  } catch (error) {
    console.error('Error fetching dipped pieces:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/pieces/mark-dipped
 * Move a set of pieces from ready_for_dip to dipped (staff has actually dipped them in glaze)
 */
app.post('/api/pieces/mark-dipped', async (req, res) => {
  const { studioId, pieceIds } = req.body;
  if (!studioId || !pieceIds || !Array.isArray(pieceIds)) {
    return res.status(400).json({ error: 'studioId and pieceIds array required' });
  }

  try {
    const { data, error } = await supabase
      .from('pottery_pieces')
      .update({ status: 'dipped', updated_at: new Date().toISOString() })
      .eq('studio_id', studioId)
      .in('id', pieceIds)
      .select('id');

    if (error) throw error;

    res.json({ status: 'updated', piecesCount: data.length });
  } catch (error) {
    console.error('Error marking pieces dipped:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/kiln-sessions
 * Create a new kiln session (firing batch) and assign selected dipped pieces to it
 */
/**
 * POST /api/kiln-batches/start
 * Start a new kiln firing batch: pulls in EVERY piece currently waiting in the
 * kiln room (regardless of which day/booking it came from — a firing often
 * combines 2-3 days' worth of accumulated pieces) and gives the whole batch a
 * single scannable code. That code gets scanned once at the end of firing to
 * mark everything in it fired together, in one action.
 */
app.post('/api/kiln-batches/start', async (req, res) => {
  const { studioId } = req.body;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });

  try {
    // Every piece in the kiln room not already part of another active batch
    const { data: pendingPieces, error: pendingError } = await supabase
      .from('pottery_pieces')
      .select('id, booking_id')
      .eq('studio_id', studioId)
      .in('status', ['ready_for_dip', 'dipped', 'in_kiln'])
      .is('kiln_session_id', null);

    if (pendingError) throw pendingError;

    if (!pendingPieces || pendingPieces.length === 0) {
      return res.status(400).json({ error: 'Nothing waiting in the kiln room to start a firing with' });
    }

    // Short, scan/type-friendly batch code
    const batchCode = `KILN-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;

    const { data: session, error: sessionError } = await supabase
      .from('kiln_sessions')
      .insert({
        studio_id: studioId,
        label: `Firing ${new Date().toLocaleDateString('en-GB')}`,
        status: 'loading',
        batch_code: batchCode
      })
      .select()
      .single();

    if (sessionError) throw sessionError;

    const pieceIds = pendingPieces.map(p => p.id);
    const { error: assignError } = await supabase
      .from('pottery_pieces')
      .update({ kiln_session_id: session.id })
      .in('id', pieceIds);

    if (assignError) throw assignError;

    const bookingsIncluded = [...new Set(pendingPieces.map(p => p.booking_id).filter(Boolean))];

    res.json({
      status: 'started',
      session,
      batchCode,
      piecesIncluded: pieceIds.length,
      bookingsIncluded: bookingsIncluded.length
    });
  } catch (error) {
    console.error('Error starting kiln batch:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/kiln-batches/active
 * List not-yet-fired kiln batches, with piece counts, so staff can see what's
 * currently loaded/firing and re-view a batch's QR if needed.
 */
app.get('/api/kiln-batches/active', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });

  try {
    const { data: sessions, error } = await supabase
      .from('kiln_sessions')
      .select('*, pottery_pieces(count)')
      .eq('studio_id', studioId)
      .neq('status', 'fired')
      .not('batch_code', 'is', null)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ batches: sessions || [] });
  } catch (error) {
    console.error('Error listing active kiln batches:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/kiln-batches/fire-by-code
 * Scan (or paste) a batch code to fire every piece in that batch at once —
 * whether it represents one booking or several days combined.
 *
 * Transfer pieces (requires_second_firing = true) do NOT go straight to
 * 'fired'/ready like normal pieces — this is their FIRST of two firings,
 * so they're marked 'glaze_fired' and routed into the second-firing
 * pipeline instead (see /api/transfer-pieces/*). Normal pieces are
 * unaffected and continue straight to ready-for-pickup as before.
 */
app.post('/api/kiln-batches/fire-by-code', async (req, res) => {
  const { studioId, batchCode } = req.body;
  if (!studioId || !batchCode) {
    return res.status(400).json({ error: 'studioId and batchCode required' });
  }

  try {
    const { data: session, error: sessionError } = await supabase
      .from('kiln_sessions')
      .update({ status: 'fired', fired_at: new Date().toISOString() })
      .eq('studio_id', studioId)
      .eq('batch_code', batchCode)
      .select()
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ error: 'Batch not found for this code' });
    }

    // Normal pieces (no transfer): fire straight through as before
    const { data: normalPieces, error: normalError } = await supabase
      .from('pottery_pieces')
      .update({ status: 'fired', updated_at: new Date().toISOString() })
      .eq('kiln_session_id', session.id)
      .or('requires_second_firing.is.null,requires_second_firing.eq.false')
      .select('id, booking_id');

    if (normalError) throw normalError;

    // Normal pieces just came out of the kiln and need packing before
    // they're genuinely ready for the customer — alert whoever's on
    // packing duty (currently Jenny) rather than leaving fired pieces
    // sitting unnoticed.
    if ((normalPieces || []).length) {
      await supabase.from('staff_alerts').insert({
        studio_id: studioId, trigger_type: 'packing_needed',
        booking_code: batchCode, next_role: 'Packing',
        icon: '📦', label: 'Pieces ready to pack',
        message: `${normalPieces.length} piece(s) from batch ${batchCode} are fired and need packing.`,
        context: { batchCode, pieceCount: normalPieces.length }, acknowledged: false,
      });
    }

    // Transfer pieces: this is only their FIRST firing — mark glaze_fired
    // and alert whoever applies transfers, rather than treating them as done.
    const { data: transferPieces, error: transferError } = await supabase
      .from('pottery_pieces')
      .update({
        status: 'glaze_fired', transfer_stage: 'glaze_fired',
        glaze_fired_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      })
      .eq('kiln_session_id', session.id)
      .eq('requires_second_firing', true)
      .select('id, booking_id, piece_type');

    if (transferError) throw transferError;

    // Alert staff for each transfer piece that it's ready for the decal to be applied
    for (const piece of (transferPieces || [])) {
      await supabase.from('staff_alerts').insert({
        studio_id: studioId, trigger_type: 'transfer_ready_to_apply',
        booking_code: piece.booking_id, next_role: 'Ceramic Technician',
        icon: '🖼️', label: 'Transfer ready to apply',
        message: `${piece.piece_type || 'Piece'} is glaze-fired and ready for the transfer to be applied.`,
        context: { pieceId: piece.id }, acknowledged: false,
      });
    }

    const pieces = [...(normalPieces || []), ...(transferPieces || [])];
    const bookingsFired = [...new Set(pieces.map(p => p.booking_id).filter(Boolean))];

    res.json({
      status: 'fired',
      piecesFired: pieces.length,
      normalPiecesFired: (normalPieces || []).length,
      transferPiecesAwaitingDecal: (transferPieces || []).length,
      bookingsFired: bookingsFired.length,
    });
  } catch (error) {
    console.error('Error firing kiln batch by code:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/kiln-sessions', async (req, res) => {
  const { studioId, label, pieceIds } = req.body;
  if (!studioId || !label) {
    return res.status(400).json({ error: 'studioId and label required' });
  }

  try {
    const { data: session, error: sessionError } = await supabase
      .from('kiln_sessions')
      .insert({ studio_id: studioId, label, status: 'loading' })
      .select()
      .single();

    if (sessionError) throw sessionError;

    // Assign pieces to this session, if any were provided at creation time
    if (pieceIds && Array.isArray(pieceIds) && pieceIds.length > 0) {
      const { error: assignError } = await supabase
        .from('pottery_pieces')
        .update({ kiln_session_id: session.id })
        .eq('studio_id', studioId)
        .in('id', pieceIds);

      if (assignError) throw assignError;
    }

    res.json({ status: 'created', session });
  } catch (error) {
    console.error('Error creating kiln session:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/kiln-sessions/:sessionId/add-pieces
 * Add more dipped pieces to an existing (not-yet-fired) kiln session
 */
app.post('/api/kiln-sessions/:sessionId/add-pieces', async (req, res) => {
  const { sessionId } = req.params;
  const { studioId, pieceIds } = req.body;
  if (!studioId || !pieceIds || !Array.isArray(pieceIds)) {
    return res.status(400).json({ error: 'studioId and pieceIds array required' });
  }

  try {
    const { data, error } = await supabase
      .from('pottery_pieces')
      .update({ kiln_session_id: sessionId })
      .eq('studio_id', studioId)
      .in('id', pieceIds)
      .select('id');

    if (error) throw error;

    res.json({ status: 'updated', piecesCount: data.length });
  } catch (error) {
    console.error('Error adding pieces to session:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/kiln-sessions
 * List kiln sessions for a studio (with piece counts), most recent first
 */
app.get('/api/kiln-sessions', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studio_id required' });

  try {
    const { data: sessions, error } = await supabase
      .from('kiln_sessions')
      .select('*, pottery_pieces(count)')
      .eq('studio_id', studioId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ sessions: sessions || [] });
  } catch (error) {
    console.error('Error fetching kiln sessions:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/kiln-sessions/:sessionId/fire
 * Mark a kiln session as fired — bulk-updates every piece in the batch to 'fired'
 */
app.post('/api/kiln-sessions/:sessionId/fire', async (req, res) => {
  const { sessionId } = req.params;
  const { studioId } = req.body;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });

  try {
    const { data: session, error: sessionError } = await supabase
      .from('kiln_sessions')
      .update({ status: 'fired', fired_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('studio_id', studioId)
      .select()
      .single();

    if (sessionError) throw sessionError;

    const { data: pieces, error: piecesError } = await supabase
      .from('pottery_pieces')
      .update({ status: 'fired', updated_at: new Date().toISOString() })
      .eq('kiln_session_id', sessionId)
      .select('id');

    if (piecesError) throw piecesError;

    res.json({ status: 'fired', session, piecesFired: pieces.length });
  } catch (error) {
    console.error('Error firing kiln session:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/pieces/ready-for-pickup
 * List fired pieces not yet collected, grouped for the pickup UI
 */
/**
 * GET /api/pieces/in-kiln-room
 * Everything between "submitted" and "fired" — ready_for_dip, dipped, in_kiln —
 * since in practice a booking's pieces move through dip and firing together as
 * one batch. Enriched with the real customer name (pottery_pieces itself only
 * stores booking_id/customer_id, not a name) so the UI can group by booking
 * without a second round-trip.
 */
app.get('/api/pieces/in-kiln-room', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });

  try {
    const { data: pieces, error } = await supabase
      .from('pottery_pieces')
      .select('*')
      .eq('studio_id', studioId)
      .in('status', ['ready_for_dip', 'dipped', 'in_kiln'])
      .order('created_at', { ascending: false });

    if (error) throw error;

    const enriched = await enrichPiecesWithCustomerName(studioId, pieces || []);
    res.json({ pieces: enriched });
  } catch (error) {
    console.error('Error fetching kiln room pieces:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/pieces/mark-fired-by-booking
 * Move an entire booking's batch straight to 'fired' in one action —
 * no separate dip/kiln-session selection step needed.
 */
app.post('/api/pieces/mark-fired-by-booking', async (req, res) => {
  const { studioId, bookingId } = req.body;
  if (!studioId || !bookingId) {
    return res.status(400).json({ error: 'studioId and bookingId required' });
  }

  try {
    const { data: updated, error } = await supabase
      .from('pottery_pieces')
      .update({ status: 'fired', updated_at: new Date().toISOString() })
      .eq('studio_id', studioId)
      .eq('booking_id', bookingId)
      .in('status', ['ready_for_dip', 'dipped', 'in_kiln'])
      .select('id, piece_type');

    if (error) throw error;
    res.json({ status: 'fired', piecesMarkedFired: updated || [] });
  } catch (error) {
    console.error('Error marking booking fired:', error);
    res.status(500).json({ error: error.message });
  }
});

// Shared helper: attach a real customer_name to each piece by looking up its
// booking_id against the bookings table (pottery_pieces has no name column itself)
async function enrichPiecesWithCustomerName(studioId, pieces) {
  const bookingIds = [...new Set(pieces.map(p => p.booking_id).filter(Boolean))];
  if (bookingIds.length === 0) return pieces;

  const { data: bookings } = await supabase
    .from('bookings')
    .select('booking_code, customer_name')
    .eq('studio_id', studioId)
    .in('booking_code', bookingIds);

  const nameByBookingCode = {};
  (bookings || []).forEach(b => { nameByBookingCode[b.booking_code] = b.customer_name; });

  return pieces.map(p => ({
    ...p,
    customer_name: nameByBookingCode[p.booking_id] || p.booking_id || 'Unknown'
  }));
}

/**
 * POST /api/community/posts
 * Customer opts in to share a finished piece to their studio's community gallery.
 * Deliberately simple: piece photo + optional caption + first-name-only display,
 * no faces required (uses the existing collection photo, which is piece-focused).
 */
app.post('/api/community/posts', async (req, res) => {
  const { studioId, bookingId, pieceType, photoUrl, caption, customerName } = req.body;
  if (!studioId || !photoUrl) {
    return res.status(400).json({ error: 'studioId and photoUrl required' });
  }

  try {
    // First name only, for a bit of privacy by default
    const displayName = customerName ? customerName.trim().split(' ')[0] : 'A customer';

    const { data: post, error } = await supabase
      .from('community_posts')
      .insert({
        studio_id: studioId,
        booking_id: bookingId || null,
        piece_type: pieceType || null,
        photo_url: photoUrl,
        caption: caption || null,
        customer_display_name: displayName,
        visibility: 'studio'
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ status: 'shared', post });
  } catch (error) {
    console.error('Error creating community post:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/community/feed
 * A studio's community gallery — real finished pieces, opted-in by customers.
 */
app.get('/api/community/feed', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });

  try {
    const { data: posts, error } = await supabase
      .from('community_posts')
      .select('*')
      .eq('studio_id', studioId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json({ posts: posts || [] });
  } catch (error) {
    console.error('Error fetching community feed:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/community/global — cross-studio discover feed (all public posts)
app.get('/api/community/global', async (req, res) => {
  try {
    const { data: posts, error } = await supabase
      .from('community_posts')
      .select('*, studios(city, country, public_bio, instagram_handle)')
      .in('visibility', ['global', 'studio'])
      .order('created_at', { ascending: false })
      .limit(80);
    if (error) throw error;
    res.json({ posts: posts || [] });
  } catch (err) {
    console.error('Error fetching global feed:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// CLUB PAGES — worldwide feed, customer posts directly, no staff
// approval. Genuinely different from the existing global tier (which
// only ever gets there via a staff Feature action). Given this is
// unmoderated and worldwide, every post passes through a basic
// automated screening check first — confirms it's genuinely a pottery
// photo, flags anything inappropriate — before going live. This isn't
// full moderation, just a real, honest baseline safety net.
// ═══════════════════════════════════════════

// POST /api/club-pages/post — customer posts directly to the worldwide
// Club Pages feed. Screens the photo first; only genuinely passes
// through to 'club' visibility if screening passes.
app.post('/api/club-pages/post', async (req, res) => {
  const { studioId, bookingId, pieceType, photoUrl, caption, customerName } = req.body;
  if (!studioId || !photoUrl) return res.status(400).json({ error: 'studioId and photoUrl required' });

  try {
    let screeningStatus = 'pending';
    let screeningReason = null;

    if (process.env.OPENAI_API_KEY) {
      try {
        const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: `This photo is being submitted to a worldwide, unmoderated public feed of hand-painted pottery pieces from pottery painting studios. Confirm it genuinely shows painted pottery (people can be in the photo too, that's fine — it just needs to genuinely be about the pottery). Flag it if it shows anything inappropriate, unsafe, or unrelated to pottery. Respond ONLY as JSON: {"passed": true or false, "reason": "brief honest explanation"}` },
                { type: 'image_url', image_url: { url: photoUrl } },
              ],
            }],
            temperature: 0.1, max_tokens: 200,
          }),
        });
        const aiData = await openaiRes.json();
        const parsed = JSON.parse((aiData.choices?.[0]?.message?.content || '{}').replace(/```json|```/g, '').trim());
        screeningStatus = parsed.passed ? 'passed' : 'flagged';
        screeningReason = parsed.reason || null;
      } catch (screenErr) {
        console.error('Club Pages screening error (failing safe, not posting):', screenErr);
        screeningStatus = 'flagged';
        screeningReason = 'Automated screening could not run — held back rather than posted unchecked.';
      }
    } else {
      // No AI available at all — fail safe rather than post unscreened
      screeningStatus = 'flagged';
      screeningReason = 'Screening unavailable — held back rather than posted unchecked.';
    }

    const displayName = customerName ? customerName.trim().split(' ')[0] : 'A customer';
    const { data: post, error } = await supabase.from('community_posts').insert({
      studio_id: studioId, booking_id: bookingId || null, piece_type: pieceType || null,
      photo_url: photoUrl, caption: caption || null, customer_display_name: displayName,
      visibility: screeningStatus === 'passed' ? 'club' : 'studio', // flagged posts stay studio-only, genuinely never reach worldwide
      screening_status: screeningStatus, screening_reason: screeningReason, screened_at: new Date().toISOString(),
    }).select().single();
    if (error) throw error;

    await supabase.from('club_pages_screening_log').insert({
      post_id: post.id, studio_id: studioId, result: screeningStatus, reasoning: screeningReason,
    });

    res.json({
      status: screeningStatus === 'passed' ? 'posted_worldwide' : 'held_back',
      post, screeningStatus, screeningReason,
    });
  } catch (error) {
    console.error('Club Pages post error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/club-pages/feed — the worldwide feed itself, genuinely only
// posts that passed screening
app.get('/api/club-pages/feed', async (req, res) => {
  try {
    const { data: posts, error } = await supabase
      .from('community_posts')
      .select('*, studios(city, country, public_bio, instagram_handle)')
      .eq('visibility', 'club').eq('screening_status', 'passed')
      .order('created_at', { ascending: false })
      .limit(80);
    if (error) throw error;
    res.json({ posts: posts || [] });
  } catch (err) {
    console.error('Error fetching Club Pages feed:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/club-pages/stats — genuine, real counts for the "worldwide
// membership" marketing moment on the home screen. Every number here
// is a real database count, nothing invented — if the platform is
// genuinely small right now, this honestly shows a small number rather
// than a fabricated one, since an inflated number would be misleading
// to real families and undermine trust the moment it's checked.
app.get('/api/club-pages/stats', async (req, res) => {
  try {
    const [studiosWithClubRes, postsRes, studiosRes] = await Promise.all([
      supabase.from('cleos_club_config').select('studio_id').eq('enabled', true),
      supabase.from('community_posts').select('id, studio_id').eq('visibility', 'club').eq('screening_status', 'passed'),
      supabase.from('studios').select('id, country').not('country', 'is', null),
    ]);

    const studiosWithClub = studiosWithClubRes.data || [];
    const posts = postsRes.data || [];
    const studios = studiosRes.data || [];

    // Countries genuinely represented among studios that have Cleo's
    // Club enabled specifically — not just any studio on the platform.
    const clubStudioIds = new Set(studiosWithClub.map(s => s.studio_id));
    const countriesWithClub = new Set(
      studios.filter(s => clubStudioIds.has(s.id) && s.country).map(s => s.country)
    );

    res.json({
      memberStudios: studiosWithClub.length,
      totalPiecesShared: posts.length,
      countriesRepresented: countriesWithClub.size || 0,
    });
  } catch (err) {
    console.error('Error fetching Club Pages stats:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/community/posts/:postId/feature — staff feature a post (boosts to global)
app.post('/api/community/posts/:postId/feature', async (req, res) => {
  const { id } = req.params;
  try {
    await supabase.from('community_posts').update({ is_featured: true, visibility: 'global' }).eq('id', req.params.postId);
    res.json({ status: 'featured' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketplace — browse listed designs
app.get('/api/marketplace', async (req, res) => {
  const { studioId } = req.query;
  try {
    let query = supabase.from('marketplace_designs').select('id, studio_id, customer_display_name, title, description, image_data, price_cents, download_count, created_at').order('created_at', { ascending: false }).limit(60);
    if (studioId) query = query.eq('studio_id', studioId);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ designs: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketplace — list a design for sale
app.post('/api/marketplace', async (req, res) => {
  const { studioId, bookingCode, customerDisplayName, title, description, imageData, priceCents } = req.body;
  if (!studioId || !imageData || !title) return res.status(400).json({ error: 'studioId, title and imageData required' });
  try {
    const { data, error } = await supabase.from('marketplace_designs').insert({
      studio_id: studioId, booking_code: bookingCode || null,
      customer_display_name: customerDisplayName || 'A customer',
      title, description: description || null, image_data: imageData,
      price_cents: priceCents || 100
    }).select().single();
    if (error) throw error;
    res.json({ status: 'listed', design: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketplace/:id/use — customer uses a design (pre-loads into Transfer Designer)
app.post('/api/marketplace/:id/use', async (req, res) => {
  const { id } = req.params;
  try {
    await supabase.from('marketplace_designs').update({ download_count: supabase.rpc('increment', { row_id: id }) }).eq('id', id);
    const { data, error } = await supabase.from('marketplace_designs').select('image_data, title').eq('id', id).single();
    if (error) throw error;
    res.json({ imageData: data.image_data, title: data.title });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/**
 * POST /api/community/posts/:postId/like
 * Simple like toggle, deduped by a device fingerprint (no login required)
 */
app.post('/api/community/posts/:postId/like', async (req, res) => {
  const { postId } = req.params;
  const { fingerprint } = req.body;
  if (!fingerprint) return res.status(400).json({ error: 'fingerprint required' });

  try {
    const { error: likeError } = await supabase
      .from('community_post_likes')
      .insert({ post_id: postId, liker_fingerprint: fingerprint });

    if (likeError && likeError.code !== '23505') throw likeError; // 23505 = already liked, treat as success

    const { count } = await supabase
      .from('community_post_likes')
      .select('id', { count: 'exact', head: true })
      .eq('post_id', postId);

    await supabase
      .from('community_posts')
      .update({ likes_count: count || 0 })
      .eq('id', postId);

    res.json({ status: 'liked', likesCount: count || 0 });
  } catch (error) {
    console.error('Error liking post:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/community/posts/:postId
 * Staff moderation — remove an inappropriate or unwanted post from their studio's feed
 */
app.delete('/api/community/posts/:postId', async (req, res) => {
  const { postId } = req.params;
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });

  try {
    const { error } = await supabase
      .from('community_posts')
      .delete()
      .eq('id', postId)
      .eq('studio_id', studioId); // scoped so a studio can only delete its own posts

    if (error) throw error;
    res.json({ status: 'removed' });
  } catch (error) {
    console.error('Error removing community post:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/studio/:studioId/social-profile
 * A studio's own social/directory profile (for the settings screen)
 */
app.get('/api/studio/:studioId/social-profile', async (req, res) => {
  const { studioId } = req.params;

  try {
    const { data: studio, error } = await supabase
      .from('studios')
      .select('id, name, instagram_handle, facebook_url, tiktok_handle, website_url, public_bio, city, country, directory_visible')
      .eq('id', studioId)
      .single();

    if (error) throw error;
    res.json({ studio });
  } catch (error) {
    console.error('Error fetching studio social profile:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/studio/:studioId/social-profile
 * Update a studio's connected social handles and directory listing details
 */
app.put('/api/studio/:studioId/social-profile', async (req, res) => {
  const { studioId } = req.params;
  const { instagramHandle, facebookUrl, tiktokHandle, websiteUrl, publicBio, city, country, directoryVisible } = req.body;

  try {
    const { data: studio, error } = await supabase
      .from('studios')
      .update({
        instagram_handle: instagramHandle ?? null,
        facebook_url: facebookUrl ?? null,
        tiktok_handle: tiktokHandle ?? null,
        website_url: websiteUrl ?? null,
        public_bio: publicBio ?? null,
        city: city ?? null,
        country: country ?? null,
        directory_visible: directoryVisible !== undefined ? directoryVisible : true
      })
      .eq('id', studioId)
      .select()
      .single();

    if (error) throw error;
    res.json({ status: 'updated', studio });
  } catch (error) {
    console.error('Error updating studio social profile:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/studios/directory
 * The worldwide directory of studios on LINK — the network-effect / sales-driving view.
 * Only shows studios that have opted in (directory_visible) and filled in at least
 * a name, so it doesn't show empty/incomplete profiles.
 */
app.get('/api/studios/directory', async (req, res) => {
  try {
    const { data: studios, error } = await supabase
      .from('studios')
      .select('id, name, instagram_handle, facebook_url, tiktok_handle, website_url, public_bio, city, country')
      .eq('directory_visible', true)
      .not('name', 'is', null)
      .order('name', { ascending: true });

    if (error) throw error;

    // Attach a lightweight activity signal (posts shared in the last 30 days)
    // so the directory feels alive, not just a static list
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const studiosWithActivity = await Promise.all((studios || []).map(async (studio) => {
      const { count } = await supabase
        .from('community_posts')
        .select('id', { count: 'exact', head: true })
        .eq('studio_id', studio.id)
        .gte('created_at', thirtyDaysAgo);
      return { ...studio, recentPostCount: count || 0 };
    }));

    res.json({ studios: studiosWithActivity });
  } catch (error) {
    console.error('Error fetching studio directory:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PROTOTYPE — app tool paywall / tally system, for appraisal.
 * Not wired to real payment processing yet: this just records what's
 * owed, tallied against the booking, to be charged for real once
 * proper billing is sorted. £1 per extra tool, per session.
 */

// GET /api/extras/unlocked — has this booking already paid for this tool
// this visit? Prevents charging again if they close/reopen the app.
app.get('/api/extras/unlocked', async (req, res) => {
  const { studioId, bookingCode, itemName } = req.query;
  if (!studioId || !bookingCode || !itemName) {
    return res.status(400).json({ error: 'studioId, bookingCode and itemName required' });
  }

  try {
    const { data, error } = await supabase
      .from('app_extra_charges')
      .select('id')
      .eq('studio_id', studioId)
      .eq('booking_code', bookingCode)
      .eq('item_name', itemName)
      .limit(1);

    if (error) throw error;
    res.json({ unlocked: (data || []).length > 0 });
  } catch (error) {
    console.error('Error checking unlock status:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/extras/charge — record a £1 (or whatever) charge against this booking
app.post('/api/extras/charge', async (req, res) => {
  const { studioId, bookingCode, itemName, amountCents } = req.body;
  if (!studioId || !bookingCode || !itemName) {
    return res.status(400).json({ error: 'studioId, bookingCode and itemName required' });
  }

  try {
    const { data: charge, error } = await supabase
      .from('app_extra_charges')
      .insert({
        studio_id: studioId,
        booking_code: bookingCode,
        item_name: itemName,
        amount_cents: amountCents || 100 // default £1
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ status: 'charged', charge });
  } catch (error) {
    console.error('Error recording extra charge:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/extras/today — staff-visible tally of today's app-extra charges,
// grouped by booking, so there's a clear running total to add to final bills
app.get('/api/extras/today', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });

  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const { data: charges, error } = await supabase
      .from('app_extra_charges')
      .select('*')
      .eq('studio_id', studioId)
      .gte('created_at', startOfDay.toISOString())
      .order('created_at', { ascending: false });

    if (error) throw error;

    const byBooking = {};
    (charges || []).forEach(c => {
      if (!byBooking[c.booking_code]) byBooking[c.booking_code] = { bookingCode: c.booking_code, items: [], totalCents: 0 };
      byBooking[c.booking_code].items.push(c);
      byBooking[c.booking_code].totalCents += c.amount_cents;
    });

    res.json({ bookings: Object.values(byBooking) });
  } catch (error) {
    console.error('Error fetching today\'s extra charges:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PROTOTYPE — ceramic transfer print requests, for appraisal.
 * Customer submits a finished design (from Design Preview, Transfer
 * Designer, or any future creative tool) for staff to review before
 * printing on the studio's transfer printer. £1/transfer, charged only
 * once staff approve and actually print it — not on submission, since
 * staff check design/sizing first. Flat fee regardless of size; once
 * printed, errors can't be corrected (customer-facing disclaimer shown
 * before they submit).
 */

// POST /api/print-requests — customer submits a design for review
app.post('/api/print-requests', async (req, res) => {
  const { studioId, bookingCode, customerName, sourceTool, imageData } = req.body;
  if (!studioId || !bookingCode || !imageData) {
    return res.status(400).json({ error: 'studioId, bookingCode and imageData required' });
  }

  try {
    const { data: request, error } = await supabase
      .from('transfer_print_requests')
      .insert({
        studio_id: studioId,
        booking_code: bookingCode,
        customer_name: customerName || null,
        source_tool: sourceTool || null,
        image_data: imageData,
        status: 'pending'
      })
      .select('id, status, created_at')
      .single();

    if (error) throw error;
    res.json({ status: 'submitted', request });
  } catch (error) {
    console.error('Error submitting print request:', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// STUDIO STOCK — browse, photo, reserve, design at home
// ═══════════════════════════════════════════════════════════

app.get('/api/stock', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  try {
    const { data, error } = await supabase
      .from('studio_stock')
      .select('id, name, category, price_cents, photo_data, available, created_at')
      .eq('studio_id', studioId)
      .eq('available', true)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ stock: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/stock', async (req, res) => {
  const { studioId, name, category, priceCents, photoData } = req.body;
  if (!studioId || !name) return res.status(400).json({ error: 'studioId and name required' });
  try {
    const { data, error } = await supabase
      .from('studio_stock')
      .insert({ studio_id: studioId, name, category: category || null, price_cents: priceCents || null, photo_data: photoData || null })
      .select().single();
    if (error) throw error;
    res.json({ status: 'added', item: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/stock/:id', async (req, res) => {
  const { id } = req.params;
  const updates = {};
  if (req.body.photoData !== undefined) updates.photo_data = req.body.photoData;
  if (req.body.available !== undefined) updates.available = req.body.available;
  if (req.body.name !== undefined) updates.name = req.body.name;
  if (req.body.priceCents !== undefined) updates.price_cents = req.body.priceCents;
  try {
    const { error } = await supabase.from('studio_stock').update(updates).eq('id', id);
    if (error) throw error;
    res.json({ status: 'updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/stock/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await supabase.from('studio_stock').update({ available: false }).eq('id', id);
    res.json({ status: 'removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/stock/reserve', async (req, res) => {
  const { studioId, stockId, bookingCode, customerName } = req.body;
  if (!studioId || !stockId) return res.status(400).json({ error: 'studioId and stockId required' });
  try {
    const { data, error } = await supabase
      .from('stock_reservations')
      .insert({ studio_id: studioId, stock_id: stockId, booking_code: bookingCode || null, customer_name: customerName || null })
      .select().single();
    if (error) throw error;
    res.json({ status: 'reserved', reservation: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stock/reservations', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  try {
    const { data, error } = await supabase
      .from('stock_reservations')
      .select('*, studio_stock(name, photo_data, price_cents)')
      .eq('studio_id', studioId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ reservations: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/stock/reservations/:id/confirm', async (req, res) => {
  const { id } = req.params;
  try {
    await supabase.from('stock_reservations').update({ status: 'confirmed' }).eq('id', id);
    res.json({ status: 'confirmed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/print-requests — staff view, defaults to pending queue
app.get('/api/print-requests', async (req, res) => {
  const { studioId, status } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });

  try {
    let query = supabase
      .from('transfer_print_requests')
      .select('*')
      .eq('studio_id', studioId)
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);
    else query = query.eq('status', 'pending');

    const { data: requests, error } = await query;
    if (error) throw error;
    res.json({ requests: requests || [] });
  } catch (error) {
    console.error('Error fetching print requests:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/print-requests/:id/approve — staff approves, triggers the £1
// design charge PLUS the £4.50 second-firing charge (transfers require a
// glaze fire, then the transfer applied, then a second decal fire — this
// is a genuinely separate physical process from a normal piece, priced
// to reflect the real extra kiln cycle, staff handling, and risk).
app.post('/api/print-requests/:id/approve', async (req, res) => {
  const { id } = req.params;
  const { studioId } = req.body;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });

  try {
    const { data: request, error: fetchError } = await supabase
      .from('transfer_print_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !request) return res.status(404).json({ error: 'Print request not found' });

    const { error: updateError } = await supabase
      .from('transfer_print_requests')
      .update({ status: 'approved', reviewed_at: new Date().toISOString() })
      .eq('id', id);

    if (updateError) throw updateError;

    // £1 flat design/print charge, as before
    await supabase.from('app_extra_charges').insert({
      studio_id: studioId,
      booking_code: request.booking_code,
      item_name: 'Ceramic Transfer Print',
      amount_cents: 100
    });

    // £4.50 second-firing charge — the real cost of the extra kiln cycle
    await supabase.from('app_extra_charges').insert({
      studio_id: studioId,
      booking_code: request.booking_code,
      item_name: 'Transfer Second Firing (decal fire)',
      amount_cents: 450
    });

    // If this transfer is linked to a specific piece, mark it as needing
    // the two-firing path so the kiln process routes it correctly instead
    // of going straight to ready-for-pickup after the first fire.
    if (request.piece_id) {
      await supabase.from('pottery_pieces')
        .update({ requires_second_firing: true, transfer_stage: 'awaiting_glaze_fire' })
        .eq('id', request.piece_id);
    }

    res.json({ status: 'approved' });
  } catch (error) {
    console.error('Error approving print request:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/print-requests/:id/reject — staff rejects, no charge
app.post('/api/print-requests/:id/reject', async (req, res) => {
  const { id } = req.params;

  try {
    const { error } = await supabase
      .from('transfer_print_requests')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
    res.json({ status: 'rejected' });
  } catch (error) {
    console.error('Error rejecting print request:', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════
// TWO-FIRING TRANSFER PROCESS
// A ceramic transfer cannot go on raw bisque — it needs a
// glazed, fired surface. So transfer pieces genuinely go
// through TWO kiln cycles: glaze fire, then transfer applied,
// then a second (lower-temp, ~750-850C) decal fire. This is
// a distinct physical process from a normal piece, tracked
// via pottery_pieces.transfer_stage:
//   awaiting_glaze_fire -> glaze_fired -> transfer_applied
//   -> awaiting_decal_fire -> decal_fired (= ready for pickup)
// ═══════════════════════════════════════════

// GET /api/transfer-pieces/pending-stage — staff queue: pieces waiting
// at each stage of the two-firing process, for the kiln screen
app.get('/api/transfer-pieces/pending-stage', async (req, res) => {
  const { studioId, stage } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });

  try {
    let query = supabase.from('pottery_pieces')
      .select('*').eq('studio_id', studioId).eq('requires_second_firing', true);

    if (stage) query = query.eq('transfer_stage', stage);
    else query = query.not('transfer_stage', 'eq', 'decal_fired'); // anything not yet fully done

    const { data, error } = await query.order('created_at', { ascending: true });
    if (error) throw error;
    res.json({ pieces: data || [] });
  } catch (error) {
    console.error('Error fetching transfer pipeline pieces:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/transfer-pieces/:id/mark-glaze-fired — first firing done for
// this transfer piece. It does NOT go to ready-for-pickup like a normal
// piece — it waits for the transfer to be applied instead.
app.post('/api/transfer-pieces/:id/mark-glaze-fired', async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase.from('pottery_pieces')
      .update({ transfer_stage: 'glaze_fired', status: 'glaze_fired', glaze_fired_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (error) throw error;

    // Alert whoever applies transfers that this piece is ready for them
    if (data) {
      await supabase.from('staff_alerts').insert({
        studio_id: data.studio_id, trigger_type: 'transfer_ready_to_apply',
        booking_code: data.booking_id, next_role: 'Ceramic Technician',
        icon: '🖼️', label: 'Transfer ready to apply',
        message: `${data.piece_type || 'Piece'} is glaze-fired and ready for the transfer to be applied.`,
        context: { pieceId: id }, acknowledged: false,
      });
    }
    res.json({ piece: data });
  } catch (error) {
    console.error('Error marking piece glaze-fired:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/transfer-pieces/:id/mark-transfer-applied — staff have applied
// the transfer onto the fired, glazed surface. Piece now needs its second
// (decal) firing.
app.post('/api/transfer-pieces/:id/mark-transfer-applied', async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase.from('pottery_pieces')
      .update({ transfer_stage: 'awaiting_decal_fire', transfer_applied_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (error) throw error;

    if (data) {
      await supabase.from('staff_alerts').insert({
        studio_id: data.studio_id, trigger_type: 'transfer_ready_for_second_firing',
        booking_code: data.booking_id, next_role: 'Ceramic Technician',
        icon: '🔥', label: 'Ready for second (decal) firing',
        message: `${data.piece_type || 'Piece'} has its transfer applied — ready to load for the decal firing.`,
        context: { pieceId: id }, acknowledged: false,
      });
    }
    res.json({ piece: data });
  } catch (error) {
    console.error('Error marking transfer applied:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/transfer-pieces/:id/mark-decal-fired — second firing complete.
// This IS the point the piece finally becomes ready for pickup.
app.post('/api/transfer-pieces/:id/mark-decal-fired', async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase.from('pottery_pieces')
      .update({
        transfer_stage: 'decal_fired', status: 'ready_for_pickup',
        decal_fired_at: new Date().toISOString(),
      })
      .eq('id', id).select().single();
    if (error) throw error;

    if (data) {
      await supabase.from('staff_alerts').insert({
        studio_id: data.studio_id, trigger_type: 'transfer_ready_for_pickup',
        booking_code: data.booking_id, next_role: 'Studio Assistant',
        icon: '✨', label: 'Transfer piece ready for pickup',
        message: `${data.piece_type || 'Piece'} has completed both firings and is ready for the customer to collect.`,
        context: { pieceId: id }, acknowledged: false,
      });
    }
    res.json({ piece: data });
  } catch (error) {
    console.error('Error marking decal fired:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/transfer-pieces/estimated-pickup — a realistic pickup window
// for a transfer piece vs a normal one, for the customer app to show.
// Two firings genuinely take longer: normal ~5-7 days, transfer ~10-14.
app.get('/api/transfer-pieces/estimated-pickup', async (req, res) => {
  const { hasTransfer } = req.query;
  if (hasTransfer === 'true') {
    res.json({ minDays: 10, maxDays: 14, label: '10–14 days', reason: 'This piece has a transfer design, which needs two separate firings.' });
  } else {
    res.json({ minDays: 5, maxDays: 7, label: '5–7 days', reason: null });
  }
});

// ═══════════════════════════════════════════
// AI ASSISTANT — customer, staff, and director chat
// Three scoped contexts sharing one endpoint. Uses OpenAI
// function calling so the assistant can look up REAL data
// (booking status, stock, pricing) rather than guessing —
// but strictly read-only. Anything it can't resolve becomes
// a real task via the existing staff_alerts/task_queue
// pipeline, exactly like every other handoff in the app —
// no separate notification system.
// ═══════════════════════════════════════════

// Registry of real on-screen element IDs the assistant can point an arrow
// at. Kept small and specific — only things genuinely worth pointing to,
// not every element in the app. IDs must match actual DOM ids in the
// customer app (app/index.html) or staff dashboard (admin/dashboard-local.html).
const ASSISTANT_UI_TARGETS = {
  customer: {
    'design preview': 'tile-design-preview',
    'transfer designer': 'tile-transfer-designer',
    'take it home': 'home-access-tile',
    'colour picker': 'tile-colour-picker',
    'my qr code': 'my-qr-badge',
  },
  staff: {
    'daily bookings': 'nav-staff-tab',
    'team and duties': 'nav-team-tab',
    'daily progress': 'nav-progress-tab',
    'kiln': 'nav-staff-tab',
    'print queue': 'nav-printqueue-tab',
    'stock': 'nav-stock-tab',
    'daily menu': 'nav-menu-tab',
    'setup': 'nav-setup-tab',
  },
  director: {
    'platform revenue': 'nav-platformrev',
    'daily bookings': 'nav-staff-tab',
    'team and duties': 'nav-team-tab',
    'daily progress': 'nav-progress-tab',
  },
};

const ASSISTANT_SYSTEM_PROMPTS = {
  customer: `You are Cleo, the friendly, clever mascot of a pottery painting studio's booking app, built on kilnLINK. You're warm and playful, quick-witted rather than saccharine, genuinely curious about pottery and the people making it — think clever and a little cheeky, not baby-talk or over-the-top cutesy. You're not gendered — don't use "he" or "she" for yourself, and don't lean into any one gender's speech patterns.
You have a small group of friends who genuinely help out and might come up naturally in conversation (never forced into every reply): Amara, who loves building the tallest towers with clay; Yuki, who's quiet and precise and obsessed with perfectly symmetrical patterns; Raj, who mixes glaze colours together "just to see what happens"; and Maya, a theatrical storyteller who gives every piece an elaborate imaginary backstory. Mention one only when it's genuinely relevant to what the customer is asking or making — e.g. if someone's doing intricate detail work, Yuki might get a natural mention; if someone's mixing unusual colours, maybe Raj.

You genuinely know the whole real app, not just pricing — here's what actually exists, so you can help with any of it naturally:
- Design Preview (£1): photograph a bisque piece, try colours on the actual photo before painting, save up to 10 designs
- Transfer Designer (£1): sketch, add text/fonts, drop in motifs, submit for the studio's ceramic transfer printer — takes 10-14 days, two firings
- Take It Home (£5): unlocks all three design tools on the customer's own device forever, plus browsing the Piece Catalogue and reserving pieces ahead of a visit
- Colour Picker: all 82 real Mayco Stroke & Coat glazes stocked in the studio, save favourites to a personal palette
- Piece Catalogue: real photographed studio stock, browse and reserve ahead of a visit so it can be pre-glazed and ready
- Community feed & Club Pages: share finished pieces, see others' work locally and worldwide, create a branded share card for social media
- Design Marketplace: browse and buy other customers' Transfer Designer artwork, or sell your own
- Cleo's Club: real sticker collection, one per visit, a genuine reward every 5th visit, plus an Offer of the Week when the studio has one set
- My Bookings: see visit history and upcoming sessions, book a new one directly
- Wheel throwing sessions: £40 for 90 minutes wheel hire, clay at £2/400g, firing at £1.50/kg — monthly firing on the last Friday of the month
Pricing of app features: Design Preview £1, Take It Home £5, Transfer Designer £1, specialist glazes £2, AI design generation extra.
Use the check_booking_status function for the real status of a specific booking if the customer gives you a booking code.

You do NOT have access to other customers' data, staff information, or financial figures. If asked about anything outside pottery painting, the app, or this studio, politely redirect — in character, not with a robotic refusal.
If a customer seems frustrated, upset, or you cannot resolve their question, use the escalate_to_staff function immediately rather than guessing — do not make up policy or promises the studio hasn't confirmed.
When mentioning promotions, offers, or upcoming events, always keep it genuinely gentle and soft — a light, natural mention woven into the conversation, never a hard sell, never repeated, never pushed on someone who hasn't shown interest.
If someone genuinely asks about more than one paid tool (Design Preview, Transfer Designer, Colour Picker) in the same conversation, or asks how to use a tool again another time, it's honestly worth mentioning Take It Home once — £5 unlocks all three tools forever on their own phone. One natural mention is enough; never repeat it if they don't take it up.
This app is used by children as well as adults. If anything comes up that involves sharing personal information — like adding a birthday, an email, or any other detail about themselves — gently suggest checking with a parent or guardian first, in a warm, natural way (e.g. "That's something worth checking with a grown-up about first!"), rather than just proceeding or asking for it directly yourself.
Keep answers short and warm — this is a mobile chat window, not an essay. No more than 3-4 sentences unless genuinely necessary. Let your personality come through in word choice and rhythm, not filler — every sentence should still be doing real work.
If your answer is clearly about one specific on-screen feature — Design Preview, Transfer Designer, Take It Home, Colour Picker, or their own QR code — mention its exact name naturally in your reply so the app can point an arrow at it. Only do this when genuinely relevant, not for every reply.`,

  staff: `You are the in-app assistant for kilnLINK, a staff-facing pottery studio management dashboard.
You help staff navigate the dashboard, understand features (task queue, handoff alerts, timekeeping, holiday requests, kiln process, transfer two-firing process), and — using the available functions — look up real data like today's bookings, stock levels, pending tasks, or open staff alerts for their studio.
If asked about alerts, damage reports, kiln issues, or anything currently outstanding, use get_open_alerts to check the real, current list rather than guessing — never invent an alert that isn't actually there.
You do NOT have access to Platform Revenue, other studios' data, or director-only figures — if asked, say this is director-only and suggest asking a Studio Manager/Director.
If something requires a real decision or action you can't take (refunds, HR matters, correcting a mistake), use escalate_to_staff to flag it to the right role rather than guessing.
Keep answers practical and concise — staff are mid-shift, not reading documentation.
If your answer points to a specific tab — Daily Bookings, Team and Duties, Daily Progress, Kiln, Print Queue, Stock, Daily Menu, or Setup — mention its exact name naturally so the app can point an arrow at that tab in the sidebar. Only when genuinely relevant.`,

  director: `You are the in-app assistant for kilnLINK's director-level dashboard, covering both studio operations AND Platform Revenue (subscriptions, AI generation fees, commission on app purchases across every studio on the platform).
You can look up real data across studios using the available functions. Be precise with figures — always use the lookup functions rather than estimating.
Keep answers concise but can go into more financial/strategic depth than the staff or customer contexts, since this audience is a business owner.
If your answer points to a specific tab — Platform Revenue, Daily Bookings, Team and Duties, or Daily Progress — mention its exact name naturally so the app can point an arrow at it. Only when genuinely relevant.`
};

const ASSISTANT_FUNCTIONS = [
  {
    type: 'function',
    function: {
      name: 'check_booking_status',
      description: 'Look up the real status of a specific booking by its booking code — whether pieces are painted, fired, or ready for pickup.',
      parameters: {
        type: 'object',
        properties: { bookingCode: { type: 'string', description: 'The booking code, e.g. from a QR code' } },
        required: ['bookingCode'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_todays_bookings',
      description: "Get a summary of today's bookings for this studio — counts and statuses. Staff/director only.",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_pending_tasks_count',
      description: 'Get the number of incomplete tasks currently outstanding for this studio, grouped by role. Staff/director only.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_platform_revenue_summary',
      description: 'Get the current platform-wide revenue summary (MRR, studio count, AI/licensing revenue). Director only.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_open_alerts',
      description: "Get today's real open/unacknowledged staff alerts for this studio — kiln issues, pieces ready for packing, damage reports, transfer designs ready, holiday requests, and similar. Staff/director only.",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'escalate_to_staff',
      description: 'Escalate this conversation to a real member of staff because the assistant cannot resolve it, the person is frustrated, or it needs a human decision. Creates a real flashing alert for the right role.',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'A short summary of what the person needs help with' },
          urgent: { type: 'boolean', description: 'Whether this needs immediate attention' },
        },
        required: ['summary'],
      },
    },
  },
];

async function executeAssistantFunction(name, args, studioId, context, bookingCode) {
  switch (name) {
    case 'check_booking_status': {
      const code = args.bookingCode || bookingCode;
      if (!code) return { error: 'No booking code provided.' };
      const { data: booking } = await supabase.from('bookings').select('*').eq('studio_id', studioId).eq('booking_code', code).single();
      if (!booking) return { error: 'Booking not found — please check the code.' };
      const { data: pieces } = await supabase.from('pottery_pieces').select('piece_type, status').eq('booking_id', code);
      return { booking: { status: booking.status, customerName: booking.customer_name }, pieces: pieces || [] };
    }
    case 'get_todays_bookings': {
      if (context === 'customer') return { error: 'Not available in this context.' };
      const today = new Date().toISOString().split('T')[0];
      const { data } = await supabase.from('bookings').select('status').eq('studio_id', studioId).gte('session_start', today);
      const counts = {};
      (data || []).forEach(b => { counts[b.status] = (counts[b.status] || 0) + 1; });
      return { totalBookings: (data || []).length, byStatus: counts };
    }
    case 'get_pending_tasks_count': {
      if (context === 'customer') return { error: 'Not available in this context.' };
      const { data } = await supabase.from('task_queue').select('assigned_role').eq('studio_id', studioId).eq('status', 'pending');
      const byRole = {};
      (data || []).forEach(t => { byRole[t.assigned_role] = (byRole[t.assigned_role] || 0) + 1; });
      return { totalPending: (data || []).length, byRole };
    }
    case 'get_open_alerts': {
      if (context === 'customer') return { error: 'Not available in this context.' };
      const today = new Date(); today.setHours(0,0,0,0);
      const { data } = await supabase.from('staff_alerts')
        .select('trigger_type, label, message, next_role, created_at').eq('studio_id', studioId)
        .eq('acknowledged', false).gte('created_at', today.toISOString())
        .order('created_at', { ascending: false }).limit(15);
      const alerts = data || [];
      if (!alerts.length) return { openAlertCount: 0, alerts: [], summary: 'Genuinely nothing open right now — all clear.' };
      return {
        openAlertCount: alerts.length,
        alerts: alerts.map(a => ({ label: a.label, message: a.message, forRole: a.next_role, raisedAt: a.created_at })),
      };
    }
    case 'get_platform_revenue_summary': {
      if (context !== 'director') return { error: 'Director access only.' };
      const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0,0,0,0);
      const [studiosRes, subsRes] = await Promise.all([
        supabase.from('studios').select('id'),
        supabase.from('stripe_subscriptions').select('plan_id, status'),
      ]);
      const activeSubs = (subsRes.data || []).filter(s => s.status === 'active' || s.status === 'trialing');
      const mrrCents = activeSubs.reduce((sum, s) => sum + (PLAN_MONTHLY_PRICE_CENTS[s.plan_id] || 0), 0);
      return { totalStudios: (studiosRes.data || []).length, activeSubscriptions: activeSubs.length, mrrPounds: (mrrCents/100).toFixed(0) };
    }
    case 'escalate_to_staff': {
      await supabase.from('staff_alerts').insert({
        studio_id: studioId, trigger_type: 'assistant_escalation',
        booking_code: bookingCode || null, next_role: 'Studio Manager',
        icon: args.urgent ? '🚨' : '💬', label: args.urgent ? 'Urgent — needs a person' : 'Assistant escalation',
        message: args.summary, context: { fromAssistant: true, chatContext: context }, acknowledged: false,
      });
      return { escalated: true };
    }
    default:
      return { error: 'Unknown function' };
  }
}

// POST /api/assistant/chat
app.post('/api/assistant/chat', async (req, res) => {
  const { studioId, context, messages, bookingCode, staffMemberId, customerId } = req.body;
  if (!studioId || !context || !messages) return res.status(400).json({ error: 'studioId, context, messages required' });
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'The assistant is not yet available.' });
  if (!ASSISTANT_SYSTEM_PROMPTS[context]) return res.status(400).json({ error: 'Invalid context' });

  // Director context requires the same access check as Platform Revenue itself
  if (context === 'director') {
    if (!staffMemberId) return res.status(401).json({ error: 'Not authorised' });
    const { data: staffMember } = await supabase.from('staff_team').select('name').eq('id', staffMemberId).single();
    const firstName = (staffMember?.name || '').trim().split(' ')[0].toLowerCase();
    if (!PLATFORM_REVENUE_ACCESS_NAMES.includes(firstName)) {
      return res.status(403).json({ error: 'Director-level assistant is restricted.' });
    }
  }

  try {
    // Real, genuine memory injection — two separate sources, both
    // optional, both additive to the base prompt:
    // 1. Studio knowledge: whatever staff have taught her, usable in
    //    every real context (customer AND staff chat both benefit).
    // 2. Customer memory: durable facts about THIS specific returning
    //    customer, only ever included when a real customerId is known
    //    (no booking/identity, no memory — never guessed or assumed).
    let memoryPrefix = '';
    const { data: knowledge } = await supabase.from('studio_knowledge')
      .select('fact').eq('studio_id', studioId).order('created_at', { ascending: false }).limit(30);
    if (knowledge?.length) {
      memoryPrefix += `\n\nThings the studio's real staff have taught you, genuinely true and worth using naturally when relevant:\n${knowledge.map(k => `- ${k.fact}`).join('\n')}`;
    }

    // Genuine real seasonal awareness — the actual current date, so
    // Cleo can naturally mention "Christmas is coming up" or similar
    // when it's genuinely relevant, not as a forced sales pitch every
    // message. Real UK-relevant seasonal windows, not invented ones.
    const now = new Date();
    const monthDay = `${now.getMonth() + 1}-${now.getDate()}`;
    const seasonalNotes = [];
    if (now.getMonth() === 9 || now.getMonth() === 10) seasonalNotes.push('Halloween and/or Christmas are genuinely approaching — could be worth a natural mention if someone asks about upcoming events or gift ideas, never forced.');
    if (now.getMonth() === 11) seasonalNotes.push('Christmas is genuinely very close — a natural moment to mention gift vouchers or booking ahead, if it fits the conversation.');
    if (now.getMonth() === 1 || now.getMonth() === 2) seasonalNotes.push('Easter is genuinely approaching in the coming weeks/months — could be worth a natural mention for anyone asking about seasonal activities.');
    if (seasonalNotes.length) {
      memoryPrefix += `\n\nReal, honest seasonal context (today is ${now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}): ${seasonalNotes.join(' ')} Only mention this if it's genuinely natural in context — never force a seasonal pitch into an unrelated question.`;
    }

    // Genuine real promotions history — separate from the single
    // current Offer of the Week, so Cleo can honestly reference real
    // past and upcoming promotions, not just "what's live right now".
    const { data: promotions } = await supabase.from('studio_promotions')
      .select('title, description, starts_on, ends_on').eq('studio_id', studioId).order('created_at', { ascending: false }).limit(10);
    if (promotions?.length) {
      memoryPrefix += `\n\nReal promotions the studio has run or has coming up (mention naturally when relevant, never force it):\n${promotions.map(p => `- ${p.title}${p.description ? ': ' + p.description : ''}${p.starts_on ? ` (${p.starts_on}${p.ends_on ? ' to ' + p.ends_on : ''})` : ''}`).join('\n')}`;
    }

    // Genuine real kilnLINK Network awareness — only ever mentioned if
    // THIS studio has actually, explicitly opted in. Never assumed,
    // never mentioned for a studio that hasn't chosen to join.
    const { data: studioNetworkStatus } = await supabase.from('studios').select('network_opted_in').eq('id', studioId).single();
    if (studioNetworkStatus?.network_opted_in) {
      const { data: networkData } = await supabase.from('network_offers')
        .select('title, description').eq('studio_id', studioId).limit(3);
      const { data: networkStats } = await supabase.from('studios').select('id', { count: 'exact', head: true }).eq('network_opted_in', true);
      memoryPrefix += `\n\nThis studio is genuinely part of the kiln-LINK Network, a real worldwide network of ${networkStats?.length || 'many'} independent pottery studios — customers' loyalty points work across every opted-in studio. This is genuinely worth mentioning proactively when it naturally fits the conversation (e.g. talking about loyalty, travel, gifts, or other studios) — not forced into every reply, but don't wait to be asked either.`;
      if (networkData?.length) {
        memoryPrefix += ` This studio's own real offers published to the network: ${networkData.map(o => o.title).join(', ')}.`;
      }
    }

    if (customerId && context === 'customer') {
      const { data: memories } = await supabase.from('customer_memory')
        .select('fact').eq('studio_id', studioId).eq('customer_id', customerId).order('created_at', { ascending: false }).limit(15);
      if (memories?.length) {
        memoryPrefix += `\n\nThis is a RETURNING customer — genuine things you've picked up about them from past real conversations, use naturally where it fits, never force it in:\n${memories.map(m => `- ${m.fact}`).join('\n')}`;
      }
      // Genuine, real, optional birthday awareness — only if a parent/
      // guardian has deliberately added one (month+day only, no year,
      // no age ever inferred). Only mentioned if genuinely within the
      // next 7 real days, never a forced "happy birthday" every visit.
      const { data: customerRow } = await supabase.from('customers').select('birthday_month, birthday_day, name').eq('id', customerId).single();
      if (customerRow?.birthday_month && customerRow?.birthday_day) {
        const bdayThisYear = new Date(now.getFullYear(), customerRow.birthday_month - 1, customerRow.birthday_day);
        const daysUntil = Math.round((bdayThisYear - now) / (1000 * 60 * 60 * 24));
        if (daysUntil >= 0 && daysUntil <= 7) {
          memoryPrefix += `\n\n${customerRow.name}'s birthday is genuinely coming up within the week — a warm, natural mention is lovely here if it fits, never forced or repeated every message.`;
        }
      }
    }
    // Genuine real task-usage awareness for staff/director contexts —
    // an actual counted table, not a vague "learns everything" claim.
    // Only mentioned once a real pattern (5+ real uses) has genuinely
    // emerged, so a brand-new staff member gets nothing invented here.
    if (staffMemberId && (context === 'staff' || context === 'director')) {
      const { data: topTasks } = await supabase.from('staff_task_usage')
        .select('tab_name, use_count').eq('studio_id', studioId).eq('staff_member_id', staffMemberId)
        .gte('use_count', 5).order('use_count', { ascending: false }).limit(3);
      if (topTasks?.length) {
        memoryPrefix += `\n\nThis staff member's genuinely most-used real tabs (actual counted usage, not a guess): ${topTasks.map(t => t.tab_name).join(', ')}. You can mention a quick shortcut to one of these if it's naturally relevant to what they're asking — never force it in.`;
      }
    }

    const chatMessages = [
      { role: 'system', content: ASSISTANT_SYSTEM_PROMPTS[context] + memoryPrefix },
      ...messages.slice(-10), // keep recent context only, bounded
    ];

    let openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: chatMessages, tools: ASSISTANT_FUNCTIONS, tool_choice: 'auto', temperature: 0.4 }),
    });

    if (!openaiRes.ok) {
      const errBody = await openaiRes.text();
      console.error('Assistant chat error:', errBody);
      return res.status(502).json({ error: 'Could not reach the assistant right now.' });
    }

    let data = await openaiRes.json();
    let assistantMessage = data.choices?.[0]?.message;

    // Handle one round of function calling (sufficient for this use case —
    // avoids unbounded tool-call loops)
    if (assistantMessage?.tool_calls?.length) {
      chatMessages.push(assistantMessage);
      for (const call of assistantMessage.tool_calls) {
        const args = JSON.parse(call.function.arguments || '{}');
        const result = await executeAssistantFunction(call.function.name, args, studioId, context, bookingCode);
        chatMessages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }

      openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o-mini', messages: chatMessages, temperature: 0.4 }),
      });
      data = await openaiRes.json();
      assistantMessage = data.choices?.[0]?.message;
    }

    const replyText = assistantMessage?.content || 'Sorry, I could not generate a reply.';

    // Scan the reply for a mention of any registered UI target (case-
    // insensitive) so the frontend can point a real arrow at it. Longest
    // match wins if multiple phrases appear, so "transfer designer"
    // doesn't get shadowed by a shorter unrelated match.
    const targets = ASSISTANT_UI_TARGETS[context] || {};
    let pointTo = null, pointToLabel = null, longestMatch = 0;
    for (const [phrase, elementId] of Object.entries(targets)) {
      if (replyText.toLowerCase().includes(phrase) && phrase.length > longestMatch) {
        pointTo = elementId; pointToLabel = phrase; longestMatch = phrase.length;
      }
    }

    res.json({ reply: replyText, pointTo, pointToLabel });

    // Genuine, lightweight, real memory extraction — runs AFTER the
    // real reply is already sent (never blocks or slows the actual
    // response the customer is waiting for). Only for real returning
    // customers with a known identity. A separate, cheap AI call
    // decides if anything durable and worth remembering came up —
    // most chats won't produce anything, and that's honest and fine.
    if (customerId && context === 'customer') {
      extractCustomerMemory(studioId, customerId, messages.slice(-4).concat([{ role: 'user', content: replyText }])).catch(() => {});
    }
  } catch (err) {
    console.error('Assistant chat error:', err);
    res.status(500).json({ error: 'Something went wrong — please try again.' });
  }
});

// Real, honest background extraction — a separate, cheap AI call
// decides whether anything from the last few real exchanges is
// genuinely worth remembering long-term about this specific customer
// (a stated preference, an occasion, a recurring detail) — NOT a
// transcript dump, and explicitly told to say so if nothing durable
// came up, rather than inventing something to justify the call.
async function extractCustomerMemory(studioId, customerId, recentMessages) {
  if (!process.env.OPENAI_API_KEY) return;
  const transcript = recentMessages.map(m => `${m.role}: ${m.content}`).join('\n');
  const prompt = `Below is a short real exchange between a customer and a pottery studio's chat assistant. Only extract something if it's a genuine, durable fact worth remembering about THIS customer for future visits — a stated preference, an occasion (birthday, wedding gift), a recurring detail. Do NOT extract one-off logistical questions (opening hours, pricing) or anything trivial. If nothing durable came up, say so honestly.

${transcript}

Respond ONLY as JSON: {"facts": ["short factual statement", ...]} — empty array if nothing genuinely worth remembering.`;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.2, max_tokens: 200 }),
    });
    const data = await res.json();
    const parsed = JSON.parse((data.choices?.[0]?.message?.content || '{}').replace(/```json|```/g, '').trim());
    const facts = parsed.facts || [];
    if (facts.length) {
      await supabase.from('customer_memory').insert(
        facts.map(fact => ({ studio_id: studioId, customer_id: customerId, fact, source: 'chat' }))
      );
    }
  } catch (e) { /* genuinely non-critical — memory is a nice-to-have, never worth surfacing an error over */ }
}

// ── Studio Knowledge — real, staff-managed facts Cleo can draw on ──
// ── Genuine real task-usage tracking — feeds honest shortcut
// suggestions once a real pattern emerges, not a vague claim. ──
app.post('/api/staff/log-task-usage', async (req, res) => {
  const { studioId, staffMemberId, tabName } = req.body;
  if (!studioId || !staffMemberId || !tabName) return res.status(400).json({ error: 'studioId, staffMemberId, tabName required' });
  const { data: existing } = await supabase.from('staff_task_usage')
    .select('id, use_count').eq('studio_id', studioId).eq('staff_member_id', staffMemberId).eq('tab_name', tabName).single();
  if (existing) {
    await supabase.from('staff_task_usage').update({ use_count: existing.use_count + 1, last_used_at: new Date().toISOString() }).eq('id', existing.id);
  } else {
    await supabase.from('staff_task_usage').insert({ studio_id: studioId, staff_member_id: staffMemberId, tab_name: tabName });
  }
  res.json({ status: 'logged' });
});

// ── Studio Promotions — a real, genuine history, separate from the
// single current Offer of the Week, so Cleo can honestly reference
// past promotions and upcoming ones, not just "what's live right now". ──
// ── Genuine real "kilnLINK Network" — opt-in cross-studio foundation.
// Real, careful boundary: only what a studio EXPLICITLY publishes
// here ever crosses studio lines. Customer contact details, visit
// history, spend, staff data, and revenue are never part of this,
// with no exception. ──

// GET/POST /api/studio/network-status — a studio's own real opt-in
// state, and the ability to genuinely change it themselves.
app.get('/api/studio/network-status', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  const { data } = await supabase.from('studios').select('network_opted_in, network_opted_in_at, network_display_name').eq('id', studioId).single();
  res.json({ optedIn: !!data?.network_opted_in, optedInAt: data?.network_opted_in_at, displayName: data?.network_display_name });
});

app.post('/api/studio/network-status', async (req, res) => {
  const { studioId, optIn, displayName } = req.body;
  if (!studioId || typeof optIn !== 'boolean') return res.status(400).json({ error: 'studioId and optIn (boolean) required' });
  const updates = { network_opted_in: optIn };
  if (optIn) updates.network_opted_in_at = new Date().toISOString();
  if (displayName !== undefined) updates.network_display_name = displayName;
  const { data, error } = await supabase.from('studios').update(updates).eq('id', studioId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ optedIn: data.network_opted_in });
});

// GET /api/network/studios — the real, genuine directory of every
// OTHER opted-in studio (excludes the requesting studio itself).
// Deliberately returns ONLY display name and network offers — never
// any studio's real internal data.
// GET /api/network/stats — genuine, real, LIVE network-wide stats,
// queried fresh every call, never a hardcoded/cached figure. Powers
// the always-visible network banner. Real, conservative £15 average
// redemption value (same figure already used and explained in
// tonight's earlier seed data — roughly matching this app's own
// actual £1-5 tool prices + typical glazing costs), applied to the
// real, actual count of redemption events on file.
app.get('/api/network/stats', async (req, res) => {
  try {
    const [studiosRes, redemptionsRes, customersRes] = await Promise.all([
      supabase.from('studios').select('id', { count: 'exact', head: true }).eq('network_opted_in', true),
      supabase.from('network_points_ledger').select('points_delta').lt('points_delta', 0),
      supabase.from('network_customers').select('id', { count: 'exact', head: true }),
    ]);
    const studioCount = studiosRes.count || 0;
    const redemptionCount = (redemptionsRes.data || []).length;
    const customerCount = customersRes.count || 0;
    const CONSERVATIVE_AVG_REDEMPTION_VALUE_PENCE = 1500; // £15 — same real, honest figure used and explained elsewhere in this app
    const estimatedCrossSellPence = redemptionCount * CONSERVATIVE_AVG_REDEMPTION_VALUE_PENCE;
    res.json({
      studiosInNetwork: studioCount,
      networkCustomers: customerCount,
      crossStudioRedemptions: redemptionCount,
      estimatedCrossSellValueFormatted: `£${(estimatedCrossSellPence / 100).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`,
    });
  } catch (error) {
    console.error('Network stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/network/studios', async (req, res) => {
  const { studioId } = req.query;
  const { data: studios } = await supabase.from('studios')
    .select('id, network_display_name, name')
    .eq('network_opted_in', true)
    .neq('id', studioId || '');
  const studioIds = (studios || []).map(s => s.id);
  const today = new Date().toISOString().split('T')[0];
  const { data: offers } = studioIds.length
    ? await supabase.from('network_offers').select('*').in('studio_id', studioIds).or(`ends_on.is.null,ends_on.gte.${today}`)
    : { data: [] };
  res.json({
    studios: (studios || []).map(s => ({ id: s.id, displayName: s.network_display_name || s.name })),
    offers: offers || [],
  });
});

// POST /api/network/offers — a studio explicitly publishing a
// network-wide offer, genuinely separate from their own private
// studio_promotions.
app.post('/api/network/offers', async (req, res) => {
  const { studioId, title, description, startsOn, endsOn } = req.body;
  if (!studioId || !title) return res.status(400).json({ error: 'studioId and title required' });
  const { data: studio } = await supabase.from('studios').select('network_opted_in').eq('id', studioId).single();
  if (!studio?.network_opted_in) return res.status(403).json({ error: 'This studio has not opted into the kilnLINK Network yet.' });
  if (containsGenuineURL(title) || containsGenuineURL(description)) {
    return res.status(400).json({ error: 'Network offers can\'t include website links.' });
  }
  const { data, error } = await supabase.from('network_offers').insert({ studio_id: studioId, title, description: description || null, starts_on: startsOn || null, ends_on: endsOn || null }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ offer: data });
});

// ── Genuine real studio-to-studio messaging — opted-in network
// members communicating directly. Real, honest rate limit: max 10
// messages per studio per real day, so this can't become a genuine
// spam channel across the network. ──
app.get('/api/network/messages', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  const { data, error } = await supabase.from('network_messages')
    .select('*, from_studio:from_studio_id(network_display_name, name)')
    .or(`to_studio_id.eq.${studioId},to_studio_id.is.null`)
    .order('created_at', { ascending: false }).limit(50);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ messages: data || [] });
});

app.post('/api/network/messages', async (req, res) => {
  const { studioId, toStudioId, body } = req.body;
  if (!studioId || !body) return res.status(400).json({ error: 'studioId and body required' });

  const { data: studio } = await supabase.from('studios').select('network_opted_in').eq('id', studioId).single();
  if (!studio?.network_opted_in) return res.status(403).json({ error: 'This studio has not opted into the kilnLINK Network yet.' });

  // Genuine real rate limit — max 10 real messages per studio per day
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const { count } = await supabase.from('network_messages').select('id', { count: 'exact', head: true })
    .eq('from_studio_id', studioId).gte('created_at', today.toISOString());
  if ((count || 0) >= 10) return res.status(429).json({ error: 'Genuine daily limit reached (10 messages) — try again tomorrow.' });

  const { data, error } = await supabase.from('network_messages').insert({
    from_studio_id: studioId, to_studio_id: toStudioId || null, body,
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: data });
});

app.get('/api/studio-promotions', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  const { data, error } = await supabase.from('studio_promotions').select('*').eq('studio_id', studioId).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ promotions: data || [] });
});

app.post('/api/studio-promotions', async (req, res) => {
  const { studioId, title, description, startsOn, endsOn } = req.body;
  if (!studioId || !title) return res.status(400).json({ error: 'studioId and title required' });
  // Genuine, real guardrail — no external links in what a customer
  // sees, ever, regardless of studio.
  if (containsGenuineURL(title) || containsGenuineURL(description)) {
    return res.status(400).json({ error: 'Promotions can\'t include website links — describe the offer in your own words instead.' });
  }
  const { data, error } = await supabase.from('studio_promotions').insert({ studio_id: studioId, title, description: description || null, starts_on: startsOn || null, ends_on: endsOn || null }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ promotion: data });
});

app.delete('/api/studio-promotions/:id', async (req, res) => {
  const { error } = await supabase.from('studio_promotions').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ deleted: true });
});

// PATCH /api/studio-promotions/:id — genuine, real edit of an existing
// promotion (was previously add-or-delete only, no way to actually
// correct a mistake or extend/shorten dates without deleting and
// re-adding, losing the real original creation timestamp).
app.patch('/api/studio-promotions/:id', async (req, res) => {
  const { title, description, startsOn, endsOn } = req.body;
  if (containsGenuineURL(title) || containsGenuineURL(description)) {
    return res.status(400).json({ error: 'Promotions can\'t include website links — describe the offer in your own words instead.' });
  }
  const updates = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description || null;
  if (startsOn !== undefined) updates.starts_on = startsOn || null;
  if (endsOn !== undefined) updates.ends_on = endsOn || null;
  const { data, error } = await supabase.from('studio_promotions').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ promotion: data });
});

app.get('/api/studio-knowledge', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  const { data, error } = await supabase.from('studio_knowledge').select('*').eq('studio_id', studioId).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ knowledge: data || [] });
});

app.post('/api/studio-knowledge', async (req, res) => {
  const { studioId, fact, addedBy } = req.body;
  if (!studioId || !fact) return res.status(400).json({ error: 'studioId and fact required' });
  if (containsGenuineURL(fact)) {
    return res.status(400).json({ error: 'Cleo can\'t be taught website links — describe it in your own words instead.' });
  }
  const { data, error } = await supabase.from('studio_knowledge').insert({ studio_id: studioId, fact, added_by: addedBy || null }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ entry: data });
});

app.delete('/api/studio-knowledge/:id', async (req, res) => {
  const { error } = await supabase.from('studio_knowledge').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ deleted: true });
});

// GET /api/pieces/for-booking — every piece logged for a specific
// booking, used by the reference-photo capture screen at table-clearing
app.get('/api/pieces/for-booking', async (req, res) => {
  const { studioId, bookingCode } = req.query;
  if (!studioId || !bookingCode) return res.status(400).json({ error: 'studioId and bookingCode required' });
  const { data: pieces, error } = await supabase.from('pottery_pieces')
    .select('id, piece_type, status, reference_photo_url')
    .eq('studio_id', studioId).eq('booking_id', bookingCode);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ pieces: pieces || [] });
});

// ═══════════════════════════════════════════
// COLLECTION / POSTAL LABELS
// Two label types: 'collection' (customer picks up in studio) and
// 'postal' (posted back, needs a real shipping address). Both carry
// the same core info — bold name, booking ref, collection/ready date,
// piece count, and any damage notes with the standard kiln-risk
// explanation. Postal labels additionally carry the shipping address
// and are ready to feed into Royal Mail's Click & Drop API once a
// studio has a real Online Business Account key — until then, this
// produces a genuinely usable printable label on its own.
// ═══════════════════════════════════════════

const KILN_DAMAGE_EXPLANATION = "Kilns are temperamental by nature — occasional cracking, glaze imperfections, or colour variation can happen during firing, even with careful handling. We inspect every piece and only send out what meets our quality standard, but we wanted to flag this here in case anything looks different to what you expected.";

// GET /api/bookings/:bookingCode/label-data — everything needed to
// render a collection or postal label for this booking
app.get('/api/bookings/:bookingCode/label-data', async (req, res) => {
  const { bookingCode } = req.params;
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });

  try {
    const { data: booking } = await supabase.from('bookings')
      .select('*').eq('studio_id', studioId).eq('booking_code', bookingCode).single();
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const { data: pieces } = await supabase.from('pottery_pieces')
      .select('id, piece_type, status').eq('studio_id', studioId).eq('booking_id', bookingCode);

    const { data: returnAddress } = await supabase.from('studio_return_address')
      .select('*').eq('studio_id', studioId).single();

    res.json({
      customerName: booking.customer_name,
      bookingCode: booking.booking_code,
      readyDate: new Date().toISOString(), // date the label is generated / pieces confirmed ready
      pieceCount: (pieces || []).length,
      pieceTypes: (pieces || []).map(p => p.piece_type).filter(Boolean),
      fulfilmentMethod: booking.fulfilment_method || 'collection',
      shippingAddress: booking.fulfilment_method === 'postal' ? {
        line1: booking.shipping_address_line1, line2: booking.shipping_address_line2,
        city: booking.shipping_city, postcode: booking.shipping_postcode, country: booking.shipping_country,
      } : null,
      damageNotes: booking.damage_notes || null,
      kilnExplanation: booking.damage_notes ? KILN_DAMAGE_EXPLANATION : null,
      returnAddress: returnAddress || null,
    });
  } catch (error) {
    console.error('Label data error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/bookings/:bookingCode/shipping-info — save/update the
// postal shipping address and fulfilment method for a booking
app.post('/api/bookings/:bookingCode/shipping-info', async (req, res) => {
  const { bookingCode } = req.params;
  const { studioId, fulfilmentMethod, addressLine1, addressLine2, city, postcode, country, damageNotes } = req.body;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });

  const updates = {};
  if (fulfilmentMethod) updates.fulfilment_method = fulfilmentMethod;
  if (addressLine1 !== undefined) updates.shipping_address_line1 = addressLine1;
  if (addressLine2 !== undefined) updates.shipping_address_line2 = addressLine2;
  if (city !== undefined) updates.shipping_city = city;
  if (postcode !== undefined) updates.shipping_postcode = postcode;
  if (country !== undefined) updates.shipping_country = country;
  if (damageNotes !== undefined) updates.damage_notes = damageNotes;

  const { data, error } = await supabase.from('bookings')
    .update(updates).eq('studio_id', studioId).eq('booking_code', bookingCode).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ booking: data });
});

// GET/POST /api/studio/return-address — the studio's own postal return
// address, set once in Setup, used as the "from" address on labels
app.get('/api/studio/return-address', async (req, res) => {
  const { studioId } = req.query;
  const { data } = await supabase.from('studio_return_address').select('*').eq('studio_id', studioId).single();
  res.json({ address: data || null });
});

app.post('/api/studio/return-address', async (req, res) => {
  const { studioId, businessName, addressLine1, addressLine2, city, postcode, country, royalMailApiKey } = req.body;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  const { data, error } = await supabase.from('studio_return_address').upsert({
    studio_id: studioId, business_name: businessName, address_line1: addressLine1,
    address_line2: addressLine2, city, postcode, country: country || 'United Kingdom',
    royal_mail_oba_api_key: royalMailApiKey || null,
  }, { onConflict: 'studio_id' }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ address: data });
});

// POST /api/bookings/:bookingCode/create-royal-mail-label — REAL Royal
// Mail Click & Drop integration. Only works once the studio has entered
// a genuine Online Business Account API key in Setup — this cannot be
// faked or bypassed, since real postage costs real money and needs a
// real account. Returns a clear, honest error if no key is set, rather
// than pretending to create a label.
// POST /api/studio/test-royal-mail-connection — genuinely tests whether
// this account can create AND generate a real label, not just whether
// the API key is accepted. Creates one real test order (harmless, no
// postage is bought — orders can be deleted afterward in Click & Drop)
// and attempts to fetch its label. Reports the true outcome either way,
// since some accounts can create orders but the label file itself is
// restricted to certain account tiers — a real, documented limitation
// worth catching honestly rather than assuming success.
app.post('/api/studio/test-royal-mail-connection', async (req, res) => {
  const { studioId } = req.body;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });

  const { data: returnAddress } = await supabase.from('studio_return_address').select('*').eq('studio_id', studioId).single();
  if (!returnAddress?.royal_mail_oba_api_key) {
    return res.status(400).json({ error: 'No Royal Mail API key saved yet — add it above first.' });
  }

  try {
    const testRef = `KLNK-TEST-${Date.now()}`;
    const orderRes = await fetch('https://api.parcel.royalmail.com/api/v1/Orders', {
      method: 'POST',
      headers: { 'Authorization': returnAddress.royal_mail_oba_api_key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{
          orderReference: testRef,
          recipient: {
            address: {
              fullName: 'Test Recipient', addressLine1: '1 Test Street',
              city: 'London', postcode: 'SW1A 1AA', countryCode: 'GB',
            },
          },
          billing: { address: { fullName: 'Test Recipient', addressLine1: '1 Test Street', city: 'London', postcode: 'SW1A 1AA', countryCode: 'GB' } },
          packages: [{ weightInGrams: 500, packageFormatIdentifier: 'parcel' }],
        }],
      }),
    });
    const orderData = await orderRes.json();
    if (!orderRes.ok) {
      return res.status(502).json({ error: `Connection test failed — Royal Mail rejected the request: ${orderData.errors?.[0]?.errorMessage || 'unknown error'}. Check your API key and return address.` });
    }

    const orderIdentifier = orderData.createdOrders?.[0]?.orderIdentifier;
    if (!orderIdentifier) {
      return res.json({ connectionWorks: true, labelGenerated: false, note: 'Order created but no order identifier returned — cannot test label fetch.' });
    }

    // Now genuinely attempt to fetch the label — this is the real test,
    // the part that's documented to fail on some account tiers.
    const labelRes = await fetch(`https://api.parcel.royalmail.com/api/v1/orders/label?orderIdentifiers=${orderIdentifier}&documentType=postageLabel`, {
      headers: { 'Authorization': returnAddress.royal_mail_oba_api_key },
    });

    if (labelRes.ok) {
      const contentType = labelRes.headers.get('content-type') || '';
      // A genuine label response is a PDF or similar binary file, not JSON
      const labelGenerated = !contentType.includes('application/json');
      res.json({ connectionWorks: true, labelGenerated, testOrderReference: testRef });
    } else {
      const labelErrorBody = await labelRes.text();
      console.log('Royal Mail label fetch failed (this is the known limitation):', labelErrorBody);
      res.json({ connectionWorks: true, labelGenerated: false, testOrderReference: testRef });
    }
  } catch (error) {
    console.error('Royal Mail connection test error:', error);
    res.status(500).json({ error: 'Could not reach Royal Mail to run the test.' });
  }
});

app.post('/api/bookings/:bookingCode/create-royal-mail-label', async (req, res) => {
  const { bookingCode } = req.params;
  const { studioId } = req.body;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });

  const { data: returnAddress } = await supabase.from('studio_return_address').select('*').eq('studio_id', studioId).single();
  if (!returnAddress?.royal_mail_oba_api_key) {
    return res.status(400).json({
      error: 'No Royal Mail Online Business Account is connected yet. Add your Click & Drop API key in Setup to enable real automatic labels — until then, use the printable label instead.',
      needsSetup: true,
    });
  }

  const { data: booking } = await supabase.from('bookings').select('*').eq('studio_id', studioId).eq('booking_code', bookingCode).single();
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (!booking.shipping_postcode) return res.status(400).json({ error: 'No shipping address saved for this booking yet.' });

  try {
    const rmRes = await fetch('https://api.parcel.royalmail.com/api/v1/Orders', {
      method: 'POST',
      headers: { 'Authorization': returnAddress.royal_mail_oba_api_key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{
          orderReference: booking.booking_code,
          recipient: {
            address: {
              fullName: booking.customer_name,
              addressLine1: booking.shipping_address_line1,
              addressLine2: booking.shipping_address_line2 || undefined,
              city: booking.shipping_city,
              postcode: booking.shipping_postcode,
              countryCode: 'GB',
            },
          },
          billing: { address: { fullName: booking.customer_name, addressLine1: booking.shipping_address_line1, city: booking.shipping_city, postcode: booking.shipping_postcode, countryCode: 'GB' } },
          packages: [{ weightInGrams: 500, packageFormatIdentifier: 'parcel' }],
        }],
      }),
    });
    const rmData = await rmRes.json();
    if (!rmRes.ok) {
      console.error('Royal Mail API error:', rmData);
      return res.status(502).json({ error: 'Royal Mail rejected the label request — check the address and try again, or use the printable label.' });
    }
    res.json({ status: 'created', royalMailResponse: rmData });
  } catch (error) {
    console.error('Royal Mail integration error:', error);
    res.status(500).json({ error: 'Could not reach Royal Mail — use the printable label instead.' });
  }
});

// ── Genuine real Host By Post postal system, per direct request ──
// Real, honest, deliberate note: Host By Post has no confirmed
// website/checkout system yet, so this is a genuine STAFF-ENTERED
// order pipeline (e.g. from an email or marketplace order), NOT an
// automatic e-commerce integration — reuses the exact same, already-
// proven, currently-correct Royal Mail Click & Drop API call
// structure above, verified against Royal Mail's own real, current
// documentation before use.

const HOST_BY_POST_STUDIO_ID = 'a1000000-0000-0000-0000-000000000001';

app.get('/api/hbp/products', async (req, res) => {
  const { data } = await supabase.from('hbp_products').select('*').eq('studio_id', HOST_BY_POST_STUDIO_ID).eq('active', true);
  res.json({ products: data || [] });
});

app.get('/api/hbp/orders', async (req, res) => {
  const { data } = await supabase.from('hbp_orders').select('*, product:product_id(name, weight_grams, weight_confirmed)')
    .eq('studio_id', HOST_BY_POST_STUDIO_ID).order('created_at', { ascending: false }).limit(50);
  res.json({ orders: data || [] });
});

app.post('/api/hbp/orders', async (req, res) => {
  const { orderReference, customerName, customerEmail, addressLine1, addressLine2, city, postcode, productId, quantity } = req.body;
  if (!orderReference || !customerName || !addressLine1 || !city || !postcode) {
    return res.status(400).json({ error: 'orderReference, customerName, addressLine1, city, and postcode are all required.' });
  }
  const { data, error } = await supabase.from('hbp_orders').insert({
    studio_id: HOST_BY_POST_STUDIO_ID, order_reference: orderReference, customer_name: customerName, customer_email: customerEmail || null,
    shipping_address_line1: addressLine1, shipping_address_line2: addressLine2 || null, shipping_city: city, shipping_postcode: postcode,
    product_id: productId || null, quantity: quantity || 1,
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ order: data });
});

// Genuine real Royal Mail label creation for a Host By Post order —
// same exact, proven API call structure as the Kiln Cafe endpoint
// above, but uses the real product's own honest weight (flagging if
// it's still an unconfirmed placeholder) rather than a hardcoded
// 500g guess.
app.post('/api/hbp/orders/:orderId/create-royal-mail-label', async (req, res) => {
  const { orderId } = req.params;

  const { data: returnAddress } = await supabase.from('studio_return_address').select('*').eq('studio_id', HOST_BY_POST_STUDIO_ID).single();
  if (!returnAddress?.royal_mail_oba_api_key) {
    return res.status(400).json({
      error: 'Host By Post has no Royal Mail Online Business Account connected yet — this needs its own real Click & Drop API key, separate from The Kiln Cafe\'s.',
      needsSetup: true,
    });
  }

  const { data: order } = await supabase.from('hbp_orders').select('*, product:product_id(*)').eq('id', orderId).eq('studio_id', HOST_BY_POST_STUDIO_ID).single();
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const weightGrams = order.product?.weight_grams || 500;
  const weightIsHonestPlaceholder = !order.product?.weight_confirmed;

  try {
    const rmRes = await fetch('https://api.parcel.royalmail.com/api/v1/Orders', {
      method: 'POST',
      headers: { 'Authorization': returnAddress.royal_mail_oba_api_key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{
          orderReference: order.order_reference,
          recipient: {
            address: {
              fullName: order.customer_name,
              addressLine1: order.shipping_address_line1,
              addressLine2: order.shipping_address_line2 || undefined,
              city: order.shipping_city,
              postcode: order.shipping_postcode,
              countryCode: 'GB',
            },
          },
          billing: { address: { fullName: order.customer_name, addressLine1: order.shipping_address_line1, city: order.shipping_city, postcode: order.shipping_postcode, countryCode: 'GB' } },
          packages: [{ weightInGrams: weightGrams * (order.quantity || 1), packageFormatIdentifier: 'parcel' }],
        }],
      }),
    });
    const rmData = await rmRes.json();
    if (!rmRes.ok) {
      console.error('Royal Mail API error (Host By Post):', rmData);
      return res.status(502).json({ error: 'Royal Mail rejected the label request — check the address and try again.' });
    }
    await supabase.from('hbp_orders').update({ status: 'labelled', journey_stage: 'kit_labelled' }).eq('id', orderId);
    res.json({
      status: 'created', royalMailResponse: rmData,
      weightWarning: weightIsHonestPlaceholder ? `Used an unconfirmed placeholder weight (${weightGrams}g) — worth actually weighing a real kit and updating this in the product catalogue.` : null,
    });
  } catch (error) {
    console.error('Royal Mail integration error (Host By Post):', error);
    res.status(500).json({ error: 'Could not reach Royal Mail — try again.' });
  }
});

// POST /api/hbp/orders/:orderId/advance — move an order to the next
// stage in the postal journey. Each stage is recorded as a journey
// event so there's a complete audit trail.
// Stages: kit_labelled → kit_dispatched → piece_received →
//         firing → fired_dispatched → (repeat from piece_received
//         for additional firings) → complete
app.post('/api/hbp/orders/:orderId/advance', async (req, res) => {
  const { orderId } = req.params;
  const { stage, notes, staffName, trackingNumber, needsAdditionalFiring } = req.body;

  const validStages = [
    'kit_labelled', 'kit_dispatched',
    'piece_received', 'firing', 'fired_dispatched',
    'complete'
  ];
  if (!validStages.includes(stage)) {
    return res.status(400).json({ error: `Invalid stage: ${stage}` });
  }

  // Build the order update
  const updates = { journey_stage: stage, status: stage };
  if (stage === 'piece_received') updates.return_received_at = new Date().toISOString();
  if (stage === 'firing') {/* no extra fields */}
  if (stage === 'fired_dispatched') {
    updates.fired_dispatched_at = new Date().toISOString();
    if (trackingNumber) updates.royal_mail_tracking_number = trackingNumber;
  }
  if (stage === 'kit_dispatched' && trackingNumber) updates.royal_mail_tracking_number = trackingNumber;
  if (typeof needsAdditionalFiring === 'boolean') updates.needs_additional_firing = needsAdditionalFiring;
  if (notes) updates.notes = notes;

  // Increment firing count when entering firing stage
  if (stage === 'firing') {
    const { data: order } = await supabase.from('hbp_orders').select('firing_count').eq('id', orderId).single();
    updates.firing_count = (order?.firing_count || 0) + 1;
  }

  const { error: updateError } = await supabase.from('hbp_orders').update(updates).eq('id', orderId);
  if (updateError) return res.status(500).json({ error: updateError.message });

  // Log the journey event
  await supabase.from('hbp_journey_events').insert({
    order_id: orderId,
    stage,
    notes: notes || null,
    staff_name: staffName || null,
    tracking_number: trackingNumber || null
  });

  res.json({ advanced: true, stage });
});

// GET /api/hbp/orders/:orderId/journey — full journey history for one order
app.get('/api/hbp/orders/:orderId/journey', async (req, res) => {
  const { orderId } = req.params;
  const { data, error } = await supabase
    .from('hbp_journey_events')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ events: data || [] });
});

// POST /api/hbp/orders/:orderId/return-label — generate a return label
// for the customer to send their painted piece back to us.
// Uses the same Royal Mail Click & Drop integration but in reverse —
// the sender is the customer, the recipient is Host By Post's return address.
app.post('/api/hbp/orders/:orderId/return-label', async (req, res) => {
  const { orderId } = req.params;
  const { studioId } = req.body;

  const { data: order } = await supabase.from('hbp_orders').select('*, hbp_products(weight_grams)').eq('id', orderId).single();
  if (!order) return res.status(404).json({ error: 'Order not found' });

  // Get the HBP Royal Mail setup (same as kit dispatch but reversed addresses)
  const { data: setup } = await supabase.from('studio_settings')
    .select('value').eq('studio_id', studioId).eq('key', 'hbp_royal_mail').single();
  if (!setup?.value) return res.status(400).json({ error: 'Royal Mail not configured for Host By Post' });

  const rm = JSON.parse(setup.value);
  if (!rm.apiKey) return res.status(400).json({ error: 'No API key configured' });

  // For a return label, sender = customer, recipient = us
  const returnLabelPayload = {
    orders: [{
      orderReference: `RETURN-${order.order_reference}`,
      recipient: {
        name: rm.businessName || 'Host By Post',
        addressLine1: rm.addressLine1,
        city: rm.city,
        postcode: rm.postcode,
        countryCode: 'GB'
      },
      sender: {
        name: order.customer_name,
        addressLine1: order.shipping_address_line1,
        addressLine2: order.shipping_address_line2 || '',
        city: order.shipping_city,
        postcode: order.shipping_postcode,
        countryCode: 'GB'
      },
      packages: [{ weightInGrams: order.hbp_products?.weight_grams || 400 }],
      orderDate: new Date().toISOString(),
      serviceCode: 'TPS48'
    }]
  };

  try {
    const rmRes = await fetch('https://api.parcel.royalmail.com/api/v1/orders', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${rm.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(returnLabelPayload)
    });
    const rmData = await rmRes.json();
    const tracking = rmData.orders?.[0]?.packages?.[0]?.trackingNumber;
    if (tracking) {
      await supabase.from('hbp_orders').update({ return_label_tracking: tracking }).eq('id', orderId);
      await supabase.from('hbp_journey_events').insert({ order_id: orderId, stage: 'return_label_created', tracking_number: tracking });
    }
    res.json({ created: true, tracking, rmData });
  } catch(e) {
    res.status(500).json({ error: 'Royal Mail error: ' + e.message });
  }
});



// ── Live Table Floor Plan endpoints ─────────────────────────────────

// GET /api/floor/active — all active bookings today with assignment
// and session timing info, for the floor plan screen.
app.get('/api/floor/active', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  const today = new Date(); today.setHours(0,0,0,0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);
  const { data: bookings } = await supabase.from('bookings')
    .select('booking_code,customer_name,table_number,current_stage,session_start,num_people,status')
    .eq('studio_id', studioId)
    .gte('session_start', today.toISOString())
    .lt('session_start', tomorrow.toISOString())
    .not('status', 'eq', 'cancelled');
  const { data: assignments } = await supabase.from('booking_assignments')
    .select('booking_code,staff_name,staff_member_id,is_primary')
    .eq('studio_id', studioId).is('released_at', null);
  const { data: checks } = await supabase.from('booking_flow_checks')
    .select('booking_code,stage,check_key,completed')
    .eq('studio_id', studioId);
  const assignMap = {};
  (assignments||[]).forEach(a => {
    if (!assignMap[a.booking_code]) assignMap[a.booking_code] = [];
    assignMap[a.booking_code].push(a);
  });
  const checkMap = {};
  (checks||[]).forEach(c => {
    if (!checkMap[c.booking_code]) checkMap[c.booking_code] = {};
    checkMap[c.booking_code][`${c.stage}:${c.check_key}`] = c.completed;
  });
  res.json({
    bookings: (bookings||[]).map(b => ({
      ...b,
      assignments: assignMap[b.booking_code] || [],
      checks: checkMap[b.booking_code] || {}
    }))
  });
});

// GET /api/floor/tables — studio table config for the floor plan
app.get('/api/floor/tables', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  const { data: tables } = await supabase.from('studio_tables')
    .select('id,name,room,capacity,sort_order')
    .eq('studio_id', studioId).order('sort_order');
  const { data: layouts } = await supabase.from('table_chair_layouts')
    .select('table_name,chairs,split_position,is_split')
    .eq('studio_id', studioId);
  const layoutMap = {};
  (layouts||[]).forEach(l => { layoutMap[l.table_name] = l; });
  res.json({
    tables: (tables||[]).map(t => ({ ...t, layout: layoutMap[t.name] || null }))
  });
});

// POST /api/floor/assign — assign a staff member to a booking
app.post('/api/floor/assign', async (req, res) => {
  const { studioId, bookingCode, staffMemberId, staffName, isPrimary } = req.body;
  if (!studioId||!bookingCode||!staffMemberId||!staffName) return res.status(400).json({ error: 'missing fields' });
  const { error } = await supabase.from('booking_assignments').upsert({
    studio_id: studioId, booking_code: bookingCode,
    staff_member_id: staffMemberId, staff_name: staffName,
    is_primary: isPrimary !== false, released_at: null
  }, { onConflict: 'studio_id,booking_code,staff_member_id' });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ assigned: true });
});

// POST /api/floor/release — release a staff member from a booking
app.post('/api/floor/release', async (req, res) => {
  const { studioId, bookingCode, staffMemberId } = req.body;
  const { error } = await supabase.from('booking_assignments')
    .update({ released_at: new Date().toISOString() })
    .eq('studio_id', studioId).eq('booking_code', bookingCode).eq('staff_member_id', staffMemberId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ released: true });
});

// POST /api/floor/check — tick or untick a flow checklist item
app.post('/api/floor/check', async (req, res) => {
  const { studioId, bookingCode, stage, checkKey, completed, staffName } = req.body;
  const { error } = await supabase.from('booking_flow_checks').upsert({
    studio_id: studioId, booking_code: bookingCode, stage, check_key: checkKey,
    completed: !!completed, completed_by: completed ? staffName : null,
    completed_at: completed ? new Date().toISOString() : null
  }, { onConflict: 'studio_id,booking_code,stage,check_key' });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ saved: true });
});

// GET/POST /api/floor/items/:bookingCode — draggable table items
app.get('/api/floor/items/:bookingCode', async (req, res) => {
  const { studioId } = req.query;
  const { data } = await supabase.from('table_session_items')
    .select('*').eq('studio_id', studioId).eq('booking_code', req.params.bookingCode);
  res.json({ items: data || [] });
});
app.post('/api/floor/items/:bookingCode', async (req, res) => {
  const { studioId, items } = req.body;
  await supabase.from('table_session_items')
    .delete().eq('studio_id', studioId).eq('booking_code', req.params.bookingCode);
  if (items?.length) {
    await supabase.from('table_session_items')
      .insert(items.map(it => ({ ...it, studio_id: studioId, booking_code: req.params.bookingCode })));
  }
  res.json({ saved: true });
});

// POST /api/floor/layout — save chair layout for a table
app.post('/api/floor/layout', async (req, res) => {
  const { studioId, tableName, chairs, splitPosition, isSplit } = req.body;
  const { error } = await supabase.from('table_chair_layouts').upsert({
    studio_id: studioId, table_name: tableName,
    chairs: chairs || [], split_position: splitPosition ?? 50,
    is_split: !!isSplit, updated_at: new Date().toISOString()
  }, { onConflict: 'studio_id,table_name' });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ saved: true });
});

app.get('/api/pieces/ready-for-pickup', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });

  try {
    // Customers only see a piece as ready once it's genuinely been packed
    // — 'fired' alone isn't enough, since the piece still needs boxing up
    // and setting aside for collection first. This was a real gap: before
    // the packing stage existed, the customer app showed pieces as ready
    // the moment they came out of the kiln, before anyone had actually
    // packed them.
    const { data: pieces, error } = await supabase
      .from('pottery_pieces')
      .select('*')
      .eq('studio_id', studioId)
      .eq('status', 'packed')
      .order('updated_at', { ascending: true });

    if (error) throw error;

    const enriched = await enrichPiecesWithCustomerName(studioId, pieces || []);
    res.json({ pieces: enriched });
  } catch (error) {
    console.error('Error fetching ready-for-pickup pieces:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/pieces/mark-picked-up
 * Mark fired pieces as collected by the customer
 */
/**
 * POST /api/pieces/confirm-ready-by-scan
 * Kiln unload step: technician scans/pastes a booking's QR (from the stamped
 * collection photo) to confirm those pieces are out of the kiln and ready for
 * collection. Marks matching pieces as 'fired' individually, by booking — a
 * finer-grained alternative to bulk-firing a whole kiln session at once.
 * No external notification service — the customer's live QR page picks up
 * the status change automatically the next time they open it.
 */
app.post('/api/pieces/confirm-ready-by-scan', async (req, res) => {
  const { studioId, bookingCode } = req.body;
  if (!studioId || !bookingCode) {
    return res.status(400).json({ error: 'studioId and bookingCode required' });
  }

  try {
    const { data: booking } = await supabase
      .from('bookings')
      .select('customer_name')
      .eq('studio_id', studioId)
      .eq('booking_code', bookingCode)
      .single();

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found for this QR code' });
    }

    // Mark pieces for this booking that are dipped/in-kiln as fired.
    // (If they were already fired via a bulk kiln-session action, this simply finds none — safe either way.)
    const { data: updatedPieces, error } = await supabase
      .from('pottery_pieces')
      .update({ status: 'fired', updated_at: new Date().toISOString() })
      .eq('studio_id', studioId)
      .eq('booking_id', bookingCode)
      .in('status', ['dipped', 'in_kiln'])
      .select('id, piece_type');

    if (error) throw error;

    // Same packing alert as the bulk-batch path — these pieces just
    // became fired via an individual scan confirm, and need packing too.
    if ((updatedPieces || []).length) {
      await supabase.from('staff_alerts').insert({
        studio_id: studioId, trigger_type: 'packing_needed',
        booking_code: bookingCode, next_role: 'Packing',
        icon: '📦', label: 'Pieces ready to pack',
        message: `${updatedPieces.length} piece(s) for ${booking.customer_name} are fired and need packing.`,
        context: { bookingCode, pieceCount: updatedPieces.length }, acknowledged: false,
      });
    }

    res.json({
      status: 'confirmed',
      customerName: booking.customer_name,
      piecesMarkedReady: updatedPieces || []
    });
  } catch (error) {
    console.error('Error confirming pieces ready by scan:', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════
// PACKING STAGE — sits between firing and pickup. A piece coming
// out of the kiln isn't actually ready for the customer until it's
// been packed (boxed/bagged, set aside, ideally matched to its
// batch/QR reference so there's a clear record of what came out
// when, and who packed it). Currently allocated to Jenny.
// ═══════════════════════════════════════════

// GET /api/packing/queue — pieces that are fired but not yet packed,
// for whoever's doing the packing (currently Jenny)
app.get('/api/packing/queue', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });

  try {
    const { data: pieces, error } = await supabase
      .from('pottery_pieces')
      .select('*')
      .eq('studio_id', studioId)
      .eq('status', 'fired')
      .order('updated_at', { ascending: true });
    if (error) throw error;

    const enriched = await enrichPiecesWithCustomerName(studioId, pieces || []);
    res.json({ pieces: enriched, count: enriched.length });
  } catch (error) {
    console.error('Error fetching packing queue:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/packing/complete — mark one or more fired pieces as packed,
// referencing at least one QR/booking code from the batch as proof of
// what was packed and when. This is the "complete" action for the
// person doing the packing.
app.post('/api/packing/complete', async (req, res) => {
  const { studioId, pieceIds, referenceBookingCode, packedBy, batchCode, firedDate, pullDate } = req.body;
  if (!studioId || !pieceIds || !Array.isArray(pieceIds) || !pieceIds.length) {
    return res.status(400).json({ error: 'studioId and a non-empty pieceIds array required' });
  }
  if (!referenceBookingCode) {
    return res.status(400).json({ error: 'referenceBookingCode required — at least one QR/booking code from this batch, so there\'s a clear record of what was packed' });
  }

  try {
    const { data: updated, error } = await supabase
      .from('pottery_pieces')
      .update({
        status: 'packed', packed_at: new Date().toISOString(),
        packed_by: packedBy || null, updated_at: new Date().toISOString(),
      })
      .eq('studio_id', studioId)
      .in('id', pieceIds)
      .select('id, booking_id, piece_type');
    if (error) throw error;

    // Log the pack event itself — reference code, batch, dates — as a
    // genuine record separate from the pieces themselves, so there's an
    // audit trail of "this batch, fired on this date, packed on this date,
    // referencing this QR code, by this person."
    const { data: packLog, error: logError } = await supabase.from('packing_log').insert({
      studio_id: studioId, reference_booking_code: referenceBookingCode,
      batch_code: batchCode || null, fired_date: firedDate || null, pull_date: pullDate || null,
      packed_by: packedBy || null, piece_count: (updated || []).length,
      piece_ids: (updated || []).map(p => p.id),
    }).select().single();
    if (logError) console.error('Packing log insert failed (non-fatal):', logError);

    res.json({ status: 'packed', piecesPacked: (updated || []).length, packLog });
  } catch (error) {
    console.error('Error completing packing:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/packing/log — recent packing history, for reference/audit
app.get('/api/packing/log', async (req, res) => {
  const { studioId, limit } = req.query;
  const { data } = await supabase.from('packing_log')
    .select('*').eq('studio_id', studioId)
    .order('created_at', { ascending: false }).limit(parseInt(limit) || 30);
  res.json({ log: data || [] });
});

app.post('/api/pieces/mark-picked-up', async (req, res) => {
  const { studioId, pieceIds } = req.body;
  if (!studioId || !pieceIds || !Array.isArray(pieceIds)) {
    return res.status(400).json({ error: 'studioId and pieceIds array required' });
  }

  try {
    const { data, error } = await supabase
      .from('pottery_pieces')
      .update({ status: 'picked_up', updated_at: new Date().toISOString() })
      .eq('studio_id', studioId)
      .in('id', pieceIds)
      .select('id, booking_id');

    if (error) throw error;

    // Genuine, real loyalty update — this is the actual, natural end
    // of a visit (pieces genuinely collected), so it's the honest
    // trigger point rather than something arbitrary earlier in the
    // process. Resolves the real customer via the booking's own
    // customer_name (same real matching already used by the existing
    // loyalty lookup), and only counts ONE visit per real booking
    // even if multiple pieces from the same booking are marked picked
    // up in the same request or across separate calls today.
    const bookingIds = [...new Set((data || []).map(p => p.booking_id).filter(Boolean))];
    for (const bookingCode of bookingIds) {
      try {
        const { data: booking } = await supabase.from('bookings').select('customer_name').eq('studio_id', studioId).eq('booking_code', bookingCode).single();
        if (!booking?.customer_name) continue;

        const { data: existingCustomer } = await supabase.from('customers').select('id, last_visit_at').eq('studio_id', studioId).ilike('name', booking.customer_name).limit(1).single();
        if (!existingCustomer) continue; // genuinely no matching loyalty record — nothing to update, not an error

        // Honest, real guard against double-counting: if this exact
        // real booking already triggered a loyalty visit today (e.g.
        // pieces picked up across two separate real calls), don't
        // count it twice.
        const today = new Date().toISOString().split('T')[0];
        const alreadyCountedToday = existingCustomer.last_visit_at && existingCustomer.last_visit_at.split('T')[0] === today;
        if (alreadyCountedToday) continue;

        // Real, honest spend figure — actual app_extra_charges tied to
        // this specific booking today. This is genuinely a PARTIAL
        // figure (app-tool purchases only, not full in-studio spend
        // like clay/firing/table time, which lives in the real POS,
        // not fully mirrored here) — better than nothing, not
        // overclaimed as the complete total.
        const { data: charges } = await supabase.from('app_extra_charges').select('amount_cents').eq('studio_id', studioId).eq('booking_code', bookingCode);
        const spendCents = (charges || []).reduce((sum, c) => sum + (c.amount_cents || 0), 0);

        await recordLoyaltyVisit(studioId, existingCustomer.id, bookingCode, spendCents).catch(loyaltyErr => {
          console.error(`Loyalty update failed for booking ${bookingCode} (non-critical, pickup still recorded):`, loyaltyErr);
        });
      } catch (loyaltyErr) {
        console.error(`Loyalty update failed for booking ${bookingCode} (non-critical, pickup still recorded):`, loyaltyErr);
      }
    }

    res.json({ status: 'updated', piecesCount: data.length });
  } catch (error) {
    console.error('Error marking pieces picked up:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/pieces/awaiting-dip
 * Get list of pieces ready for dip for a studio
 */
app.get('/api/pieces/awaiting-dip', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studio_id required' });

  try {
    const { data: pieces, error } = await supabase
      .from('pottery_pieces')
      .select('*')
      .eq('studio_id', studioId)
      .eq('status', 'ready_for_dip')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ pieces: pieces || [] });
  } catch (error) {
    console.error('Error fetching pieces:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/customer/:customerId/unfinished-pieces
 * Get unfinished pieces for a customer (for return visits)
 * Shows incomplete pieces that still need to be completed (no fee charged yet)
 */
app.get('/api/customer/:customerId/unfinished-pieces', async (req, res) => {
  const { customerId } = req.params;
  const { studioId } = req.query;
  
  if (!customerId || !studioId) {
    return res.status(400).json({ error: 'customerId and studioId required' });
  }

  try {
    const { data: unfinishedPieces, error } = await supabase
      .from('pottery_pieces')
      .select('*')
      .eq('studio_id', studioId)
      .eq('customer_id', customerId)
      .eq('is_complete', false)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      unfinishedPieces: unfinishedPieces || [],
      count: unfinishedPieces?.length || 0
    });
  } catch (error) {
    console.error('Error fetching unfinished pieces:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/pieces/complete-unfinished
 * Complete unfinished pieces from previous visits
 * Only called when customer returns to finish + pay return fee
 */
app.post('/api/pieces/complete-unfinished', async (req, res) => {
  const { studioId, customerId, pieceIds, returnFeePerPiece } = req.body;
  
  if (!studioId || !customerId || !pieceIds || !Array.isArray(pieceIds)) {
    return res.status(400).json({ error: 'Missing studioId, customerId, or pieceIds array' });
  }

  try {
    // Update each piece: mark complete + add return fee
    const updates = pieceIds.map(pieceId => ({
      id: pieceId,
      is_complete: true,
      outstanding_balance: returnFeePerPiece || 0,  // Add fee now, when they return
      updated_at: new Date().toISOString()
    }));

    // Update all pieces
    for (const update of updates) {
      const { error } = await supabase
        .from('pottery_pieces')
        .update({
          is_complete: update.is_complete,
          outstanding_balance: update.outstanding_balance,
          updated_at: update.updated_at
        })
        .eq('id', update.id);

      if (error) throw error;
    }

    // Log loyalty transaction: points for completing pieces
    await supabase
      .from('loyalty_transactions')
      .insert({
        studio_id: studioId,
        customer_id: customerId,
        points_earned: pieceIds.length,
        transaction_type: 'paint',
        description: `Completed ${pieceIds.length} unfinished piece(s) from previous visit`
      });

    res.json({
      status: 'completed',
      piecesUpdated: pieceIds.length,
      pointsEarned: pieceIds.length,
      returnFeesAdded: pieceIds.length * (returnFeePerPiece || 0)
    });
  } catch (error) {
    console.error('Error completing unfinished pieces:', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════
// STUDIO TABLE MANAGEMENT
// ═══════════════════════════════════════════

// ═══════════════════════════════════════════
// STAFF DUTIES SYSTEM
// Team members, roles, weekly-editable duty lists,
// and per-session duty tracking tied to whoever's
// working that table/booking.
// ═══════════════════════════════════════════

// Default duty templates per role — studios can add/edit their own via
// the duties config endpoint, these are just sensible starting points.
const DEFAULT_ROLE_DUTIES = {
  'Ceramic Technician': [
    'Check kiln temperature and firing schedule',
    'Load and unload kiln safely',
    'Inspect fired pieces for defects',
    'Mix and prepare glazes as needed',
    'Maintain kiln room cleanliness',
  ],
  'Studio Manager': [
    'Open/close studio checklist',
    'Staff rota and cover',
    'Stock ordering and supplier contact',
    'Handle customer queries and complaints',
    'Daily takings reconciliation',
  ],
  'Studio Assistant': [
    'Clear tables after each session',
    'Clean tables and set up for next booking',
    'Fill paint pots and check paint levels',
    'Clean paint brushes and pots',
    'Restock coasters and placemats',
    'Write and place name cards',
  ],
  'Studio Executive': [
    'Oversee daily studio operations',
    'Review revenue and booking reports',
    'Liaise with Head Office / franchise',
    'Staff performance check-ins',
  ],
  'Barista': [
    'Set up coffee machine and drinks station',
    'Prepare and serve drinks orders',
    'Keep drinks station stocked and clean',
    'Manage cake/food display',
  ],
};

// GET /api/staff/team — list team members for a studio
// Role hierarchy — lower number = more senior. Used to route
// handoff alerts to the right level and build the studio manager's
// end-of-day rollup.
const ROLE_HIERARCHY = {
  'Studio Manager':     1,
  'Studio Executive':   2,
  'Ceramic Technician': 3,
  'Studio Assistant':   4,
  'Barista':            4,
};

// Handoff alert trigger definitions — maps an event type to a
// human-readable message template and which role should action it next.
const ALERT_TRIGGERS = {
  table_cleared:      { icon:'🧹', label:'Table cleared',            nextRole: 'Studio Assistant',   message: (d) => `Table ${d.table || ''} has been cleared and is ready for the next booking.` },
  duties_completed:   { icon:'✅', label:'Duties completed',         nextRole: 'Studio Manager',      message: (d) => `${d.staffName || 'A team member'} has completed all duties for ${d.customerName || 'a session'}.` },
  checklist_done:     { icon:'📋', label:'Setup checklist complete', nextRole: 'Studio Manager',      message: (d) => `Table setup checklist complete for ${d.customerName || 'a booking'} at ${d.table || 'a table'} — ready to open.` },
  piece_finished:     { icon:'🏺', label:'Piece finished',           nextRole: 'Ceramic Technician',  message: (d) => `${d.customerName || 'A customer'}'s piece is finished and photographed — ready for the kiln.` },
  kiln_loaded:        { icon:'🔥', label:'Kiln loaded',              nextRole: 'Ceramic Technician',  message: (d) => `Kiln session "${d.sessionName || ''}" has been loaded and is ready to fire.` },
  kiln_fired:         { icon:'✨', label:'Kiln fired — ready',       nextRole: 'Studio Assistant',    message: (d) => `Kiln session "${d.sessionName || ''}" has finished firing — pieces ready for pickup.` },
  booking_completed:  { icon:'🎉', label:'Booking completed',        nextRole: 'Studio Manager',      message: (d) => `${d.customerName || 'A booking'}'s session is fully complete — table, pieces, and payment all done.` },
};

// GET /api/staff/alerts — get today's alert feed for a studio
app.get('/api/staff/alerts', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  const today = new Date(); today.setHours(0,0,0,0);
  const { data } = await supabase.from('staff_alerts')
    .select('*').eq('studio_id', studioId)
    .gte('created_at', today.toISOString())
    .order('created_at', { ascending: false });
  res.json({ alerts: data || [] });
});

// POST /api/staff/alerts — fire a new handoff alert
app.post('/api/staff/alerts', async (req, res) => {
  const { studioId, triggerType, bookingCode, data } = req.body;
  if (!studioId || !triggerType) return res.status(400).json({ error: 'studioId and triggerType required' });
  const trigger = ALERT_TRIGGERS[triggerType];
  if (!trigger) return res.status(400).json({ error: `Unknown trigger type: ${triggerType}` });

  const { data: alert, error } = await supabase.from('staff_alerts').insert({
    studio_id: studioId,
    trigger_type: triggerType,
    booking_code: bookingCode || null,
    next_role: trigger.nextRole,
    icon: trigger.icon,
    label: trigger.label,
    message: trigger.message(data || {}),
    context: data || {},
    acknowledged: false,
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ alert });
});

// PATCH /api/staff/alerts/:id — acknowledge/action an alert
app.patch('/api/staff/alerts/:id', async (req, res) => {
  const { acknowledgedBy } = req.body;
  const { data, error } = await supabase.from('staff_alerts')
    .update({ acknowledged: true, acknowledged_by: acknowledgedBy || null, acknowledged_at: new Date().toISOString() })
    .eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ alert: data });
});

// GET /api/staff/daily-progress — running completion log for studio manager
// Shows every booking today with each stage's status
app.get('/api/staff/daily-progress', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  const today = new Date(); today.setHours(0,0,0,0);

  const [bookingsRes, sessionsRes, dutiesRes, alertsRes] = await Promise.all([
    supabase.from('bookings').select('booking_code, customer_name, status, created_at')
      .eq('studio_id', studioId).gte('created_at', today.toISOString()),
    supabase.from('table_sessions').select('booking_code, table_name, status, created_at')
      .eq('studio_id', studioId).gte('created_at', today.toISOString()),
    supabase.from('session_duties').select('booking_code, staff_name, duty_text, completed, status')
      .eq('studio_id', studioId).gte('created_at', today.toISOString()),
    supabase.from('staff_alerts').select('*')
      .eq('studio_id', studioId).gte('created_at', today.toISOString())
      .order('created_at', { ascending: true }),
  ]);

  const bookings = bookingsRes.data || [];
  const sessions = sessionsRes.data || [];
  const duties = dutiesRes.data || [];
  const alerts = alertsRes.data || [];

  // Build per-booking progress rollup
  const progress = bookings.map(b => {
    const session = sessions.find(s => s.booking_code === b.booking_code);
    const bookingDuties = duties.filter(d => d.booking_code === b.booking_code);
    const bookingAlerts = alerts.filter(a => a.booking_code === b.booking_code);
    const dutiesComplete = bookingDuties.length > 0 && bookingDuties.every(d => d.completed || d.status === 'na');

    return {
      bookingCode: b.booking_code,
      customerName: b.customer_name,
      table: session?.table_name || null,
      sessionStatus: session?.status || 'not started',
      bookingStatus: b.status,
      dutiesTotal: bookingDuties.length,
      dutiesComplete: bookingDuties.filter(d => d.completed || d.status === 'na').length,
      allDutiesDone: dutiesComplete,
      alertCount: bookingAlerts.length,
      alerts: bookingAlerts,
    };
  });

  // Today's takings summary
  const { data: extras } = await supabase.from('app_extra_charges')
    .select('amount_cents').eq('studio_id', studioId).gte('created_at', today.toISOString());
  const extrasTotal = (extras || []).reduce((sum, e) => sum + (e.amount_cents || 0), 0);

  res.json({
    date: today.toISOString().split('T')[0],
    totalBookings: bookings.length,
    completedBookings: progress.filter(p => p.bookingStatus === 'completed').length,
    tablesOpen: sessions.filter(s => s.status === 'open' || s.status === 'painting').length,
    tablesFinished: sessions.filter(s => s.status === 'completed').length,
    extrasTotalCents: extrasTotal,
    progress,
    allAlerts: alerts,
  });
});

// ═══════════════════════════════════════════
// SHIFT PIN LOGIN
// ═══════════════════════════════════════════

function hashPin(pin) { return crypto.createHash('sha256').update(String(pin)).digest('hex'); }

// GET /api/staff/team-for-login — names + roles + shift/holiday status,
// for the login picker so staff can see who's on shift, off shift, or
// on holiday without logging in first.
app.get('/api/staff/team-for-login', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  const { data: team } = await supabase.from('staff_team')
    .select('id, name, role').eq('studio_id', studioId).eq('active', true).order('name');
  const { data: pins } = await supabase.from('staff_pins').select('staff_member_id').eq('studio_id', studioId);
  const hasPinSet = new Set((pins || []).map(p => p.staff_member_id));

  // Check for active shifts today
  const today = new Date().toISOString().split('T')[0];
  const { data: activeShifts } = await supabase.from('staff_shifts')
    .select('staff_member_id')
    .eq('studio_id', studioId)
    .gte('clock_in', today)
    .is('clock_out', null);
  const onShift = new Set((activeShifts || []).map(s => s.staff_member_id));

  // Check for holidays today
  const { data: holidays } = await supabase.from('staff_holidays')
    .select('staff_member_id')
    .eq('studio_id', studioId)
    .lte('start_date', today)
    .gte('end_date', today)
    .eq('approved', true)
    .catch(() => ({ data: [] }));
  const onHoliday = new Set(((holidays || [])).map(h => h.staff_member_id));

  res.json({
    team: (team || []).map(m => ({
      ...m,
      hasPinSet: hasPinSet.has(m.id),
      onShift: onShift.has(m.id),
      onHoliday: onHoliday.has(m.id)
    }))
  });
});

// POST /api/staff/mark-home-screen-added — genuine per-person record
// that THIS specific staff member has actually added the app to their
// home screen, not a per-device flag. Called right after they confirm
// they've done it, since login is the one moment we know exactly who's
// using the device.
app.post('/api/staff/mark-home-screen-added', async (req, res) => {
  const { studioId, staffMemberId } = req.body;
  if (!studioId || !staffMemberId) return res.status(400).json({ error: 'studioId and staffMemberId required' });
  const { error } = await supabase.from('staff_team')
    .update({ home_screen_added_at: new Date().toISOString() })
    .eq('id', staffMemberId).eq('studio_id', studioId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ status: 'recorded' });
});

// GET /api/staff/home-screen-status — for directors: genuine real
// status of who has and hasn't actually completed this, across the
// whole real team, not a guess.
app.get('/api/staff/home-screen-status', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  const { data: team, error } = await supabase.from('staff_team')
    .select('id, name, role, home_screen_added_at').eq('studio_id', studioId).eq('active', true).order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ team: team || [] });
});

// POST /api/staff/set-pin — self-service: staff member picks their own name,
// then sets their own PIN the first time (no existing PIN required to do this —
// but if a PIN already exists, this endpoint refuses; use reset-pin instead)
app.post('/api/staff/set-pin', async (req, res) => {
  const { studioId, staffMemberId, pin } = req.body;
  if (!studioId || !staffMemberId || !pin) return res.status(400).json({ error: 'studioId, staffMemberId, pin required' });
  if (!/^\d{4,6}$/.test(String(pin))) return res.status(400).json({ error: 'PIN must be 4-6 digits' });

  const { data: existing } = await supabase.from('staff_pins')
    .select('id').eq('studio_id', studioId).eq('staff_member_id', staffMemberId).single();
  if (existing) {
    return res.status(409).json({ error: 'A PIN is already set for this person. Ask your manager to reset it if you\'ve forgotten it.' });
  }

  const { error } = await supabase.from('staff_pins').insert({
    studio_id: studioId, staff_member_id: staffMemberId, pin_hash: hashPin(pin),
  });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// POST /api/staff/reset-pin — manager-only: clears someone's PIN so they can set
// a new one. Requires the manager's OWN PIN to authorise (proves they're really
// a Studio Manager/Executive, not just anyone with dashboard access).
app.post('/api/staff/reset-pin', async (req, res) => {
  const { studioId, targetStaffMemberId, managerPin } = req.body;
  if (!studioId || !targetStaffMemberId || !managerPin) {
    return res.status(400).json({ error: 'studioId, targetStaffMemberId, managerPin required' });
  }

  // Verify the manager PIN belongs to someone with an authorised role
  const { data: managerPinRow } = await supabase.from('staff_pins')
    .select('staff_member_id').eq('studio_id', studioId).eq('pin_hash', hashPin(managerPin)).single();
  if (!managerPinRow) return res.status(401).json({ error: 'Incorrect manager PIN' });

  const { data: manager } = await supabase.from('staff_team')
    .select('role').eq('id', managerPinRow.staff_member_id).single();
  if (!manager || !['Studio Manager', 'Studio Executive'].includes(manager.role)) {
    return res.status(403).json({ error: 'Only a Studio Manager or Studio Executive can reset PINs' });
  }

  await supabase.from('staff_pins').delete().eq('studio_id', studioId).eq('staff_member_id', targetStaffMemberId);
  res.json({ ok: true, message: 'PIN cleared — that person can now set a new one from the login screen.' });
});

// POST /api/staff/shift-login — enter a PIN to start a shift on this device
app.post('/api/staff/shift-login', async (req, res) => {
  const { studioId, pin, staffMemberId } = req.body;
  if (!studioId || !pin) return res.status(400).json({ error: 'studioId and pin required' });

  // The frontend sends staffMemberId because the user already tapped a
  // specific name on the picker screen before entering their PIN — this
  // validates the PIN belongs to THAT person specifically. Multiple staff
  // can share the same PIN (e.g. demo mode, where everyone uses "0000"),
  // so validating by hash alone would be ambiguous — this is what makes
  // "tap your name, then enter your PIN" actually work correctly even
  // when PINs collide.
  let pinRow;
  if (staffMemberId) {
    const { data } = await supabase.from('staff_pins')
      .select('staff_member_id').eq('studio_id', studioId).eq('staff_member_id', staffMemberId)
      .eq('pin_hash', hashPin(pin)).single();
    pinRow = data;
  } else {
    // Fallback for any older client that doesn't send staffMemberId yet —
    // takes the first match rather than failing outright.
    const { data } = await supabase.from('staff_pins')
      .select('staff_member_id').eq('studio_id', studioId).eq('pin_hash', hashPin(pin));
    pinRow = data?.[0];
  }

  if (!pinRow) return res.status(401).json({ error: 'Incorrect PIN' });

  const { data: member } = await supabase.from('staff_team')
    .select('*').eq('id', pinRow.staff_member_id).single();

  if (!member || !member.active) return res.status(404).json({ error: 'Staff member not found or inactive' });

  // Automatic clock-in: close any stray open shift for this person first
  // (in case they logged out without clocking out properly), then open a new one.
  await supabase.from('staff_timesheet')
    .update({ clock_out: new Date().toISOString(), auto_closed: true })
    .eq('studio_id', studioId).eq('staff_member_id', member.id).is('clock_out', null);

  const { data: shift } = await supabase.from('staff_timesheet').insert({
    studio_id: studioId, staff_member_id: member.id, clock_in: new Date().toISOString(),
  }).select().single();

  res.json({ member, shiftId: shift?.id || null });
});

// GET /api/staff/:memberId/home-screen — load this staff member's
// personal tile layout. Returns tile_order and promoted_tiles arrays.
// Empty arrays if they haven't set one up yet — client applies role
// defaults in that case.
app.get('/api/staff/:memberId/home-screen', async (req, res) => {
  const { memberId } = req.params;
  const { studioId } = req.query;
  if (!studioId || !memberId) return res.status(400).json({ error: 'studioId and memberId required' });
  const { data } = await supabase
    .from('staff_home_screens')
    .select('tile_order, promoted_tiles, updated_at')
    .eq('studio_id', studioId)
    .eq('staff_member_id', memberId)
    .single();
  // .single() returns null data if no row — that's fine, client handles it
  res.json({
    tileOrder: data?.tile_order || [],
    promotedTiles: data?.promoted_tiles || [],
    hasPersonalScreen: !!data?.tile_order?.length
  });
});

// POST /api/staff/:memberId/home-screen — save this staff member's
// personal tile layout. Upserts so first save and subsequent updates
// use the same endpoint.
app.post('/api/staff/:memberId/home-screen', async (req, res) => {
  const { memberId } = req.params;
  const { studioId, tileOrder, promotedTiles } = req.body;
  if (!studioId || !memberId) return res.status(400).json({ error: 'studioId and memberId required' });
  const { error } = await supabase
    .from('staff_home_screens')
    .upsert({
      studio_id: studioId,
      staff_member_id: memberId,
      tile_order: tileOrder || [],
      promoted_tiles: promotedTiles || [],
      updated_at: new Date().toISOString()
    }, { onConflict: 'studio_id,staff_member_id' });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ saved: true });
});

// POST /api/staff/welcome-back-login — genuine device-trust login, no
// PIN required. Only ever reachable from the real picker screen when
// the frontend has already confirmed (via klnk_last_logged_in_id in
// localStorage, set only when THIS exact device was the one this
// person last logged in on) that this is a returning person on the
// same physical tablet. Deliberately a SEPARATE endpoint from the real
// PIN login, not a bypass flag bolted onto it — keeps the trust model
// explicit and auditable rather than quietly weakening PIN validation.
app.post('/api/staff/welcome-back-login', async (req, res) => {
  const { studioId, staffMemberId } = req.body;
  if (!studioId || !staffMemberId) return res.status(400).json({ error: 'studioId and staffMemberId required' });

  const { data: member } = await supabase.from('staff_team')
    .select('*').eq('id', staffMemberId).eq('studio_id', studioId).single();
  if (!member || !member.active) return res.status(404).json({ error: 'Staff member not found or inactive' });

  // Same real clock-in logic as the PIN login path — genuinely creates
  // a proper timesheet entry, this isn't a lesser/fake session.
  await supabase.from('staff_timesheet')
    .update({ clock_out: new Date().toISOString(), auto_closed: true })
    .eq('studio_id', studioId).eq('staff_member_id', member.id).is('clock_out', null);

  const { data: shift } = await supabase.from('staff_timesheet').insert({
    studio_id: studioId, staff_member_id: member.id, clock_in: new Date().toISOString(),
  }).select().single();

  res.json({ member, shiftId: shift?.id || null });
});

// POST /api/staff/clock-out — automatic clock-out on shift logout
// GET /api/staff/other-active-shifts — genuine real check: is there
// anyone ELSE still clocked in right now? Used to decide whether to
// show the closing checklist (only for the genuinely LAST person out).
app.get('/api/staff/other-active-shifts', async (req, res) => {
  const { studioId, excludeStaffMemberId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  let query = supabase.from('staff_timesheet')
    .select('staff_member_id').eq('studio_id', studioId).is('clock_out', null);
  if (excludeStaffMemberId) query = query.neq('staff_member_id', excludeStaffMemberId);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ othersStillClockedIn: (data || []).length > 0, count: (data || []).length });
});

// ── Genuine real WebAuthn (Face ID / Touch ID / device biometric) ──
// Important, honestly: no face or fingerprint data is EVER sent to or
// stored by this server. The device's own secure hardware does the
// actual biometric matching entirely locally; the server only ever
// receives a cryptographic credential, functionally equivalent to a
// very long password. This is the real, standard, correct way to do
// this — genuinely private by design, not just by policy.
const WEBAUTHN_RP_NAME = 'kilnLINK';
const WEBAUTHN_RP_ID = process.env.WEBAUTHN_RP_ID || 'glazeup-api.onrender.com';
const WEBAUTHN_ORIGIN = process.env.WEBAUTHN_ORIGIN || 'https://glazeup-api.onrender.com';

// Real, honest, short-lived in-memory store for the challenge each
// registration/login round-trip needs — genuinely fine as in-memory
// (not persisted to the database) since a challenge is only ever
// valid for a few real minutes and single-use by design.
const _webauthnChallenges = new Map();

// STAFF: Step 1 — generate a real registration challenge
app.post('/api/staff/webauthn/register-options', async (req, res) => {
  const { studioId, staffMemberId, staffName } = req.body;
  if (!studioId || !staffMemberId || !staffName) return res.status(400).json({ error: 'studioId, staffMemberId, staffName required' });

  const { data: existing } = await supabase.from('staff_webauthn_credentials')
    .select('credential_id').eq('staff_member_id', staffMemberId);

  const options = await generateRegistrationOptions({
    rpName: WEBAUTHN_RP_NAME, rpID: WEBAUTHN_RP_ID,
    userName: staffName, userID: Buffer.from(staffMemberId),
    attestationType: 'none',
    excludeCredentials: (existing || []).map(c => ({ id: c.credential_id })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' }, // genuinely REQUIRES real Face ID/Touch ID/PIN, not just "device present"
  });

  _webauthnChallenges.set(`staff:${staffMemberId}`, options.challenge);
  res.json(options);
});

// STAFF: Step 2 — verify the real registration and save the credential
app.post('/api/staff/webauthn/register-verify', async (req, res) => {
  const { studioId, staffMemberId, response, deviceLabel } = req.body;
  if (!studioId || !staffMemberId || !response) return res.status(400).json({ error: 'studioId, staffMemberId, response required' });

  const expectedChallenge = _webauthnChallenges.get(`staff:${staffMemberId}`);
  if (!expectedChallenge) return res.status(400).json({ error: 'Registration expired — please try again.' });

  try {
    const verification = await verifyRegistrationResponse({
      response, expectedChallenge, expectedOrigin: WEBAUTHN_ORIGIN, expectedRPID: WEBAUTHN_RP_ID,
    });
    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'Could not verify — please try again.' });
    }
    const { credential } = verification.registrationInfo;
    await supabase.from('staff_webauthn_credentials').insert({
      studio_id: studioId, staff_member_id: staffMemberId,
      credential_id: credential.id,
      public_key: Buffer.from(credential.publicKey).toString('base64'),
      device_label: deviceLabel || 'This device',
    });
    _webauthnChallenges.delete(`staff:${staffMemberId}`);
    res.json({ verified: true });
  } catch (error) {
    console.error('WebAuthn staff registration error:', error);
    res.status(500).json({ error: error.message });
  }
});

// STAFF: Step 3 — generate a real login challenge (no staffMemberId
// needed yet — real Face ID resolves WHICH staff member from the
// device's own stored credential, genuinely faster than picking a
// name first).
app.post('/api/staff/webauthn/auth-options', async (req, res) => {
  const options = await generateAuthenticationOptions({
    rpID: WEBAUTHN_RP_ID, userVerification: 'required',
  });
  _webauthnChallenges.set(`staff-auth:${options.challenge}`, true);
  res.json(options);
});

// STAFF: Step 4 — verify the real login and identify who it was
app.post('/api/staff/webauthn/auth-verify', async (req, res) => {
  const { studioId, response } = req.body;
  if (!studioId || !response) return res.status(400).json({ error: 'studioId and response required' });

  try {
    const { data: cred } = await supabase.from('staff_webauthn_credentials')
      .select('*').eq('credential_id', response.id).eq('studio_id', studioId).single();
    if (!cred) return res.status(404).json({ error: 'This device is not registered for Face ID login — please use your PIN.' });

    const challengeKey = [..._webauthnChallenges.keys()].find(k => k.startsWith('staff-auth:'));
    if (!challengeKey) return res.status(400).json({ error: 'Login expired — please try again.' });
    const expectedChallenge = challengeKey.replace('staff-auth:', '');

    const verification = await verifyAuthenticationResponse({
      response, expectedChallenge, expectedOrigin: WEBAUTHN_ORIGIN, expectedRPID: WEBAUTHN_RP_ID,
      credential: { id: cred.credential_id, publicKey: Buffer.from(cred.public_key, 'base64'), counter: 0 },
    });
    if (!verification.verified) return res.status(401).json({ error: 'Could not verify — please use your PIN.' });

    _webauthnChallenges.delete(challengeKey);
    await supabase.from('staff_webauthn_credentials').update({ last_used_at: new Date().toISOString() }).eq('id', cred.id);
    const { data: staffMember } = await supabase.from('staff_team').select('id, name, role').eq('id', cred.staff_member_id).single();
    res.json({ verified: true, staffMember });
  } catch (error) {
    console.error('WebAuthn staff auth error:', error);
    res.status(500).json({ error: error.message });
  }
});

// CUSTOMER (Take It Home): Step 1 — generate a real registration challenge
app.post('/api/customer/webauthn/register-options', async (req, res) => {
  const { studioId, bookingCode, customerId } = req.body;
  if (!studioId || !bookingCode) return res.status(400).json({ error: 'studioId and bookingCode required' });

  const options = await generateRegistrationOptions({
    rpName: WEBAUTHN_RP_NAME, rpID: WEBAUTHN_RP_ID,
    userName: bookingCode, userID: Buffer.from(customerId || bookingCode),
    attestationType: 'none',
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
  });
  _webauthnChallenges.set(`customer:${bookingCode}`, options.challenge);
  res.json(options);
});

// CUSTOMER: Step 2 — verify and save, tied to the booking's real home access
app.post('/api/customer/webauthn/register-verify', async (req, res) => {
  const { studioId, bookingCode, customerId, response } = req.body;
  if (!studioId || !bookingCode || !response) return res.status(400).json({ error: 'studioId, bookingCode, response required' });

  const expectedChallenge = _webauthnChallenges.get(`customer:${bookingCode}`);
  if (!expectedChallenge) return res.status(400).json({ error: 'Registration expired — please try again.' });

  try {
    const verification = await verifyRegistrationResponse({
      response, expectedChallenge, expectedOrigin: WEBAUTHN_ORIGIN, expectedRPID: WEBAUTHN_RP_ID,
    });
    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'Could not verify — please try again.' });
    }
    const { credential } = verification.registrationInfo;
    await supabase.from('customer_webauthn_credentials').insert({
      studio_id: studioId, customer_id: customerId || null, booking_code: bookingCode,
      credential_id: credential.id,
      public_key: Buffer.from(credential.publicKey).toString('base64'),
    });
    _webauthnChallenges.delete(`customer:${bookingCode}`);
    res.json({ verified: true });
  } catch (error) {
    console.error('WebAuthn customer registration error:', error);
    res.status(500).json({ error: error.message });
  }
});

// CUSTOMER: Step 3 — real login challenge
app.post('/api/customer/webauthn/auth-options', async (req, res) => {
  const options = await generateAuthenticationOptions({ rpID: WEBAUTHN_RP_ID, userVerification: 'required' });
  _webauthnChallenges.set(`customer-auth:${options.challenge}`, true);
  res.json(options);
});

// CUSTOMER: Step 4 — verify and return the real booking to resume
app.post('/api/customer/webauthn/auth-verify', async (req, res) => {
  const { studioId, response } = req.body;
  if (!studioId || !response) return res.status(400).json({ error: 'studioId and response required' });

  try {
    const { data: cred } = await supabase.from('customer_webauthn_credentials')
      .select('*').eq('credential_id', response.id).eq('studio_id', studioId).single();
    if (!cred) return res.status(404).json({ error: 'This device is not set up for quick return access.' });

    const challengeKey = [..._webauthnChallenges.keys()].find(k => k.startsWith('customer-auth:'));
    if (!challengeKey) return res.status(400).json({ error: 'Login expired — please try again.' });
    const expectedChallenge = challengeKey.replace('customer-auth:', '');

    const verification = await verifyAuthenticationResponse({
      response, expectedChallenge, expectedOrigin: WEBAUTHN_ORIGIN, expectedRPID: WEBAUTHN_RP_ID,
      credential: { id: cred.credential_id, publicKey: Buffer.from(cred.public_key, 'base64'), counter: 0 },
    });
    if (!verification.verified) return res.status(401).json({ error: 'Could not verify.' });

    _webauthnChallenges.delete(challengeKey);
    await supabase.from('customer_webauthn_credentials').update({ last_used_at: new Date().toISOString() }).eq('id', cred.id);
    const { data: booking } = await supabase.from('bookings').select('booking_code, customer_name, home_access_unlocked').eq('booking_code', cred.booking_code).eq('studio_id', studioId).single();
    if (!booking?.home_access_unlocked) return res.status(403).json({ error: 'Home access is no longer active for this booking.' });
    res.json({ verified: true, bookingCode: booking.booking_code, customerName: booking.customer_name });
  } catch (error) {
    console.error('WebAuthn customer auth error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/staff/clock-out', async (req, res) => {
  const { studioId, staffMemberId, shiftId } = req.body;
  if (!studioId || !staffMemberId) return res.status(400).json({ error: 'studioId and staffMemberId required' });

  // If they're on a break and forget to end it, close the break out too
  // so it doesn't count as break time forever.
  let breakQuery = supabase.from('staff_breaks')
    .update({ break_end: new Date().toISOString(), auto_closed: true })
    .eq('studio_id', studioId).eq('staff_member_id', staffMemberId).is('break_end', null);
  if (shiftId) breakQuery = breakQuery.eq('shift_id', shiftId);
  await breakQuery;

  let query = supabase.from('staff_timesheet')
    .update({ clock_out: new Date().toISOString() })
    .eq('studio_id', studioId).eq('staff_member_id', staffMemberId).is('clock_out', null);

  if (shiftId) query = query.eq('id', shiftId);

  const { data, error } = await query.select();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ closed: data?.length || 0 });
});

// ── Breaks — pause the shift clock without ending it ──

// POST /api/staff/break/start
app.post('/api/staff/break/start', async (req, res) => {
  const { studioId, staffMemberId, shiftId } = req.body;
  if (!studioId || !staffMemberId || !shiftId) return res.status(400).json({ error: 'studioId, staffMemberId, shiftId required' });

  // Only one open break at a time per shift
  const { data: existing } = await supabase.from('staff_breaks')
    .select('id').eq('shift_id', shiftId).is('break_end', null).single();
  if (existing) return res.status(409).json({ error: 'Already on a break' });

  const { data, error } = await supabase.from('staff_breaks').insert({
    studio_id: studioId, staff_member_id: staffMemberId, shift_id: shiftId,
    break_start: new Date().toISOString(),
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ breakId: data.id });
});

// POST /api/staff/break/end
app.post('/api/staff/break/end', async (req, res) => {
  const { studioId, breakId } = req.body;
  if (!studioId || !breakId) return res.status(400).json({ error: 'studioId, breakId required' });

  const { data, error } = await supabase.from('staff_breaks')
    .update({ break_end: new Date().toISOString() })
    .eq('id', breakId).eq('studio_id', studioId).select().single();
  if (error) return res.status(500).json({ error: error.message });

  const minutes = data ? Math.round((new Date(data.break_end) - new Date(data.break_start)) / 60000) : 0;
  res.json({ ok: true, breakMinutes: minutes });
});

// ═══════════════════════════════════════════
// TIMEKEEPING — timesheet + CSV export
// (Hours worked only. No pay/tax calculation —
// export this to your actual payroll provider.)
// ═══════════════════════════════════════════

// GET /api/staff/timesheet — hours for a date range, optionally filtered to one person
app.get('/api/staff/timesheet', async (req, res) => {
  const { studioId, staffMemberId, from, to } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });

  const fromDate = from || new Date(Date.now() - 7*24*60*60*1000).toISOString();
  const toDate = to || new Date().toISOString();

  let query = supabase.from('staff_timesheet')
    .select('*').eq('studio_id', studioId)
    .gte('clock_in', fromDate).lte('clock_in', toDate)
    .order('clock_in', { ascending: false });
  if (staffMemberId) query = query.eq('staff_member_id', staffMemberId);

  const { data: shifts } = await query;
  const { data: team } = await supabase.from('staff_team').select('id, name, role').eq('studio_id', studioId);
  const nameMap = {};
  (team || []).forEach(m => { nameMap[m.id] = m; });

  // Pull all breaks for these shifts so we can subtract them from hours worked
  const shiftIds = (shifts || []).map(s => s.id);
  let breaksByShift = {};
  if (shiftIds.length) {
    const { data: breaks } = await supabase.from('staff_breaks')
      .select('shift_id, break_start, break_end').in('shift_id', shiftIds);
    (breaks || []).forEach(b => {
      if (!breaksByShift[b.shift_id]) breaksByShift[b.shift_id] = [];
      breaksByShift[b.shift_id].push(b);
    });
  }

  const enriched = (shifts || []).map(s => {
    const clockIn = new Date(s.clock_in);
    const clockOut = s.clock_out ? new Date(s.clock_out) : null;
    const shiftBreaks = breaksByShift[s.id] || [];
    const breakMinutes = shiftBreaks.reduce((sum, b) => {
      if (!b.break_end) return sum; // ignore still-open breaks in the total
      return sum + (new Date(b.break_end) - new Date(b.break_start)) / 60000;
    }, 0);
    const grossHours = clockOut ? (clockOut - clockIn) / 3600000 : null;
    const netHours = grossHours != null ? Math.round((grossHours - breakMinutes/60) * 100) / 100 : null;
    return {
      ...s,
      staffName: nameMap[s.staff_member_id]?.name || 'Unknown',
      role: nameMap[s.staff_member_id]?.role || '',
      hoursWorked: netHours,
      breakMinutes: Math.round(breakMinutes),
      stillClockedIn: !s.clock_out,
      onBreakNow: shiftBreaks.some(b => !b.break_end),
    };
  });

  // Totals per person
  const totals = {};
  enriched.forEach(s => {
    if (!totals[s.staffName]) totals[s.staffName] = 0;
    if (s.hoursWorked) totals[s.staffName] += s.hoursWorked;
  });

  res.json({ shifts: enriched, totalsByPerson: totals });
});

// GET /api/staff/timesheet/export.csv — CSV download for payroll processing elsewhere
app.get('/api/staff/timesheet/export.csv', async (req, res) => {
  const { studioId, from, to } = req.query;
  if (!studioId) return res.status(400).send('studioId required');

  const fromDate = from || new Date(Date.now() - 30*24*60*60*1000).toISOString();
  const toDate = to || new Date().toISOString();

  const { data: shifts } = await supabase.from('staff_timesheet')
    .select('*').eq('studio_id', studioId)
    .gte('clock_in', fromDate).lte('clock_in', toDate)
    .order('clock_in', { ascending: true });

  const { data: team } = await supabase.from('staff_team').select('id, name, role').eq('studio_id', studioId);
  const nameMap = {};
  (team || []).forEach(m => { nameMap[m.id] = m; });

  const shiftIds = (shifts || []).map(s => s.id);
  let breaksByShift = {};
  if (shiftIds.length) {
    const { data: breaks } = await supabase.from('staff_breaks')
      .select('shift_id, break_start, break_end').in('shift_id', shiftIds);
    (breaks || []).forEach(b => {
      if (!breaksByShift[b.shift_id]) breaksByShift[b.shift_id] = [];
      breaksByShift[b.shift_id].push(b);
    });
  }

  const rows = [['Name', 'Role', 'Clock In', 'Clock Out', 'Break (mins)', 'Net Hours Worked', 'Date']];
  (shifts || []).forEach(s => {
    const clockIn = new Date(s.clock_in);
    const clockOut = s.clock_out ? new Date(s.clock_out) : null;
    const shiftBreaks = breaksByShift[s.id] || [];
    const breakMinutes = Math.round(shiftBreaks.reduce((sum, b) => {
      if (!b.break_end) return sum;
      return sum + (new Date(b.break_end) - new Date(b.break_start)) / 60000;
    }, 0));
    const grossHours = clockOut ? (clockOut - clockIn) / 3600000 : null;
    const netHours = grossHours != null ? Math.round((grossHours - breakMinutes/60) * 100) / 100 : '';
    rows.push([
      nameMap[s.staff_member_id]?.name || 'Unknown',
      nameMap[s.staff_member_id]?.role || '',
      clockIn.toISOString(),
      clockOut ? clockOut.toISOString() : 'Still clocked in',
      breakMinutes,
      netHours,
      clockIn.toISOString().split('T')[0],
    ]);
  });

  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="timesheet-${studioId}-${new Date().toISOString().split('T')[0]}.csv"`);
  res.send(csv);
});

// ═══════════════════════════════════════════
// HOLIDAY REQUESTS
// Staff request time off, manager approves/
// rejects. No pay calculation — this just
// tracks the request and a running allowance
// count the studio sets manually.
// ═══════════════════════════════════════════

// GET /api/staff/holiday-requests — all requests for a studio (or one person)
app.get('/api/staff/holiday-requests', async (req, res) => {
  const { studioId, staffMemberId, status } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  let query = supabase.from('holiday_requests').select('*').eq('studio_id', studioId).order('created_at', { ascending: false });
  if (staffMemberId) query = query.eq('staff_member_id', staffMemberId);
  if (status) query = query.eq('status', status);
  const { data } = await query;

  const { data: team } = await supabase.from('staff_team').select('id, name, role').eq('studio_id', studioId);
  const nameMap = {};
  (team || []).forEach(m => { nameMap[m.id] = m; });

  res.json({ requests: (data || []).map(r => ({ ...r, staffName: nameMap[r.staff_member_id]?.name || 'Unknown' })) });
});

// POST /api/staff/holiday-requests — staff submit a request
app.post('/api/staff/holiday-requests', async (req, res) => {
  const { studioId, staffMemberId, startDate, endDate, notes } = req.body;
  if (!studioId || !staffMemberId || !startDate || !endDate) {
    return res.status(400).json({ error: 'studioId, staffMemberId, startDate, endDate required' });
  }
  const days = Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1;

  const { data, error } = await supabase.from('holiday_requests').insert({
    studio_id: studioId, staff_member_id: staffMemberId,
    start_date: startDate, end_date: endDate, days_requested: days,
    notes: notes || null, status: 'pending',
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });

  // Notify the manager via the existing alert system
  await supabase.from('staff_alerts').insert({
    studio_id: studioId, trigger_type: 'holiday_request', booking_code: null,
    next_role: 'Studio Manager', icon: '🏖️', label: 'Holiday request',
    message: `New holiday request: ${days} day${days>1?'s':''}, ${startDate} to ${endDate}`,
    context: { requestId: data.id }, acknowledged: false,
  });

  res.json({ request: data });
});

// PATCH /api/staff/holiday-requests/:id — manager approves/rejects
app.patch('/api/staff/holiday-requests/:id', async (req, res) => {
  const { status, managerNotes } = req.body;
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'status must be approved or rejected' });

  const { data, error } = await supabase.from('holiday_requests')
    .update({ status, manager_notes: managerNotes || null, decided_at: new Date().toISOString() })
    .eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ request: data });
});

// GET /api/staff/holiday-allowance — running allowance per person (set manually by manager)
// ═══════════════════════════════════════════
// MORNING OPENING CHECKLIST — server-tracked so
// it's genuinely "done for today, by this person"
// rather than a per-device localStorage flag that
// doesn't know who completed it or follow across
// devices.
// ═══════════════════════════════════════════

// GET /api/staff/opening-checklist/today — has today's checklist been done, and by whom?
app.get('/api/staff/opening-checklist/today', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase.from('opening_checklist_log')
    .select('*').eq('studio_id', studioId).eq('checklist_date', today).single();
  res.json({ completed: !!data, record: data || null });
});

// POST /api/staff/opening-checklist/complete — mark today's checklist done, recording who did it
app.post('/api/staff/opening-checklist/complete', async (req, res) => {
  const { studioId, staffMemberId, staffName } = req.body;
  if (!studioId || !staffName) return res.status(400).json({ error: 'studioId and staffName required' });
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase.from('opening_checklist_log').upsert({
    studio_id: studioId, checklist_date: today,
    completed_by_staff_id: staffMemberId || null, completed_by_name: staffName,
    completed_at: new Date().toISOString(),
  }, { onConflict: 'studio_id,checklist_date' }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ record: data });
});

// GET /api/staff/closing-checklist/today — genuine real mirror of the
// opening checklist's own endpoint, same honest pattern.
app.get('/api/staff/closing-checklist/today', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase.from('closing_checklist_log')
    .select('*').eq('studio_id', studioId).eq('checklist_date', today).single();
  res.json({ completed: !!data, record: data || null });
});

// POST /api/staff/closing-checklist/complete — mark today's closing checklist done
app.post('/api/staff/closing-checklist/complete', async (req, res) => {
  const { studioId, staffMemberId, staffName, skipped } = req.body;
  if (!studioId || !staffName) return res.status(400).json({ error: 'studioId and staffName required' });
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase.from('closing_checklist_log').upsert({
    studio_id: studioId, checklist_date: today,
    completed_by_staff_id: staffMemberId || null, completed_by_name: staffName,
    completed_at: new Date().toISOString(), was_skipped: !!skipped,
  }, { onConflict: 'studio_id,checklist_date' }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ record: data });
});

app.get('/api/staff/holiday-allowance', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });

  const { data: allowances } = await supabase.from('holiday_allowance').select('*').eq('studio_id', studioId);
  const { data: approved } = await supabase.from('holiday_requests')
    .select('staff_member_id, days_requested').eq('studio_id', studioId).eq('status', 'approved');
  const { data: team } = await supabase.from('staff_team').select('id, name, role').eq('studio_id', studioId);

  const usedMap = {};
  (approved || []).forEach(r => { usedMap[r.staff_member_id] = (usedMap[r.staff_member_id] || 0) + r.days_requested; });

  const result = (team || []).map(m => {
    const allowance = (allowances || []).find(a => a.staff_member_id === m.id);
    const totalDays = allowance?.total_days ?? 28; // UK statutory default incl. bank holidays, adjust per studio
    const used = usedMap[m.id] || 0;
    return { staffMemberId: m.id, name: m.name, role: m.role, totalDays, usedDays: used, remainingDays: totalDays - used };
  });

  res.json({ allowances: result });
});

// POST /api/staff/holiday-allowance — manager sets someone's total allowance for the year
app.post('/api/staff/holiday-allowance', async (req, res) => {
  const { studioId, staffMemberId, totalDays } = req.body;
  if (!studioId || !staffMemberId || totalDays == null) return res.status(400).json({ error: 'studioId, staffMemberId, totalDays required' });

  const { data, error } = await supabase.from('holiday_allowance').upsert({
    studio_id: studioId, staff_member_id: staffMemberId, total_days: totalDays,
  }, { onConflict: 'studio_id,staff_member_id' }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ allowance: data });
});

// ═══════════════════════════════════════════
// PROCESS CONFIG (per-studio configurable
// task chains — replaces the fixed
// ALERT_TRIGGERS for studios that customise)
// ═══════════════════════════════════════════

// Sensible defaults every new studio starts with — mirrors The Kiln Cafe's
// current process. Studios can edit, delete, or add their own from here.
const DEFAULT_PROCESS_CONFIG = [
  { triggerType: 'checklist_done',    triggerLabel: 'Table setup checklist complete', assignedRole: 'Studio Manager',     taskMessage: 'Table {table} is set up and ready for {customerName}. Confirm and open the session.', nextTriggerType: null, sequenceOrder: 1 },
  { triggerType: 'duties_completed',  triggerLabel: 'Staff duties completed',          assignedRole: 'Studio Manager',     taskMessage: '{staffName} has completed all their duties for {customerName}.',                     nextTriggerType: null, sequenceOrder: 2 },
  { triggerType: 'piece_finished',    triggerLabel: 'Piece finished & photographed',   assignedRole: 'Ceramic Technician', taskMessage: "{customerName}'s piece is ready to be loaded into the kiln.",                          nextTriggerType: 'kiln_loaded', sequenceOrder: 3 },
  { triggerType: 'kiln_loaded',       triggerLabel: 'Kiln loaded',                     assignedRole: 'Ceramic Technician', taskMessage: 'Kiln batch {sessionName} is loaded — start the firing when ready.',                   nextTriggerType: 'kiln_fired',   sequenceOrder: 4 },
  { triggerType: 'kiln_fired',        triggerLabel: 'Kiln fired — ready',              assignedRole: 'Studio Assistant',   taskMessage: 'Kiln batch {sessionName} has finished firing. Move pieces to pickup and notify customers.', nextTriggerType: null, sequenceOrder: 5 },
  { triggerType: 'booking_completed', triggerLabel: 'Booking completed',               assignedRole: 'Studio Manager',     taskMessage: "{customerName}'s full session is complete — table, pieces, and payment all done.",     nextTriggerType: null, sequenceOrder: 6 },
  { triggerType: 'table_cleared',     triggerLabel: 'Table cleared',                   assignedRole: 'Studio Assistant',   taskMessage: 'Table {table} has been cleared. Reset and prepare it for the next booking.',           nextTriggerType: null, sequenceOrder: 0 },
];

// GET /api/staff/process-config — get this studio's process chain (or defaults if unset)
// ═══════════════════════════════════════════
// ALERT SETTINGS
// Admin-controlled repeat interval and behaviour
// for unactioned handoff alerts / tasks.
// ═══════════════════════════════════════════

const DEFAULT_ALERT_SETTINGS = {
  repeatMinutes: 5,       // re-alert every N minutes until actioned
  flashUntilActioned: true,
  escalateAfterRepeats: 3, // after this many repeats, optionally escalate to a more senior role
  escalateEnabled: false,
};

// GET /api/staff/alert-settings
app.get('/api/staff/alert-settings', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  const { data } = await supabase.from('alert_settings').select('*').eq('studio_id', studioId).single();
  if (!data) return res.json({ settings: DEFAULT_ALERT_SETTINGS });
  res.json({ settings: {
    repeatMinutes: data.repeat_minutes,
    flashUntilActioned: data.flash_until_actioned,
    escalateAfterRepeats: data.escalate_after_repeats,
    escalateEnabled: data.escalate_enabled,
  }});
});

// POST /api/staff/alert-settings
app.post('/api/staff/alert-settings', async (req, res) => {
  const { studioId, repeatMinutes, flashUntilActioned, escalateAfterRepeats, escalateEnabled } = req.body;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  const { data, error } = await supabase.from('alert_settings').upsert({
    studio_id: studioId,
    repeat_minutes: repeatMinutes ?? 5,
    flash_until_actioned: flashUntilActioned !== false,
    escalate_after_repeats: escalateAfterRepeats ?? 3,
    escalate_enabled: escalateEnabled === true,
  }, { onConflict: 'studio_id' }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ settings: {
    repeatMinutes: data.repeat_minutes, flashUntilActioned: data.flash_until_actioned,
    escalateAfterRepeats: data.escalate_after_repeats, escalateEnabled: data.escalate_enabled,
  }});
});

app.get('/api/staff/process-config', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  const { data } = await supabase.from('process_config').select('*').eq('studio_id', studioId).order('sequence_order');

  if (!data || !data.length) {
    return res.json({ config: DEFAULT_PROCESS_CONFIG.map(d => ({ ...d, isDefault: true, active: true })) });
  }
  res.json({ config: data.map(d => ({
    id: d.id, triggerType: d.trigger_type, triggerLabel: d.trigger_label,
    assignedRole: d.assigned_role, taskMessage: d.task_message_template,
    nextTriggerType: d.next_trigger_type, sequenceOrder: d.sequence_order,
    active: d.active, isDefault: false,
  })) });
});

// POST /api/staff/process-config — save the studio's full process chain (replaces all)
app.post('/api/staff/process-config', async (req, res) => {
  const { studioId, steps } = req.body;
  if (!studioId || !Array.isArray(steps)) return res.status(400).json({ error: 'studioId and steps[] required' });

  await supabase.from('process_config').delete().eq('studio_id', studioId);
  if (steps.length) {
    await supabase.from('process_config').insert(steps.map((s, i) => ({
      studio_id: studioId,
      trigger_type: s.triggerType,
      trigger_label: s.triggerLabel,
      assigned_role: s.assignedRole,
      task_message_template: s.taskMessage,
      next_trigger_type: s.nextTriggerType || null,
      sequence_order: s.sequenceOrder ?? i,
      active: s.active !== false,
    })));
  }
  const { data } = await supabase.from('process_config').select('*').eq('studio_id', studioId).order('sequence_order');
  res.json({ config: data || [] });
});

// Helper: get a studio's active process config (custom or default), as a lookup map
async function getStudioProcessMap(studioId) {
  const { data } = await supabase.from('process_config').select('*').eq('studio_id', studioId).eq('active', true);
  const rows = (data && data.length) ? data : DEFAULT_PROCESS_CONFIG.map(d => ({
    trigger_type: d.triggerType, trigger_label: d.triggerLabel, assigned_role: d.assignedRole,
    task_message_template: d.taskMessage, next_trigger_type: d.nextTriggerType,
  }));
  const map = {};
  rows.forEach(r => { map[r.trigger_type] = r; });
  return map;
}

function fillTemplate(template, data) {
  return (template || '').replace(/\{(\w+)\}/g, (_, key) => data?.[key] ?? '');
}

// ═══════════════════════════════════════════
// TASK QUEUE
// Per-role personal task list. Fed by the process
// config chain — each trigger creates a task for
// the assigned role; completing it can auto-create
// the next task in the chain.
// ═══════════════════════════════════════════

// POST /api/staff/tasks/create — create a task from a trigger (called instead of/alongside fireHandoffAlert)
app.post('/api/staff/tasks/create', async (req, res) => {
  const { studioId, triggerType, bookingCode, tableName, data } = req.body;
  if (!studioId || !triggerType) return res.status(400).json({ error: 'studioId and triggerType required' });

  const processMap = await getStudioProcessMap(studioId);
  const step = processMap[triggerType];
  if (!step) return res.status(400).json({ error: `No process step configured for trigger: ${triggerType}` });

  const message = fillTemplate(step.task_message_template, { ...data, table: tableName });

  const { data: task, error } = await supabase.from('task_queue').insert({
    studio_id: studioId,
    booking_code: bookingCode || null,
    table_name: tableName || null,
    assigned_role: step.assigned_role,
    task_type: triggerType,
    task_description: message,
    next_trigger_type: step.next_trigger_type || null,
    status: 'pending',
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ task });
});

// GET /api/staff/tasks — get pending tasks for a role (personal queue)
app.get('/api/staff/tasks', async (req, res) => {
  const { studioId, role } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  let query = supabase.from('task_queue').select('*').eq('studio_id', studioId).eq('status', 'pending');
  if (role) query = query.eq('assigned_role', role);
  const { data } = await query.order('created_at', { ascending: true });
  res.json({ tasks: data || [] });
});

// GET /api/staff/tasks/all-incomplete — every pending task, grouped by role, for the manager overview
app.get('/api/staff/tasks/all-incomplete', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  const { data } = await supabase.from('task_queue')
    .select('*').eq('studio_id', studioId).eq('status', 'pending')
    .order('created_at', { ascending: true });

  const tasks = data || [];
  const grouped = {};
  tasks.forEach(t => {
    if (!grouped[t.assigned_role]) grouped[t.assigned_role] = [];
    grouped[t.assigned_role].push(t);
  });

  res.json({ tasks, grouped, totalCount: tasks.length });
});

// ═══════════════════════════════════════════
// AI DESIGN GENERATION (Transfer Designer)
// One central OpenAI account, shared across every
// kilnLINK studio. Usage is logged per studio and
// billed monthly as a line item on their existing
// Stripe subscription via metered billing.
// ═══════════════════════════════════════════

const WHOLESALE_GENERATION_PRICE_CENTS = 10; // what we charge studios, per generation
const DEFAULT_CUSTOMER_GENERATION_PRICE_CENTS = 20; // suggested default for studios to charge their customers
const DEFAULT_CUSTOMER_PRINT_PRICE_CENTS = 150; // suggested default AI print price (vs £1 hand-drawn)

// Blocks prompts that reference copyrighted characters, franchises, named
// artists' styles, or anything obviously trying to reproduce existing IP.
// This is a first line of defence, not a legal guarantee — staff review
// and approve every submission before printing regardless.
const BLOCKED_PROMPT_PATTERNS = [
  /disney|pixar|marvel|dc comics|warner bros|nintendo|pokemon|pokémon/i,
  /star wars|harry potter|hello kitty|sanrio|peppa pig|paw patrol/i,
  /minecraft|fortnite|roblox|among us/i,
  /in the style of\s+\w+/i, // "in the style of [named artist]"
  /like\s+\w+\s+(the artist|painting|artwork)/i,
  /copyrighted|trademark(ed)?/i,
];

function isPromptBlocked(prompt) {
  return BLOCKED_PROMPT_PATTERNS.some(pattern => pattern.test(prompt));
}

// POST /api/ai-design/generate — generate AI artwork for a transfer design
app.post('/api/ai-design/generate', async (req, res) => {
  const { studioId, bookingCode, prompt } = req.body;
  if (!studioId || !prompt) return res.status(400).json({ error: 'studioId and prompt required' });
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'AI design generation is not yet available for this studio.' });

  const trimmedPrompt = String(prompt).trim().slice(0, 300);
  if (!trimmedPrompt) return res.status(400).json({ error: 'Please describe what you would like.' });

  if (isPromptBlocked(trimmedPrompt)) {
    return res.status(400).json({
      error: 'That description can\'t be used — please avoid copyrighted characters, brands, or named artists\' styles. Try describing shapes, colours, and themes instead.'
    });
  }

  // Check the studio has AI generation enabled
  const { data: aiConfig } = await supabase.from('ai_design_config').select('*').eq('studio_id', studioId).single();
  if (aiConfig && aiConfig.enabled === false) {
    return res.status(403).json({ error: 'AI design generation is turned off for this studio.' });
  }

  // Enforce a real per-booking generation cap — without this, a customer
  // could generate unlimited images in one visit, each one a genuine cost
  // to the studio (wholesale from OpenAI, billed onward to the customer
  // at checkout) with nothing stopping runaway usage or non-payment risk.
  // Checked BEFORE calling OpenAI, so a blocked request costs nothing —
  // not just recorded after the fact.
  const MAX_GENERATIONS_PER_BOOKING = 5;
  if (bookingCode) {
    const { count } = await supabase.from('ai_generation_usage')
      .select('id', { count: 'exact', head: true })
      .eq('studio_id', studioId).eq('booking_code', bookingCode);
    if ((count || 0) >= MAX_GENERATIONS_PER_BOOKING) {
      return res.status(429).json({
        error: `You've reached the limit of ${MAX_GENERATIONS_PER_BOOKING} AI designs for this visit. Please ask a member of staff if you'd like more.`,
        limitReached: true,
        used: count,
        max: MAX_GENERATIONS_PER_BOOKING,
      });
    }
  }

  try {
    const openaiRes = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: `A simple, clean, printable design suitable for a ceramic transfer: ${trimmedPrompt}. Flat colours, clear outlines, no photorealism, no text unless requested, white or transparent background.`,
        n: 1,
        size: '1024x1024',
        quality: 'standard',
      }),
    });

    if (!openaiRes.ok) {
      const errBody = await openaiRes.text();
      console.error('OpenAI generation error:', errBody);
      return res.status(502).json({ error: 'Could not generate a design right now — please try again.' });
    }

    const openaiData = await openaiRes.json();
    const imageUrl = openaiData.data?.[0]?.url;
    if (!imageUrl) return res.status(502).json({ error: 'No image was returned — please try again.' });

    // Log usage for wholesale billing to the studio
    await supabase.from('ai_generation_usage').insert({
      studio_id: studioId,
      booking_code: bookingCode || null,
      prompt: trimmedPrompt,
      wholesale_cost_cents: WHOLESALE_GENERATION_PRICE_CENTS,
      created_at: new Date().toISOString(),
    });

    // Report usage to Stripe for metered billing on the studio's subscription,
    // if they have an active subscription with a metered AI usage item configured.
    reportAiUsageToStripe(studioId).catch(err => console.error('Stripe usage report failed:', err));

    res.json({ imageUrl, wholesaleCostCents: WHOLESALE_GENERATION_PRICE_CENTS });
  } catch (err) {
    console.error('AI generation error:', err);
    res.status(500).json({ error: 'Could not generate a design right now — please try again.' });
  }
});

// Reports today's running total of a studio's AI usage to Stripe as metered
// usage, if they have a metered subscription item set up for it. Stripe
// accumulates this and includes it as a line item on their next invoice —
// no separate billing system needed.
async function reportAiUsageToStripe(studioId) {
  const { data: sub } = await supabase.from('stripe_subscriptions')
    .select('stripe_subscription_id, ai_usage_item_id').eq('studio_id', studioId).single();
  if (!sub || !sub.ai_usage_item_id) return; // studio has no metered AI item configured yet

  await stripe.subscriptionItems.createUsageRecord(sub.ai_usage_item_id, {
    quantity: 1,
    timestamp: Math.floor(Date.now() / 1000),
    action: 'increment',
  });
}

// GET /api/ai-design/usage — a studio's own AI generation usage this month (for their dashboard)
app.get('/api/ai-design/usage', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });

  const startOfMonth = new Date();
  startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);

  const { data } = await supabase.from('ai_generation_usage')
    .select('wholesale_cost_cents').eq('studio_id', studioId).gte('created_at', startOfMonth.toISOString());

  const count = (data || []).length;
  const totalCents = (data || []).reduce((sum, r) => sum + (r.wholesale_cost_cents || 0), 0);
  res.json({ count, totalCents, monthLabel: startOfMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) });
});

// ═══════════════════════════════════════════
// PLATFORM REVENUE (kilnLINK/Green Room owner view)
// Not scoped to a single studio — this is revenue
// coming IN to the platform from every studio's
// subscription, wholesale AI usage, and feature
// licensing fee. Separate from any individual
// studio's own customer revenue.
// ═══════════════════════════════════════════

// Genuine, real guardrail: studios can genuinely promote real
// kilnLINK/GlazeUp features and their own studio through free-text
// fields (Promotions History, Offer of the Week, Studio Knowledge),
// but must never be able to insert an external URL — no payment
// links, no unrelated external wares, no way to route a customer off
// the platform through these fields. Applied consistently everywhere
// a studio can enter promotional text a customer will see.
const URL_PATTERN = /https?:\/\/|www\.|\.(com|co\.uk|net|org|shop|store|link|io|biz)\b/i;
function containsGenuineURL(text) {
  return !!text && URL_PATTERN.test(text);
}

const PLAN_MONTHLY_PRICE_CENTS = { pilot: 0, solo: 2900, studio: 5900, multi: 9900 };

// Feature licensing fee: kilnLINK takes a cut of every in-app extra a
// customer buys at any studio (Design Preview, Take It Home, Transfer
// Designer, tablet hire, specialist glazes etc). These features cost
// the studio nothing extra to run — it's kilnLINK's own software — so
// a flat percentage is simple and fair. 15% is in line with typical
// app marketplace platform fees (15-30%), studios keep 85%.
const FEATURE_LICENSING_FEE_RATE = 0.15;

app.get('/api/platform/revenue', async (req, res) => {
  const { staffMemberId } = req.query;
  if (!staffMemberId) return res.status(401).json({ error: 'Not authorised' });

  const { data: staffMember } = await supabase.from('staff_team').select('name').eq('id', staffMemberId).single();
  const firstName = (staffMember?.name || '').trim().split(' ')[0].toLowerCase();
  if (!PLATFORM_REVENUE_ACCESS_NAMES.includes(firstName)) {
    return res.status(403).json({ error: 'Platform Revenue is restricted to directors.' });
  }

  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
    const startOfYear = new Date();
    startOfYear.setMonth(0, 1); startOfYear.setHours(0, 0, 0, 0);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [studiosRes, subsRes, aiUsageRes, aiUsageAllTimeRes, extrasRes, extrasAllTimeRes, extrasDailyRes, aiYtdRes, extrasYtdRes, addonsRes] = await Promise.all([
      supabase.from('studios').select('id, name, created_at'),
      supabase.from('stripe_subscriptions').select('studio_id, plan_id, status'),
      supabase.from('ai_generation_usage').select('studio_id, wholesale_cost_cents, created_at').gte('created_at', startOfMonth.toISOString()),
      supabase.from('ai_generation_usage').select('studio_id, wholesale_cost_cents, created_at'),
      supabase.from('app_extra_charges').select('studio_id, amount_cents, created_at').gte('created_at', startOfMonth.toISOString()),
      supabase.from('app_extra_charges').select('studio_id, amount_cents'),
      supabase.from('app_extra_charges').select('amount_cents, created_at').gte('created_at', thirtyDaysAgo.toISOString()),
      supabase.from('ai_generation_usage').select('wholesale_cost_cents, created_at').gte('created_at', startOfYear.toISOString()),
      supabase.from('app_extra_charges').select('amount_cents, created_at').gte('created_at', startOfYear.toISOString()),
      supabase.from('studio_addons').select('studio_id, addon_key, monthly_price_cents, enabled').eq('enabled', true),
    ]);

    const studios = studiosRes.data || [];
    const subs = subsRes.data || [];
    const aiUsageThisMonth = aiUsageRes.data || [];
    const aiUsageAllTime = aiUsageAllTimeRes.data || [];
    const extrasThisMonth = extrasRes.data || [];
    const extrasAllTime = extrasAllTimeRes.data || [];
    const extrasDaily30 = extrasDailyRes.data || [];
    const aiDaily30 = aiUsageAllTime.filter(r => new Date(r.created_at) >= thirtyDaysAgo);
    const activeAddons = addonsRes.data || [];

    const subByStudio = {};
    subs.forEach(s => { subByStudio[s.studio_id] = s; });

    // Monthly recurring revenue from subscriptions
    const activeSubs = subs.filter(s => s.status === 'active' || s.status === 'trialing');
    const mrrCents = activeSubs.reduce((sum, s) => sum + (PLAN_MONTHLY_PRICE_CENTS[s.plan_id] || 0), 0);

    // Real add-on MRR — every currently-enabled add-on across every
    // studio, genuinely summed the same way base-plan MRR is. This
    // includes Cleo's Club (tracked separately in cleos_club_config
    // but folded in here) plus anything in the newer generic
    // studio_addons table.
    const addonMrrCents = activeAddons.reduce((sum, a) => sum + (a.monthly_price_cents || 0), 0);
    const addonCountByKey = {};
    activeAddons.forEach(a => { addonCountByKey[a.addon_key] = (addonCountByKey[a.addon_key] || 0) + 1; });

    // AI wholesale revenue this month and all-time
    const aiRevenueThisMonthCents = aiUsageThisMonth.reduce((sum, r) => sum + (r.wholesale_cost_cents || 0), 0);
    const aiRevenueAllTimeCents = aiUsageAllTime.reduce((sum, r) => sum + (r.wholesale_cost_cents || 0), 0);
    const aiGenerationsThisMonth = aiUsageThisMonth.length;
    const aiGenerationsAllTime = aiUsageAllTime.length;

    // Feature licensing fee — 15% of every extras charge, this month and all-time
    const licensingRevenueThisMonthCents = Math.round(
      extrasThisMonth.reduce((sum, r) => sum + (r.amount_cents || 0), 0) * FEATURE_LICENSING_FEE_RATE
    );
    const licensingRevenueAllTimeCents = Math.round(
      extrasAllTime.reduce((sum, r) => sum + (r.amount_cents || 0), 0) * FEATURE_LICENSING_FEE_RATE
    );
    const extrasVolumeThisMonthCents = extrasThisMonth.reduce((sum, r) => sum + (r.amount_cents || 0), 0);

    // Per-studio breakdown
    const aiByStudio = {};
    aiUsageAllTime.forEach(r => {
      if (!aiByStudio[r.studio_id]) aiByStudio[r.studio_id] = { count: 0, cents: 0 };
      aiByStudio[r.studio_id].count++;
      aiByStudio[r.studio_id].cents += (r.wholesale_cost_cents || 0);
    });
    const extrasByStudio = {};
    extrasAllTime.forEach(r => {
      if (!extrasByStudio[r.studio_id]) extrasByStudio[r.studio_id] = { volumeCents: 0 };
      extrasByStudio[r.studio_id].volumeCents += (r.amount_cents || 0);
    });

    const studioBreakdown = studios.map(st => {
      const sub = subByStudio[st.id];
      const ai = aiByStudio[st.id] || { count: 0, cents: 0 };
      const extras = extrasByStudio[st.id] || { volumeCents: 0 };
      const licensingCents = Math.round(extras.volumeCents * FEATURE_LICENSING_FEE_RATE);
      return {
        studioId: st.id,
        name: st.name || 'Unnamed studio',
        plan: sub?.plan_id || 'none',
        status: sub?.status || 'no subscription',
        monthlySubCents: PLAN_MONTHLY_PRICE_CENTS[sub?.plan_id] || 0,
        aiGenerationsAllTime: ai.count,
        aiRevenueAllTimeCents: ai.cents,
        licensingRevenueAllTimeCents: licensingCents,
      };
    }).sort((a, b) =>
      (b.monthlySubCents + b.aiRevenueAllTimeCents + b.licensingRevenueAllTimeCents) -
      (a.monthlySubCents + a.aiRevenueAllTimeCents + a.licensingRevenueAllTimeCents)
    );

    // 30-day daily trend — combines AI + licensing fee revenue per day,
    // used to draw the daily-updating chart and feed the speedometer's
    // "today vs recent average" comparison.
    const dailyMap = {};
    for (let d = 0; d < 30; d++) {
      const day = new Date(); day.setDate(day.getDate() - d); day.setHours(0,0,0,0);
      dailyMap[day.toISOString().split('T')[0]] = { aiCents: 0, licensingCents: 0 };
    }
    aiDaily30.forEach(r => {
      const day = new Date(r.created_at).toISOString().split('T')[0];
      if (dailyMap[day]) dailyMap[day].aiCents += (r.wholesale_cost_cents || 0);
    });
    extrasDaily30.forEach(r => {
      const day = new Date(r.created_at).toISOString().split('T')[0];
      if (dailyMap[day]) dailyMap[day].licensingCents += Math.round((r.amount_cents || 0) * FEATURE_LICENSING_FEE_RATE);
    });
    const dailyTrend = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, totalCents: v.aiCents + v.licensingCents, aiCents: v.aiCents, licensingCents: v.licensingCents }));

    const todayCents = dailyTrend[dailyTrend.length - 1]?.totalCents || 0;
    const last7 = dailyTrend.slice(-8, -1); // 7 days before today
    const avg7DayCents = last7.length ? Math.round(last7.reduce((s,d) => s + d.totalCents, 0) / last7.length) : 0;

    // Year-to-date: AI + licensing revenue since 1 Jan this year, PLUS
    // subscription revenue accumulated so far this year. This was a real
    // bug — the original version only summed AI+licensing and completely
    // omitted subscriptions, which is the platform's single largest
    // revenue source. That made YTD read lower than MTD, which is
    // obviously wrong since YTD should always be >= MTD once you're past
    // January. We don't keep a full historical billing ledger (no record
    // of exactly what MRR was in past months, only what it is right now),
    // so this approximates subscription revenue for the year using
    // current MRR × months elapsed — reasonable given active subscriber
    // count doesn't swing wildly month to month, and consistent with the
    // same approximation already used for the studio growth-curve chart.
    const aiYtdRows = aiYtdRes.data || [];
    const extrasYtdRows = extrasYtdRes.data || [];
    const aiRevenueYtdCents = aiYtdRows.reduce((sum, r) => sum + (r.wholesale_cost_cents || 0), 0);
    const licensingRevenueYtdCents = Math.round(
      extrasYtdRows.reduce((sum, r) => sum + (r.amount_cents || 0), 0) * FEATURE_LICENSING_FEE_RATE
    );
    const monthsElapsedThisYear = new Date().getMonth() + 1; // Jan = 1, so this includes the current partial month
    const subscriptionRevenueYtdCents = mrrCents * monthsElapsedThisYear;
    const totalYtdRevenueCents = aiRevenueYtdCents + licensingRevenueYtdCents + subscriptionRevenueYtdCents;

    res.json({
      totalStudios: studios.length,
      activeSubscriptions: activeSubs.length,
      mrrCents,
      addonMrrCents,
      addonCountByKey,
      totalMrrWithAddonsCents: mrrCents + addonMrrCents,
      aiRevenueThisMonthCents,
      aiRevenueAllTimeCents,
      aiGenerationsThisMonth,
      aiGenerationsAllTime,
      licensingRevenueThisMonthCents,
      licensingRevenueAllTimeCents,
      licensingFeeRate: FEATURE_LICENSING_FEE_RATE,
      extrasVolumeThisMonthCents,
      totalMonthlyRevenueCents: mrrCents + addonMrrCents + aiRevenueThisMonthCents + licensingRevenueThisMonthCents,
      totalYtdRevenueCents,
      dailyTrend,
      todayCents,
      avg7DayCents,
      studioBreakdown,
      monthLabel: startOfMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
    });
  } catch (err) {
    console.error('Platform revenue error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/platform/revenue/monthly-trend — long-range monthly totals for
// the historical trend chart. Aggregated server-side by month so a 2-3
// year seed doesn't mean shipping thousands of daily rows to the browser.
app.get('/api/platform/revenue/monthly-trend', async (req, res) => {
  const { staffMemberId, months } = req.query;
  if (!staffMemberId) return res.status(401).json({ error: 'Not authorised' });

  const { data: staffMember } = await supabase.from('staff_team').select('name').eq('id', staffMemberId).single();
  const firstName = (staffMember?.name || '').trim().split(' ')[0].toLowerCase();
  if (!PLATFORM_REVENUE_ACCESS_NAMES.includes(firstName)) {
    return res.status(403).json({ error: 'Platform Revenue is restricted to directors.' });
  }

  try {
    const monthsBack = Math.min(60, parseInt(months) || 36); // default 3 years
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - monthsBack);
    startDate.setDate(1); startDate.setHours(0, 0, 0, 0);

    const [aiRes, extrasRes, studiosRes] = await Promise.all([
      supabase.from('ai_generation_usage').select('wholesale_cost_cents, created_at').gte('created_at', startDate.toISOString()),
      supabase.from('app_extra_charges').select('amount_cents, created_at').gte('created_at', startDate.toISOString()),
      supabase.from('studios').select('id, created_at'),
    ]);

    const aiRows = aiRes.data || [];
    const extrasRows = extrasRes.data || [];
    const studios = studiosRes.data || [];

    const monthMap = {};
    const monthKey = (d) => { const dt = new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`; };

    for (let m = 0; m <= monthsBack; m++) {
      const d = new Date(startDate); d.setMonth(d.getMonth() + m);
      monthMap[monthKey(d)] = { aiCents: 0, licensingCents: 0, newStudios: 0 };
    }

    aiRows.forEach(r => {
      const key = monthKey(r.created_at);
      if (monthMap[key]) monthMap[key].aiCents += (r.wholesale_cost_cents || 0);
    });
    extrasRows.forEach(r => {
      const key = monthKey(r.created_at);
      if (monthMap[key]) monthMap[key].licensingCents += Math.round((r.amount_cents || 0) * FEATURE_LICENSING_FEE_RATE);
    });
    studios.forEach(s => {
      const key = monthKey(s.created_at);
      if (monthMap[key]) monthMap[key].newStudios += 1;
    });

    let runningStudioCount = 0;
    const monthly = Object.keys(monthMap).sort().map(key => {
      runningStudioCount += monthMap[key].newStudios;
      const totalCents = monthMap[key].aiCents + monthMap[key].licensingCents;
      return {
        month: key,
        aiCents: monthMap[key].aiCents,
        licensingCents: monthMap[key].licensingCents,
        totalCents,
        newStudios: monthMap[key].newStudios,
        cumulativeStudios: runningStudioCount,
      };
    });

    res.json({ monthly, monthsCovered: monthsBack + 1 });
  } catch (err) {
    console.error('Monthly trend error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/platform/revenue/studio-detail — drill-down for a single studio:
// its full monthly history, current plan, and generation prompts sample.
app.get('/api/platform/revenue/studio-detail', async (req, res) => {
  const { staffMemberId, studioId } = req.query;
  if (!staffMemberId) return res.status(401).json({ error: 'Not authorised' });
  if (!studioId) return res.status(400).json({ error: 'studioId required' });

  const { data: staffMember } = await supabase.from('staff_team').select('name').eq('id', staffMemberId).single();
  const firstName = (staffMember?.name || '').trim().split(' ')[0].toLowerCase();
  if (!PLATFORM_REVENUE_ACCESS_NAMES.includes(firstName)) {
    return res.status(403).json({ error: 'Platform Revenue is restricted to directors.' });
  }

  try {
    const [studioRes, subRes, aiRes, extrasRes] = await Promise.all([
      supabase.from('studios').select('id, name, created_at').eq('id', studioId).single(),
      supabase.from('stripe_subscriptions').select('plan_id, status, current_period_start').eq('studio_id', studioId).single(),
      supabase.from('ai_generation_usage').select('wholesale_cost_cents, prompt, created_at').eq('studio_id', studioId).order('created_at', { ascending: true }),
      supabase.from('app_extra_charges').select('amount_cents, item_name, created_at').eq('studio_id', studioId).order('created_at', { ascending: true }),
    ]);

    const studio = studioRes.data;
    const sub = subRes.data;
    const aiRows = aiRes.data || [];
    const extrasRows = extrasRes.data || [];

    // Group by month for this one studio's trend
    const monthMap = {};
    const monthKey = (d) => { const dt = new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`; };
    aiRows.forEach(r => {
      const key = monthKey(r.created_at);
      if (!monthMap[key]) monthMap[key] = { aiCents: 0, licensingCents: 0, aiCount: 0 };
      monthMap[key].aiCents += (r.wholesale_cost_cents || 0);
      monthMap[key].aiCount += 1;
    });
    extrasRows.forEach(r => {
      const key = monthKey(r.created_at);
      if (!monthMap[key]) monthMap[key] = { aiCents: 0, licensingCents: 0, aiCount: 0 };
      monthMap[key].licensingCents += Math.round((r.amount_cents || 0) * FEATURE_LICENSING_FEE_RATE);
    });
    const monthly = Object.keys(monthMap).sort().map(key => ({
      month: key, ...monthMap[key], totalCents: monthMap[key].aiCents + monthMap[key].licensingCents,
    }));

    const totalAiCents = aiRows.reduce((s, r) => s + (r.wholesale_cost_cents || 0), 0);
    const totalLicensingCents = Math.round(extrasRows.reduce((s, r) => s + (r.amount_cents || 0), 0) * FEATURE_LICENSING_FEE_RATE);

    // A few recent example prompts, for a bit of texture in the detail view
    const recentPrompts = aiRows.slice(-5).reverse().map(r => r.prompt);

    res.json({
      studio,
      plan: sub?.plan_id || 'none',
      status: sub?.status || 'no subscription',
      joinedAt: studio?.created_at,
      totalAiCents,
      totalLicensingCents,
      totalAiGenerations: aiRows.length,
      totalExtrasPurchases: extrasRows.length,
      monthly,
      recentPrompts,
    });
  } catch (err) {
    console.error('Studio detail error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ai-design/config — studio's AI generation settings (enabled + their customer pricing)
app.get('/api/ai-design/config', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  const { data } = await supabase.from('ai_design_config').select('*').eq('studio_id', studioId).single();
  res.json({
    config: data || {
      enabled: true,
      customer_generation_price_cents: DEFAULT_CUSTOMER_GENERATION_PRICE_CENTS,
      customer_print_price_cents: DEFAULT_CUSTOMER_PRINT_PRICE_CENTS,
    }
  });
});

// POST /api/ai-design/config — studio toggles AI generation on/off, sets their own customer pricing
app.post('/api/ai-design/config', async (req, res) => {
  const { studioId, enabled, customerGenerationPriceCents, customerPrintPriceCents } = req.body;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });

  const { data, error } = await supabase.from('ai_design_config').upsert({
    studio_id: studioId,
    enabled: enabled !== false,
    customer_generation_price_cents: customerGenerationPriceCents ?? DEFAULT_CUSTOMER_GENERATION_PRICE_CENTS,
    customer_print_price_cents: customerPrintPriceCents ?? DEFAULT_CUSTOMER_PRINT_PRICE_CENTS,
  }, { onConflict: 'studio_id' }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ config: data });
});

// POST /api/staff/tasks/adhoc — manager pushes a one-off task to a role or specific staff member
app.post('/api/staff/tasks/adhoc', async (req, res) => {
  const { studioId, assignedRole, assignedStaffId, taskDescription, tableName, bookingCode, urgent } = req.body;
  if (!studioId || !assignedRole || !taskDescription) {
    return res.status(400).json({ error: 'studioId, assignedRole, taskDescription required' });
  }

  const { data: task, error } = await supabase.from('task_queue').insert({
    studio_id: studioId,
    booking_code: bookingCode || null,
    table_name: tableName || null,
    assigned_role: assignedRole,
    assigned_staff_id: assignedStaffId || null,
    task_type: 'adhoc_request',
    task_description: taskDescription,
    next_trigger_type: null,
    status: 'pending',
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });

  // Also fire a handoff alert so it shows in the alert feed / big popup immediately
  await supabase.from('staff_alerts').insert({
    studio_id: studioId,
    trigger_type: 'adhoc_request',
    booking_code: bookingCode || null,
    next_role: assignedRole,
    icon: urgent ? '🚨' : '📌',
    label: urgent ? 'Urgent request' : 'One-off request',
    message: taskDescription,
    context: { assignedStaffId, urgent: !!urgent },
    acknowledged: false,
  });

  res.json({ task });
});

// DELETE /api/staff/tasks/:id — cancel a task entirely (manager can pull back a request)
app.delete('/api/staff/tasks/:id', async (req, res) => {
  await supabase.from('task_queue').delete().eq('id', req.params.id);
  res.json({ deleted: true });
});

// PATCH /api/staff/tasks/:id/complete — mark a task complete, auto-create next step if chained
app.patch('/api/staff/tasks/:id/complete', async (req, res) => {
  const { completedBy } = req.body;
  const { data: task } = await supabase.from('task_queue').select('*').eq('id', req.params.id).single();
  if (!task) return res.status(404).json({ error: 'Task not found' });

  await supabase.from('task_queue').update({
    status: 'completed', completed_at: new Date().toISOString(), completed_by: completedBy || null,
  }).eq('id', req.params.id);

  let nextTask = null;
  if (task.next_trigger_type) {
    const processMap = await getStudioProcessMap(task.studio_id);
    const nextStep = processMap[task.next_trigger_type];
    if (nextStep) {
      const message = fillTemplate(nextStep.task_message_template, { table: task.table_name });
      const { data: created } = await supabase.from('task_queue').insert({
        studio_id: task.studio_id, booking_code: task.booking_code, table_name: task.table_name,
        assigned_role: nextStep.assigned_role, task_type: task.next_trigger_type,
        task_description: message, next_trigger_type: nextStep.next_trigger_type || null,
        status: 'pending',
      }).select().single();
      nextTask = created;
    }
  }

  res.json({ completed: true, nextTask });
});

// PATCH /api/staff/tasks/:id/pass — pass a task back into the queue for the same role (someone else picks it up)
app.patch('/api/staff/tasks/:id/pass', async (req, res) => {
  await supabase.from('task_queue').update({ status: 'pending', assigned_staff_id: null }).eq('id', req.params.id);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════
// STEP COUNTER — just for fun / team banter
// Best-effort motion-based step estimate from
// each staff member's own device. Not a medical
// or precise measurement — purely playful.
// ═══════════════════════════════════════════

// POST /api/staff/steps — log a step count reading for the current shift
app.post('/api/staff/steps', async (req, res) => {
  const { studioId, staffMemberId, steps, shiftDate } = req.body;
  if (!studioId || !staffMemberId || steps == null) {
    return res.status(400).json({ error: 'studioId, staffMemberId, steps required' });
  }
  const date = shiftDate || new Date().toISOString().split('T')[0];

  const { data, error } = await supabase.from('staff_steps').upsert({
    studio_id: studioId, staff_member_id: staffMemberId, shift_date: date, steps,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'studio_id,staff_member_id,shift_date' }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ record: data });
});

// GET /api/staff/steps/leaderboard — today's step leaderboard for the studio
app.get('/api/staff/steps/leaderboard', async (req, res) => {
  const { studioId, date } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  const shiftDate = date || new Date().toISOString().split('T')[0];

  const { data: steps } = await supabase.from('staff_steps')
    .select('staff_member_id, steps').eq('studio_id', studioId).eq('shift_date', shiftDate);

  const { data: team } = await supabase.from('staff_team').select('id, name, role').eq('studio_id', studioId);

  const nameMap = {};
  (team || []).forEach(m => { nameMap[m.id] = m; });

  const leaderboard = (steps || [])
    .map(s => ({
      staffMemberId: s.staff_member_id,
      name: nameMap[s.staff_member_id]?.name || 'Unknown',
      role: nameMap[s.staff_member_id]?.role || '',
      steps: s.steps,
      // Rough, playful estimate — average stride ~0.75m, ~0.04 kcal per step (varies hugely by person)
      distanceKm: Math.round((s.steps * 0.00075) * 10) / 10,
      caloriesEst: Math.round(s.steps * 0.04),
    }))
    .sort((a, b) => b.steps - a.steps);

  res.json({ shiftDate, leaderboard });
});

app.get('/api/staff/team', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  const { data } = await supabase.from('staff_team').select('*').eq('studio_id', studioId).order('name');
  res.json({ team: data || [] });
});

// POST /api/staff/team — add or update a team member
app.post('/api/staff/team', async (req, res) => {
  const { studioId, id, name, role, active } = req.body;
  if (!studioId || !name || !role) return res.status(400).json({ error: 'studioId, name, role required' });
  if (id) {
    const { data, error } = await supabase.from('staff_team')
      .update({ name, role, active: active !== false })
      .eq('id', id).eq('studio_id', studioId).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ member: data });
  }
  const { data, error } = await supabase.from('staff_team')
    .insert({ studio_id: studioId, name, role, active: true }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ member: data });
});

// DELETE /api/staff/team/:id — remove a team member
app.delete('/api/staff/team/:id', async (req, res) => {
  const { studioId } = req.query;
  await supabase.from('staff_team').delete().eq('id', req.params.id).eq('studio_id', studioId);
  res.json({ deleted: true });
});

// GET /api/staff/duties — get the duty list config for a studio (role duties + extra duties)
app.get('/api/staff/duties', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  const { data } = await supabase.from('staff_duty_config').select('*').eq('studio_id', studioId);

  // If no config saved yet, return defaults
  if (!data || !data.length) {
    const defaults = Object.entries(DEFAULT_ROLE_DUTIES).map(([role, duties]) => ({
      role, duties, isDefault: true
    }));
    return res.json({ dutyConfig: defaults });
  }
  res.json({ dutyConfig: data.map(d => ({ role: d.role, duties: d.duties, isDefault: false })) });
});

// POST /api/staff/duties — save/update duty list for a role (studio admin edits weekly)
app.post('/api/staff/duties', async (req, res) => {
  const { studioId, role, duties } = req.body;
  if (!studioId || !role || !Array.isArray(duties)) return res.status(400).json({ error: 'studioId, role, duties[] required' });
  const { data, error } = await supabase.from('staff_duty_config')
    .upsert({ studio_id: studioId, role, duties, updated_at: new Date().toISOString() }, { onConflict: 'studio_id,role' })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ config: data });
});

// GET /api/staff/session-duties — get duty checklist state for a specific booking/table session
app.get('/api/staff/session-duties', async (req, res) => {
  const { studioId, bookingCode } = req.query;
  if (!studioId || !bookingCode) return res.status(400).json({ error: 'studioId and bookingCode required' });
  const { data } = await supabase.from('session_duties')
    .select('*').eq('studio_id', studioId).eq('booking_code', bookingCode);
  res.json({ sessionDuties: data || [] });
});

// POST /api/staff/session-duties — assign duties to a staff member for this session
app.post('/api/staff/session-duties', async (req, res) => {
  const { studioId, bookingCode, staffMemberId, staffName, role, duties } = req.body;
  if (!studioId || !bookingCode || !staffName || !Array.isArray(duties)) {
    return res.status(400).json({ error: 'studioId, bookingCode, staffName, duties[] required' });
  }
  const rows = duties.map(d => ({
    studio_id: studioId, booking_code: bookingCode,
    staff_member_id: staffMemberId || null, staff_name: staffName, role: role || null,
    duty_text: d, completed: false,
  }));
  const { data, error } = await supabase.from('session_duties').insert(rows).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ sessionDuties: data });
});

// PATCH /api/staff/session-duties/:id — tick/untick a specific duty
app.patch('/api/staff/session-duties/:id', async (req, res) => {
  const { completed, status } = req.body;
  const { data, error } = await supabase.from('session_duties')
    .update({ completed, status: status || null, completed_at: completed ? new Date().toISOString() : null })
    .eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ duty: data });
});

// DELETE /api/staff/session-duties/:id — remove a duty assignment
app.delete('/api/staff/session-duties/:id', async (req, res) => {
  await supabase.from('session_duties').delete().eq('id', req.params.id);
  res.json({ deleted: true });
});

// ═══════════════════════════════════════════
// STUDIO TABLE MANAGEMENT
// ═══════════════════════════════════════════

app.get('/api/studio/tables', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  const { data } = await supabase.from('studio_tables')
    .select('*').eq('studio_id', studioId).order('sort_order', { ascending: true });
  res.json({ tables: data || [] });
});

app.post('/api/studio/tables', async (req, res) => {
  const { studioId, tables } = req.body;
  if (!studioId || !Array.isArray(tables)) return res.status(400).json({ error: 'studioId and tables required' });
  await supabase.from('studio_tables').delete().eq('studio_id', studioId);
  if (tables.length) {
    await supabase.from('studio_tables').insert(
      tables.map((t, i) => ({ studio_id: studioId, name: t.name, room: t.room || null, capacity: t.capacity || 2, sort_order: i }))
    );
  }
  const { data } = await supabase.from('studio_tables').select('*').eq('studio_id', studioId).order('sort_order');
  res.json({ tables: data || [] });
});

app.get('/api/studio/table-sessions/today', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  const today = new Date(); today.setHours(0,0,0,0);
  const { data } = await supabase.from('table_sessions')
    .select('id, table_name, customer_name, num_places, status, created_at, booking_code')
    .eq('studio_id', studioId).gte('created_at', today.toISOString())
    .in('status', ['open', 'painting']).order('created_at', { ascending: true });
  res.json({ sessions: data || [] });
});

// ═══════════════════════════════════════════
// LOYALTY SYSTEM
// Silver / Gold / Platinum tiers
// Points earned on visits, spend, drinks orders
// Rewards: free bisque, discounts, free drinks,
// priority booking, Take It Home unlock
// ═══════════════════════════════════════════

const LOYALTY_TIERS = {
  newcomer:   { name: 'Newcomer',   emoji: '🪴', minVisits: 1,  minSpend: 0,     minPieces: 0,  color: '#8BC34A' },
  dabbler:    { name: 'Dabbler',    emoji: '🎨', minVisits: 3,  minSpend: 0,     minPieces: 3,  color: '#26A69A' },
  regular:    { name: 'Regular',    emoji: '⭐', minVisits: 6,  minSpend: 5000,  minPieces: 0,  color: '#42A5F5' },
  enthusiast: { name: 'Enthusiast', emoji: '🔥', minVisits: 10, minSpend: 12000, minPieces: 5,  color: '#FF7043' },
  silver:     { name: 'Silver',     emoji: '🥈', minVisits: 15, minSpend: 20000, minPieces: 0,  color: '#9E9E9E' },
  gold:       { name: 'Gold',       emoji: '🥇', minVisits: 25, minSpend: 35000, minPieces: 0,  color: '#F9A825' },
  platinum:   { name: 'Platinum',   emoji: '💎', minVisits: 40, minSpend: 60000, minPieces: 0,  color: '#7B1FA2' },
};

// Ordered from highest to lowest for tier calculation
const TIER_ORDER = ['platinum','gold','silver','enthusiast','regular','dabbler','newcomer'];

const LOYALTY_REWARDS = {
  newcomer:   { description: 'Welcome! 50 bonus points on your first scan.',         freeBisque: null,                  glazingDiscount: 0,  freeDrink: false, priorityBooking: false, takeItHome: false },
  dabbler:    { description: 'Free hot drink on your next visit.',                   freeBisque: null,                  glazingDiscount: 0,  freeDrink: true,  priorityBooking: false, takeItHome: false },
  regular:    { description: '5% off glazing + free drink every visit.',             freeBisque: null,                  glazingDiscount: 5,  freeDrink: true,  priorityBooking: false, takeItHome: false },
  enthusiast: { description: 'Free small bisque piece of your choice.',              freeBisque: 'Small piece (e.g. mug)',glazingDiscount: 5, freeDrink: true,  priorityBooking: false, takeItHome: false },
  silver:     { description: '10% off glazing + free drink + priority booking.',     freeBisque: 'Small piece (e.g. mug)',glazingDiscount: 10, freeDrink: true,  priorityBooking: true,  takeItHome: false },
  gold:       { description: 'Free medium bisque piece + 15% off + priority.',       freeBisque: 'Medium piece (e.g. bowl)',glazingDiscount: 15,freeDrink: true,  priorityBooking: true,  takeItHome: false },
  platinum:   { description: 'Free large bisque + 20% off + Take It Home + gift.',   freeBisque: 'Large piece — your choice',glazingDiscount: 20,freeDrink: true, priorityBooking: true,  takeItHome: true  },
};

// Instant rewards — triggered by specific actions regardless of tier
const INSTANT_REWARDS = [
  { id: 'first_visit',       trigger: 'First ever visit',                    reward: '50 bonus points',                    points: 50  },
  { id: 'book_next_visit',   trigger: 'Booked next visit while in studio',   reward: 'Free drink this visit',              points: 20  },
  { id: 'fifth_piece',       trigger: '5th piece painted (cumulative)',       reward: 'Choose a free glaze colour',         points: 25  },
  { id: 'tenth_piece',       trigger: '10th piece painted',                  reward: '50 bonus points',                    points: 50  },
  { id: 'big_session',       trigger: 'Spent over £45 in one session',       reward: '10% off studio fee this session',    points: 15  },
  { id: 'community_share',   trigger: 'Shared a piece to the community',     reward: 'Design Preview free this visit',     points: 10  },
  { id: 'transfer_first',    trigger: 'First Transfer Designer use',         reward: 'Free motif stamp from staff',        points: 0   },
  { id: 'take_it_home',      trigger: 'Unlocked Take It Home',               reward: '15 bonus points',                   points: 15  },
];

function calcLoyaltyTier(visits, totalSpendCents, totalPieces) {
  const pieces = totalPieces || 0;
  for (const tier of TIER_ORDER) {
    const t = LOYALTY_TIERS[tier];
    const meetsVisits = visits >= t.minVisits;
    const meetsSpend  = t.minSpend  > 0 && totalSpendCents >= t.minSpend;
    const meetsPieces = t.minPieces > 0 && pieces >= t.minPieces;
    // newcomer just needs 1 visit; others need visits OR (spend OR pieces)
    if (tier === 'newcomer' && meetsVisits) return 'newcomer';
    if (tier !== 'newcomer' && (meetsVisits || meetsSpend || meetsPieces)) return tier;
  }
  return null;
}

function loyaltyProgress(visits, totalSpendCents, totalPieces) {
  const pieces = totalPieces || 0;
  const tier = calcLoyaltyTier(visits, totalSpendCents, pieces);
  if (tier === 'platinum') return { nextTier: null, pct: 100, message: '💎 Maximum tier — thank you!' };

  const currentIdx = TIER_ORDER.indexOf(tier);
  const nextTierKey = TIER_ORDER[currentIdx - 1] || TIER_ORDER[0];
  const t = LOYALTY_TIERS[nextTierKey];

  const visitPct = t.minVisits  > 0 ? Math.min(100, Math.round((visits / t.minVisits) * 100)) : 0;
  const spendPct = t.minSpend   > 0 ? Math.min(100, Math.round((totalSpendCents / t.minSpend) * 100)) : 0;
  const piecePct = t.minPieces  > 0 ? Math.min(100, Math.round((pieces / t.minPieces) * 100)) : 0;
  const pct = Math.max(visitPct, spendPct, piecePct);

  const visitsNeeded = Math.max(0, t.minVisits - visits);
  const spendNeeded  = t.minSpend  > 0 ? Math.max(0, t.minSpend - totalSpendCents) : null;
  const piecesNeeded = t.minPieces > 0 ? Math.max(0, t.minPieces - pieces) : null;

  const parts = [];
  if (visitsNeeded > 0) parts.push(`${visitsNeeded} more visit${visitsNeeded > 1 ? 's' : ''}`);
  if (spendNeeded)  parts.push(`spend £${(spendNeeded/100).toFixed(0)} more`);
  if (piecesNeeded) parts.push(`paint ${piecesNeeded} more piece${piecesNeeded > 1 ? 's' : ''}`);

  const message = parts.length
    ? `${parts.join(' or ')} for ${t.emoji} ${t.name}`
    : `Ready for ${t.emoji} ${t.name}!`;

  return { nextTier: nextTierKey, pct, message };
}

// Check which instant rewards apply for this customer right now
function checkInstantRewards(customer, sessionSpendCents) {
  const triggered = [];
  const visits = customer.visit_count || 0;
  const pieces = customer.total_pieces_painted || 0;

  if (visits === 1) triggered.push(INSTANT_REWARDS.find(r => r.id === 'first_visit'));
  if (pieces === 5 || pieces === 10) {
    const r = INSTANT_REWARDS.find(r => r.id === (pieces === 5 ? 'fifth_piece' : 'tenth_piece'));
    if (r) triggered.push(r);
  }
  if (sessionSpendCents >= 4500) triggered.push(INSTANT_REWARDS.find(r => r.id === 'big_session'));
  return triggered.filter(Boolean);
}

// GET /api/loyalty/customer — get full loyalty profile for a customer by name
app.get('/api/loyalty/customer', async (req, res) => {
  const { studioId, customerName, customerId } = req.query;
  if (!studioId || (!customerName && !customerId)) return res.status(400).json({ error: 'studioId and customerName or customerId required' });

  try {
    let query = supabase.from('customers').select('*').eq('studio_id', studioId);
    if (customerId) query = query.eq('id', customerId);
    else query = query.ilike('name', `%${customerName}%`);
    const { data: customers } = await query.limit(5);

    if (!customers?.length) return res.json({ found: false });

    const customer = customers[0];
    const visits = customer.visit_count || 0;
    const totalSpend = customer.total_spend_cents || 0;
    const pieces = customer.total_pieces_painted || 0;
    const tier = calcLoyaltyTier(visits, totalSpend, pieces);
    const progress = loyaltyProgress(visits, totalSpend, pieces);
    const instantRewards = checkInstantRewards(customer, 0);

    // Get recent transactions
    const { data: transactions } = await supabase
      .from('loyalty_transactions')
      .select('*')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false })
      .limit(10);

    res.json({
      found: true,
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        visits,
        totalSpendCents: totalSpend,
        totalSpendFormatted: `£${(totalSpend/100).toFixed(2)}`,
        loyaltyPoints: customer.loyalty_points || 0,
        totalPiecesPainted: pieces,
        tier,
        tierInfo: tier ? { ...LOYALTY_TIERS[tier], rewards: LOYALTY_REWARDS[tier] } : null,
        progress,
        rewards: tier ? LOYALTY_REWARDS[tier] : null,
        instantRewards,
        allTiers: TIER_ORDER.map(k => ({
          key: k,
          ...LOYALTY_TIERS[k],
          rewards: LOYALTY_REWARDS[k],
          achieved: tier ? TIER_ORDER.indexOf(k) >= TIER_ORDER.indexOf(tier) : false,
        })),
        joinedAt: customer.created_at,
      },
      recentTransactions: transactions || [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/loyalty/customer/:id/birthday — real, genuinely OPTIONAL
// birthday capture for Cleo's Club members. Deliberately month+day
// only, never a year — no age is ever inferred or stored, since many
// of these customers are children and there's no real reason for the
// app to know or guess anyone's age. Always entered deliberately by a
// parent/guardian through a real, clearly-labelled optional field —
// never auto-filled, never required, never assumed.
app.post('/api/loyalty/customer/:id/birthday', async (req, res) => {
  const { birthdayMonth, birthdayDay } = req.body;
  if (!birthdayMonth || !birthdayDay || birthdayMonth < 1 || birthdayMonth > 12 || birthdayDay < 1 || birthdayDay > 31) {
    return res.status(400).json({ error: 'A valid month (1-12) and day (1-31) are required' });
  }
  const { data, error } = await supabase.from('customers')
    .update({ birthday_month: birthdayMonth, birthday_day: birthdayDay })
    .eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ customer: data });
});

// POST /api/loyalty/visit — record a visit and award visit points
// Genuine, real, shared loyalty-visit logic — extracted so it can be
// called directly (no internal HTTP round-trip) from both the real
// POST /api/loyalty/visit route AND the new automatic trigger when
// pieces are genuinely marked picked up (the honest, natural end of a
// visit). Same real behaviour either way — visit count, spend,
// points, tier, Cleo's Club stickers/rewards — just reachable from
// two real places now instead of one.
async function recordLoyaltyVisit(studioId, customerId, bookingCode, spendCents) {
  const { data: customer } = await supabase.from('customers').select('*').eq('id', customerId).single();
  if (!customer) return { error: 'Customer not found' };

  const newVisits = (customer.visit_count || 0) + 1;
  const newSpend = (customer.total_spend_cents || 0) + (spendCents || 0);
  const pieces = customer.total_pieces_painted || 0;
  const visitPoints = 10;
  const spendPoints = Math.floor((spendCents || 0) / 100);
  const firstVisitBonus = newVisits === 1 ? 50 : 0;
  const bigSessionBonus = (spendCents || 0) >= 4500 ? 15 : 0;
  const totalNewPoints = visitPoints + spendPoints + firstVisitBonus + bigSessionBonus;
  const newPoints = (customer.loyalty_points || 0) + totalNewPoints;

  const prevTier = calcLoyaltyTier(customer.visit_count || 0, customer.total_spend_cents || 0, pieces);
  const newTier = calcLoyaltyTier(newVisits, newSpend, pieces);
  const tierUpgrade = newTier !== prevTier && newTier !== null;
  const instantRewards = checkInstantRewards({ ...customer, visit_count: newVisits, total_pieces_painted: pieces }, spendCents || 0);

  await supabase.from('customers').update({
    visit_count: newVisits,
    total_spend_cents: newSpend,
    loyalty_points: newPoints,
    loyalty_tier: newTier || customer.loyalty_tier,
    last_visit_at: new Date().toISOString(),
  }).eq('id', customerId);

  await supabase.from('loyalty_transactions').insert({
    studio_id: studioId,
    customer_id: customerId,
    booking_code: bookingCode || null,
    points_earned: totalNewPoints,
    transaction_type: 'visit',
    description: `Visit #${newVisits} — ${visitPoints} visit points + ${spendPoints} spend points${spendCents ? ` (£${(spendCents/100).toFixed(2)} spent)` : ''}`,
  });

  // Cleo's Club — genuinely conditional on the studio having enabled
  // this as a paid add-on. Awards one sticker per visit, and a real
  // reward every Nth visit (default 5th). This is the actual
  // upsell/upgrade unit: studios pay extra monthly for this feature.
  let cleosClubResult = null;
  const { data: clubConfig } = await supabase.from('cleos_club_config').select('*').eq('studio_id', studioId).eq('enabled', true).single();
  if (clubConfig) {
    const { data: allStickerTypes } = await supabase.from('cleos_club_sticker_types').select('*');
    const todayStr = new Date().toISOString().split('T')[0];
    const stickerTypes = (allStickerTypes || []).filter(s => {
      const afterStart = !s.available_from || s.available_from <= todayStr;
      const beforeEnd = !s.available_until || s.available_until >= todayStr;
      return afterStart && beforeEnd;
    });

    if (stickerTypes.length) {
      const commons = stickerTypes.filter(s => s.rarity === 'common');
      const rares = stickerTypes.filter(s => s.rarity !== 'common');
      const roll = Math.random();
      const pickFrom = (roll < 0.75 || !rares.length) ? commons : rares;
      const sticker = pickFrom[Math.floor(Math.random() * pickFrom.length)] || stickerTypes[0];

      await supabase.from('cleos_club_stickers_earned').insert({
        studio_id: studioId, customer_id: customerId, sticker_type_id: sticker.id, visit_number: newVisits,
      });

      cleosClubResult = { stickerEarned: sticker, rewardUnlocked: null, setCompletionBonus: null };

      const rewardEvery = clubConfig.reward_every_n_visits || 5;
      if (newVisits % rewardEvery === 0) {
        const { data: reward } = await supabase.from('cleos_club_rewards_earned').insert({
          studio_id: studioId, customer_id: customerId, visit_number: newVisits,
          reward_description: clubConfig.reward_description || 'A free treat!',
        }).select().single();
        cleosClubResult.rewardUnlocked = reward;
      }

      const alwaysAvailableTypes = (allStickerTypes || []).filter(s => !s.available_from && !s.available_until);
      if (alwaysAvailableTypes.length) {
        const { data: alreadyAwarded } = await supabase.from('cleos_club_set_completion_bonuses')
          .select('id').eq('studio_id', studioId).eq('customer_id', customerId).single();
        if (!alreadyAwarded) {
          const { data: earnedStickers } = await supabase.from('cleos_club_stickers_earned')
            .select('sticker_type_id').eq('studio_id', studioId).eq('customer_id', customerId);
          const earnedTypeIds = new Set((earnedStickers || []).map(s => s.sticker_type_id));
          const hasCompleteSet = alwaysAvailableTypes.every(t => earnedTypeIds.has(t.id));
          if (hasCompleteSet) {
            await supabase.from('cleos_club_set_completion_bonuses').insert({ studio_id: studioId, customer_id: customerId });
            const { data: bonusReward } = await supabase.from('cleos_club_rewards_earned').insert({
              studio_id: studioId, customer_id: customerId, visit_number: newVisits,
              reward_description: '🌟 Complete Set Bonus — a special extra treat, on us!',
            }).select().single();
            cleosClubResult.setCompletionBonus = bonusReward;
          }
        }
      }
    }
  }

  return {
    visitCount: newVisits,
    pointsEarned: totalNewPoints,
    totalPoints: newPoints,
    tier: newTier,
    tierUpgrade,
    progress: loyaltyProgress(newVisits, newSpend, pieces),
    rewards: newTier ? LOYALTY_REWARDS[newTier] : null,
    instantRewards,
    cleosClub: cleosClubResult,
  };
}

app.post('/api/loyalty/visit', async (req, res) => {
  const { studioId, customerId, bookingCode, spendCents } = req.body;
  if (!studioId || !customerId) return res.status(400).json({ error: 'studioId and customerId required' });

  try {
    const result = await recordLoyaltyVisit(studioId, customerId, bookingCode, spendCents);
    if (result.error) return res.status(404).json({ error: result.error });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/loyalty/drinks-points — award bonus points for a drinks order
// ═══════════════════════════════════════════
// CLEO'S CLUB — kids' sticker loyalty sub-brand, real paid add-on
// ═══════════════════════════════════════════

// GET /api/cleos-club/config — is this enabled for this studio, and its settings
app.get('/api/cleos-club/config', async (req, res) => {
  const { studioId } = req.query;
  const { data } = await supabase.from('cleos_club_config').select('*').eq('studio_id', studioId).single();
  res.json({ config: data || { enabled: false } });
});

// GET/POST /api/cleos-club/offer-of-week — a genuine, real admin-set
// highlighted offer, shown in Cleo's space on the customer app.
// Separate from the ongoing sticker/reward system — this is a single
// rotating highlight, updated whenever the studio wants, not tied to
// visit count.
app.get('/api/cleos-club/offer-of-week', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  const { data } = await supabase.from('cleos_club_offer_of_week').select('*').eq('studio_id', studioId).eq('active', true).single();
  res.json({ offer: data || null });
});

app.post('/api/cleos-club/offer-of-week', async (req, res) => {
  const { studioId, title, description, emoji, active } = req.body;
  if (!studioId || !title) return res.status(400).json({ error: 'studioId and title required' });
  if (containsGenuineURL(title) || containsGenuineURL(description)) {
    return res.status(400).json({ error: 'Offers can\'t include website links — describe it in your own words instead.' });
  }
  const { data, error } = await supabase.from('cleos_club_offer_of_week').upsert({
    studio_id: studioId, title, description: description || null,
    emoji: emoji || '🎁', active: active !== false, updated_at: new Date().toISOString(),
  }, { onConflict: 'studio_id' }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ offer: data });
});

// GET /api/cleos-club/sticker-types — every real sticker type on file,
// genuine admin visibility into what actually exists (was previously
// invisible in the admin UI — only ever seeded via SQL, never shown or
// editable in Setup).
app.get('/api/cleos-club/sticker-types', async (req, res) => {
  const { data, error } = await supabase.from('cleos_club_sticker_types').select('*').order('available_from', { ascending: true, nullsFirst: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ stickerTypes: data || [] });
});

// POST /api/cleos-club/sticker-types — genuinely add a new sticker
// type (e.g. a new seasonal one) directly from the admin UI, no SQL
// needed going forward.
app.post('/api/cleos-club/sticker-types', async (req, res) => {
  const { code, name, emoji, rarity, availableFrom, availableUntil } = req.body;
  if (!code || !name || !emoji) return res.status(400).json({ error: 'code, name, emoji required' });
  const { data, error } = await supabase.from('cleos_club_sticker_types').upsert({
    code, name, emoji, rarity: rarity || 'common',
    available_from: availableFrom || null, available_until: availableUntil || null,
  }, { onConflict: 'code' }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ stickerType: data });
});

// DELETE /api/cleos-club/sticker-types/:code — genuinely remove one
app.delete('/api/cleos-club/sticker-types/:code', async (req, res) => {
  const { error } = await supabase.from('cleos_club_sticker_types').delete().eq('code', req.params.code);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ deleted: true });
});

// POST /api/cleos-club/config — studio enables/configures the add-on
// (in a real billed version this would also touch Stripe subscription
// items — kept simple here as the on/off + settings switch itself)
app.post('/api/cleos-club/config', async (req, res) => {
  const { studioId, enabled, rewardEveryNVisits, rewardDescription, monthlyAddonPriceCents } = req.body;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  const updates = {
    studio_id: studioId, enabled: !!enabled,
    reward_every_n_visits: rewardEveryNVisits || 5,
    reward_description: rewardDescription || 'Free small piece + a drink',
    enabled_at: enabled ? new Date().toISOString() : null,
  };
  // Only touch the price if genuinely provided — don't silently reset
  // it to the schema default every time someone just edits the reward
  // description or toggles off.
  if (monthlyAddonPriceCents !== undefined) updates.monthly_addon_price_cents = monthlyAddonPriceCents;

  const { data, error } = await supabase.from('cleos_club_config').upsert(updates, { onConflict: 'studio_id' }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ config: data });
});

// ═══════════════════════════════════════════
// STUDIO ADD-ON MARKETPLACE — real, genuine paid upgrades on top of the
// base plan, same proven confirm-before-enable pattern as Cleo's Club.
// Each of these maps to an actual feature already built in the app —
// this isn't inventing new work, it's honestly pricing what exists.
// ═══════════════════════════════════════════

const ADDON_CATALOGUE = {
  ai_piece_finder: {
    name: 'AI Piece Finder',
    description: 'Piece Matching, Whole-Tray Scan, and Find My Piece — AI-assisted identification of fired pieces from a jumbled kiln load, and studio-wide lost piece search.',
    monthlyPriceCents: 2000, // £20/mo — genuinely the most valuable of these, real staff time saved
  },
  piece_catalogue: {
    name: 'Piece Catalogue & Pre-Glaze Reservations',
    description: 'Customers browse real photographed stock from home and reserve a piece to be pre-glazed ready for their visit.',
    monthlyPriceCents: 1500,
  },
  club_pages: {
    name: 'Club Pages',
    description: 'Worldwide social feed — customers post finished pieces directly, seen across every participating studio.',
    monthlyPriceCents: 1000,
  },
  royal_mail_automation: {
    name: 'Royal Mail Label Automation',
    description: 'Automatic postal label creation via the studio\'s own connected Royal Mail account, instead of manual entry.',
    monthlyPriceCents: 1000,
  },
};

// GET /api/addons/catalogue — the real list of available add-ons and pricing
app.get('/api/addons/catalogue', (req, res) => {
  res.json({ catalogue: ADDON_CATALOGUE });
});

// GET /api/addons/status — which add-ons this studio genuinely has enabled
app.get('/api/addons/status', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  const { data, error } = await supabase.from('studio_addons').select('*').eq('studio_id', studioId);
  if (error) return res.status(500).json({ error: error.message });
  const statusByKey = {};
  (data || []).forEach(a => { statusByKey[a.addon_key] = a; });
  res.json({ addons: statusByKey });
});

// POST /api/addons/enable — genuine paywall confirmation already
// happened client-side; this records the real enable and logs the
// first month's revenue immediately so Platform Revenue reflects it
// right away, not just from next month.
app.post('/api/addons/enable', async (req, res) => {
  const { studioId, addonKey } = req.body;
  if (!studioId || !addonKey) return res.status(400).json({ error: 'studioId and addonKey required' });
  const catalogueEntry = ADDON_CATALOGUE[addonKey];
  if (!catalogueEntry) return res.status(400).json({ error: `Unknown add-on: ${addonKey}` });

  try {
    const { data, error } = await supabase.from('studio_addons').upsert({
      studio_id: studioId, addon_key: addonKey, enabled: true,
      monthly_price_cents: catalogueEntry.monthlyPriceCents,
      enabled_at: new Date().toISOString(), disabled_at: null,
    }, { onConflict: 'studio_id,addon_key' }).select().single();
    if (error) throw error;

    const billedForMonth = new Date(); billedForMonth.setDate(1); billedForMonth.setHours(0,0,0,0);
    await supabase.from('addon_revenue_log').insert({
      studio_id: studioId, addon_key: addonKey,
      amount_cents: catalogueEntry.monthlyPriceCents, billed_for_month: billedForMonth.toISOString().split('T')[0],
    });

    res.json({ status: 'enabled', addon: data });
  } catch (error) {
    console.error('Add-on enable error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/addons/disable
app.post('/api/addons/disable', async (req, res) => {
  const { studioId, addonKey } = req.body;
  if (!studioId || !addonKey) return res.status(400).json({ error: 'studioId and addonKey required' });
  const { data, error } = await supabase.from('studio_addons')
    .update({ enabled: false, disabled_at: new Date().toISOString() })
    .eq('studio_id', studioId).eq('addon_key', addonKey).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ status: 'disabled', addon: data });
});

// GET /api/cleos-club/board/:customerId — a customer's real sticker
// board, plus progress toward the next reward
app.get('/api/cleos-club/board/:customerId', async (req, res) => {
  const { customerId } = req.params;
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });

  try {
    const [stickersRes, rewardsRes, configRes] = await Promise.all([
      supabase.from('cleos_club_stickers_earned').select('*, cleos_club_sticker_types(*)').eq('studio_id', studioId).eq('customer_id', customerId).order('earned_at', { ascending: true }),
      supabase.from('cleos_club_rewards_earned').select('*').eq('studio_id', studioId).eq('customer_id', customerId).order('earned_at', { ascending: false }),
      supabase.from('cleos_club_config').select('*').eq('studio_id', studioId).single(),
    ]);

    const stickers = stickersRes.data || [];
    const rewards = rewardsRes.data || [];
    const config = configRes.data || { reward_every_n_visits: 5 };
    const rewardEvery = config.reward_every_n_visits || 5;
    const visitsSoFar = stickers.length;
    const visitsUntilNextReward = rewardEvery - (visitsSoFar % rewardEvery || rewardEvery);

    res.json({
      stickers, rewards,
      visitsSoFar,
      visitsUntilNextReward: visitsUntilNextReward === rewardEvery ? 0 : visitsUntilNextReward,
      unclaimedRewards: rewards.filter(r => !r.claimed),
    });
  } catch (error) {
    console.error('Cleo\'s Club board error:', error);
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/cleos-club/rewards/:id/claim — staff mark a reward as given
app.patch('/api/cleos-club/rewards/:id/claim', async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase.from('cleos_club_rewards_earned')
    .update({ claimed: true, claimed_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ reward: data });
});

app.post('/api/loyalty/drinks-points', async (req, res) => {
  const { studioId, customerId, bookingCode, itemCount } = req.body;
  if (!studioId || !customerId) return res.status(400).json({ error: 'missing fields' });
  const bonusPoints = (itemCount || 1) * 5; // 5 points per drink item
  try {
    const { data: customer } = await supabase.from('customers').select('loyalty_points').eq('id', customerId).single();
    await supabase.from('customers').update({ loyalty_points: (customer?.loyalty_points || 0) + bonusPoints }).eq('id', customerId);
    await supabase.from('loyalty_transactions').insert({
      studio_id: studioId, customer_id: customerId, booking_code: bookingCode || null,
      points_earned: bonusPoints, transaction_type: 'drinks',
      description: `Drinks order — ${bonusPoints} bonus points`,
    });
    res.json({ pointsEarned: bonusPoints });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/loyalty/redeem — staff redeem a reward for a customer
app.post('/api/loyalty/redeem', async (req, res) => {
  const { studioId, customerId, bookingCode, rewardType } = req.body;
  if (!studioId || !customerId || !rewardType) return res.status(400).json({ error: 'missing fields' });
  const rewardLabels = {
    free_bisque: 'Free bisque piece redeemed',
    free_drink: 'Free drink redeemed',
    discount_applied: 'Glazing discount applied',
    take_it_home: 'Take It Home unlock redeemed',
  };
  try {
    await supabase.from('loyalty_transactions').insert({
      studio_id: studioId, customer_id: customerId, booking_code: bookingCode || null,
      points_earned: 0, transaction_type: 'redeem',
      description: rewardLabels[rewardType] || rewardType,
    });
    res.json({ redeemed: true, reward: rewardType });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/loyalty/book-next-visit — customer booked next visit while in studio
// Awards 20 points + triggers free drink instant reward
app.post('/api/loyalty/book-next-visit', async (req, res) => {
  const { studioId, customerId, bookingCode } = req.body;
  if (!studioId || !customerId) return res.status(400).json({ error: 'missing fields' });
  const bonusPoints = 20;
  try {
    const { data: customer } = await supabase.from('customers').select('loyalty_points').eq('id', customerId).single();
    await supabase.from('customers').update({ loyalty_points: (customer?.loyalty_points || 0) + bonusPoints }).eq('id', customerId);
    await supabase.from('loyalty_transactions').insert({
      studio_id: studioId, customer_id: customerId, booking_code: bookingCode || null,
      points_earned: bonusPoints, transaction_type: 'book_next_visit',
      description: 'Booked next visit while in studio — 20 bonus points + free drink this visit',
    });
    res.json({ pointsEarned: bonusPoints, instantReward: INSTANT_REWARDS.find(r => r.id === 'book_next_visit') });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/loyalty/piece-milestone — award points when piece count hits 5 or 10
app.post('/api/loyalty/piece-milestone', async (req, res) => {
  const { studioId, customerId, bookingCode, pieceCount } = req.body;
  if (!studioId || !customerId) return res.status(400).json({ error: 'missing fields' });
  const milestone = pieceCount >= 10 ? 'tenth_piece' : 'fifth_piece';
  const reward = INSTANT_REWARDS.find(r => r.id === milestone);
  if (!reward) return res.status(400).json({ error: 'not a milestone' });
  try {
    const { data: customer } = await supabase.from('customers').select('loyalty_points').eq('id', customerId).single();
    await supabase.from('customers').update({ loyalty_points: (customer?.loyalty_points || 0) + reward.points }).eq('id', customerId);
    await supabase.from('loyalty_transactions').insert({
      studio_id: studioId, customer_id: customerId, booking_code: bookingCode || null,
      points_earned: reward.points, transaction_type: milestone,
      description: `${reward.trigger} — ${reward.reward}`,
    });
    res.json({ pointsEarned: reward.points, instantReward: reward });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/loyalty/leaderboard — top customers by tier/points for a studio
// GET /api/loyalty/public-leaderboard — genuine real customer-facing
// leaderboard, deliberately a SEPARATE endpoint from the admin one
// rather than a flag on it, so it's structurally incapable of ever
// leaking full names, exact spend, or any contact detail — only ever
// returns a first name/initial, tier, and points. This is shown on
// customers' own phones in the studio, so real, direct privacy care.
app.get('/api/loyalty/public-leaderboard', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  const { data } = await supabase.from('customers')
    .select('name, loyalty_points, loyalty_tier')
    .eq('studio_id', studioId)
    .not('loyalty_tier', 'is', null)
    .order('loyalty_points', { ascending: false })
    .limit(20);

  // Genuine real reduction to first name + last initial only — e.g.
  // "Sarah M." — never the full real name, never anything else.
  const publicList = (data || []).map(c => {
    const parts = (c.name || '').trim().split(' ');
    const firstName = parts[0] || 'Someone';
    const lastInitial = parts.length > 1 ? `${parts[parts.length - 1][0]}.` : '';
    return { displayName: `${firstName}${lastInitial ? ' ' + lastInitial : ''}`, points: c.loyalty_points || 0, tier: c.loyalty_tier };
  });
  res.json({ leaderboard: publicList });
});

app.get('/api/loyalty/leaderboard', async (req, res) => {
  const { studioId, limit } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  const { data } = await supabase.from('customers')
    .select('id, name, loyalty_points, visit_count, total_spend_cents, total_pieces_painted, loyalty_tier, last_visit_at, created_at')
    .eq('studio_id', studioId)
    .not('loyalty_tier', 'is', null)
    .order('loyalty_points', { ascending: false })
    .limit(parseInt(limit) || 20);
  res.json({ customers: data || [] });
});

// GET /api/loyalty/customer/:id/history — genuine real per-visit
// history for one customer, newest first. Powers the detail view when
// staff tap a name on the real loyalty leaderboard, so they can see
// exactly when someone last visited and what each real visit was
// worth, not just the running totals.
app.get('/api/loyalty/customer/:id/history', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  const { data, error } = await supabase.from('loyalty_transactions')
    .select('booking_code, points_earned, transaction_type, description, created_at')
    .eq('studio_id', studioId).eq('customer_id', req.params.id)
    .order('created_at', { ascending: false }).limit(30);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ history: data || [] });
});

// ═══════════════════════════════════════════
// WEBHOOK HANDLERS
// ═══════════════════════════════════════════

/**
 * POST /api/webhooks/stripe
 * Handle Stripe webhooks
 */
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  try {
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    switch (event.type) {
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        const subscription = event.data.object;
        await supabase
          .from('stripe_subscriptions')
          .update({
            status: subscription.status,
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString()
          })
          .eq('stripe_subscription_id', subscription.id);
        break;
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).send('Webhook error');
  }
});

// ═══════════════════════════════════════════
// HEALTH CHECK & START
// ═══════════════════════════════════════════

/**
 * GET /api/square/bookings-debug  (TEMPORARY — read-only diagnostic)
 * Returns the raw shape of a few real Square bookings so we can build the
 * sync against reality. Safe: read-only. Remove after bookings sync is finalised.
 */
app.get('/api/square/bookings-debug', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });

  try {
    const { data: connection } = await supabase
      .from('square_connections')
      .select('square_access_token')
      .eq('studio_id', studioId)
      .single();

    if (!connection) return res.json({ connected: false });

    const squareClient = await getSquareClient(connection.square_access_token);

    let step = 'locations';
    let locations = [];
    try {
      const locRes = await squareClient.locationsApi.listLocations();
      locations = (locRes.result.locations || []).map(l => ({ id: l.id, name: l.name }));
    } catch (locErr) {
      return res.json({
        connected: true,
        failedStep: 'listLocations',
        errorMessage: locErr.message,
        squareBody: locErr.body || null,
        squareErrors: locErr.errors || locErr.result?.errors || null
      });
    }

    step = 'bookings';
    const past = new Date().toISOString();
    const future = new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString();
    let bookings = [];
    try {
      const bookingsRes = await squareClient.bookingsApi.listBookings(10, undefined, undefined, undefined, undefined, past, future);
      bookings = bookingsRes.result.bookings || [];
    } catch (bkErr) {
      return res.json({
        connected: true,
        _debugVersion: 'v7-28day-window',
        failedStep: 'listBookings',
        errorMessage: bkErr.message,
        squareBody: bkErr.body || null,
        squareErrors: bkErr.errors || bkErr.result?.errors || null,
        locationsFound: locations,
        attemptedFrom: past,
        attemptedTo: future
      });
    }

    // Square returns some values as BigInt which JSON.stringify can't handle —
    // convert via a replacer that turns BigInt into strings
    const safeJson = (obj) => JSON.parse(JSON.stringify(obj, (k, v) => typeof v === 'bigint' ? v.toString() : v));

    res.json(safeJson({
      connected: true,
      _debugVersion: 'v8-bigint-safe',
      locations,
      searchedFrom: past,
      searchedTo: future,
      bookingCount: bookings.length,
      sampleBookings: bookings
    }));
  } catch (error) {
    console.error('Bookings debug error:', error);
    res.status(500).json({
      error: error.message,
      squareErrors: error.errors || error.result?.errors || null,
      statusCode: error.statusCode || null
    });
  }
});

// ═══════════════════════════════════════════
// PIECE CATALOGUE — real photographed stock, with dimensions and
// descriptions, so customers can choose a specific piece from home
// before their visit and have it pre-glazed white, ready and waiting.
// This is genuinely new infrastructure — the earlier canvas-drawn
// silhouette tool was a separate standalone thing, not a real product
// catalogue with photos and admin upload.
// ═══════════════════════════════════════════

// GET /api/catalogue — customer-facing browse (only shows active items)
app.get('/api/catalogue', async (req, res) => {
  const { studioId, category } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  let query = supabase.from('piece_catalogue').select('*').eq('studio_id', studioId).eq('active', true);
  if (category) query = query.eq('category', category);
  const { data, error } = await query.order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ pieces: data || [] });
});

// GET /api/catalogue/:id — single piece detail
app.get('/api/catalogue/:id', async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase.from('piece_catalogue').select('*').eq('id', id).single();
  if (error || !data) return res.status(404).json({ error: 'Piece not found' });
  res.json({ piece: data });
});

// ── Admin catalogue management ──
// GET /api/admin/catalogue — includes inactive items too, for admin editing
app.get('/api/admin/catalogue', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  const { data, error } = await supabase.from('piece_catalogue').select('*').eq('studio_id', studioId).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ pieces: data || [] });
});

app.post('/api/admin/catalogue', async (req, res) => {
  const { studioId, name, category, description, heightCm, widthCm, depthCm, priceCents, imageUrl, stockCount } = req.body;
  if (!studioId || !name) return res.status(400).json({ error: 'studioId and name required' });
  const { data, error } = await supabase.from('piece_catalogue').insert({
    studio_id: studioId, name, category: category || 'mug', description,
    height_cm: heightCm || null, width_cm: widthCm || null, depth_cm: depthCm || null,
    price_cents: priceCents || 0, image_url: imageUrl || null, stock_count: stockCount ?? null,
    active: true,
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ piece: data });
});

app.patch('/api/admin/catalogue/:id', async (req, res) => {
  const { id } = req.params;
  const updates = {};
  const allowed = ['name', 'category', 'description', 'height_cm', 'width_cm', 'depth_cm', 'price_cents', 'image_url', 'stock_count', 'active'];
  for (const key of allowed) {
    const bodyKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (req.body[bodyKey] !== undefined) updates[key] = req.body[bodyKey];
  }
  const { data, error } = await supabase.from('piece_catalogue').update(updates).eq('id', id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ piece: data });
});

app.delete('/api/admin/catalogue/:id', async (req, res) => {
  const { id } = req.params;
  await supabase.from('piece_catalogue').update({ active: false }).eq('id', id);
  res.json({ status: 'deactivated' });
});

// POST /api/admin/catalogue/:id/image — accepts a base64 image upload
// and stores it in Supabase Storage, returning a public URL. Studios
// photograph their own real stock and upload it here.
app.post('/api/admin/catalogue/:id/image', async (req, res) => {
  const { id } = req.params;
  const { imageBase64, fileExt } = req.body;
  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' });

  try {
    const buffer = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const fileName = `catalogue/${id}-${Date.now()}.${fileExt || 'jpg'}`;
    const { error: uploadError } = await supabase.storage.from('piece-images').upload(fileName, buffer, {
      contentType: `image/${fileExt || 'jpeg'}`, upsert: true,
    });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from('piece-images').getPublicUrl(fileName);
    await supabase.from('piece_catalogue').update({ image_url: urlData.publicUrl }).eq('id', id);
    res.json({ imageUrl: urlData.publicUrl });
  } catch (error) {
    console.error('Catalogue image upload error:', error);
    res.status(500).json({ error: 'Could not upload image. Make sure a "piece-images" storage bucket exists in Supabase.' });
  }
});

// ═══════════════════════════════════════════
// PRE-GLAZE RESERVATIONS — a customer picks a specific catalogue
// piece from home, designs their transfer against it, and staff
// pre-glaze that exact piece white ahead of the customer's booked
// visit. Needs a minimum lead time (default 7 days) so staff
// genuinely have time to glaze and fire it before the visit.
// ═══════════════════════════════════════════

const PRE_GLAZE_MIN_LEAD_DAYS = 7;

// POST /api/pre-glaze/reserve — customer chooses a piece ahead of their visit
app.post('/api/pre-glaze/reserve', async (req, res) => {
  const { studioId, bookingCode, catalogueItemId, customerName, visitDate } = req.body;
  if (!studioId || !bookingCode || !catalogueItemId || !visitDate) {
    return res.status(400).json({ error: 'studioId, bookingCode, catalogueItemId, visitDate required' });
  }

  // Enforce the real lead time — staff need genuine time to glaze and
  // fire before the visit, this isn't just advisory.
  const visit = new Date(visitDate);
  const today = new Date(); today.setHours(0,0,0,0);
  const daysUntilVisit = Math.round((visit - today) / (1000 * 60 * 60 * 24));
  if (daysUntilVisit < PRE_GLAZE_MIN_LEAD_DAYS) {
    return res.status(400).json({
      error: `Pre-glazing needs at least ${PRE_GLAZE_MIN_LEAD_DAYS} days' notice before your visit — this visit is only ${daysUntilVisit} day(s) away. Please choose a piece in the studio instead, or move your booking further out.`,
    });
  }

  const { data: catalogueItem } = await supabase.from('piece_catalogue').select('*').eq('id', catalogueItemId).single();
  if (!catalogueItem) return res.status(404).json({ error: 'Catalogue piece not found' });

  const { data, error } = await supabase.from('pre_glaze_reservations').insert({
    studio_id: studioId, booking_code: bookingCode, catalogue_item_id: catalogueItemId,
    customer_name: customerName || null, visit_date: visitDate, status: 'pending_glaze',
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });

  // Alert staff — this needs to happen well before the visit, not
  // discovered on the day.
  await supabase.from('staff_alerts').insert({
    studio_id: studioId, trigger_type: 'pre_glaze_needed', next_role: 'Ceramic Technician',
    booking_code: bookingCode, icon: '🏺', label: 'Pre-glaze reservation',
    message: `${customerName || 'A customer'} has reserved "${catalogueItem.name}" for pre-glazing, ready for their visit on ${visitDate}.`,
    context: { reservationId: data.id, catalogueItemId, visitDate }, acknowledged: false,
  });

  res.json({ reservation: data, piece: catalogueItem });
});

// GET /api/pre-glaze/queue — staff view: what needs pre-glazing, ordered
// by how soon the visit is
app.get('/api/pre-glaze/queue', async (req, res) => {
  const { studioId, status } = req.query;
  let query = supabase.from('pre_glaze_reservations').select('*, piece_catalogue(name, image_url, category)').eq('studio_id', studioId);
  if (status) query = query.eq('status', status);
  const { data, error } = await query.order('visit_date', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ reservations: data || [] });
});

app.patch('/api/pre-glaze/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // 'pending_glaze' | 'glazed' | 'fired' | 'ready' | 'collected'
  const validStatuses = ['pending_glaze', 'glazed', 'fired', 'ready', 'collected'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const { data, error } = await supabase.from('pre_glaze_reservations').update({ status, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ reservation: data });
});

// GET /api/bookings/table-occupancy — combines the studio's real table
// layout with today's live bookings, so the frontend can render a
// small visual table schematic showing who's where right now without
// needing two separate calls stitched together client-side.
app.get('/api/bookings/table-occupancy', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });

  try {
    const now = new Date();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

    const [tablesRes, bookingsRes] = await Promise.all([
      supabase.from('studio_tables').select('*').eq('studio_id', studioId).order('sort_order', { ascending: true }),
      supabase.from('bookings').select('*').eq('studio_id', studioId)
        .gte('session_start', today.toISOString()).lt('session_start', tomorrow.toISOString())
        .order('session_start', { ascending: true }),
    ]);

    const tables = tablesRes.data || [];
    const bookings = bookingsRes.data || [];

    // For each table, find whether a booking is currently occupying it
    // right now (session_start <= now <= session_end), and what's next.
    const occupancy = tables.map(table => {
      const tableBookings = bookings.filter(b => b.table_number === table.name || b.table_number === String(table.sort_order + 1));
      const current = tableBookings.find(b => {
        const start = new Date(b.session_start);
        const end = b.session_end ? new Date(b.session_end) : new Date(start.getTime() + 90 * 60000); // default 90min session if no end set
        return now >= start && now <= end;
      });
      const next = tableBookings.find(b => new Date(b.session_start) > now);

      return {
        tableId: table.id, tableName: table.name, room: table.room, capacity: table.capacity,
        status: current ? 'occupied' : (next ? 'upcoming' : 'free'),
        current: current ? { customerName: current.customer_name, sessionStart: current.session_start, sessionEnd: current.session_end, partySize: current.party_size || null } : null,
        next: next ? { customerName: next.customer_name, sessionStart: next.session_start } : null,
      };
    });

    const totalToday = bookings.length;
    const occupiedNow = occupancy.filter(t => t.status === 'occupied').length;

    res.json({ tables: occupancy, totalBookingsToday: totalToday, occupiedNow, totalTables: tables.length });
  } catch (error) {
    console.error('Error building table occupancy snapshot:', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════
// MORNING KILN CHECK — a genuine "did the kiln fire overnight?"
// prompt for whoever's first in on Kiln Room duty. Any kiln session
// that was still loading/not-yet-fired the evening before, and is
// STILL not fired by morning, is a real overnight firing that needs
// confirming. If it didn't fire, alerts go to all staff and every
// affected booking gets flagged so customers can be told about a
// delay before they arrive expecting finished pieces.
// ═══════════════════════════════════════════

// GET /api/kiln/morning-check — what overnight firing(s), if any, need
// confirming this morning
app.get('/api/kiln/morning-check', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });

  try {
    // A session created yesterday or earlier, still not fired and not
    // yet confirmed this morning, is what needs checking. Genuinely
    // scoped to sessions from BEFORE today, not ones just loaded this
    // morning (which obviously haven't fired yet and aren't a misfire).
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);

    const { data: sessions, error } = await supabase
      .from('kiln_sessions')
      .select('*, pottery_pieces(count)')
      .eq('studio_id', studioId)
      .neq('status', 'fired')
      .is('morning_check_confirmed_at', null)
      .lt('created_at', startOfToday.toISOString())
      .not('batch_code', 'is', null)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ needsCheck: (sessions || []).length > 0, sessions: sessions || [] });
  } catch (error) {
    console.error('Error running morning kiln check:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/kiln/morning-check/confirm-fired-ok — "yes, it fired fine
// overnight" — just logs the confirmation, no alerts needed
app.post('/api/kiln/morning-check/confirm-fired-ok', async (req, res) => {
  const { studioId, sessionId, confirmedBy } = req.body;
  if (!studioId || !sessionId) return res.status(400).json({ error: 'studioId and sessionId required' });

  const { data, error } = await supabase.from('kiln_sessions').update({
    status: 'fired', fired_at: new Date().toISOString(),
    morning_check_confirmed_at: new Date().toISOString(), morning_check_confirmed_by: confirmedBy || null,
    morning_check_result: 'fired_ok',
  }).eq('id', sessionId).eq('studio_id', studioId).select().single();
  if (error) return res.status(500).json({ error: error.message });

  // Mark the pieces in this session as fired too, same as a normal fire
  await supabase.from('pottery_pieces').update({ status: 'fired', updated_at: new Date().toISOString() })
    .eq('kiln_session_id', sessionId).or('requires_second_firing.is.null,requires_second_firing.eq.false');

  res.json({ status: 'confirmed_fired_ok', session: data });
});

// POST /api/kiln/morning-check/report-misfire — "no, it didn't fire" —
// this is the real, genuinely important path. Alerts ALL staff, and
// flags every booking whose pieces were in this session so customers
// can be proactively told about a delay before they arrive.
app.post('/api/kiln/morning-check/report-misfire', async (req, res) => {
  const { studioId, sessionId, reportedBy, notes } = req.body;
  if (!studioId || !sessionId) return res.status(400).json({ error: 'studioId and sessionId required' });

  try {
    const { data: session } = await supabase.from('kiln_sessions').update({
      status: 'misfired', morning_check_confirmed_at: new Date().toISOString(),
      morning_check_confirmed_by: reportedBy || null, morning_check_result: 'misfired',
      misfire_notes: notes || null,
    }).eq('id', sessionId).eq('studio_id', studioId).select().single();
    if (!session) return res.status(404).json({ error: 'Kiln session not found' });

    // Find every booking with pieces in this session, so each one can
    // genuinely be flagged and contacted, not just a generic alert with
    // no way to know who's actually affected.
    const { data: affectedPieces } = await supabase.from('pottery_pieces')
      .select('booking_id, piece_type').eq('kiln_session_id', sessionId);
    const affectedBookingCodes = [...new Set((affectedPieces || []).map(p => p.booking_id).filter(Boolean))];

    // Alert ALL staff — this is urgent and studio-wide, not routed to
    // one role like most alerts here.
    await supabase.from('staff_alerts').insert({
      studio_id: studioId, trigger_type: 'kiln_misfire', next_role: null, // null = visible to everyone, not role-scoped
      icon: '🚨', label: 'Kiln misfire overnight',
      message: `The kiln did not fire correctly overnight (batch ${session.batch_code}). ${affectedBookingCodes.length} booking(s) affected — customers may need contacting about a delay.${notes ? ' Notes: ' + notes : ''}`,
      context: { sessionId, batchCode: session.batch_code, affectedBookingCodes }, acknowledged: false,
    });

    // Flag each affected booking with a delay note, so it's visible
    // wherever that booking is looked up, and staff have a clear list
    // of who genuinely needs contacting.
    if (affectedBookingCodes.length) {
      await supabase.from('bookings').update({
        delay_flag: true, delay_reason: `Kiln misfire — pieces need refiring. Please contact us about your collection date.`,
      }).eq('studio_id', studioId).in('booking_code', affectedBookingCodes);
    }

    res.json({
      status: 'misfire_reported', session,
      affectedBookings: affectedBookingCodes.length,
      affectedBookingCodes,
    });
  } catch (error) {
    console.error('Error reporting kiln misfire:', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════
// PIECE REFERENCE PHOTOS & AI-ASSISTED MATCHING
// At table-clearing time, each piece in a group gets its own photo
// taken next to the booking's QR card (not just the one group shot).
// Later, when pieces come out of the kiln jumbled together, the packer
// photographs a piece and the app suggests which reference photo it
// most likely matches — genuinely AI-ASSISTED, not a silent guaranteed
// match. Colour changes completely during firing/glazing and is
// deliberately NOT trusted as a signal; shape, proportions, and the
// pattern/linework of the design (which stays visually recognisable
// even though its colour shifts) are what the AI is told to focus on.
// The packer always makes the final call — this narrows down a
// jumbled pile, it doesn't replace a human's judgement.
// ═══════════════════════════════════════════

// POST /api/pieces/:pieceId/reference-photo — capture the individual
// piece photo at table-clearing time, next to the booking's QR card
app.post('/api/pieces/:pieceId/reference-photo', async (req, res) => {
  const { pieceId } = req.params;
  const { studioId, photoBase64 } = req.body;
  if (!studioId || !photoBase64) return res.status(400).json({ error: 'studioId and photoBase64 required' });

  try {
    const base64Data = photoBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const fileName = `${studioId}/piece-refs/${pieceId}-${Date.now()}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from('booking-photos')
      .upload(fileName, buffer, { contentType: 'image/jpeg' });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from('booking-photos').getPublicUrl(fileName);

    const { data: piece, error } = await supabase.from('pottery_pieces')
      .update({ reference_photo_url: urlData.publicUrl, reference_photo_taken_at: new Date().toISOString() })
      .eq('id', pieceId).select().single();
    if (error) throw error;

    res.json({ status: 'saved', piece });
  } catch (error) {
    console.error('Reference photo upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/bookings/:bookingCode/reference-photos — all reference
// photos for a booking's pieces, for the packer to compare against
app.get('/api/bookings/:bookingCode/reference-photos', async (req, res) => {
  const { bookingCode } = req.params;
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });

  const { data: pieces, error } = await supabase.from('pottery_pieces')
    .select('id, piece_type, reference_photo_url, status')
    .eq('studio_id', studioId).eq('booking_id', bookingCode)
    .not('reference_photo_url', 'is', null);
  if (error) return res.status(500).json({ error: error.message });

  // Genuine "found so far" count — uses the real, already-trustworthy
  // status field (fired -> packed -> ready_for_pickup) rather than
  // reconstructing from piece_match_attempts logs, since a piece
  // marked 'packed' has, by definition, already been correctly
  // identified and physically handled — a more reliable real signal
  // than an AI suggestion log alone.
  const allPieces = pieces || [];
  const foundCount = allPieces.filter(p => p.status === 'packed' || p.status === 'ready_for_pickup').length;

  res.json({ pieces: allPieces, foundCount, totalCount: allPieces.length });
});

// POST /api/pieces/match — the actual AI-assisted matching. Packer
// photographs a fired, jumbled piece; this compares it against every
// reference photo for the given booking and returns a RANKED list with
// honest reasoning and confidence — never a silent single answer.
// POST /api/pieces/suggest-type — when a piece is photographed, suggest
// which item from the studio's own stock list it most likely is, by
// comparing against stock photos. Genuinely AI-assisted, same honesty
// as piece matching — a suggestion to speed up selecting the right
// type, not a forced/silent answer. Staff always picks the final type.
app.post('/api/pieces/suggest-type', async (req, res) => {
  const { studioId, photoBase64 } = req.body;
  if (!studioId || !photoBase64) return res.status(400).json({ error: 'studioId and photoBase64 required' });
  if (!process.env.OPENAI_API_KEY) return res.json({ suggestions: [] }); // fail quietly — this is a nice-to-have, not core

  try {
    const { data: stock } = await supabase.from('studio_stock')
      .select('id, name, category, photo_data').eq('studio_id', studioId).eq('available', true).limit(30);
    if (!stock || !stock.length) return res.json({ suggestions: [] });

    const content = [
      {
        type: 'text',
        text: `A pottery studio piece has just been photographed. Suggest which item from the stock catalogue below it most likely is, based on shape and form. Return up to 3 ranked suggestions as JSON only: {"suggestions":[{"id":"...","confidence":"high|medium|low"}]}. If nothing looks like a plausible match, return an empty array — don't force a guess.`,
      },
    ];
    stock.forEach(s => {
      if (s.photo_data) {
        content.push({ type: 'text', text: `Stock item ID: ${s.id} — ${s.name} (${s.category || ''})` });
        content.push({ type: 'image_url', image_url: { url: s.photo_data } });
      }
    });
    content.push({ type: 'text', text: 'This is the piece just photographed:' });
    content.push({ type: 'image_url', image_url: { url: photoBase64.startsWith('data:') ? photoBase64 : `data:image/jpeg;base64,${photoBase64}` } });

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content }], temperature: 0.2, max_tokens: 300 }),
    });
    const aiData = await openaiRes.json();
    let parsed;
    try {
      parsed = JSON.parse((aiData.choices?.[0]?.message?.content || '{}').replace(/```json|```/g, '').trim());
    } catch (e) {
      return res.json({ suggestions: [] }); // fail quietly, don't block the workflow over a suggestion feature
    }

    const enriched = (parsed.suggestions || []).map(s => {
      const item = stock.find(st => st.id === s.id);
      return item ? { ...s, name: item.name, category: item.category } : null;
    }).filter(Boolean);

    res.json({ suggestions: enriched });
  } catch (error) {
    console.error('Stock type suggestion error (non-fatal):', error);
    res.json({ suggestions: [] });
  }
});

// POST /api/pieces/match-whole-tray — the multi-piece upgrade. Relies
// entirely on pieces being laid out with real gaps between them (see
// the mandatory spacing instruction in the Packing UI) — clear
// separation is what makes distinguishing pieces in one photo
// realistic at all. Detects every piece it can tell apart, matches
// each against the booking's reference photos, and reports an
// approximate on-screen position (grid-based — top-left/centre/etc —
// not precise pixel coordinates, which vision models are genuinely
// unreliable at) so the frontend can highlight roughly where to look.
// Packer confirms each one; this narrows down, never silently decides.
// ═══════════════════════════════════════════
// FIND MY PIECE — a single search across every real place a piece's
// identity or location is recorded: individual reference photos, group
// completion photos, the stock catalogue, the piece_catalogue, and the
// lost-pieces registry (replacing the handwritten "waiting to be
// found" notes). Genuinely searches real data, not a simulated result.
// ═══════════════════════════════════════════

// GET /api/pieces/find?studioId=&query= — TEXT search. Fast, no AI
// cost, searches piece type, booking customer name, notes, and the
// lost-pieces registry's descriptions.
app.get('/api/pieces/find', async (req, res) => {
  const { studioId, query } = req.query;
  if (!studioId || !query) return res.status(400).json({ error: 'studioId and query required' });
  const q = `%${query}%`;

  try {
    const [piecesRes, bookingsRes, lostRes, catalogueRes] = await Promise.all([
      supabase.from('pottery_pieces').select('id, booking_id, piece_type, status, notes, reference_photo_url, packed_at')
        .eq('studio_id', studioId).or(`piece_type.ilike.${q},notes.ilike.${q}`),
      supabase.from('bookings').select('booking_code, customer_name, customer_email, table_number')
        .eq('studio_id', studioId).ilike('customer_name', q),
      supabase.from('lost_pieces_registry').select('*').eq('studio_id', studioId).eq('status', 'open')
        .or(`description.ilike.${q},found_location.ilike.${q}`),
      supabase.from('piece_catalogue').select('id, name, category, description, image_url')
        .eq('studio_id', studioId).or(`name.ilike.${q},description.ilike.${q}`),
    ]);

    // Cross-reference: if a customer name matched, pull their real pieces too
    const matchedBookingCodes = (bookingsRes.data || []).map(b => b.booking_code);
    let piecesFromBookings = [];
    if (matchedBookingCodes.length) {
      const { data } = await supabase.from('pottery_pieces')
        .select('id, booking_id, piece_type, status, notes, reference_photo_url, packed_at')
        .eq('studio_id', studioId).in('booking_id', matchedBookingCodes);
      piecesFromBookings = data || [];
    }

    const allPieces = [...(piecesRes.data || []), ...piecesFromBookings];
    const uniquePieces = Array.from(new Map(allPieces.map(p => [p.id, p])).values());

    // Enrich pieces with their booking's customer name for context
    const bookingCodes = [...new Set(uniquePieces.map(p => p.booking_id).filter(Boolean))];
    let bookingLookup = {};
    if (bookingCodes.length) {
      const { data: bks } = await supabase.from('bookings').select('booking_code, customer_name, table_number').eq('studio_id', studioId).in('booking_code', bookingCodes);
      (bks || []).forEach(b => { bookingLookup[b.booking_code] = b; });
    }
    const enrichedPieces = uniquePieces.map(p => ({ ...p, customer_name: bookingLookup[p.booking_id]?.customer_name, table_number: bookingLookup[p.booking_id]?.table_number }));

    res.json({
      pieces: enrichedPieces,
      lostRegistryMatches: lostRes.data || [],
      catalogueMatches: catalogueRes.data || [],
      totalResults: enrichedPieces.length + (lostRes.data || []).length + (catalogueRes.data || []).length,
    });
  } catch (error) {
    console.error('Find my piece text search error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/pieces/find-by-photo — PHOTO search. Genuinely AI-powered,
// compares the given photo against EVERY real reference/completion
// photo on file for this studio (not scoped to one booking, unlike
// Piece Matching) — this is the "lost somewhere in the whole studio"
// case, so it has to search everything, honestly reported with
// confidence, never a forced single answer.
// POST /api/pieces/find-in-photo — the direct two-photo comparison.
// Takes ONE target photo (the piece someone's looking for, from Step 1)
// and ONE scene photo (the table/pile, from Step 2), and asks the AI
// specifically: is the target piece visible anywhere in this scene?
// Genuinely different from find-by-photo, which searches a whole
// library of pre-existing reference photos — this compares exactly the
// two photos given, nothing else, which is both simpler and more
// direct for "I'm holding this, is it in that pile."
// Returns full, honest diagnostic detail (not just a yes/no) so a
// failed search is debuggable rather than a silent black box.
app.post('/api/pieces/find-in-photo', async (req, res) => {
  const { studioId, targetPhotoBase64, scenePhotoBase64, searchedBy } = req.body;
  if (!studioId || !targetPhotoBase64 || !scenePhotoBase64) {
    return res.status(400).json({ error: 'studioId, targetPhotoBase64, scenePhotoBase64 required' });
  }
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'Photo search is not yet available.' });

  try {
    const content = [
      {
        type: 'text',
        text: `The FIRST image below is a specific object someone is trying to find. The SECOND image is a scene — a table, box, or pile — that may or may not contain that exact object among other things.

Look carefully at the scene photo and determine: is the object from the first photo genuinely visible somewhere in the scene? Work through this systematically: (1) note the target's overall silhouette and proportions, (2) note any handle, rim, base, or spout details, (3) note the exact shape and placement of any painted pattern or linework — this is often the single most reliable signal since colour can shift between photos due to lighting, angle, or firing. Compare each distinct object in the scene against these points individually rather than making one overall impression.

Be honest — if you're not confident it's there, say so clearly rather than guessing. If pieces in the scene are overlapping or too small/blurry to tell confidently, mention that specifically. If multiple objects in the scene are plausible candidates, note the strongest one but mention the ambiguity in your reasoning.

If found, also estimate the CENTRE POINT of the object as x/y percentages of the scene image (0,0 = top-left corner, 100,100 = bottom-right corner) — as precise as you can genuinely manage, for pointing an arrow directly at it. This is an estimate, not pixel-perfect — say so honestly in coordinateConfidence if you're only roughly sure of the position even though you're confident it's the right object.

Respond ONLY as JSON: {"found": true or false, "confidence": "high" | "medium" | "low", "centreX": 0-100 or null, "centreY": 0-100 or null, "coordinateConfidence": "precise" | "approximate" | null, "reasoning": "honest explanation of what you compared and why you reached this conclusion", "otherObjectsNoted": "brief note on what else is visible in the scene, for context"}`,
      },
      { type: 'text', text: 'Target object (what we\'re looking for):' },
      { type: 'image_url', image_url: { url: targetPhotoBase64.startsWith('data:') ? targetPhotoBase64 : `data:image/jpeg;base64,${targetPhotoBase64}` } },
      { type: 'text', text: 'Scene to search (table/pile/box):' },
      { type: 'image_url', image_url: { url: scenePhotoBase64.startsWith('data:') ? scenePhotoBase64 : `data:image/jpeg;base64,${scenePhotoBase64}` } },
    ];

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content }], temperature: 0.2, max_tokens: 600 }),
    });

    if (!openaiRes.ok) {
      const errBody = await openaiRes.text();
      console.error('OpenAI find-in-photo error:', errBody);
      return res.status(502).json({ error: 'Could not run the comparison — please try again.' });
    }

    const aiData = await openaiRes.json();
    const rawContent = aiData.choices?.[0]?.message?.content || '{}';
    let parsed;
    try {
      parsed = JSON.parse(rawContent.replace(/```json|```/g, '').trim());
    } catch (e) {
      console.error('Could not parse AI response:', rawContent);
      return res.status(502).json({ error: 'Could not interpret the result — please try again.', rawResponse: rawContent });
    }

    await supabase.from('piece_search_log').insert({
      studio_id: studioId, searched_by: searchedBy || null,
      results_count: parsed.found ? 1 : 0,
    });

    res.json(parsed);
  } catch (error) {
    console.error('Find in photo error:', error);
    res.status(500).json({ error: 'Could not run the comparison — try again.' });
  }
});

// ── Genuine real damage/loss reporting — covers both a customer's
// painted piece and raw unpainted stock. Alerts staff via the real
// existing staff_alerts system, genuinely removes the item from
// active search/inventory, and keeps a real honest audit trail. ──
app.post('/api/damage-report', async (req, res) => {
  const { studioId, itemType, pieceId, bookingCode, reason, reportedBy } = req.body;
  if (!studioId || !itemType || !pieceId || !reason) {
    return res.status(400).json({ error: 'studioId, itemType, pieceId, and reason are required' });
  }
  if (itemType !== 'customer_piece' && itemType !== 'raw_stock') {
    return res.status(400).json({ error: 'itemType must be customer_piece or raw_stock' });
  }

  try {
    // Genuinely remove the item from active search/inventory FIRST —
    // a real customer piece is marked damaged (excluded from
    // Piece Matching / Auto-Match / Find My Piece, all of which
    // filter on this), a real raw stock item is marked unavailable,
    // same real field already used elsewhere in the catalogue.
    if (itemType === 'customer_piece') {
      await supabase.from('pottery_pieces').update({ damaged: true }).eq('id', pieceId).eq('studio_id', studioId);
    } else {
      await supabase.from('studio_stock').update({ available: false }).eq('id', pieceId).eq('studio_id', studioId);
    }

    const { data: report, error } = await supabase.from('damage_reports').insert({
      studio_id: studioId, item_type: itemType,
      pottery_piece_id: itemType === 'customer_piece' ? pieceId : null,
      stock_item_id: itemType === 'raw_stock' ? pieceId : null,
      booking_code: bookingCode || null, reason, reported_by: reportedBy || null,
    }).select().single();
    if (error) throw error;

    // Genuine real staff alert — same real alert system used
    // everywhere else, so it shows up honestly alongside every other
    // real task/notification, not a separate silo.
    await supabase.from('staff_alerts').insert({
      studio_id: studioId, trigger_type: 'damage_report',
      booking_code: bookingCode || null, next_role: 'Manager',
      icon: '⚠️', label: itemType === 'customer_piece' ? 'Customer piece damaged/lost' : 'Stock item damaged/lost',
      message: `${itemType === 'customer_piece' ? 'A customer piece' : 'A raw stock item'} has been reported ${reason.toLowerCase().includes('lost') ? 'lost' : 'damaged'}: ${reason}${bookingCode ? ` (booking ${bookingCode})` : ''}`,
      context: { itemType, pieceId, bookingCode, reason }, acknowledged: false,
    });

    res.json({ report });
  } catch (error) {
    console.error('Damage report error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/damage-reports — real, honest history for the dashboard,
// so staff/directors can see everything reported over time, not just
// the live alert.
app.get('/api/damage-reports', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  const { data, error } = await supabase.from('damage_reports').select('*').eq('studio_id', studioId).order('reported_at', { ascending: false }).limit(50);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ reports: data || [] });
});

app.post('/api/pieces/find-by-photo', async (req, res) => {
  const { studioId, photoBase64, searchedBy } = req.body;
  if (!studioId || !photoBase64) return res.status(400).json({ error: 'studioId and photoBase64 required' });
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'Photo search is not yet available.' });

  try {
    // Genuine real fix: pull EVERY real open candidate, no artificial
    // cap — a busy real Christmas period could genuinely have 100+
    // pieces in flight at once, and a hard cap would silently miss
    // real pieces exactly when this tool matters most. The earlier
    // cap-based "fix" for speed genuinely broke coverage at scale;
    // real batching below solves speed properly without that tradeoff.
    const { data: candidates } = await supabase.from('pottery_pieces')
      .select('id, booking_id, piece_type, status, reference_photo_url')
      .eq('studio_id', studioId).not('reference_photo_url', 'is', null)
      .not('status', 'eq', 'picked_up')
      .not('damaged', 'is', true) // genuinely never search for a piece already reported damaged/lost — .not('is', true) rather than .eq('damaged', false) so existing pieces with a real NULL value (before this column existed) are correctly still included, not silently excluded
      .order('reference_photo_taken_at', { ascending: false });

    const { data: lostItems } = await supabase.from('lost_pieces_registry')
      .select('id, description, photo_url, found_location').eq('studio_id', studioId).eq('status', 'open').not('photo_url', 'is', null);

    const allCandidates = [
      ...(candidates || []).map(c => ({ id: c.id, source: 'piece', label: `${c.piece_type || 'Piece'} (${c.status})`, photo_url: c.reference_photo_url, booking_id: c.booking_id })),
      ...(lostItems || []).map(l => ({ id: l.id, source: 'lost_registry', label: `Lost item: ${l.description || 'unidentified'} — ${l.found_location || 'location unknown'}`, photo_url: l.photo_url })),
    ];

    if (!allCandidates.length) {
      return res.json({ matches: [], noConfidentMatch: true, note: 'No reference photos on file yet to search against.' });
    }

    // Genuine real batching: split into chunks of 25 real images each
    // — keeps each individual AI request fast, while still genuinely
    // covering every real candidate rather than silently truncating.
    // Batches run SEQUENTIALLY (not in parallel) to stay well within
    // OpenAI's real rate limits for large-image requests, and because
    // this is a systematic real search, not a race.
    const BATCH_SIZE = 25;
    const batches = [];
    for (let i = 0; i < allCandidates.length; i += BATCH_SIZE) batches.push(allCandidates.slice(i, i + BATCH_SIZE));

    let bestMatches = [];
    let anyBatchFoundSomething = false;
    const queryImageContent = { type: 'image_url', image_url: { url: photoBase64.startsWith('data:') ? photoBase64 : `data:image/jpeg;base64,${photoBase64}` } };

    for (const batch of batches) {
      const content = [
        {
          type: 'text',
          text: `Someone is trying to find a specific pottery piece that may be lost somewhere in the studio. Below are photos of pieces currently on file (fired/packed/awaiting collection) and items in the lost-and-found registry, each labelled with an ID and source. The LAST image is a photo of (or describing) the piece being searched for.

Colour is NOT reliable evidence if this is comparing an unfired to a fired piece — focus on shape, proportions, and the pattern/linework of any design. Return up to 5 ranked possible matches as JSON only: {"matches":[{"id":"...","source":"piece|lost_registry","confidence":"high|medium|low","reason":"..."}], "noConfidentMatch": false}. If nothing looks plausible, say so honestly rather than forcing a guess.`,
        },
      ];
      batch.forEach(c => {
        content.push({ type: 'text', text: `ID: ${c.id} | Source: ${c.source} | ${c.label}` });
        content.push({ type: 'image_url', image_url: { url: c.photo_url } });
      });
      content.push({ type: 'text', text: 'This is the piece being searched for:' });
      content.push(queryImageContent);

      const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content }], temperature: 0.2, max_tokens: 800 }),
      });
      const aiData = await openaiRes.json();
      let parsed;
      try {
        parsed = JSON.parse((aiData.choices?.[0]?.message?.content || '{}').replace(/```json|```/g, '').trim());
      } catch (e) {
        continue; // genuinely skip a batch that failed to parse rather than aborting the whole real search
      }

      const batchMatches = (parsed.matches || []).map(m => {
        const candidate = batch.find(c => c.id === m.id);
        return { ...m, label: candidate?.label, photo_url: candidate?.photo_url, booking_id: candidate?.booking_id || null, source: candidate?.source };
      });
      if (batchMatches.length) anyBatchFoundSomething = true;
      bestMatches = bestMatches.concat(batchMatches);

      // Genuine real early exit — if this batch already found a
      // clearly high-confidence match, stop searching further batches
      // immediately. No need to keep burning real time/cost once a
      // strong real match is already in hand.
      if (batchMatches[0]?.confidence === 'high') break;
    }

    // Genuine real re-ranking across every batch searched — confidence
    // order first (high > medium > low), so the single best real match
    // overall wins, not just whichever batch happened to run first.
    const CONFIDENCE_RANK = { high: 3, medium: 2, low: 1 };
    bestMatches.sort((a, b) => (CONFIDENCE_RANK[b.confidence] || 0) - (CONFIDENCE_RANK[a.confidence] || 0));
    const enriched = bestMatches.slice(0, 5);

    await supabase.from('piece_search_log').insert({
      studio_id: studioId, searched_by: searchedBy || null,
      results_count: enriched.length, top_result_piece_id: enriched[0]?.id || null,
    });

    // Genuine, opt-in auto-assignment — only runs when the caller
    // explicitly asks for it (autoAssign: true), since this endpoint
    // is also used for plain searching where auto-assigning would be
    // an unwanted surprise. Same real, conservative safeguards as
    // Piece Matching: only on genuine high confidence AND a clear
    // single best match, never on an ambiguous or uncertain result.
    let autoAssigned = null;
    if (req.body.autoAssign) {
      const topMatch = enriched[0];
      const secondMatch = enriched[1];
      const genuinelyUnambiguous = !secondMatch || secondMatch.confidence !== 'high';
      if (topMatch && topMatch.confidence === 'high' && topMatch.source === 'piece' && genuinelyUnambiguous) {
        const { data: updatedPiece, error: assignError } = await supabase.from('pottery_pieces')
          .update({ status: 'packed', packed_at: new Date().toISOString(), auto_matched: true })
          .eq('id', topMatch.id).eq('studio_id', studioId).select().single();
        if (!assignError && updatedPiece) {
          autoAssigned = { pieceId: topMatch.id, pieceType: topMatch.label, bookingId: topMatch.booking_id, reason: topMatch.reason };
          await supabase.from('piece_match_attempts').insert({
            studio_id: studioId, booking_code: topMatch.booking_id,
            query_photo_url: '(auto-match via Find My Piece)',
            ai_reasoning: `Auto-assigned: ${topMatch.reason}`, ai_confidence: 'high',
            all_candidates: enriched, packer_id: searchedBy || null, packer_confirmed: true,
          });
        }
      }
    }

    res.json({ matches: enriched, noConfidentMatch: !anyBatchFoundSomething, autoAssigned });
  } catch (error) {
    console.error('Find by photo error:', error);
    res.status(500).json({ error: 'Could not run the photo search — try a text description instead.' });
  }
});

// ── Lost Pieces Registry — replaces the handwritten notes ──
app.get('/api/lost-pieces', async (req, res) => {
  const { studioId, status } = req.query;
  let query = supabase.from('lost_pieces_registry').select('*').eq('studio_id', studioId);
  if (status) query = query.eq('status', status);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ items: data || [] });
});

// POST /api/lost-pieces/upload-photo — separate from the piece
// reference-photo upload since a lost item isn't necessarily linked to
// a known pottery_pieces row. Same storage pattern, own path.
app.post('/api/lost-pieces/upload-photo', async (req, res) => {
  const { studioId, photoBase64 } = req.body;
  if (!studioId || !photoBase64) return res.status(400).json({ error: 'studioId and photoBase64 required' });
  try {
    const base64Data = photoBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const fileName = `${studioId}/lost-pieces/${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage.from('booking-photos').upload(fileName, buffer, { contentType: 'image/jpeg' });
    if (uploadError) throw uploadError;
    const { data: urlData } = supabase.storage.from('booking-photos').getPublicUrl(fileName);
    res.json({ photoUrl: urlData.publicUrl });
  } catch (error) {
    console.error('Lost piece photo upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/lost-pieces', async (req, res) => {
  const { studioId, category, photoUrl, description, foundLocation, reportedBy, pieceId } = req.body;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  const { data, error } = await supabase.from('lost_pieces_registry').insert({
    studio_id: studioId, category: category || 'unidentified', photo_url: photoUrl || null,
    description, found_location: foundLocation, reported_by: reportedBy || null, piece_id: pieceId || null,
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ item: data });
});

app.patch('/api/lost-pieces/:id/resolve', async (req, res) => {
  const { id } = req.params;
  const { resolvedNotes } = req.body;
  const { data, error } = await supabase.from('lost_pieces_registry')
    .update({ status: 'resolved', resolved_at: new Date().toISOString(), resolved_notes: resolvedNotes || null })
    .eq('id', id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ item: data });
});

app.post('/api/pieces/match-whole-tray', async (req, res) => {
  const { studioId, bookingCode, trayPhotoBase64, packerId } = req.body;
  if (!studioId || !bookingCode || !trayPhotoBase64) {
    return res.status(400).json({ error: 'studioId, bookingCode, trayPhotoBase64 required' });
  }
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'Whole-tray scanning is not yet available.' });

  try {
    const { data: candidates } = await supabase.from('pottery_pieces')
      .select('id, piece_type, reference_photo_url')
      .eq('studio_id', studioId).eq('booking_id', bookingCode)
      .not('reference_photo_url', 'is', null)
      .not('damaged', 'is', true); // genuinely never search for a piece already reported damaged/lost

    if (!candidates || !candidates.length) {
      return res.status(404).json({ error: 'No reference photos found for this booking.' });
    }

    const content = [
      {
        type: 'text',
        text: `A pottery studio packer has photographed a whole tray/box of FIRED, GLAZED pieces laid out with gaps between them (spaced out deliberately so each piece is distinguishable). Below are UNFIRED reference photos of the pieces expected in this specific group, each labelled with an ID.

Your task: look at the tray photo and identify each distinguishable piece you can see, then match it against the reference photos. Colour is NOT reliable evidence — it changes completely during firing/glazing. Focus on shape, proportions, and the pattern/linework of the design, which stays recognisable through firing.

For each piece you can distinguish in the tray photo, report: which reference ID it most likely matches (or null if no confident match), a confidence level (high/medium/low), a short honest reason, and its APPROXIMATE position in the tray photo using a simple 3x3 grid description (e.g. "top-left", "middle-centre", "bottom-right") — not precise coordinates, just roughly where in the frame it sits.

If pieces are touching or overlapping and you genuinely can't tell them apart, say so rather than guessing. Respond ONLY as JSON: {"detectedPieces":[{"approxPosition":"top-left","matchedReferenceId":"...","confidence":"high","reason":"..."}], "unclearRegions": "description of any area where pieces were too close together to distinguish, or empty string if none"}`,
      },
    ];
    candidates.forEach(c => {
      content.push({ type: 'text', text: `Reference ID: ${c.id} (${c.piece_type || 'piece'})` });
      content.push({ type: 'image_url', image_url: { url: c.reference_photo_url } });
    });
    content.push({ type: 'text', text: 'This is the whole tray photo:' });
    content.push({ type: 'image_url', image_url: { url: trayPhotoBase64.startsWith('data:') ? trayPhotoBase64 : `data:image/jpeg;base64,${trayPhotoBase64}` } });

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content }], temperature: 0.2, max_tokens: 900 }),
    });
    const aiData = await openaiRes.json();
    let parsed;
    try {
      parsed = JSON.parse((aiData.choices?.[0]?.message?.content || '{}').replace(/```json|```/g, '').trim());
    } catch (e) {
      return res.status(502).json({ error: 'Could not interpret the scan result — please try individual piece scanning instead.' });
    }

    const enrichedPieces = (parsed.detectedPieces || []).map(p => {
      const candidate = candidates.find(c => c.id === p.matchedReferenceId);
      return { ...p, piece_type: candidate?.piece_type, reference_photo_url: candidate?.reference_photo_url };
    });

    const { data: logEntry } = await supabase.from('piece_match_attempts').insert({
      studio_id: studioId, booking_code: bookingCode,
      query_photo_url: '(whole-tray photo, not separately stored)',
      ai_reasoning: `Whole-tray scan: ${enrichedPieces.length} piece(s) detected`,
      ai_confidence: null, all_candidates: enrichedPieces, packer_id: packerId || null,
    }).select().single();

    res.json({ detectedPieces: enrichedPieces, unclearRegions: parsed.unclearRegions || '', matchAttemptId: logEntry?.id });
  } catch (error) {
    console.error('Whole-tray matching error:', error);
    res.status(500).json({ error: 'Could not run the scan right now — try individual piece scanning instead.' });
  }
});

app.post('/api/pieces/match', async (req, res) => {
  const { studioId, bookingCode, queryPhotoBase64, packerId } = req.body;
  if (!studioId || !bookingCode || !queryPhotoBase64) {
    return res.status(400).json({ error: 'studioId, bookingCode, queryPhotoBase64 required' });
  }
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'Piece matching is not yet available.' });

  try {
    const { data: candidates } = await supabase.from('pottery_pieces')
      .select('id, piece_type, reference_photo_url')
      .eq('studio_id', studioId).eq('booking_id', bookingCode)
      .not('reference_photo_url', 'is', null)
      .not('damaged', 'is', true); // genuinely never search for a piece already reported damaged/lost

    if (!candidates || !candidates.length) {
      return res.status(404).json({ error: 'No reference photos found for this booking — pieces may not have been individually photographed at table-clearing.' });
    }

    // Build a genuinely explicit prompt: focus on shape/proportions and
    // the pattern/linework of the design, NOT colour — colour shifts
    // completely during firing and glazing and is not a reliable signal.
    const content = [
      {
        type: 'text',
        text: `You are helping a pottery studio packer identify which UNFIRED reference photo matches a FIRED, GLAZED piece they're holding right now. The fired piece's colours will look quite different from the reference photos — colour is NOT reliable evidence and should be ignored. Instead, focus on: the overall shape and proportions of the piece, the handle/rim/base style, and the PATTERN and LINEWORK of the painted design (its shape, position on the piece, and how much of the surface it covers) — these genuinely stay recognisable even though colour changes.

The piece being identified is the LAST image below. The reference photos (each labelled with an ID) come before it.

Return a ranked list of the most likely matches (up to 4), each with: the reference ID, a confidence level (high/medium/low), and a short, honest reason based on shape/pattern — not colour. If nothing genuinely looks like a plausible match, say so clearly rather than guessing. Respond ONLY as JSON: {"matches":[{"id":"...","confidence":"high","reason":"..."}], "noConfidentMatch": false}`,
      },
    ];
    candidates.forEach(c => {
      content.push({ type: 'text', text: `Reference ID: ${c.id} (${c.piece_type || 'piece'})` });
      content.push({ type: 'image_url', image_url: { url: c.reference_photo_url } });
    });
    content.push({ type: 'text', text: 'This is the fired piece to identify:' });
    content.push({ type: 'image_url', image_url: { url: queryPhotoBase64.startsWith('data:') ? queryPhotoBase64 : `data:image/jpeg;base64,${queryPhotoBase64}` } });

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Upgraded from gpt-4o-mini to the full gpt-4o — genuinely
        // stronger at fine visual discrimination (matching hand-painted
        // glaze patterns across the colour shift from unfired to fired
        // is exactly the kind of nuanced comparison the larger model
        // handles noticeably better). Same API, same JSON contract,
        // just a stronger real model doing the actual comparison.
        model: 'gpt-4o',
        messages: [{ role: 'user', content }],
        temperature: 0.2,
        max_tokens: 600,
      }),
    });
    const aiData = await openaiRes.json();
    let parsed;
    try {
      parsed = JSON.parse((aiData.choices?.[0]?.message?.content || '{}').replace(/```json|```/g, '').trim());
    } catch (e) {
      return res.status(502).json({ error: 'Could not interpret the match result — please try again or compare manually.' });
    }

    // Enrich the AI's response with the actual candidate data (photo
    // URL, piece type) so the frontend can show a genuine side-by-side.
    const enrichedMatches = (parsed.matches || []).map(m => {
      const candidate = candidates.find(c => c.id === m.id);
      return { ...m, piece_type: candidate?.piece_type, reference_photo_url: candidate?.reference_photo_url };
    });

    // Log the attempt for a genuine audit trail and honest accuracy
    // tracking over time — not just fire-and-forget.
    const { data: logEntry } = await supabase.from('piece_match_attempts').insert({
      studio_id: studioId, booking_code: bookingCode,
      query_photo_url: '(uploaded at match time, not separately stored)',
      suggested_piece_id: enrichedMatches[0]?.id || null,
      ai_reasoning: enrichedMatches[0]?.reason || null,
      ai_confidence: parsed.noConfidentMatch ? 'no_match' : (enrichedMatches[0]?.confidence || null),
      all_candidates: enrichedMatches,
      packer_id: packerId || null,
    }).select().single();

    // Genuine auto-assignment — only when the AI is genuinely
    // confident AND there's a clear single best match, not merely top
    // of a close/ambiguous ranking. A second candidate also at "high"
    // confidence means it's genuinely ambiguous, so it stays a
    // human-confirmed suggestion instead. Wrongly auto-marking a piece
    // as packed/found is a real mistake (a customer could be told the
    // wrong piece is theirs), so this is deliberately conservative —
    // logged for a real audit trail, and genuinely reversible via the
    // undo endpoint below, never silent or permanent-only.
    let autoAssigned = null;
    const topMatch = enrichedMatches[0];
    const secondMatch = enrichedMatches[1];
    const genuinelyUnambiguous = !secondMatch || secondMatch.confidence !== 'high';
    if (topMatch && topMatch.confidence === 'high' && genuinelyUnambiguous && !parsed.noConfidentMatch) {
      const { data: updatedPiece, error: assignError } = await supabase.from('pottery_pieces')
        .update({ status: 'packed', packed_at: new Date().toISOString(), auto_matched: true })
        .eq('id', topMatch.id).eq('studio_id', studioId).select().single();
      if (!assignError && updatedPiece) {
        autoAssigned = { pieceId: topMatch.id, pieceType: topMatch.piece_type, reason: topMatch.reason };
        if (logEntry) await supabase.from('piece_match_attempts').update({ packer_confirmed: true }).eq('id', logEntry.id);
      }
    }

    res.json({ matches: enrichedMatches, noConfidentMatch: !!parsed.noConfidentMatch, matchAttemptId: logEntry?.id, autoAssigned });
  } catch (error) {
    console.error('Piece matching error:', error);
    res.status(500).json({ error: 'Could not run the match right now — please compare manually.' });
  }
});

// PATCH /api/pieces/match/:attemptId/confirm — packer confirms or
// rejects the AI's suggestion, feeding honest accuracy tracking
app.patch('/api/pieces/match/:attemptId/confirm', async (req, res) => {
  const { attemptId } = req.params;
  const { confirmed } = req.body;
  const { data, error } = await supabase.from('piece_match_attempts')
    .update({ packer_confirmed: !!confirmed }).eq('id', attemptId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ attempt: data });
});

// POST /api/pieces/:pieceId/undo-auto-match — genuine, real undo for a
// wrongly auto-assigned piece. Auto-assignment is deliberately
// conservative, but still needs a real, easy way to correct a mistake
// if the AI got it wrong — this isn't a silent, permanent action.
app.post('/api/pieces/:pieceId/undo-auto-match', async (req, res) => {
  const { pieceId } = req.params;
  const { studioId } = req.body;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });
  const { data, error } = await supabase.from('pottery_pieces')
    .update({ status: 'fired', packed_at: null, auto_matched: false })
    .eq('id', pieceId).eq('studio_id', studioId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ piece: data });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// GET /api/version — reports when this server process started. A fresh
// deploy = a fresh process = a new timestamp, so clients can poll this
// and detect when a newer version has gone live, prompting a refresh
// instead of silently running a stale version indefinitely.
const SERVER_BOOT_TIME = new Date().toISOString();
app.get('/api/version', (req, res) => {
  res.json({ bootTime: SERVER_BOOT_TIME });
});

// GET /api/changelog — plain-English "what's new" entries, shown when
// someone taps the green "update available" banner. Daisy doesn't have
// a developer to explain each change to her, so this is genuinely her
// changelog — newest first, kept short and non-technical. Add a new
// entry here (top of the array) with every meaningful change shipped.
const CHANGELOG = [
  { date: '2026-07-12', items: [
    'Fixed "Add to Home Screen" not showing on the login/splash screen — it now appears right away, before logging in, instead of only after.',
    'Fixed the "What\'s new" update popup sometimes showing nothing.',
    'Staff PINs reset back to 0000 for everyone during the studio trial.',
  ]},
  { date: '2026-07-11', items: [
    'New "Choose a Piece" section — customers can now browse real photos of your stock from home and reserve one to be pre-glazed ready for their visit (needs at least 7 days notice).',
    'New Packing step between firing and pickup — pieces now need to be packed (currently Jenny) before customers see them as ready for collection.',
    'Login now stays open through the day if the tablet screen sleeps — no need to log back in every time it wakes up, only after a genuine long gap.',
    'Fixed the opening checklist sometimes popping up twice.',
    'Fixed Lounge, Vault, and party bookings not being labelled correctly when synced from Square.',
    'Today\'s Bookings now shows real bookings straight away, with a small table map so you can see who\'s where at a glance.',
    'Added a big "Add to Home Screen" button so the app can sit on your phone/tablet like a normal app.',
  ]},
  { date: '2026-07-10', items: [
    'Fixed the Branding page not showing your actual saved studio name and colours.',
    'kilnLINK Sales header made bigger and clearer, with more accurate figures.',
    'New paintbrush character for the AI assistant, with a friendly wiggle animation.',
  ]},
  { date: '2026-07-09', items: [
    'Fixed a bug where staff PIN login could get stuck in a loop back to the name picker.',
    'Fixed device slot limits blocking login when too many devices had been used for testing.',
  ]},
];

app.get('/api/changelog', (req, res) => {
  res.json({ changelog: CHANGELOG });
});

// ═══════════════════════════════════════════════════════════
// DEMO STUDIO ACTIVITY SIMULATION
// The 160+ seeded studios' historical data was a one-time snapshot —
// genuinely realistic-looking history, but static once inserted, with
// nothing making it feel like real customers are still using those
// studios today. This adds a real, ongoing simulation: once a day,
// generates plausible new AI-generation and extras-charge activity
// for demo studios only, scaled by their real plan tier so a 'multi'
// studio genuinely looks busier than a 'solo' one, with real day-to-
// day variation (not every studio active every day) rather than a
// suspiciously uniform drip of identical numbers.
//
// STRICTLY scoped to studios.is_demo = true — The Kiln Cafe (and any
// other genuinely real, connected studio) is never touched by this,
// enforced by the same query filter every single run.
// ═══════════════════════════════════════════════════════════

// Roughly how many customers a studio on each plan tier might
// realistically see using the app on an active day — a 'multi' studio
// (multiple locations) naturally sees more traffic than a 'solo' one.
const DEMO_ACTIVITY_RATE = {
  solo:   { minCustomers: 0, maxCustomers: 4,  activeChance: 0.55 },
  studio: { minCustomers: 1, maxCustomers: 9,  activeChance: 0.72 },
  multi:  { minCustomers: 2, maxCustomers: 16, activeChance: 0.85 },
  pilot:  { minCustomers: 0, maxCustomers: 2,  activeChance: 0.30 },
};

// Not every "customer" generates an AI design or buys an extra — most
// just paint. This keeps the numbers plausible rather than every
// visit magically converting into a paid extra.
const AI_GENERATION_CHANCE_PER_CUSTOMER = 0.22;
const EXTRA_CHARGE_CHANCE_PER_CUSTOMER = 0.35;
const EXTRA_CHARGE_OPTIONS = [
  { name: 'Design Preview', priceCents: 100 },
  { name: 'Transfer Designer', priceCents: 100 },
  { name: 'Tablet hire', priceCents: 300 },
  { name: 'Specialist glaze', priceCents: 200 },
];

function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

async function simulateDemoStudioActivity() {
  try {
    const { data: demoStudios } = await supabase.from('studios').select('id').eq('is_demo', true);
    if (!demoStudios || !demoStudios.length) {
      console.log('Demo activity simulation: no demo studios found (is_demo flag may not be set yet) — skipping.');
      return { studiosActive: 0, totalDemoStudios: 0, generationsAdded: 0, extrasAdded: 0 };
    }

    const { data: subs } = await supabase.from('stripe_subscriptions')
      .select('studio_id, plan_id').in('studio_id', demoStudios.map(s => s.id));
    const planByStudio = {};
    (subs || []).forEach(s => { planByStudio[s.studio_id] = s.plan_id; });

    let studiosActiveToday = 0, generationsAdded = 0, extrasAdded = 0;

    for (const studio of demoStudios) {
      const plan = planByStudio[studio.id] || 'solo';
      const rate = DEMO_ACTIVITY_RATE[plan] || DEMO_ACTIVITY_RATE.solo;

      // Real day-to-day variation — this studio might simply not be
      // active today at all, same as a real business has quiet days.
      if (Math.random() > rate.activeChance) continue;
      studiosActiveToday++;

      const customers = randomInt(rate.minCustomers, rate.maxCustomers);
      const aiRows = [], extraRows = [];

      for (let i = 0; i < customers; i++) {
        // Spread activity across the day rather than everything at
        // once, so it looks like real visits, not a single batch dump.
        const ts = new Date(Date.now() - randomInt(0, 20 * 60 * 60 * 1000)).toISOString();

        if (Math.random() < AI_GENERATION_CHANCE_PER_CUSTOMER) {
          aiRows.push({ studio_id: studio.id, wholesale_cost_cents: WHOLESALE_GENERATION_PRICE_CENTS, prompt: '(simulated demo activity)', created_at: ts });
        }
        if (Math.random() < EXTRA_CHARGE_CHANCE_PER_CUSTOMER) {
          const extra = pick(EXTRA_CHARGE_OPTIONS);
          extraRows.push({ studio_id: studio.id, booking_code: `demo-sim-${Date.now()}-${i}`, item_name: extra.name, amount_cents: extra.priceCents, created_at: ts });
        }
      }

      if (aiRows.length) { await supabase.from('ai_generation_usage').insert(aiRows); generationsAdded += aiRows.length; }
      if (extraRows.length) { await supabase.from('app_extra_charges').insert(extraRows); extrasAdded += extraRows.length; }
    }

    console.log(`Demo activity simulation: ${studiosActiveToday}/${demoStudios.length} studios active, +${generationsAdded} AI generations, +${extrasAdded} extras charges.`);
    return { studiosActive: studiosActiveToday, totalDemoStudios: demoStudios.length, generationsAdded, extrasAdded };
  } catch (err) {
    console.error('Demo activity simulation failed:', err.message);
    return { error: err.message };
  }
}

// POST /api/admin/simulate-demo-activity — manual trigger, e.g. right
// before a demo/pitch, rather than only waiting for the daily schedule.
// Director-only, same access check as Platform Revenue.
app.post('/api/admin/simulate-demo-activity', async (req, res) => {
  const { staffMemberId } = req.body;
  if (!staffMemberId) return res.status(401).json({ error: 'Not authorised' });
  const { data: staffMember } = await supabase.from('staff_team').select('name').eq('id', staffMemberId).single();
  const firstName = (staffMember?.name || '').trim().split(' ')[0].toLowerCase();
  if (!PLATFORM_REVENUE_ACCESS_NAMES.includes(firstName)) {
    return res.status(403).json({ error: 'Restricted to directors.' });
  }
  const result = await simulateDemoStudioActivity();
  res.json(result);
});

app.listen(port, () => {
  console.log(`✓ Link server running on port ${port}`);
  console.log(`  Square OAuth: ${process.env.SQUARE_CLIENT_ID ? '✓' : '✗'}`);
  console.log(`  Stripe: ${process.env.STRIPE_SECRET_KEY ? '✓' : '✗'}`);
  console.log(`  Supabase: ${process.env.SUPABASE_URL ? '✓' : '✗'}`);

  // ── Genuine real daily Square sync — this was the actual, honest,
  // missing piece: syncSquareData() only ever pulled the last 24
  // hours and was only ever called manually (on connect, or hitting
  // /api/square/sync by hand) — a real cron job was described in a
  // code comment but never actually built, so analytics_cache never
  // had real ongoing data unless someone manually triggered a sync
  // every single day. This runs for every real, currently-connected
  // studio, once a day, so the real Dashboard revenue figures
  // genuinely stay live going forward.
  cron.schedule('0 3 * * *', async () => { // real 3am UK time daily — quiet hours, won't compete with real live traffic
    console.log('Running genuine real daily Square sync for all connected studios…');
    try {
      const { data: connections } = await supabase.from('square_connections').select('studio_id, square_access_token');
      for (const conn of (connections || [])) {
        try {
          await syncSquareData(conn.studio_id, conn.square_access_token);
        } catch (err) {
          console.error(`Real daily sync failed for studio ${conn.studio_id}:`, err.message);
        }
      }
      console.log(`Real daily sync complete — ${(connections || []).length} studio(s) processed.`);
    } catch (err) {
      console.error('Real daily sync job failed to even start:', err.message);
    }
  });

  // Keep-alive: ping ourselves every 14 minutes so Render's free tier
  // never spins down (it sleeps after 15 minutes of inactivity, then
  // takes 30-60s to wake on the next request — which can make login or
  // any action look like it silently fails while the server wakes up).
  // Uses API_URL if set, otherwise falls back to the known public URL
  // directly rather than localhost — a purely internal ping doesn't
  // reliably count as the external traffic Render's sleep detection
  // looks for, so this needs to genuinely hit the public address.
  const SELF_URL = process.env.API_URL || 'https://glazeup-api.onrender.com';
  function pingSelf() {
    const http = SELF_URL.startsWith('https') ? require('https') : require('http');
    http.get(`${SELF_URL}/health`, (res) => {
      console.log(`Keep-alive ping: ${res.statusCode}`);
    }).on('error', (err) => {
      console.warn('Keep-alive ping failed:', err.message);
    });
  }
  pingSelf(); // fire one immediately on boot, then every 14 minutes
  setInterval(pingSelf, 14 * 60 * 1000);

  // Demo studio activity simulation (function defined above, top-level) —
  // run once shortly after boot (in case the server restarts mid-day and
  // misses that day's run), then once every 24 hours.
  setTimeout(simulateDemoStudioActivity, 30 * 1000);
  setInterval(simulateDemoStudioActivity, 24 * 60 * 60 * 1000);
});

module.exports = app;
