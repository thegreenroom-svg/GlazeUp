'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  Camera
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function StudioNavigation() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Default open on desktop, closed on mobile
    setIsOpen(window.innerWidth >= 768);
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
    { label: 'Photo Match', icon: <Camera className="w-5 h-5" />, href: '/photo-match' }
  ];

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 md:hidden bg-blue-600 text-white p-3 rounded-full shadow-lg"
      >
        {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.nav
            initial={{ x: -256 }}
            animate={{ x: 0 }}
            exit={{ x: -256 }}
            className="fixed md:relative w-64 h-screen bg-gray-900 text-white z-40 md:z-0 overflow-y-auto"
          >
            <div className="p-6 border-b border-gray-800">
              <h1 className="text-2xl font-bold text-blue-400">GlazeUp</h1>
              <p className="text-sm text-gray-400 mt-1">Read-only demo</p>
            </div>

            <div className="py-6">
              {menuItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => {
                    if (window.innerWidth < 768) {
                      setIsOpen(false);
                    }
                  }}
                  className={`flex items-center gap-3 px-6 py-3 transition-all ${
                    isActive(item.href)
                      ? 'bg-blue-600 text-white border-r-4 border-blue-400'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  {item.icon}
                  <span className="font-medium">{item.label}</span>
                </Link>
              ))}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-black/50 md:hidden z-30"
          />
        )}
      </AnimatePresence>
    </>
  );
}
