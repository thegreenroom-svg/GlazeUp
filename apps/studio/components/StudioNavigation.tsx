'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home,
  Calendar,
  Palette,
  Zap,
  Flame,
  Users,
  Menu,
  X,
  TrendingUp,
  Package,
  Bell,
  UserCircle,
  PoundSterling,
  Camera,
  MapPin,
  FlaskConical,
  GitBranch,
  Award,
  BellRing,
  BarChart3,
  Sparkles,
  CreditCard,
  Boxes,
  QrCode,
  Pipette,
  Eye,
  PenTool,
  ShieldCheck,
  HeartPulse,
  GraduationCap,
  Library,
  Truck,
  CalendarClock, CalendarDays,
  Globe2,
  UserSquare2,
  Stamp,
  Footprints,
  ChefHat,
  PrinterIcon,
  RefreshCw as RefreshIcon,
  Search,
  Sun,
  Moon
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from './ThemeContext';

export function StudioNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const checkSize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      setIsOpen(!mobile);
    };
    checkSize();
    window.addEventListener('resize', checkSize);
    return () => window.removeEventListener('resize', checkSize);
  }, []);

  // Diagnostics are MINE, not the product's. test-ai, the two Square
  // diagnostic pages, party-size recovery and needs-verification are
  // workbench tools built to debug this studio's data. A second studio
  // opening a menu with "Test AI" in the daily-workflow section loses
  // confidence in the whole thing before they've used it. They still
  // exist and still work at their URLs -- they're just not advertised
  // unless this env var is set.
  const showDiagnostics = process.env.NEXT_PUBLIC_SHOW_DIAGNOSTICS === 'true';

  // Four surfaces, not forty. The app had 39 staff pages, each with its
  // own front door, which is navigable if you built it and bewildering
  // if you didn't. The insight is that a piece of pottery has ONE life
  // -- painted, photographed, fired, found, collected -- and ten of
  // these screens were describing five states of it. Nobody thinks "I
  // need the Completion screen"; they think "where is Charlie's plate".
  //
  // So this groups by the question being asked, not by the screen that
  // happens to answer it. Nothing is deleted and every URL still works
  // -- this is navigation, which is reversible, rather than surgery on
  // 1,400 lines of working till logic, which is not.
  const menuGroups: { section: string; items: { label: string; icon: React.ReactNode; href: string }[] }[] = [
    {
      // The Schedule is the way in, not one option among five. Everything
      // operational happens TO a booking -- running the session, printing
      // its card, packing its pottery -- and all of that is now reachable
      // from the booking itself. These stay listed because a menu you
      // can't find a page in is its own problem, but the day comes first
      // and the rest are the back door.
      section: 'Today',
      items: [
        { label: 'The Day', icon: <CalendarDays className="w-5 h-5" />, href: '/schedule' },
        { label: 'Bookings', icon: <Calendar className="w-5 h-5" />, href: '/bookings' },
        { label: 'Start Floor', icon: <Footprints className="w-5 h-5" />, href: '/floor' },
        { label: 'Print Cards', icon: <PrinterIcon className="w-5 h-5" />, href: '/daily-cards' },
        { label: 'Alerts', icon: <Bell className="w-5 h-5" />, href: '/alerts' },
      ],
    },
    {
      // The piece's whole journey, in the order it actually happens.
      // These five were scattered across two groups and a "rarely
      // needed" bin, despite being the core of what the studio does.
      // Ordered by the piece's actual life -- stamped, fired, found,
      // packed, posted -- rather than by when each screen happened to get
      // built. Eight entries down to six, and every one of these can
      // CHANGE something. The three read-only views that used to sit here
      // (Kiln Workflow, Collections, Lifecycle) moved to Business, because
      // that is what they are: reports. Between them they were 324 lines
      // and zero writes -- three separate front doors onto the same
      // question, "where are pieces up to", none of which could act on the
      // answer, cluttering the group used with pottery in hand.
      section: 'Pieces',
      items: [
        { label: 'All Pieces', icon: <Palette className="w-5 h-5" />, href: '/pieces' },
        { label: 'Stamp a Piece', icon: <Stamp className="w-5 h-5" />, href: '/completion' },
        { label: 'Kiln Batches', icon: <Flame className="w-5 h-5" />, href: '/kiln-batch' },
        // Photograph a table and it reads the chalk tag to find the
        // booking -- no need to know whose pottery it is first. I filed
        // this under Diagnostics during the navigation cleanup because of
        // its name; it is not a diagnostic, it is one of the few tools
        // that works the way the studio actually works: pottery in front
        // of you, name unknown. Hiding it took away a daily capability.
        { label: 'Whose is this?', icon: <Camera className="w-5 h-5" />, href: '/photo-match' },
        { label: 'Find on Table', icon: <MapPin className="w-5 h-5" />, href: '/find-on-table' },
        { label: 'Packing', icon: <Package className="w-5 h-5" />, href: '/packing' },
        // Renamed from "Kiln — Collection & Post". It was competing with
        // Kiln Batches for the same mental slot while its genuinely unique
        // job is postal labels and the (parked) ready email. Named for
        // what it actually does.
        { label: 'Postal & Labels', icon: <Truck className="w-5 h-5" />, href: '/kiln-dip' },
      ],
    },
    {
      // Per Daisy: "all the reporting stuff, the finances, that could be
      // separate, find somewhere else." Nobody opens the finances with a
      // customer at the counter, so it sits below the two sections that
      // are used with pottery in hand.
      section: 'Business',
      items: [
        { label: 'Dashboard', icon: <Home className="w-5 h-5" />, href: '/dashboard' },
        { label: 'Takings', icon: <PoundSterling className="w-5 h-5" />, href: '/money' },
        { label: 'Customers', icon: <Users className="w-5 h-5" />, href: '/customers' },
        { label: 'Bisque Stock', icon: <Package className="w-5 h-5" />, href: '/inventory' },
        { label: 'Reports', icon: <TrendingUp className="w-5 h-5" />, href: '/reports' },
        { label: 'Analytics', icon: <BarChart3 className="w-5 h-5" />, href: '/analytics' },
        // One read-only view kept, not three. Kiln Workflow, Collections
        // Due and Piece Lifecycle were three separate front doors onto the
        // same question -- "where are pieces up to" -- with 324 lines and
        // zero writes between them. Moving all three here would have taken
        // Business from 6 entries to 9, which is reshuffling clutter
        // rather than removing it.
        //
        // Collections Due is the one with an operational use (who is owed
        // pottery), so it stays in the menu. The other two remain fully
        // working pages and stay in the Jump-to search -- findable by name,
        // just not occupying a slot in a list read at a counter.
        { label: 'Collections Due', icon: <Library className="w-5 h-5" />, href: '/collections' },
      ],
    },
    {
      // Set up once, touched rarely. Grouping these together is what
      // lets the three sections above stay short.
      section: 'Studio',
      items: [
        { label: 'Team', icon: <UserCircle className="w-5 h-5" />, href: '/team' },
        { label: 'Roles & Studio', icon: <ShieldCheck className="w-5 h-5" />, href: '/roles' },
        { label: 'Health & Safety', icon: <HeartPulse className="w-5 h-5" />, href: '/health-safety' },
        { label: 'Training', icon: <GraduationCap className="w-5 h-5" />, href: '/training' },
        { label: 'Catalogue', icon: <Boxes className="w-5 h-5" />, href: '/catalogue' },
        { label: 'Our Profile', icon: <UserSquare2 className="w-5 h-5" />, href: '/our-profile' },
        { label: 'Notifications', icon: <BellRing className="w-5 h-5" />, href: '/notifications' },
        { label: 'Billing', icon: <CreditCard className="w-5 h-5" />, href: '/billing' },
      ],
    },
    {
      // Customer-facing surfaces. Separated because they're a different
      // audience -- staff open these to hand the iPad over.
      section: 'For customers',
      items: [
        { label: 'Colour Picker', icon: <Pipette className="w-5 h-5" />, href: '/colour-picker' },
        { label: 'Design Preview', icon: <Eye className="w-5 h-5" />, href: '/design-preview' },
        { label: 'Transfer Designer', icon: <PenTool className="w-5 h-5" />, href: '/transfer-designer' },
        { label: 'Customer View', icon: <QrCode className="w-5 h-5" />, href: '/customer' },
        { label: 'My Bookings', icon: <CalendarClock className="w-5 h-5" />, href: '/my-bookings' },
      ],
    },
    {
      // Platform-level features that belong to GlazeUp-the-business
      // rather than to running a studio on a Tuesday.
      section: 'Platform',
      items: [
        { label: 'Loyalty', icon: <Award className="w-5 h-5" />, href: '/loyalty' },
        { label: 'Community', icon: <Sparkles className="w-5 h-5" />, href: '/community' },
        { label: 'Studios Worldwide', icon: <Globe2 className="w-5 h-5" />, href: '/studios-worldwide' },
        { label: 'KDS', icon: <ChefHat className="w-5 h-5" />, href: '/kds' },
      ],
    },
    ...(showDiagnostics ? [{
      section: 'Diagnostics',
      items: [
        { label: 'Test AI', icon: <FlaskConical className="w-5 h-5" />, href: '/test-ai' },
        { label: 'Ticket Link Check', icon: <FlaskConical className="w-5 h-5" />, href: '/ticket-link' },
        { label: 'Square Access Check', icon: <ShieldCheck className="w-5 h-5" />, href: '/square-access' },
        { label: 'Needs Verification', icon: <ShieldCheck className="w-5 h-5" />, href: '/needs-verification' },
        { label: 'Recover Party Sizes', icon: <RefreshIcon className="w-5 h-5" />, href: '/backfill-party-sizes' },
      ],
    }] : []),
  ];

  // Flat list behind the "Jump to..." search. Deliberately includes the
  // diagnostic pages even when they're hidden from the menu -- they're
  // hidden from a new studio, not taken away from whoever knows to look
  // for them by name.
  const menuItems = [
    ...menuGroups.flatMap((g) => g.items),
    // Pinned above the groups rather than inside one, so it isn't in
    // menuGroups -- but it still needs to be findable by name.
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Schedule', href: '/schedule' },
    { label: 'Test AI', href: '/test-ai' },
    { label: 'Ticket Link Check', href: '/ticket-link' },
    { label: 'Square Access Check', href: '/square-access' },
    { label: 'Kiln Workflow', href: '/kiln-workflow' },
    { label: 'Piece Lifecycle', href: '/lifecycle' },
    { label: 'Photo Match', href: '/photo-match' },
    { label: 'Needs Verification', href: '/needs-verification' },
    { label: 'Recover Party Sizes', href: '/backfill-party-sizes' },
    { label: 'Square Diagnostic', href: '/square-diagnostic' },
    { label: 'Square Bookings Diagnostic', href: '/square-bookings-diagnostic' },
  ];

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const headerAndSearch = (
    <>
      <div className="px-4 py-3 border-b border-gray-800" style={{ background: 'linear-gradient(135deg, var(--clay) 0%, #9A6435 100%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <img
            src="https://static.wixstatic.com/media/d0e5bd_2acf96e6189f4fbcb2159fae9f0a5674~mv2.png"
            alt="The Kiln Cafe"
            style={{ height: '28px', filter: 'brightness(0) invert(1)' }}
          />
          <button
            onClick={toggleTheme}
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            aria-label="Toggle dark mode"
          >
            {theme === 'dark' ? <Sun size={14} color="white" /> : <Moon size={14} color="white" />}
          </button>
        </div>
      </div>

      <div style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #333' }}>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: '#888' }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const match = menuItems.find((m) => m.label.toLowerCase().includes(query.toLowerCase()));
                if (match) {
                  router.push(match.href);
                  setQuery('');
                  if (isMobile) setIsOpen(false);
                }
              }
            }}
            placeholder="Jump to..."
            style={{
              width: '100%',
              padding: '0.4rem 0.6rem 0.4rem 1.8rem',
              backgroundColor: 'var(--charcoal)',
              border: '1px solid var(--stone)',
              borderRadius: '6px',
              color: 'var(--ivory)',
              fontSize: '0.85rem',
            }}
          />
        </div>
      </div>
    </>
  );

  const itemLink = (item: { label: string; icon: React.ReactNode; href: string }) => (
    <Link
      key={item.href}
      href={item.href}
      onClick={() => {
        if (isMobile) setIsOpen(false);
      }}
      className={`flex items-center gap-2 px-3 py-1.5 transition-all ${
        isActive(item.href) ? 'text-white' : 'text-gray-400 hover:text-white hover:opacity-80'
      }`}
      style={{
        fontSize: '0.8rem',
        ...(isActive(item.href) ? { backgroundColor: 'var(--clay)', borderRadius: '4px' } : {}),
      }}
    >
      {item.icon}
      <span className="font-medium" style={{ fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
    </Link>
  );

  const menuList = (
    <div className="py-3">
      <div style={{ padding: '0 0.75rem 0.5rem' }}>
        {itemLink({ label: 'The Day', icon: <CalendarDays className="w-5 h-5" />, href: '/schedule' })}
      </div>
      {menuGroups.map((g) => (
        <div key={g.section} style={{ marginBottom: '0.5rem' }}>
          <p style={{ padding: '0.5rem 0.75rem 0.2rem', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--stone)', borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: '0.3rem' }}>
            {g.section}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            {g.items.map(itemLink)}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 md:hidden text-white p-3 rounded-full shadow-lg no-print"
        style={{ backgroundColor: 'var(--clay)' }}
      >
        {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {/* Desktop sidebar */}
      {!isMobile && isOpen && (
        <nav className="relative w-64 text-white z-0 overflow-y-auto no-print" style={{ height: '100dvh', backgroundColor: 'var(--charcoal)' }}>
          {headerAndSearch}
          {menuList}
        </nav>
      )}

      {/* Mobile bottom sheet */}
      <AnimatePresence>
        {isMobile && isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/50 z-30 no-print"
            />
            <motion.nav
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.5 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 100) setIsOpen(false);
              }}
              className="fixed bottom-0 left-0 right-0 text-white z-40 overflow-y-auto no-print"
              style={{ borderTopLeftRadius: '20px', borderTopRightRadius: '20px', maxHeight: '95dvh', backgroundColor: 'var(--charcoal)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'center', padding: '0.6rem 0 0' }}>
                <div style={{ width: '36px', height: '4px', borderRadius: '2px', backgroundColor: '#555' }} />
              </div>
              {headerAndSearch}
              {menuList}
            </motion.nav>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
