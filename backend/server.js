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
import path from 'path';
import fs from 'fs';

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
    const { data, error } = await supabase
      .from('bookings')
      .select('id, customer_name, customer_email, party_size, status, session_start, session_end, room, current_stage, table_number, notes, booking_type, arrived_at')
      .eq('studio_id', DEMO_STUDIO_ID)
      .order('session_start', { ascending: false })
      .limit(50);
    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/demo/pieces', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('pottery_pieces')
      .select('id, piece_type, status, is_complete, created_at, scheduled_firing_date, reference_photo_url, mark_code, description, damaged, requires_second_firing, transfer_stage, glaze_fired_at')
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
    const { data, error } = await supabase
      .from('customers')
      .select('id, name, email, phone, tier, loyalty_points, visit_count, total_spend_cents, total_pieces_painted')
      .eq('studio_id', DEMO_STUDIO_ID)
      .order('last_visit_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    res.json(data);
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
});
