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
      section: 'The four steps',
      items: [
        { label: 'Print cards', icon: <PrinterIcon className="w-5 h-5" />, href: '/daily-cards' },
        { label: 'Photograph the table', icon: <Camera className="w-5 h-5" />, href: '/floor' },
        { label: 'Into the kiln', icon: <Flame className="w-5 h-5" />, href: '/kiln-batch' },
        { label: 'Packing', icon: <Package className="w-5 h-5" />, href: '/packing' },
      ],
    },
    {
      // Not steps in the workflow -- the things the four steps refer TO.
      // The day is how you find a booking in the first place, collection
      // is the handover at the end, and postal covers what doesn't get
      // collected in person.
      section: 'Around the day',
      items: [
        { label: 'The Day', icon: <CalendarDays className="w-5 h-5" />, href: '/schedule' },
        { label: 'Bookings', icon: <CalendarDays className="w-5 h-5" />, href: '/bookings' },
        { label: 'Collection', icon: <Package className="w-5 h-5" />, href: '/collect' },
        { label: 'Postal & Labels', icon: <Truck className="w-5 h-5" />, href: '/kiln-dip' },
        { label: 'Test AI', icon: <FlaskConical className="w-5 h-5" />, href: '/test-ai' },
      ],
    },
    ...(showDiagnostics ? [{
      section: 'Diagnostics',
      items: [
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
    { label: 'Schedule', href: '/schedule' },
    { label: 'Ticket Link Check', href: '/ticket-link' },
    { label: 'Square Access Check', href: '/square-access' },
    { label: 'Needs Verification', href: '/needs-verification' },
    { label: 'Recover Party Sizes', href: '/backfill-party-sizes' },
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
