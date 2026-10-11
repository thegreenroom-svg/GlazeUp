'use client';

// [11 Oct] Overdue lives on Collect now: overdue bookings sit at the top of
// "Hand over" and "To pack" in red, with a call button. This address is
// kept so old links and bookmarks still land somewhere useful.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function OverdueMoved() {
  const router = useRouter();
  useEffect(() => { router.replace('/collect'); }, [router]);
  return <p style={{ padding: '1.5rem', color: '#777' }}>Overdue is on Collect now…</p>;
}
