'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { PageHeader } from '@/components/PageStatus';

interface Config {
  studio: { name: string; city: string | null; slug: string | null } | null;
  tables: { id: string; name: string; room: string | null; capacity: number }[];
  table_count: number;
  total_seats: number;
  team_size: number;
  roles: string[];
}

// Spec section 17: what each role can reach.
const PERMISSIONS: { area: string; owner: boolean; manager: boolean; staff: boolean; artist: boolean }[] = [
  { area: 'Bookings & till', owner: true, manager: true, staff: true, artist: true },
  { area: 'Piece lifecycle & kiln', owner: true, manager: true, staff: true, artist: true },
  { area: 'Photo match & shelf sweep', owner: true, manager: true, staff: true, artist: true },
  { area: 'Customers & loyalty', owner: true, manager: true, staff: true, artist: false },
  { area: 'Reports & analytics', owner: true, manager: true, staff: false, artist: false },
  { area: 'Team & rotas', owner: true, manager: true, staff: false, artist: false },
  { area: 'Money & takings', owner: true, manager: true, staff: false, artist: false },
  { area: 'Billing & subscription', owner: true, manager: false, staff: false, artist: false },
  { area: 'Studio settings & branding', owner: true, manager: false, staff: false, artist: false },
];

const ROLE_KEYS = ['owner', 'manager', 'staff', 'artist'] as const;

export default function RolesPage() {
  const [data, setData] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/studio-config`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError('Could not load studio config.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem', maxWidth: '700px' }}>
      <PageHeader title="Roles & Studio" subtitle="Who can reach what, and how this studio is set up." />

      <div style={{ padding: '0.7rem 0.9rem', backgroundColor: '#fff8e1', border: '1px solid #ffca28', borderRadius: '6px', fontSize: '0.8rem', marginBottom: '1.5rem' }}>
        This shows the permission model. Nothing is enforced yet — this app has no login, so every page is currently reachable by anyone with the address.
      </div>

      {loading && <p style={{ color: '#666' }}>Loading...</p>}
      {error && <div style={{ padding: '1rem', backgroundColor: '#fee', color: '#c33', borderRadius: '4px' }}>{error}</div>}

      {data && (
        <>
          {data.studio && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem', marginBottom: '1.5rem' }}>
              {[
                { label: 'Tables', value: data.table_count },
                { label: 'Seats', value: data.total_seats },
                { label: 'Team', value: data.team_size },
              ].map((s) => (
                <div key={s.label} style={{ padding: '0.9rem', backgroundColor: 'white', border: '1px solid #eee', borderRadius: '8px', textAlign: 'center' }}>
                  <p style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--clay)' }}>{s.value}</p>
                  <p style={{ fontSize: '0.7rem', color: '#999' }}>{s.label}</p>
                </div>
              ))}
            </div>
          )}

          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.6rem' }}>Permissions</h2>
          <div style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.4rem', borderBottom: '1px solid #ddd' }}>Area</th>
                  {ROLE_KEYS.map((r) => (
                    <th key={r} style={{ padding: '0.5rem 0.3rem', borderBottom: '1px solid #ddd', textTransform: 'capitalize', fontWeight: 600 }}>{r}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERMISSIONS.map((p) => (
                  <tr key={p.area}>
                    <td style={{ padding: '0.45rem 0.4rem', borderBottom: '1px solid #f2f2f2' }}>{p.area}</td>
                    {ROLE_KEYS.map((r) => (
                      <td key={r} style={{ textAlign: 'center', padding: '0.45rem 0.3rem', borderBottom: '1px solid #f2f2f2' }}>
                        {p[r] ? <Check size={14} color="#1a8a3c" /> : <X size={14} color="#ddd" />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.tables.length > 0 && (
            <>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.6rem' }}>Tables</h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {data.tables.map((t) => (
                  <div key={t.id} style={{ padding: '0.45rem 0.7rem', backgroundColor: '#f9f9f9', borderRadius: '6px', fontSize: '0.8rem' }}>
                    <strong>{t.name}</strong>
                    <span style={{ color: '#999' }}> · {t.capacity} seats{t.room ? ` · ${t.room}` : ''}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </motion.div>
  );
}
