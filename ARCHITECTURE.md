# GlazeUp Architecture & System Design

Complete technical documentation of the GlazeUp pottery studio SaaS platform.

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    GlazeUp Ecosystem                         │
└─────────────────────────────────────────────────────────────┘
              │              │              │
              ▼              ▼              ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │  Customer    │ │    Studio    │ │   Backend    │
    │  App (Next)  │ │  App (Next)  │ │ (Node/Express)
    │   :3000      │ │   :3001      │ │   :3001      │
    └──────────────┘ └──────────────┘ └──────────────┘
              │              │              │
              └──────────────┼──────────────┘
                             │
                    ┌────────▼────────┐
                    │   Supabase      │
                    │  PostgreSQL     │
                    │   Auth          │
                    │   Storage       │
                    └─────────────────┘
                             │
            ┌────────────────┼────────────────┐
            ▼                ▼                ▼
        ┌────────┐      ┌────────┐      ┌────────┐
        │ Square │      │  Email │      │   S3   │
        │Payments│      │ Service│      │Images │
        └────────┘      └────────┘      └────────┘
```

## Technology Stack

### Frontend Layer

**Customer App** (`/apps/customer`)
- Framework: Next.js 14 (React 18)
- Language: TypeScript
- Styling: Tailwind CSS + custom globals
- State: React hooks + Zustand (for stores)
- Animation: Framer Motion
- Auth: Supabase Auth Helpers
- UI Icons: Lucide React
- Deployment: Vercel

**Studio App** (`/apps/studio`)
- Framework: Next.js 14 (React 18)
- Language: TypeScript
- Styling: Tailwind CSS
- State: React hooks + Zustand
- Animation: Framer Motion
- Auth: Supabase Auth Helpers
- Dashboard: Recharts (optional)
- Deployment: Vercel

### Backend Layer

**API Server** (`/backend`)
- Framework: Express.js (Node.js 18)
- Language: JavaScript
- HTTP Server: Express
- Logging: Pino
- Security: Helmet, CORS, Rate Limiting
- File Upload: Multer + Sharp (image optimization)
- Image Processing: Sharp
- Validation: Joi
- Database: Supabase PostgreSQL
- Deployment: Render

### Data Layer

**Database**: Supabase (PostgreSQL)
- Authentication: Supabase Auth
- Row Level Security: Enabled on all tables
- Real-time: Supabase Realtime subscriptions
- Storage: Supabase Storage (piece photos)
- Migrations: SQL-based (version controlled)

### External Services

- **Payments**: Square API (bookings, loyalty redemption)
- **Email**: SendGrid (optional, for notifications)
- **Image Storage**: Supabase Storage or AWS S3
- **Monitoring**: Sentry (optional)

## Data Architecture

### Database Entities (Multi-Studio)

```
studios
├── id (PK)
├── name, email, phone, address
├── configuration (tables, capacity)
├── square_account_id
└── metadata

users (staff & customers)
├── id (PK)
├── auth_id (Supabase Auth)
├── studio_id (FK)
├── email, display_name, avatar_url
├── role (owner, manager, staff, artist)
└── is_customer

customers
├── id (PK)
├── user_id (FK)
├── studio_id (FK)
├── loyalty_points
├── total_visits, total_spent
└── preferences

bookings
├── id (PK)
├── studio_id (FK)
├── customer_id (FK)
├── scheduled_at, checked_in_at
├── party_size, duration_minutes
├── status (pending, confirmed, checked-in, completed, cancelled)
├── total_amount
├── square_payment_id
└── payment_status

ceramic_pieces (core tracking)
├── id (PK)
├── booking_id (FK)
├── customer_id (FK)
├── status (created → painted → drying → glazing → kiln_queue → 
│           firing → quality_check → ready_for_collection → 
│           collected → archived)
├── piece_name, item_type, base_color
├── history (JSONB - immutable log)
├── staff_notes, quality_issues
└── collected_at

piece_photos
├── id (PK)
├── piece_id (FK)
├── storage_path, photo_url
├── taken_at, stage
├── fingerprint_vector (pgvector)
├── fingerprint_json (JSONB)
└── metadata

