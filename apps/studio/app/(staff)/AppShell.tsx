'use client';

import { useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Home } from 'lucide-react';
import { ThemeProvider } from '@/components/ThemeContext';
import { StudioNavigation } from '@/components/StudioNavigation';

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  useEffect(() => {
    // Swipe-back: a rightward swipe starting near the left edge navigates back,
    // matching the brief's 'swipe-back gesture everywhere'.
    const handleTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const deltaX = touchEndX - touchStartX.current;
      const deltaY = Math.abs(touchEndY - touchStartY.current);

      const startedNearLeftEdge = touchStartX.current < 30;
      const swipedRightEnough = deltaX > 80;
      const mostlyHorizontal = deltaY < 50;

      if (startedNearLeftEdge && swipedRightEnough && mostlyHorizontal) {
        router.back();
      }
    };

    document.addEventListener('touchstart', handleTouchStart);
    document.addEventListener('touchend', handleTouchEnd);
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [router]);

  return (
    <ThemeProvider>
      <div className="flex" style={{ height: '100dvh' }}>
        <StudioNavigation />
        <main className="flex-1 overflow-auto" style={{ position: 'relative' }}>
          {pathname !== '/' && (
            <button
              onClick={() => router.push('/')}
              aria-label="Return to home"
              style={{
                position: 'fixed', top: '0.75rem', right: '0.75rem', zIndex: 20,
                width: 38, height: 38, borderRadius: '50%', border: 'none', cursor: 'pointer',
                backgroundColor: 'var(--charcoal)', color: 'var(--ivory)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
              }}
            >
              <Home size={18} />
            </button>
          )}
          {children}
        </main>
      </div>
    </ThemeProvider>
  );
}
