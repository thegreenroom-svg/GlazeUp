import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(cors());
app.use(express.json());

// Supabase setup
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mdpchpjnlzlmldtlqrns.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'your-key-here';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const STUDIO_ID = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3';

// ============ BOOKINGS ============
app.get('/api/bookings', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('studio_id', STUDIO_ID)
      .order('booking_start', { ascending: true });
    
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/bookings', async (req, res) => {
  try {
    const { name, email, phone, booking_start, space_name, num_people, notes } = req.body;
    
    const { data, error } = await supabase
      .from('bookings')
      .insert([{
        studio_id: STUDIO_ID,
        customer_name: name,
        customer_email: email,
        customer_phone: phone,
        booking_start,
        space_name,
        num_people,
        notes,
        created_at: new Date().toISOString()
      }])
      .select();
    
    if (error) throw error;
    res.json(data[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ PIECES ============
app.get('/api/pieces', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('pieces')
      .select('*')
      .eq('studio_id', STUDIO_ID);
    
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pieces', async (req, res) => {
  try {
    const { booking_id, shape, colours, pattern, position, photo_url } = req.body;
    
    const { data, error } = await supabase
      .from('pieces')
      .insert([{
        studio_id: STUDIO_ID,
        booking_id,
        shape,
        colours,
        pattern,
        grid_position: position,
        photo_url,
        created_at: new Date().toISOString()
      }])
      .select();
    
    if (error) throw error;
    res.json(data[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ SHELF SCAN ============
app.post('/api/shelf/scan', async (req, res) => {
  try {
    const { photo_url } = req.body;
    
    // Call Anthropic API for shelf recognition
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'url', url: photo_url }
            },
            {
              type: 'text',
              text: `Inventory each pottery piece on this shelf. For each: shape, colours, pattern, grid position (A1-H8).
              Return JSON: {inventory: [{shape, colours, pattern, position}]}`
            }
          ]
        }]
      })
    });
    
    const anthropicData = await anthropicRes.json();
    const result = JSON.parse(anthropicData.content[0].text.trim());
    
    // Store scan
    const { data, error } = await supabase
      .from('shelf_scans')
      .insert([{
        studio_id: STUDIO_ID,
        photo_url,
        inventory: result.inventory,
        created_at: new Date().toISOString()
      }])
      .select();
    
    if (error) throw error;
    res.json({ ...data[0], inventory: result.inventory });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ STAFF LOGIN ============
app.post('/api/staff/login', async (req, res) => {
  try {
    const { pin } = req.body;
    
    // SHA-256 hash (simplified - use bcrypt in production)
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(pin).digest('hex');
    
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .eq('studio_id', STUDIO_ID)
      .eq('pin_hash', hash)
      .single();
    
    if (error || !data) {
      return res.status(401).json({ error: 'Invalid PIN' });
    }
    
    res.json({ id: data.id, name: data.name, role: data.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ ANALYTICS ============
app.get('/api/analytics/revenue', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('takings')
      .select('*')
      .eq('studio_id', STUDIO_ID)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
    
    if (error) throw error;
    
    const total = data.reduce((sum, item) => sum + (item.amount_cents || 0), 0);
    res.json({
      total_cents: total,
      total_gbp: (total / 100).toFixed(2),
      transaction_count: data.length,
      average_transaction: data.length > 0 ? ((total / data.length) / 100).toFixed(2) : 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ PHASE 3 TILL ============
app.post('/api/bookings/:code/split-bill', async (req, res) => {
  try {
    const { code } = req.params;
    const { isSplit, people } = req.body;

    if (!code || !people || people.length === 0) {
      return res.status(400).json({ error: 'Invalid split bill config' });
    }

    const { data, error } = await supabase
      .from('till_sessions')
      .upsert({
        booking_code: code,
        studio_id: STUDIO_ID,
        is_split: isSplit,
        people: people,
        split_bill_started_at: new Date().toISOString(),
        status: 'active'
      }, { onConflict: 'booking_code' })
      .select();

    if (error) throw error;

    res.json({ success: true, tillSession: data[0] });
  } catch (err) {
    console.error('Split bill error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/bookings/:code/items', async (req, res) => {
  try {
    const { code } = req.params;
    const { personId, items, estimatedWeight = 500 } = req.body;

    if (!code || !personId || !items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { data: savedItems, error } = await supabase
      .from('till_items')
      .insert(
        items.map(item => ({
          booking_code: code,
          person_id: personId,
          item_name: item.name,
          item_price: item.price,
          estimated_weight: estimatedWeight,
          studio_id: STUDIO_ID
        }))
      )
      .select();

    if (error) throw error;

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
      
      let shipping = 0;
      if (person.collection === 'postal') {
        const totalWeight = personItems.reduce((sum, i) => sum + (i.estimated_weight || 500), 0);
        shipping = getTillPostalRate(person.postalAddress || 'TA', totalWeight);
      }

      personTotals[person.id] = {
        items: personItems,
        subtotal,
        shipping,
        total: subtotal + shipping
      };
    });

    const grandTotal = Object.values(personTotals).reduce((sum, p) => sum + p.total, 0);

    res.json({
      session,
      items,
      personTotals,
      grandTotal
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

    const { data, error } = await supabase
      .from('till_sessions')
      .update({
        status: 'completed',
        payment_method: paymentMethod,
        payments_by_person: paymentsByPerson,
        completed_at: new Date().toISOString()
      })
      .eq('booking_code', code)
      .select();

    if (error) throw error;

    res.json({ success: true, completed: data[0] });
  } catch (err) {
    console.error('Complete till error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Helper: Get postal rate for till
function getTillPostalRate(postcode, weightGrams) {
  const zones = { 
    'E': 1, 'EC': 1, 'SW': 1, 'N': 1, 'NW': 1, 'SE': 1, 'W': 1, 'WC': 1,
    'BR': 1, 'CR': 1, 'DA': 1, 'EN': 1, 'IG': 1, 'KT': 1, 'RM': 1, 'SM': 1, 'SU': 1, 'TW': 1,
    'BN': 2, 'PO': 2, 'GU': 2, 'SO': 2, 'SP': 2, 'DT': 2, 'EX': 2, 'PL': 2, 'TA': 2, 'TQ': 2,
    'B': 3, 'CV': 3, 'M': 3,
    'G': 4, 'EH': 4, 'DD': 4, 'PH': 4
  };
  
  const zone = zones[postcode?.substring(0, 2).toUpperCase()] || 3;
  
  // RM24 rates by weight + zone (in GBP)
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

// ============ HEALTH CHECK ============
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============ START ============
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🎨 GlazeUp API running on port ${PORT}`);
});
