'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Pipette, Eye, PenTool, CalendarClock, Menu, X } from 'lucide-react';

const CUSTOMER_LINKS = [
  { label: 'Colour Picker', icon: <Pipette size={16} />, href: '/colour-picker' },
  { label: 'Design Preview', icon: <Eye size={16} />, href: '/design-preview' },
  { label: 'Transfer Designer', icon: <PenTool size={16} />, href: '/transfer-designer' },
  { label: 'My Bookings', icon: <CalendarClock size={16} />, href: '/my-bookings' },
];

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ minHeight: '100dvh', backgroundColor: 'var(--ivory)' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0.7rem 1rem', background: 'linear-gradient(135deg, var(--clay) 0%, #9A6435 100%)',
      }}>
        <img
          src="https://static.wixstatic.com/media/d0e5bd_2acf96e6189f4fbcb2159fae9f0a5674~mv2.png"
          alt="The Kiln Cafe"
          style={{ height: 26, filter: 'brightness(0) invert(1)' }}
        />
        <button
          onClick={() => setOpen(!open)}
          aria-label="More"
          style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
        >
          {open ? <X size={16} color="white" /> : <Menu size={16} color="white" />}
        </button>
      </div>

      {open && (
        <div style={{ backgroundColor: 'var(--charcoal)', padding: '0.5rem' }}>
          {CUSTOMER_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.8rem', color: 'var(--ivory)', textDecoration: 'none', fontSize: '0.85rem' }}
            >
              {l.icon} {l.label}
            </Link>
          ))}
        </div>
      )}

      {children}
    </div>
  );
}
