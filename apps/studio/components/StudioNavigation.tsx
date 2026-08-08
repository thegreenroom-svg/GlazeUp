'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSession, useSupabaseClient } from '@supabase/auth-helpers-react';
import {
  Home,
  Calendar,
  Palette,
  Zap,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  TrendingUp,
  Package
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function StudioNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const session = useSession();
  const supabase = useSupabaseClient();
  const [isOpen, setIsOpen] = useState(true);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/auth/login');
  };

  const menuItems = [
    { label: 'Dashboard', icon: <Home className="w-5 h-5" />, href: '/' },
    { label: 'Bookings', icon: <Calendar className="w-5 h-5" />, href: '/bookings' },
    { label: 'Pieces', icon: <Palette className="w-5 h-5" />, href: '/pieces' },
    { label: 'Kiln Workflow', icon: <Zap className="w-5 h-5" />, href: '/kiln-workflow' },
    { label: 'Inventory', icon: <Package className="w-5 h-5" />, href: '/inventory' },
    { label: 'Customers', icon: <Users className="w-5 h-5" />, href: '/customers' },
    { label: 'Reports', icon: <TrendingUp className="w-5 h-5" />, href: '/reports' },
    { label: 'Settings', icon: <Settings className="w-5 h-5" />, href: '/settings' }
  ];

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* Mobile Toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 md:hidden bg-blue-600 text-white p-3 rounded-full shadow-lg"
      >
        {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {/* Sidebar */}
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
              <p className="text-sm text-gray-400 mt-1">Studio Management</p>
            </div>

            {/* Menu Items */}
            <div className="py-6">
              {menuItems.map((item, i) => (
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

            {/* Footer */}
            <div className="absolute bottom-0 w-full border-t border-gray-800 p-4">
              <div className="mb-4 px-2">
                <p className="text-xs text-gray-500">{session?.user?.email}</p>
              </div>
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-4 py-2 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors"
              >
                <LogOut className="w-5 h-5" />
                <span>Sign Out</span>
              </button>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>

      {/* Mobile Backdrop */}
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