kiln_batches
├── id (PK)
├── studio_id (FK)
├── batch_number
├── status (planning → loading → firing → completed → unloaded)
├── scheduled_fire_at, fired_at, unloaded_at
├── fire_temperature, firing_program, duration_hours
└── pieces_count

reward_accounts
├── id (PK)
├── customer_id (FK)
├── current_balance
├── lifetime_earned, lifetime_redeemed
└── metadata

notifications
├── id (PK)
├── customer_id (FK)
├── notification_type
├── title, message
├── is_read, read_at
└── related references

audit_logs
├── id (PK)
├── studio_id (FK)
├── user_id (FK)
├── action, entity_type, entity_id
├── changes, previous_values (JSONB)
├── ip_address, user_agent
└── timestamp
```

### Row Level Security (RLS) Policies

**Customer Access**
- See own user record
- See own bookings and pieces
- See own notifications
- Cannot see studio staff data

**Studio Staff Access**
- See all studio data (bookings, customers, pieces)
- Cannot see other studios' data
- Restricted by role (owner > manager > staff > artist)

**Public Access**
- View studio listings only
- No access to bookings, pieces, or customer data

## API Architecture

### Authentication Flow

```
1. User signs up/logs in
   → Supabase Auth (handled on frontend)
   
2. Frontend receives JWT token
   → Stored in Supabase session
   
3. API requests include token
   → "Authorization: Bearer <JWT>"
   
4. Backend verifies token
   → Uses service role key to check auth
   → Returns user context or 401
   
5. RLS policies enforce access
   → Database checks studio_id match
   → Returns 403 if access denied
```

### Request/Response Pattern

**Request Header**
```
Authorization: Bearer <supabase_jwt_token>
Content-Type: application/json
```

**Success Response (200)**
```json
{
  "id": "uuid",
  "status": "success",
  "data": { /* entity data */ }
}
```

**Error Response (4xx/5xx)**
```json
{
  "error": "Human-readable message",
  "code": "ERROR_CODE",
  "details": { /* optional debug info */ }
}
```

### Endpoint Categories

**Public**
- `POST /api/studios` - Create studio (onboarding)
- `GET /health` - Health check
- `GET /ready` - Readiness probe

**Authenticated (Customer)**
- `GET /api/bookings` - View own bookings
- `GET /api/customers/:id/pieces` - View own pieces
- `GET /api/notifications` - View notifications

**Authenticated (Staff)**
- `GET /api/bookings` - View studio bookings
- `POST /api/pieces` - Create piece record
- `PATCH /api/pieces/:id/status` - Update piece status
- `POST /api/pieces/:id/photos` - Upload piece photo
- `GET /api/kiln-batches` - View kiln batches
- `PATCH /api/kiln-batches/:id/status` - Update kiln status

## Deployment Architecture

### Development Environment

```
Local Machine
├── Backend (Node):           :3001
├── Customer App (Next):      :3000
└── Studio App (Next):        :3001
    ↓
Supabase (Development Project)
```

**Setup Time**: 5 minutes  
**Cost**: Free tier OK for development

### Production Environment

```
┌──────────────────────────────────────────────────┐
│          GitHub (Source Control)                 │
└─────────────┬────────────────────────────────────┘
              │
              ├─→ Render (Backend CI/CD)
              │   ├── Auto-deploy on push
              │   └── Logs at render.com
              │
              ├─→ Vercel (Customer App)
              │   ├── Auto-deploy on push
              │   └── CDN distribution
              │
              ├─→ Vercel (Studio App)
              │   ├── Auto-deploy on push
              │   └── CDN distribution
              │
              └─→ Supabase (Database/Auth)
                  ├── PostgreSQL (managed)
                  ├── Auth (managed)
                  └── Storage (S3-backed)
```

**Scaling Strategy**
- Render: Auto-scaling for backend
- Vercel: Edge functions + CDN caching
- Supabase: Auto-scaling PostgreSQL
- Storage: S3 for infinite piece photos

### CI/CD Pipeline

```
1. Developer pushes to main/develop
   ↓
2. GitHub Actions (if configured)
   - Run tests
   - Lint code
   - Check types
   ↓
3. Deployment Services Trigger
   - Render deploys backend
   - Vercel deploys frontend
   ↓
