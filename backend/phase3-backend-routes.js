/**
 * GlazeUp Phase 3 Backend Routes
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * POST /api/bookings/:code/split-bill — Save split bill config
 * POST /api/bookings/:code/items — Add items to till
 * GET /api/bookings/:code/till — Get current till state
 */

// Add these to your Express server.js:

app.post('/api/bookings/:code/split-bill', async (req, res) => {
  try {
    const { code } = req.params;
    const { isSplit, people } = req.body;

    // Validate
    if (!code || !people || people.length === 0) {
      return res.status(400).json({ error: 'Invalid split bill config' });
    }

    // Save to till_sessions or similar
    const { data, error } = await supabase
      .from('till_sessions')
      .upsert({
        booking_code: code,
        studio_id: process.env.STUDIO_ID,
        is_split: isSplit,
        people: people,
        split_bill_started_at: new Date().toISOString(),
        status: 'active'
      }, { onConflict: 'booking_code' });

    if (error) throw error;

    res.json({ success: true, tillSession: data });
  } catch (err) {
    console.error('Split bill error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/bookings/:code/items', async (req, res) => {
  try {
    const { code } = req.params;
    const { personId, items, estimatedWeight = 500 } = req.body;

    if (!code || !personId || !items) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get till session
    const { data: session, error: sessionError } = await supabase
      .from('till_sessions')
      .select('*')
      .eq('booking_code', code)
      .single();

    if (sessionError) throw sessionError;

    // Save till items
    const { data: savedItems, error: itemError } = await supabase
      .from('till_items')
      .insert(
        items.map(item => ({
          booking_code: code,
          person_id: personId,
          item_name: item.name,
          item_price: item.price,
          estimated_weight: estimatedWeight,
          studio_id: process.env.STUDIO_ID
        }))
      );

    if (itemError) throw itemError;

    res.json({ success: true, itemsAdded: savedItems.length });
  } catch (err) {
    console.error('Items error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/bookings/:code/till', async (req, res) => {
  try {
    const { code } = req.params;

    const { data: session, error: sessionError } = await supabase
      .from('till_sessions')
      .select('*')
      .eq('booking_code', code)
      .single();

    if (sessionError) throw sessionError;

    const { data: items, error: itemsError } = await supabase
      .from('till_items')
      .select('*')
      .eq('booking_code', code);

    if (itemsError) throw itemsError;

    // Calculate totals per person
    const personTotals = {};
    session.people.forEach(person => {
      const personItems = items.filter(i => i.person_id === person.id);
      const subtotal = personItems.reduce((sum, i) => sum + i.item_price, 0);
      
      // Calculate postal shipping if applicable
      let shipping = 0;
      if (person.collection === 'postal') {
        const totalWeight = personItems.reduce((sum, i) => sum + (i.estimated_weight || 500), 0);
        // Default RM24 to UK Zone 3
        shipping = getTillPostalRate(person.postalAddress || 'TA', totalWeight);
      }

      personTotals[person.id] = {
        items: personItems,
        subtotal,
        shipping,
        total: subtotal + shipping
      };
    });

    res.json({
      session,
      items,
      personTotals,
      grandTotal: Object.values(personTotals).reduce((sum, p) => sum + p.total, 0)
    });
  } catch (err) {
    console.error('Till fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/bookings/:code/complete-till', async (req, res) => {
  try {
    const { code } = req.params;
    const { paymentMethod, paymentsByPerson } = req.body;

    // Mark till as complete
    const { data, error } = await supabase
      .from('till_sessions')
      .update({
        status: 'completed',
        payment_method: paymentMethod,
        payments_by_person: paymentsByPerson,
        completed_at: new Date().toISOString()
      })
      .eq('booking_code', code);

    if (error) throw error;

    res.json({ success: true, completed: data });
  } catch (err) {
    console.error('Complete till error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Helper: Get postal rate for till
function getTillPostalRate(postcode, weightGrams) {
  const zones = { 'E': 1, 'EC': 1, 'SW': 1, 'N': 1, 'TA': 3, 'M': 3, 'L': 4, 'EH': 4 };
  const zone = zones[postcode.substring(0, 2).toUpperCase()] || 3;
  
  // RM24 rates by weight + zone
  const rates = {
    1: { 1: 2.35, 2: 2.55, 3: 2.75, 4: 3.10 },
    2: { 1: 2.85, 2: 3.15, 3: 3.45, 4: 4.00 },
    5: { 1: 4.35, 2: 4.80, 3: 5.25, 4: 6.00 }
  };
  
  let bucket = 1;
  if (weightGrams > 2000) bucket = 5;
  else if (weightGrams > 1000) bucket = 2;
  
  return rates[bucket]?.[zone] || 2.75;
}

module.exports = { getTillPostalRate };
