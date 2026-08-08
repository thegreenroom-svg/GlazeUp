'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSession, useSupabaseClient } from '@supabase/auth-helpers-react';
import { Menu, X, LogOut, Home, Calendar, Palette, Award } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function Navigation() {
  const session = useSession();
  const supabase = useSupabaseClient();
  const [isOpen, setIsOpen] = useState(false);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setIsOpen(false);
  };

  const navItems = [
    { label: 'Home', href: '/', icon: <Home className="w-4 h-4" /> },
    { label: 'Book', href: '/bookings', icon: <Calendar className="w-4 h-4" /> },
    { label: 'Collection', href: '/collection', icon: <Palette className="w-4 h-4" /> },
    { label: 'Rewards', href: '/rewards', icon: <Award className="w-4 h-4" /> }
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-sand/30 shadow-soft">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="text-2xl font-bold text-clay">
            GlazeUp
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            {session && navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2 text-charcoal/70 hover:text-clay transition-colors"
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
          </div>

          {/* Auth Buttons */}
          <div className="flex items-center gap-4">
            {session ? (
              <>
                <span className="hidden md:inline text-sm text-charcoal/60">
                  {session.user?.email}
                </span>
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-2 text-charcoal/70 hover:text-terracotta transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden md:inline">Sign Out</span>
                </button>
              </>
            ) : (
              <>
                <Link href="/auth/login" className="hidden md:block text-clay hover:text-terracotta font-semibold">
                  Sign In
                </Link>
                <Link href="/auth/signup" className="btn btn-primary text-sm py-2 px-4">
                  Sign Up
                </Link>
              </>
            )}

            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="md:hidden p-2 hover:bg-sand/30 rounded-lg"
            >
              {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden mt-4 pt-4 border-t border-sand/30"
            >
              {session && (
                <>
                  {navItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setIsOpen(false)}
                      className="flex items-center gap-2 py-2 text-charcoal/70 hover:text-clay transition-colors"
                    >
                      {item.icon}
                      {item.label}
                    </Link>
                  ))}
                  <button
                    onClick={handleSignOut}
                    className="flex items-center gap-2 py-2 text-charcoal/70 hover:text-terracotta transition-colors w-full"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </>
              )}
              {!session && (
                <>
                  <Link
                    href="/auth/login"
                    onClick={() => setIsOpen(false)}
                    className="block py-2 text-clay hover:text-terracotta font-semibold"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/auth/signup"
                    onClick={() => setIsOpen(false)}
                    className="block py-2 text-clay hover:text-terracotta font-semibold"
                  >
                    Sign Up
                  </Link>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </nav>
  );
}
