# GlazeUp - Pottery Studio SaaS Platform

Complete pottery journey management system: discover → book → create → photograph → kiln → collect → remember → return.

## Overview

GlazeUp is a full-stack SaaS platform for pottery studios with integrated customer and staff applications. Manage bookings, track ceramic pieces through their entire lifecycle, run kiln workflows, and build customer loyalty.

### Core Features

**Customer App**
- Discover and book pottery studios
- Personal pottery gallery with permanent digital history
- Track pieces from creation through kiln firing to collection
- Loyalty program and rewards
- Notifications for piece status updates

**Studio App (Staff)**
- Real-time booking management
- Table allocation and customer check-in
- Ceramic piece tracking with photo matching
- Kiln batch management and firing workflows
- Inventory management
- Customer management and loyalty tracking
- Reporting and analytics

### Technology Stack

- **Frontend**: Next.js 14, React 18, Tailwind CSS, Framer Motion
- **Backend**: Node.js/Express, deployed to Render
- **Database**: Supabase PostgreSQL with Row Level Security
- **Authentication**: Supabase Auth
- **Storage**: Supabase Storage for piece photos
- **Payments**: Square integration
- **Deployment**: Render, Vercel (frontend)

## Architecture

```
glazeup/
├── backend/                 # Node.js/Express API
│   ├── server.js           # Main server with all routes
│   ├── package.json        # Dependencies
│   └── ...
├── apps/
│   ├── customer/           # Customer-facing React/Next.js app
│   │   ├── app/
│   │   ├── components/
│   │   ├── package.json
│   │   └── ...
│   └── studio/             # Staff management React/Next.js app
│       ├── app/
│       ├── components/
│       ├── package.json
│       └── ...
├── supabase_schema.sql     # Database schema with RLS
├── .env.example            # Environment variables template
└── README.md               # This file
```

## Data Model

### Core Entities

**Studios**: Master record for each pottery studio with configuration (table count, capacity)

**Users**: Staff and customers with role-based access
- Roles: owner, manager, staff, artist
- Staff manage studios; customers are part of a studio

**Customers**: Users who book and paint
- Loyalty tracking (points, visits, total spent)
- Personal preferences

**Bookings**: Sessions where customers paint
- Types: walk-in, scheduled, party, workshop, private-event
- Status: pending, confirmed, checked-in, completed, cancelled
- Payment integration with Square

**Ceramic Pieces**: Individual painted pots tracked through lifecycle
```
CREATED → PAINTED → DRYING → GLAZING → KILN_QUEUE → 
FIRING → QUALITY_CHECK → READY_FOR_COLLECTION → COLLECTED → ARCHIVED
```

**Piece Photos**: Before/after kiln photos with fingerprinting for matching

**Kiln Batches**: Firing runs with temperature, program, duration

**Loyalty**: Points-based engagement system (not subscription)
- Award points for visits, spending, referrals, workshops, events
- Manual adjustments by staff

### Database Schema Highlights

- Multi-studio support via `studio_id` on all operational records
- Row Level Security (RLS) for data isolation
- Immutable history tracking for pieces
- Trigger-based automatic customer stats updates
- Supabase Storage integration for piece photos

See `supabase_schema.sql` for complete schema.

## Setup & Deployment

### Prerequisites

- Node.js 18+
- Supabase project (free tier OK for development)
- Square account (for payments)
- Render account (for backend deployment)
- Git

### Local Development

1. **Clone repository**
   ```bash
   git clone <repository>
   cd glazeup
   ```

2. **Setup Supabase**
   - Create new project at supabase.com
   - Run migrations: Apply `supabase_schema.sql` to your project
   - Create storage bucket: `piece-photos`
   - Get your `SUPABASE_URL` and `SUPABASE_ANON_KEY`

3. **Configure environment**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your credentials
   ```

4. **Install dependencies and start**
   ```bash
   # Backend
   cd backend
   npm install
   npm run dev
   # Runs on http://localhost:3001

   # Customer app (new terminal)
   cd apps/customer
   npm install
   npm run dev
   # Runs on http://localhost:3000

   # Studio app (new terminal)
   cd apps/studio
   npm install
   npm run dev
   # Runs on http://localhost:3001 (configure via package.json)
   ```

### Production Deployment

#### Backend (Render)

```bash
# Push to GitHub (if not already)
git push

# Create Render web service:
# - Build: "cd backend && npm install"
# - Start: "cd backend && npm start"
# - Environment: Set all vars from .env.example
# - Instance: Standard or higher
```

#### Customer App (Vercel/Render)

```bash
# Deploy to Vercel (recommended):
# - Link GitHub repo
# - Root: apps/customer
# - Environment: Set NEXT_PUBLIC_* vars
# - Auto-deploys on push

# Or Render:
# - Build: "cd apps/customer && npm install && npm run build"
# - Start: "cd apps/customer && npm start"
```

#### Studio App (Vercel/Render)

```bash
# Deploy to Vercel:
# - Link GitHub repo
# - Root: apps/studio
# - Same env vars as customer app

