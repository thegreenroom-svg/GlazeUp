'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Calendar, PoundSterling, Flame, Palette, Bell, Users, RefreshCw } from 'lucide-react';
import { SkeletonTiles } from '@/components/Skeleton';
import { usePullToRefresh } from '@/components/usePullToRefresh';

interface TileData {
  bookingsToday: number;
  moneyToday: number;
  kilnActive: number;
  piecesCount: number;
  alertsUnread: number;
  customersCount: number;
}

function Tile({
  label,
  icon: Icon,
  value,
  subtext,
  color,
  onClick,
  fontSize,
  maxSize,
}: {
  label: string;
  icon: any;
  value: string;
  subtext?: string;
  color: string;
  onClick: () => void;
  fontSize: string;
  maxSize: string;
}) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.94 }}
      whileHover={{ scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
      style={{
        width: '100%',
        maxWidth: maxSize,
        maxHeight: maxSize,
        margin: '0 auto',
        aspectRatio: '1',
        border: 'none',
        borderRadius: '14px',
        background: `linear-gradient(155deg, ${color} 0%, ${color}dd 100%)`,
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '10%',
        cursor: 'pointer',
        boxShadow: '0 3px 10px rgba(0,0,0,0.12)',
        textAlign: 'left',
      }}
    >
      <Icon size={parseFloat(fontSize) * 1.2} color="white" style={{ opacity: 0.9 }} />
      <div>
        <div style={{ fontSize, fontWeight: 800, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: '0.65rem', opacity: 0.9, marginTop: '0.15rem' }}>{label}</div>
        {subtext && <div style={{ fontSize: '0.55rem', opacity: 0.75 }}>{subtext}</div>}
      </div>
    </motion.button>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<TileData | null>(null);
  const [studioName, setStudioName] = useState('');
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const load = useCallback(async () => {
    try {
      const base = process.env.NEXT_PUBLIC_API_URL;
      const [studioRes, bookingsRes, revenueRes, kilnRes, piecesRes, alertsRes, customersRes] = await Promise.all([
        fetch(`${base}/api/demo/studio`),
        fetch(`${base}/api/demo/bookings`),
        fetch(`${base}/api/demo/revenue`),
        fetch(`${base}/api/demo/kiln-sessions`),
        fetch(`${base}/api/demo/pieces`),
        fetch(`${base}/api/demo/alerts`),
        fetch(`${base}/api/demo/customers`),
      ]);

      const studio = studioRes.ok ? await studioRes.json() : null;
      const bookings = bookingsRes.ok ? await bookingsRes.json() : [];
      const revenue = revenueRes.ok ? await revenueRes.json() : [];
      const kiln = kilnRes.ok ? await kilnRes.json() : [];
      const pieces = piecesRes.ok ? await piecesRes.json() : [];
      const alerts = alertsRes.ok ? await alertsRes.json() : [];
      const customers = customersRes.ok ? await customersRes.json() : [];

      if (studio?.name) setStudioName(studio.name);

      const todayStr = new Date().toDateString();
      const bookingsToday = bookings.filter((b: any) => new Date(b.session_start).toDateString() === todayStr).length;

      const mostRecentDate = revenue.length > 0 ? revenue.reduce((max: string, r: any) => (r.metric_date > max ? r.metric_date : max), revenue[0].metric_date) : null;
      const moneyToday = revenue.filter((r: any) => r.metric_date === mostRecentDate).reduce((sum: number, r: any) => sum + r.revenue_cents, 0) / 100;

      const kilnActive = kiln.filter((k: any) => k.status !== 'fired').length;
      const alertsUnread = alerts.filter((a: any) => !a.acknowledged).length;

      setData({
        bookingsToday,
        moneyToday,
        kilnActive,
        piecesCount: pieces.length,
        alertsUnread,
        customersCount: customers.length,
      });
    } catch (err) {
      // leave data null, tiles will show a loading state indefinitely rather than crash
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const { pulling, pullDistance } = usePullToRefresh(load);

  // Predictive home: during opening hours (9am-5pm) bookings lead, since
  // that's what staff need front and centre while customers are in. Outside
  // those hours -- early morning kiln loading, or evening after close --
  // the kiln takes the lead tile instead, since that's what's actually
  // happening then. Driven by the real current hour, not a fixed layout.
  const hour = new Date().getHours();
  const isServiceHours = hour >= 9 && hour < 17;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '1.5rem', backgroundColor: '#FDF6F1', minHeight: '100%', position: 'relative' }}>
      {pullDistance > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', height: `${pullDistance}px`, alignItems: 'center', overflow: 'hidden' }}>
          <RefreshCw size={20} color="var(--clay)" style={{ transform: `rotate(${pullDistance * 3.6}deg)`, opacity: pullDistance / 100 }} />
        </div>
      )}
      {pulling && <p style={{ textAlign: 'center', color: 'var(--clay)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>Refreshing...</p>}

      <div
        style={{
          padding: '0.75rem 1rem',
          backgroundColor: '#fff8e1',
          border: '1px solid #ffca28',
          borderRadius: '4px',
          marginBottom: '1.25rem',
          fontSize: '0.8rem',
        }}
      >
        Demo view — read-only. {studioName}
      </div>

      {loading || !data ? (
        <SkeletonTiles />
      ) : (
        <div style={{ maxWidth: '520px', margin: '0 auto' }}>
          {isServiceHours ? (
            <>
              <div style={{ marginBottom: '0.75rem' }}>
                <Tile label="Bookings Today" icon={Calendar} value={String(data.bookingsToday)} color="var(--clay)" fontSize="2.2rem" maxSize="180px" onClick={() => router.push('/bookings')} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <Tile label="Takings" icon={PoundSterling} value={`£${data.moneyToday.toFixed(0)}`} subtext="most recent day" color="#C58C5B" fontSize="1.5rem" maxSize="130px" onClick={() => router.push('/money')} />
                <Tile label="Kiln Active" icon={Flame} value={String(data.kilnActive)} subtext="loading / firing" color="#A85D35" fontSize="1.5rem" maxSize="130px" onClick={() => router.push('/kiln-workflow')} />
              </div>
            </>
          ) : (
            <>
              <div style={{ marginBottom: '0.75rem' }}>
                <Tile label="Kiln Active" icon={Flame} value={String(data.kilnActive)} subtext="loading / firing" color="#A85D35" fontSize="2.2rem" maxSize="180px" onClick={() => router.push('/kiln-workflow')} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <Tile label="Bookings Today" icon={Calendar} value={String(data.bookingsToday)} color="var(--clay)" fontSize="1.5rem" maxSize="130px" onClick={() => router.push('/bookings')} />
                <Tile label="Takings" icon={PoundSterling} value={`£${data.moneyToday.toFixed(0)}`} subtext="most recent day" color="#C58C5B" fontSize="1.5rem" maxSize="130px" onClick={() => router.push('/money')} />
              </div>
            </>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem', marginBottom: '0.6rem' }}>
            <Tile label="Pieces" icon={Palette} value={String(data.piecesCount)} color="#9A6435" fontSize="1.1rem" maxSize="95px" onClick={() => router.push('/pieces')} />
            <Tile label="Alerts" icon={Bell} value={String(data.alertsUnread)} color="#D97742" fontSize="1.1rem" maxSize="95px" onClick={() => router.push('/alerts')} />
            <Tile label="Customers" icon={Users} value={String(data.customersCount)} color="#8B6F52" fontSize="1.1rem" maxSize="95px" onClick={() => router.push('/customers')} />
          </div>
        </div>
      )}
    </motion.div>
  );
}
