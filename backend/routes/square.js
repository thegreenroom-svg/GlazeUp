import express from 'express';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

/**
 * POST /api/square/oauth/start
 * Initiates Square OAuth flow.
 * Returns authorization URL for the studio to visit.
 */
router.post('/oauth/start', (req, res) => {
  const { studioId } = req.body;
  if (!studioId) return res.status(400).json({ error: 'studioId required' });

  const state = uuidv4();
  const clientId = process.env.SQUARE_APPLICATION_ID;
  const redirectUri = `${process.env.API_URL}/api/square/oauth/callback`;
  const scopes = ['MERCHANT_PROFILE_READ', 'PAYMENTS_READ', 'CUSTOMERS_READ'];

  const authUrl = `https://connect.squareup.com/oauth2/authorize?` +
    `client_id=${clientId}` +
    `&scope=${scopes.join('+')}` +
    `&session=false` +
    `&state=${state}`;

  // Store state temporarily (in production, use Redis or session store)
  res.json({ authUrl, state, studioId });
});

/**
 * GET /api/square/oauth/callback
 * Square redirects here with auth code.
 * Exchange code for access token and store in DB.
 */
router.get('/oauth/callback', async (req, res) => {
  const { code, state } = req.query;
  const { studioId } = req.query;  // passed back from /start

  if (!code || !studioId) {
    return res.status(400).json({ error: 'Missing code or studioId' });
  }

  const supabase = req.app.locals.supabase;

  try {
    // Exchange code for access token
    const tokenResponse = await axios.post(
      'https://connect.squareup.com/oauth2/token',
      {
        client_id: process.env.SQUARE_APPLICATION_ID,
        client_secret: process.env.SQUARE_APPLICATION_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${process.env.API_URL}/api/square/oauth/callback`
      }
    );

    const { access_token, refresh_token } = tokenResponse.data;

    // Get merchant ID from Square
    const merchantResponse = await axios.get(
      'https://connect.squareup.com/v2/merchants',
      { headers: { Authorization: `Bearer ${access_token}` } }
    );

    const merchantId = merchantResponse.data.result[0]?.id;

    // Store in database
    const { error } = await supabase
      .from('square_connections')
      .upsert({
        studio_id: studioId,
        square_access_token: access_token,
        square_refresh_token: refresh_token,
        square_merchant_id: merchantId,
        connected_at: new Date(),
        sync_status: 'idle'
      }, { onConflict: 'studio_id' });

    if (error) throw error;

    // Redirect to studio dashboard (success)
    res.redirect(
      `${process.env.FRONTEND_URL}/admin/square/success?studioId=${studioId}`
    );
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.redirect(
      `${process.env.FRONTEND_URL}/admin/square/error?message=${encodeURIComponent(err.message)}`
    );
  }
});

/**
 * GET /api/square/connection/:studioId
 * Get connection status for a studio
 */
router.get('/connection/:studioId', async (req, res) => {
  const { studioId } = req.params;
  const supabase = req.app.locals.supabase;

  const { data, error } = await supabase
    .from('square_connections')
    .select('*')
    .eq('studio_id', studioId)
    .single();

  if (error) return res.status(404).json({ error: 'Not connected' });

  // Don't expose tokens
  const { square_access_token, square_refresh_token, ...safe } = data;
  res.json(safe);
});

/**
 * POST /api/square/disconnect/:studioId
 * Disconnect a studio's Square account
 */
router.post('/disconnect/:studioId', async (req, res) => {
  const { studioId } = req.params;
  const supabase = req.app.locals.supabase;

  const { error } = await supabase
    .from('square_connections')
    .delete()
    .eq('studio_id', studioId);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ success: true });
});

export default router;