# Or Render (separate service)
```

## API Endpoints

### Authentication

- `POST /api/auth/signup` - Register new user
- `POST /api/auth/login` - Login (handled by Supabase Auth)
- `POST /api/auth/logout` - Logout

### Studios

- `POST /api/studios` - Create studio (onboarding)
- `GET /api/studios/:studioId` - Get studio details

### Bookings

- `POST /api/bookings` - Create booking
- `GET /api/bookings` - Get bookings (studio staff)
- `PATCH /api/bookings/:bookingId/check-in` - Check in customer
- `PATCH /api/bookings/:bookingId/complete` - Complete booking

### Pieces

- `POST /api/pieces` - Create ceramic piece
- `POST /api/pieces/:pieceId/photos` - Upload piece photo
- `PATCH /api/pieces/:pieceId/status` - Update piece status
- `GET /api/customers/:customerId/pieces` - Get customer's pieces

### Kiln

- `POST /api/kiln-batches` - Create kiln batch
- `GET /api/kiln-batches` - Get batches
- `PATCH /api/kiln-batches/:batchId/status` - Update batch status

### Notifications

- `GET /api/notifications` - Get customer notifications
- `PATCH /api/notifications/:notificationId/read` - Mark as read

## Security

### Row Level Security (RLS)

All tables have RLS policies:
- **Studios**: Visible to users with matching studio_id
- **Customers**: Visible to their own user or studio staff
- **Bookings**: Visible to customer or studio staff
- **Pieces**: Visible to customer or studio staff

### API Security

- All endpoints protected with Supabase Auth
- Service role key only on backend (never exposed to client)
- Secure photo uploads with size limits and type validation
- Environment variables for sensitive credentials

### Data Protection

- HTTPS enforced in production
- Supabase RLS for data isolation
- Audit logging for all operations
- No sensitive data in logs

## Loyalty System

Loyalty is **engagement-based**, not subscription:

**Point Awards**
- Visit: 10 points
- Spending: 1 point per $5 spent
- Referral: 50 points
- Workshop attendance: 25 points
- Special events: varies

**Redemption**
- 100 points = £5 discount
- 250 points = £15 discount
- Custom rewards configured per studio

**Important**: Demo loyalty cards are **not payment cards**. They do not provide NFC, banking, or financial functionality—purely engagement tracking.

## Design System

### Color Palette (Kiln-Inspired)

- **Cream**: `#F7F2EA` - Background, light accents
- **Sand**: `#E6D6BF` - Secondary background
- **Clay**: `#C58C5B` - Primary action, highlights
- **Terracotta**: `#A85D35` - Hover states, emphasis
- **Charcoal**: `#2F2A26` - Text, dark accents

### Typography

- **Display**: Bold, 3-5xl for headings
- **Body**: Regular 16px, leading-relaxed
- **UI Labels**: Semibold 12-14px uppercase

### Components

- Rounded corners (20-24px) for cards
- Soft shadows and glassmorphism
- Smooth animations with Framer Motion
- Tactile, ceramic-inspired surfaces

## Development Guidelines

### Code Quality

1. **Preserve working functionality** - don't rebuild modules without reason
2. **Identify dependencies** before changing schemas
3. **Keep deployable** - never commit breaking changes
4. **Test user journeys** - not just individual components
5. **Document decisions** - especially architectural changes

### Before Changing Architecture

1. Inspect existing codebase
2. Preserve working functionality
3. Explain material changes before implementing
4. Check for dependencies in other modules
5. Keep test data separate from production

### Multi-Studio Considerations

- Always include `studio_id` on operational records
- Use RLS policies for data isolation
- Consider scaling in schema design
- Test with multiple studios in development

## Important Constraints

- **Loyalty is engagement-based**, not subscription
- **Demo cards are not payment cards** - must not imply financial functionality
- **AI spending must be controlled** - use usage limits and logging
- **Customer memories prefer archival** over deletion
- **Multi-studio capability in schema from the beginning**
- **Preserve existing kilnLINK/famLINK architecture** where practical

## Future Roadmap

- Multi-studio SaaS licensing model
- Digital pottery passport (exportable customer record)
- Advanced analytics dashboard
- Native mobile applications
- Expanded AI design tools
- Richer customer memory features
- Studio integrations (suppliers, partners)
- Video tutorials and inspiration library

## Support & Documentation

### Troubleshooting

**Pieces not matching after photo**
- Check photo quality (min 1000px)
- Verify storage bucket permissions
- Review fingerprint vectors in database

**Kiln status not updating**
- Check RLS policies for kiln_batches table
- Verify user has studio_id set
- Check audit logs for policy denials

**Notifications not sending**
- Verify customer_id linkage
- Check notification triggers in schema
- Review email configuration (if implemented)

### Adding Features

1. Update database schema if needed
2. Create migrations for schema changes
3. Update API endpoints
4. Update frontend components
5. Test complete user journey
6. Update this documentation

## License

Proprietary - All rights reserved to The Kiln Cafe Ltd / Daisy Green

---

**Last Updated**: August 2026
**Version**: 1.0.0 - Production Ready