4. Smoke Tests (recommended)
   - Health check endpoint
   - Database connectivity
   - Auth flow
   ↓
5. Live (within 2-3 minutes)
```

## Piece Lifecycle & Photo Matching

### Ceramic Piece States

```
CREATED
  ↓ (Customer paints)
PAINTED → photograph taken
  ↓ (dries)
DRYING
  ↓ (apply glaze)
GLAZING
  ↓ (ready for firing)
KILN_QUEUE
  ↓ (in kiln batch)
FIRING → photograph taken (post-kiln)
  ↓
QUALITY_CHECK (staff review)
  ↓ (passes QC or sent back)
READY_FOR_COLLECTION
  ↓
COLLECTED → photograph available
  ↓ (optional)
ARCHIVED (permanent record kept)
```

### Photo Matching System

**Fingerprinting Approach** (Recommended)

```
1. Upload photo of painted piece
   ↓
2. Server processes:
   a) Resize/optimize (2000px max)
   b) Extract features (AI model)
   c) Generate fingerprint vector (384D)
   d) Store alongside photo
   ↓
3. Staff later finds piece post-kiln
   ↓
4. Upload post-kiln photo
   ↓
5. Server matches:
   a) Generate fingerprint for new photo
   b) Compare vectors (cosine similarity)
   c) Return likely matches
   ↓
6. Staff confirms match
   ↓
7. Link piece through kiln history
```

**Database Schema for Matching**

```sql
piece_photos
├── fingerprint_vector (pgvector/384)
├── fingerprint_json (JSONB - color histogram, edges, etc)
└── metadata

-- Search query
SELECT * FROM piece_photos
WHERE 1 - (fingerprint_vector <=> query_vector) > 0.85
ORDER BY similarity DESC
LIMIT 5;
```

## Real-Time Features

### WebSocket Subscriptions

**Booking Updates** (Live Dashboard)
```javascript
supabase
  .channel('bookings')
  .on('postgres_changes', 
       { event: 'INSERT', table: 'bookings' },
       (payload) => updateDashboard(payload.new))
  .subscribe();
```

**Piece Status Updates** (Customer Notifications)
```javascript
supabase
  .channel('pieces')
  .on('postgres_changes',
       { event: 'UPDATE', table: 'ceramic_pieces' },
       (payload) => notifyCustomer(payload.new))
  .subscribe();
```

### Notification Triggers

**Supabase Functions** (Optional Enhancement)

```sql
-- Trigger when piece status changes to "ready_for_collection"
CREATE FUNCTION notify_ready_for_collection()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'ready_for_collection' THEN
    INSERT INTO notifications (customer_id, notification_type, message)
    VALUES (NEW.customer_id, 'ready_for_collection', 
            'Your ' || NEW.piece_name || ' is ready to collect!');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER piece_ready_trigger
AFTER UPDATE ON ceramic_pieces
FOR EACH ROW
EXECUTE FUNCTION notify_ready_for_collection();
```

## Security Architecture

### Layers of Security

**1. Transport Layer**
- HTTPS enforced (Vercel/Render auto)
- TLS 1.3 minimum
- No plaintext transmission

**2. Authentication Layer**
- Supabase Auth (industry-standard)
- JWT tokens (non-expiring, verified server-side)
- Session storage in httpOnly cookies (frontend only)

**3. API Layer**
- Rate limiting (100 req/15min per IP)
- Request validation (Joi schemas)
- CORS restricted to known origins
- Helmet.js security headers

**4. Database Layer**
- Row Level Security (RLS) on all tables
- Service role key never exposed to client
- Audit logging of all mutations
- Encrypted connections to database

**5. Data Layer**
- No sensitive data in logs
- Photo encryption in transit and at rest
- Customer data isolated by studio_id
- Soft deletes preferred over hard deletes

### Environment Separation

**Development**
- Separate Supabase project
- Shared test data
- Debug logging enabled
- No rate limiting

**Staging**
- Mirror of production
- Realistic test data
- Square test mode
- Live URL logging

**Production**
- Separate Supabase project
- Live customer data
- Square live mode
- Error tracking (Sentry)
- Rate limiting enabled

## Monitoring & Observability

### Health Checks

```bash
# Backend health
GET /health
→ { status: 'ok', timestamp: '...' }

