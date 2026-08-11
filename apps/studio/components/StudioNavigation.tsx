'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home,
  Calendar,
  Palette,
  Zap,
  Users,
  Menu,
  X,
  TrendingUp,
  Package,
  Bell,
  UserCircle,
  PoundSterling,
  Receipt,
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

  const menuItems = [
    { label: 'Dashboard', icon: <Home className="w-5 h-5" />, href: '/' },
    { label: 'Bookings', icon: <Calendar className="w-5 h-5" />, href: '/bookings' },
    { label: 'Pieces', icon: <Palette className="w-5 h-5" />, href: '/pieces' },
    { label: 'Kiln Workflow', icon: <Zap className="w-5 h-5" />, href: '/kiln-workflow' },
    { label: 'Inventory', icon: <Package className="w-5 h-5" />, href: '/inventory' },
    { label: 'Customers', icon: <Users className="w-5 h-5" />, href: '/customers' },
    { label: 'Reports', icon: <TrendingUp className="w-5 h-5" />, href: '/reports' },
    { label: 'Money', icon: <PoundSterling className="w-5 h-5" />, href: '/money' },
    { label: 'Alerts', icon: <Bell className="w-5 h-5" />, href: '/alerts' },
    { label: 'Team', icon: <UserCircle className="w-5 h-5" />, href: '/team' },
    { label: 'Till', icon: <Receipt className="w-5 h-5" />, href: '/till' },
    { label: 'Photo Match', icon: <Camera className="w-5 h-5" />, href: '/photo-match' },
    { label: 'Shelf Sweep', icon: <Layers className="w-5 h-5" />, href: '/shelf-sweep' },
    { label: 'Lifecycle', icon: <GitBranch className="w-5 h-5" />, href: '/lifecycle' },
    { label: 'Loyalty', icon: <Award className="w-5 h-5" />, href: '/loyalty' },
    { label: 'Notifications', icon: <BellRing className="w-5 h-5" />, href: '/notifications' },
    { label: 'Analytics', icon: <BarChart3 className="w-5 h-5" />, href: '/analytics' },
    { label: 'Community', icon: <Sparkles className="w-5 h-5" />, href: '/community' },
    { label: 'Catalogue', icon: <Boxes className="w-5 h-5" />, href: '/catalogue' },
    { label: 'Billing', icon: <CreditCard className="w-5 h-5" />, href: '/billing' },
    { label: 'Customer View', icon: <QrCode className="w-5 h-5" />, href: '/customer' }
  ];

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const headerAndSearch = (
    <>
      <div className="px-4 py-3 border-b border-gray-800" style={{ background: 'linear-gradient(135deg, #E85D8A 0%, #C23F6B 100%)' }}>
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
              backgroundColor: '#1a1a2e',
              border: '1px solid #333',
              borderRadius: '6px',
              color: 'white',
              fontSize: '0.85rem',
            }}
          />
        </div>
      </div>
    </>
  );

  const menuList = (
    <div className="py-6">
      {menuItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => {
            if (isMobile) setIsOpen(false);
          }}
          className={`flex items-center gap-3 px-6 py-2 transition-all ${
            isActive(item.href) ? 'text-white border-r-4' : 'text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
          style={isActive(item.href) ? { backgroundColor: '#E85D8A', borderColor: '#C23F6B' } : {}}
        >
          {item.icon}
          <span className="font-medium text-sm">{item.label}</span>
        </Link>
      ))}
    </div>
  );

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 md:hidden text-white p-3 rounded-full shadow-lg"
        style={{ backgroundColor: '#E85D8A' }}
      >
        {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {/* Desktop sidebar */}
      {!isMobile && isOpen && (
        <nav className="relative w-64 bg-gray-900 text-white z-0 overflow-y-auto" style={{ height: '100dvh' }}>
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
              className="fixed inset-0 bg-black/50 z-30"
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
              className="fixed bottom-0 left-0 right-0 bg-gray-900 text-white z-40 overflow-y-auto"
              style={{ borderTopLeftRadius: '20px', borderTopRightRadius: '20px', maxHeight: '95dvh' }}
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
