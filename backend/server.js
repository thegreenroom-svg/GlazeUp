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

// ============ HEALTH CHECK ============
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============ START ============
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🎨 GlazeUp API running on port ${PORT}`);
});
