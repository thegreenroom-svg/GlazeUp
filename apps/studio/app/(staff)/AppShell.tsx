'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Home, RotateCcw, Loader2 } from 'lucide-react';
import { ThemeProvider } from '@/components/ThemeContext';
import { StudioNavigation } from '@/components/StudioNavigation';
import { NudgeProvider, HelpPanel } from '@/components/NudgeSystem';

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

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

  // Demo reset -- clears only the day-to-day demo state that piles up from
  // using Start Floor/Till/KDS/Photo Match (till items, finished-session
  // flags, photo match confirmations). Never touches real bookings, Square
  // data, or anything outside those three demo tables. For demoing only --
  // confirm-gated since it's destructive.
  const resetDemoData = async () => {
    if (!window.confirm('Reset today\'s demo data?\n\nThis clears till items, finished-session flags and photo matches for every table. Real bookings and Square data are not touched.')) {
      return;
    }
    setResetting(true);
    setResetMessage(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/reset`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Reset failed');
      setResetMessage(`Reset: ${data.till_items_deleted ?? 0} till items, ${data.session_status_deleted ?? 0} session flags, ${data.photo_matches_deleted ?? 0} photo matches cleared.`);
    } catch (err: any) {
      setResetMessage(`Reset failed: ${err.message || 'unknown error'}`);
    } finally {
      setResetting(false);
      setTimeout(() => setResetMessage(null), 5000);
    }
  };

  return (
    <ThemeProvider>
      <NudgeProvider>
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
        <HelpPanel title="How this page works" />

        {/* Demo reset -- bottom-left, subtle, confirm-gated. For demoing only. */}
        <button
          onClick={resetDemoData}
          disabled={resetting}
          aria-label="Reset today's demo data"
          title="Reset today's demo data (till, KDS, photo matches)"
          style={{
            position: 'fixed', bottom: '0.75rem', left: '0.75rem', zIndex: 20,
            width: 38, height: 38, borderRadius: '50%', border: 'none', cursor: resetting ? 'default' : 'pointer',
            backgroundColor: 'var(--stone)', color: 'var(--charcoal)', opacity: resetting ? 0.7 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
          }}
        >
          {resetting ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
        </button>
        {resetMessage && (
          <div
            style={{
              position: 'fixed', bottom: '3.5rem', left: '0.75rem', right: '0.75rem', zIndex: 20,
              maxWidth: 360, padding: '0.6rem 0.9rem', borderRadius: 8,
              backgroundColor: 'var(--charcoal)', color: 'var(--ivory)', fontSize: '0.75rem',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            }}
          >
            {resetMessage}
          </div>
        )}
      </NudgeProvider>
    </ThemeProvider>
  );
}
