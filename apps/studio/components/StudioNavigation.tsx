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
  Layers,
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
  CalendarClock,
  Globe2,
  UserSquare2,
  Stamp,
  Footprints,
  ChefHat,
  PrinterIcon,
  FlaskConical,
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

  const menuGroups: { section: string; items: { label: string; icon: React.ReactNode; href: string }[] }[] = [
    {
      section: 'Daily Workflow',
      items: [
        { label: 'Start Floor', icon: <Footprints className="w-5 h-5" />, href: '/floor' },
        { label: 'Print Cards', icon: <PrinterIcon className="w-5 h-5" />, href: '/daily-cards' },
        { label: 'Bookings', icon: <Calendar className="w-5 h-5" />, href: '/bookings' },
        { label: 'Recover Party Sizes', icon: <RefreshIcon className="w-5 h-5" />, href: '/backfill-party-sizes' },
        { label: 'Needs Verification', icon: <ShieldCheck className="w-5 h-5" />, href: '/needs-verification' },
        { label: 'KDS', icon: <ChefHat className="w-5 h-5" />, href: '/kds' },
        { label: 'Photo Match', icon: <Camera className="w-5 h-5" />, href: '/photo-match' },
        { label: 'Shelf Sweep', icon: <Layers className="w-5 h-5" />, href: '/shelf-sweep' },
        { label: 'Test AI', icon: <FlaskConical className="w-5 h-5" />, href: '/test-ai' },
        { label: 'Completion', icon: <Stamp className="w-5 h-5" />, href: '/completion' },
      ],
    },
    {
      section: 'Studio',
      items: [
        { label: 'Pieces', icon: <Palette className="w-5 h-5" />, href: '/pieces' },
        { label: 'Kiln Workflow', icon: <Zap className="w-5 h-5" />, href: '/kiln-workflow' },
        { label: 'Kiln — Dip & Fire', icon: <Flame className="w-5 h-5" />, href: '/kiln-dip' },
        { label: 'Inventory', icon: <Package className="w-5 h-5" />, href: '/inventory' },
        { label: 'Lifecycle', icon: <GitBranch className="w-5 h-5" />, href: '/lifecycle' },
        { label: 'Catalogue', icon: <Boxes className="w-5 h-5" />, href: '/catalogue' },
      ],
    },
    {
      section: 'Business',
      items: [
        { label: 'Customers', icon: <Users className="w-5 h-5" />, href: '/customers' },
        { label: 'Reports', icon: <TrendingUp className="w-5 h-5" />, href: '/reports' },
        { label: 'Money', icon: <PoundSterling className="w-5 h-5" />, href: '/money' },
        { label: 'Analytics', icon: <BarChart3 className="w-5 h-5" />, href: '/analytics' },
        { label: 'Billing', icon: <CreditCard className="w-5 h-5" />, href: '/billing' },
        { label: 'Loyalty', icon: <Award className="w-5 h-5" />, href: '/loyalty' },
      ],
    },
    {
      section: 'Creative Tools',
      items: [
        { label: 'Colour Picker', icon: <Pipette className="w-5 h-5" />, href: '/colour-picker' },
        { label: 'Design Preview', icon: <Eye className="w-5 h-5" />, href: '/design-preview' },
        { label: 'Transfer Designer', icon: <PenTool className="w-5 h-5" />, href: '/transfer-designer' },
      ],
    },
    {
      section: 'Community',
      items: [
        { label: 'Community', icon: <Sparkles className="w-5 h-5" />, href: '/community' },
        { label: 'Studios Worldwide', icon: <Globe2 className="w-5 h-5" />, href: '/studios-worldwide' },
        { label: 'Our Profile', icon: <UserSquare2 className="w-5 h-5" />, href: '/our-profile' },
        { label: 'Collections', icon: <Library className="w-5 h-5" />, href: '/collections' },
        { label: 'My Bookings', icon: <CalendarClock className="w-5 h-5" />, href: '/my-bookings' },
        { label: 'Customer View', icon: <QrCode className="w-5 h-5" />, href: '/customer' },
      ],
    },
    {
      section: 'Admin',
      items: [
        { label: 'Team', icon: <UserCircle className="w-5 h-5" />, href: '/team' },
        { label: 'Alerts', icon: <Bell className="w-5 h-5" />, href: '/alerts' },
        { label: 'Notifications', icon: <BellRing className="w-5 h-5" />, href: '/notifications' },
        { label: 'Roles & Studio', icon: <ShieldCheck className="w-5 h-5" />, href: '/roles' },
        { label: 'Health & Safety', icon: <HeartPulse className="w-5 h-5" />, href: '/health-safety' },
        { label: 'Training', icon: <GraduationCap className="w-5 h-5" />, href: '/training' },
      ],
    },
  ];
  // Flattened for isActive() lookups and anything else expecting a plain list.
  const menuItems = [
    { label: 'Dashboard', icon: <Home className="w-5 h-5" />, href: '/' },
    ...menuGroups.flatMap((g) => g.items),
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
        {itemLink({ label: 'Dashboard', icon: <Home className="w-5 h-5" />, href: '/' })}
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