# Database connectivity
GET /ready
→ { ready: true }

# App stores
curl https://customer.glazeup.com
curl https://studio.glazeup.com
```

### Logging Strategy

**Backend Logs** (Pino)
```
[INFO] Database query: GET users (50ms)
[WARN] Rate limit exceeded: 192.168.1.1
[ERROR] Photo upload failed: storage error
```

**Frontend Errors** (Console + Sentry)
```
Error: RLS policy violation
Context: booking_id=123, user_id=456
```

**Database Logs** (Supabase Dashboard)
```
Query: SELECT * FROM bookings WHERE studio_id = $1
Time: 45ms
Rows: 12
```

### Metrics to Track

**Performance**
- API response times (target: <200ms)
- Photo upload success rate
- Database query times
- Frontend bundle size

**Business**
- Bookings per day
- Pieces created per session
- Photo upload rate
- Collection rate

**System Health**
- Uptime (target: 99.5%)
- Error rate (target: <1%)
- Database CPU usage
- Storage usage

## Scaling Considerations

### Current Capacity

- **Render Backend**: Handles ~1000 concurrent users
- **PostgreSQL**: ~10GB included (expandable)
- **Storage**: Unlimited piece photos (pay-per-usage)
- **Vercel**: Unlimited requests (generous free tier)

### Scaling Triggers

**Vertical Scaling** (When to upgrade instance)
- Backend CPU >75% sustained
- Database connections >80% of pool
- Storage approaching quota

**Horizontal Scaling** (When to add services)
- 10+ studios using simultaneously
- Peak booking rate >100/hour
- Concurrent pieces >1000 in kiln queue

### Optimization Opportunities

**Database**
- Add indexes on frequently queried fields
- Archive old completed bookings
- Partition piece photos by date

**Backend**
- Add Redis caching for studio stats
- Queue async jobs (email, photo processing)
- Connection pooling for database

**Frontend**
- Image lazy-loading for collections
- Pagination for bookings list
- Service worker for offline mode

## Disaster Recovery

### Backup Strategy

**Supabase (Automatic)**
- Daily backups (7-day retention)
- Point-in-time recovery available
- Upgrade for longer retention

**Manual Backup**
```bash
# Export all data
# Through Supabase dashboard or API
pg_dump connection_string > backup.sql
```

**Restore Procedure**
1. Create new Supabase project
2. Run schema SQL to recreate tables
3. Restore backup data
4. Update environment variables
5. Verify RLS policies in place

### Failure Scenarios

**Backend Down**
- Studio app shows maintenance page
- No new bookings/pieces possible
- Existing data preserved in Supabase
- Recovery: Render auto-restarts (1-2 min)

**Database Down**
- All services return 503
- Data safe in Supabase backups
- Recovery: Supabase restores from backup (<10 min)

**Storage Down**
- Photo uploads fail gracefully
- Existing photos still accessible
- Retry mechanism in place
- Recovery: S3 auto-replicates

## Cost Estimation

### Monthly Operating Costs (Typical Studio)

```
Supabase          $25-50
├── Database      (included)
├── Auth          (included)
└── Storage       $0.025 per GB

Render Backend    $7
├── Standard instance
└── Auto-scaling

Vercel Frontend   $0 (free tier)
├── Customer app
└── Studio app

Square Payments   2.9% + $0.30 per booking
├── Customer bookings only
└── Estimated $500/month studio = $14.50/month

Total/Month       $45-65 + payment fees
```

### Scaling Costs

```
100 Studios (SaaS model):
├── Supabase        $200 (pg instances)
├── Render          $50+ (multiple instances)
├── Vercel          $0 (included)
└── Total           $250+/month at scale

Revenue (5/booking):
├── 100 studios × 10 bookings/day = 1000/day
├── 30,000 bookings/month
├── 5% takerate = $1500/month revenue
└── Profitable scaling threshold: ~20-30 studios
```

---

**Architecture Version**: 1.0  
**Last Updated**: August 2026  
**Maintainer**: Daisy Green / kilnLINK Team
