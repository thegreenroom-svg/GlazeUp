'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Home } from 'lucide-react';
import { ThemeProvider } from '@/components/ThemeContext';
import { StudioNavigation } from '@/components/StudioNavigation';
import { NudgeProvider, HelpPanel, NudgeSettingsPanel } from '@/components/NudgeSystem';

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
      <NudgeProvider>
        <div className="flex" style={{ height: '100dvh' }}>
          <StudioNavigation />
          {/* Real fix for the floating menu button overlapping content
              (Daisy: "the menu tab, which is currently sitting over one
              of the tiles on my iPhone"). The button is fixed
              bottom-right on mobile; this reserves real space beneath
              every page's content so nothing can sit under it. */}
          <main className="flex-1 overflow-auto pb-24 md:pb-0" style={{ position: 'relative' }}>
            {pathname !== '/' && (
              <button
                onClick={() => router.push('/')}
                aria-label="Return to home"
                className="no-print"
                style={{
                  // Moved from top-right to bottom-LEFT. Top-right sits
                  // directly under Safari's own controls and the app's
                  // "Reset a PIN / sign out" bar on iPhone -- visible in
                  // nearly every screenshot this session, overlapping
                  // both. Bottom-left is clear of Safari's chrome and of
                  // the menu button (bottom-right), so the two never
                  // compete.
                  position: 'fixed', bottom: '1rem', left: '1rem', zIndex: 20,
                  width: 44, height: 44, borderRadius: '50%', border: 'none', cursor: 'pointer',
                  backgroundColor: 'var(--charcoal)', color: 'var(--ivory)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                }}
              >
                <Home size={20} />
              </button>
            )}
            {children}
          </main>
        </div>
        <HelpPanel title="How this page works" />
        <NudgeSettingsPanel />
      </NudgeProvider>
    </ThemeProvider>
  );
}
