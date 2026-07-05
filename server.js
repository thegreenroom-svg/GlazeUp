/**
 * GlazeUp Backend Server
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
const cors = require('cors');
const fetch = require('node-fetch');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');
const { Client, Environment } = require('square');

// ═══════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════

const app = express();

// CORS configuration
app.use(cors({
  origin: '*',  // Allow all origins for development
  credentials: false
}));

app.use(express.json({ limit: '50mb' }));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const square = new Client({
  environment: process.env.SQUARE_ENVIRONMENT === 'sandbox' ? Environment.Sandbox : Environment.Production,
  accessToken: undefined  // Will be set per-request from stored token
});

const port = process.env.PORT || 3000;

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
  authUrl.searchParams.append('scope', 'MERCHANT_PROFILE_READ CUSTOMERS_READ ORDERS_READ INVENTORY_READ APPOINTMENTS_READ TIMECARDS_READ');
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
    const merchantRes = await client.merchantsApi.retrieveMerchant();
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

    // Trigger initial sync
    syncSquareData(studioId, tokenData.access_token);

    // Redirect to success page (you'll build this in the admin dashboard)
    res.redirect(`${process.env.API_URL}/admin/studio/${studioId}?square=connected`);
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
async function syncSquareData(studioId, accessToken) {
  try {
    const { data: syncLog } = await supabase
      .from('sync_logs')
      .insert({
        square_connection_id: (await supabase
          .from('square_connections')
          .select('id')
          .eq('studio_id', studioId)
          .single()).data.id,
        sync_type: 'incremental',
        status: 'pending'
      })
      .select()
      .single();

    const client = await getSquareClient(accessToken);
    let recordsSynced = 0;

    // Fetch orders from last 24 hours
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const ordersRes = await client.ordersApi.searchOrders({
      query: {
        filter: {
          dateTimeFilter: {
            createdAt: {
              startAt: yesterday + 'T00:00:00Z'
            }
          }
        }
      }
    });

    const orders = ordersRes.result.orders || [];
    recordsSynced = orders.length;

    // Aggregate into daily analytics
    const dailyRevenue = {};
    orders.forEach(order => {
      const date = order.createdAt.split('T')[0];
      const total = order.totalMoney?.amount || 0;
      dailyRevenue[date] = (dailyRevenue[date] || 0) + total;
    });

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
  } catch (error) {
    console.error('Sync error:', error);
    await supabase
      .from('sync_logs')
      .update({
        status: 'failed',
        error_message: error.message
      })
      .eq('square_connection_id', (await supabase.from('square_connections').select('id').eq('studio_id', studioId).single()).data.id);
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

  syncSquareData(studioId, connection.square_access_token);
  res.json({ status: 'sync started' });
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
// ANALYTICS ROUTES
// ═══════════════════════════════════════════

/**
 * GET /api/analytics/dashboard
 * Get dashboard data for a studio
 */
app.get('/api/analytics/dashboard', async (req, res) => {
  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studio_id required' });

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
        notes: booking.notes
      },
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
        const teamApi = squareClient.teamApi;
        const teamRes = await teamApi.searchTeamMembers({ query: {} });
        (teamRes.result.teamMembers || []).forEach(member => {
          teamMemberNameById[member.id] = member.givenName || member.id;
        });
      } catch (teamErr) {
        console.error('Could not fetch Square team members for table mapping:', teamErr);
      }
    }

    // Fetch today's bookings
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const response = await bookingsApi.listBookings({
      limit: 100,
      locationId: null  // Could filter by location if needed
    });

    const bookings = response.result.bookings || [];
    const todayBookings = bookings.filter(b => {
      const bookingTime = new Date(b.startAt);
      return bookingTime >= today && bookingTime < tomorrow;
    });

    // Upsert bookings into database
    const bookingsToInsert = todayBookings.map((booking, idx) => {
      const customerName = booking.customerNote || booking.customerId || `Walk-in ${idx + 1}`;
      const bookingCode = `booking-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}-${booking.id.substring(0, 8)}`;

      // Resolve table number/name depending on the studio's tracking mode
      let tableNumber = null;
      if (tableTrackingMode === 'staff_as_tables') {
        const teamMemberId = booking.appointmentSegments?.[0]?.teamMemberId;
        tableNumber = teamMemberNameById[teamMemberId] || null;
      }
      // 'none' mode: tableNumber stays null, no table tracking for this studio

      return {
        studio_id: studioId,
        square_booking_id: booking.id,
        booking_code: bookingCode,
        customer_name: customerName,
        customer_email: booking.customerEmail || null,
        customer_phone: booking.customerPhoneNumber || null,
        table_number: tableNumber,
        session_start: booking.startAt,
        session_end: booking.endAt || null,
        party_size: booking.partySize || null,
        notes: booking.note || null
      };
    });

    if (bookingsToInsert.length === 0) {
      return res.json({
        status: 'synced',
        bookingsSynced: 0,
        message: 'No bookings found for today'
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
        tableNumber: b.table_number
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
  const { studioId, bookingId, pieces, customerName, customerEmail, customerPhone } = req.body;
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
        notes: piece.notes || null
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
 * POST /api/pieces/mark-picked-up
 * Mark fired pieces as collected by the customer
 */
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
      .select('id');

    if (error) throw error;

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

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(port, () => {
  console.log(`✓ GlazeUp server running on port ${port}`);
  console.log(`  Square OAuth: ${process.env.SQUARE_CLIENT_ID ? '✓' : '✗'}`);
  console.log(`  Stripe: ${process.env.STRIPE_SECRET_KEY ? '✓' : '✗'}`);
  console.log(`  Supabase: ${process.env.SUPABASE_URL ? '✓' : '✗'}`);
});

module.exports = app;
