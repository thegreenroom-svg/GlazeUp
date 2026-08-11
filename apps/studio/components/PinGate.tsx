'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Delete } from 'lucide-react';

const SESSION_KEY = 'glazeup_shift';

interface Shift {
  name: string | null;
  role: string | null;
  at: number;
}

// A shift lasts a working day. Long enough that nobody re-enters a PIN
// between every task, short enough that a shared iPad doesn't stay unlocked
// under yesterday's name.
const SHIFT_MS = 14 * 60 * 60 * 1000;

export default function PinGate({ children }: { children: React.ReactNode }) {
  const [shift, setShift] = useState<Shift | null>(null);
  const [checked, setChecked] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const s: Shift = JSON.parse(raw);
        if (Date.now() - s.at < SHIFT_MS) setShift(s);
        else sessionStorage.removeItem(SESSION_KEY);
      }
    } catch { /* first run or private mode */ }
    setChecked(true);
  }, []);

  const submit = async (value: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/pin/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: value }),
      });
      if (!res.ok) {
        setError('PIN not recognised');
        setPin('');
        return;
      }
      const data = await res.json();
      // When one PIN is shared across the team it identifies a shift, not a
      // person -- so don't greet someone by a name we haven't actually
      // established.
      const s: Shift = {
        name: data.shared ? null : data.staff?.name ?? null,
        role: data.shared ? null : data.staff?.role ?? null,
        at: Date.now(),
      };
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* private mode */ }
      setShift(s);
    } catch {
      setError('Could not check that PIN');
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  const press = (d: string) => {
    if (busy) return;
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length === 4) submit(next);
  };

  const signOut = () => {
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
    setShift(null);
    setPin('');
  };

  if (!checked) return null;

  if (!shift) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: 'linear-gradient(135deg, var(--clay) 0%, #9A6435 100%)' }}>
        <img
          src="https://static.wixstatic.com/media/d0e5bd_2acf96e6189f4fbcb2159fae9f0a5674~mv2.png"
          alt="The Kiln Cafe"
          style={{ height: 40, filter: 'brightness(0) invert(1)', marginBottom: '1.5rem' }}
        />

        <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.5rem' }}>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                width: 14, height: 14, borderRadius: '50%',
                backgroundColor: i < pin.length ? 'white' : 'rgba(255,255,255,0.3)',
              }}
            />
          ))}
        </div>

        {error && (
          <p style={{ color: 'white', fontSize: '0.85rem', marginBottom: '1rem', opacity: 0.9 }}>{error}</p>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 72px)', gap: '0.7rem' }}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button
              key={d}
              onClick={() => press(d)}
              style={{
                height: 72, borderRadius: '50%', border: 'none', cursor: 'pointer',
                background: 'rgba(255,255,255,0.2)', color: 'white', fontSize: '1.5rem', fontWeight: 300,
              }}
            >
              {d}
            </button>
          ))}
          <div />
          <button
            onClick={() => press('0')}
            style={{ height: 72, borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.2)', color: 'white', fontSize: '1.5rem', fontWeight: 300 }}
          >
            0
          </button>
          <button
            onClick={() => setPin(pin.slice(0, -1))}
            style={{ height: 72, borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'transparent', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            aria-label="Delete"
          >
            <Delete size={22} />
          </button>
        </div>

        <p style={{ color: 'white', opacity: 0.65, fontSize: '0.75rem', marginTop: '1.5rem', textAlign: 'center', maxWidth: 260 }}>
          Staff PIN to open the studio app.
        </p>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0.4rem 0.8rem' }}>
        <button
          onClick={signOut}
          style={{ background: 'none', border: 'none', color: '#999', fontSize: '0.75rem', cursor: 'pointer' }}
        >
          {shift.name ? `${shift.name} · sign out` : 'Sign out'}
        </button>
      </div>
      {children}
    </motion.div>
  );
}
