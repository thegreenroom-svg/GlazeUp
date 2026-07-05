import express from 'express';

const router = express.Router();

/**
 * GET /api/admin/dashboard/:studioId
 * Get studio dashboard data (analytics from cached Square data)
 */
router.get('/dashboard/:studioId', async (req, res) => {
  const { studioId } = req.params;
  const supabase = req.app.locals.supabase;

  try {
    // Get last 30 days of analytics
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: analytics, error } = await supabase
      .from('studio_analytics')
      .select('*')
      .eq('studio_id', studioId)
      .gte('metric_date', thirtyDaysAgo.toISOString().split('T')[0])
      .order('metric_date', { ascending: false });

    if (error) throw error;

    // Calculate summary stats
    const totalRevenue = analytics.reduce((sum, a) => sum + (a.total_revenue || 0), 0);
    const totalTransactions = analytics.reduce((sum, a) => sum + (a.transaction_count || 0), 0);
    const totalAppUsers = analytics.reduce((sum, a) => sum + (a.app_users_count || 0), 0);

    const dailyAvg = {
      revenue: (totalRevenue / analytics.length).toFixed(2),
      transactions: Math.round(totalTransactions / analytics.length),
      appUsers: Math.round(totalAppUsers / analytics.length)
    };

    // Get most popular design from the period
    const { data: mostPopular } = await supabase
      .from('studio_analytics')
      .select('designs(id, name)')
      .eq('studio_id', studioId)
      .gte('metric_date', thirtyDaysAgo.toISOString().split('T')[0])
      .order('app_users_count', { ascending: false })
      .limit(1)
      .single();

    res.json({
      period: '30 days',
      summary: {
        totalRevenue: totalRevenue.toFixed(2),
        totalTransactions,
        totalAppUsers,
        dailyAverage: dailyAvg
      },
      mostPopularDesign: mostPopular?.designs,
      dailyData: analytics
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/sync-status/:studioId
 * Check if Square is connected and last sync time
 */
router.get('/sync-status/:studioId', async (req, res) => {
  const { studioId } = req.params;
  const supabase = req.app.locals.supabase;

  const { data, error } = await supabase
    .from('square_connections')
    .select('sync_status, last_sync_at, sync_error, connected_at')
    .eq('studio_id', studioId)
    .single();

  if (error) {
    return res.json({
      connected: false,
      lastSync: null
    });
  }

  res.json({
    connected: !!data,
    syncStatus: data.sync_status,
    lastSyncAt: data.last_sync_at,
    syncError: data.sync_error,
    connectedAt: data.connected_at
  });
});

/**
 * GET /api/admin/sync-logs/:studioId
 * Get recent sync logs
 */
router.get('/sync-logs/:studioId', async (req, res) => {
  const { studioId } = req.params;
  const limit = req.query.limit || 10;
  const supabase = req.app.locals.supabase;

  const { data, error } = await supabase
    .from('sync_logs')
    .select('*')
    .eq('studio_id', studioId)
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error) return res.status(500).json({ error: error.message });

  res.json(data);
});

/**
 * POST /api/admin/manual-sync/:studioId
 * Manually trigger a Square data sync
 */
router.post('/manual-sync/:studioId', async (req, res) => {
  const { studioId } = req.params;
  const supabase = req.app.locals.supabase;
  const squareClient = req.app.locals.squareClient;

  try {
    // Import sync function
    const { syncSquareData } = await import('../jobs/sync-square.js');

    // Trigger async (don't wait for full completion)
    syncSquareData(studioId, supabase, squareClient).catch(err => {
      console.error('Async sync error:', err);
    });

    res.json({ status: 'sync started' });
  } catch (err) {
    console.error('Manual sync error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
