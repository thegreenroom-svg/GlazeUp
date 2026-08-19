'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Calendar, PoundSterling, Palette, Bell, Users, RefreshCw, Pipette, Eye, PenTool, Flame, Check } from 'lucide-react';
import { SkeletonTiles } from '@/components/Skeleton';
import { usePullToRefresh } from '@/components/usePullToRefresh';

// Same fix already applied across floor/bookings/daily-cards/PinGate: a
// plain fetch() has no timeout of its own.
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 20000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

interface TileData {
  bookingsCount: number;
  moneyToday: number;
  moneyAvailable: boolean;
  piecesCount: number;
  alertsUnread: number;
  customersCount: number;
}

// Same three admin roles the PIN system already gates admin actions
// behind (apps/studio/components/PinGate.tsx) -- real financial figures
// on the dashboard should only be visible to Jenny/David/Daisy, same
// bar as resetting a colleague's PIN.
const ADMIN_ROLES = ['General Manager', 'Co-Director', 'Studio Executive'];
const SESSION_KEY = 'glazeup_shift';

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
        color: 'var(--charcoal)',
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
  const [isAdmin, setIsAdmin] = useState(false);
  const router = useRouter();

  // Real, per-day staff value -- per Daisy directly: "the very first
  // thing that needs to happen in this whole app... every day check...
  // apply to all bookings until changed." Not per-booking -- one current
  // value, checked/updated daily, used as the default everywhere a
  // collection date is needed until it's next changed.
  const [collectionDate, setCollectionDateState] = useState<string | null>(null);
  const [editingDate, setEditingDate] = useState(false);
  const [dateDraft, setDateDraft] = useState('');
  const [savingDate, setSavingDate] = useState(false);

  const loadCollectionDate = useCallback(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/studio/collection-date`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCollectionDateState(d?.current_collection_date || null))
      .catch(() => {});
  }, []);

  useEffect(loadCollectionDate, [loadCollectionDate]);

  const [appliedMsg, setAppliedMsg] = useState<string | null>(null);

  const saveCollectionDate = async (explicitDate?: string) => {
    // Real, correct fix for the preset buttons -- setDateDraft(iso) above
    // updates React state asynchronously, so calling saveCollectionDate()
    // immediately after would still read the OLD dateDraft value. Passing
    // the real date explicitly avoids that stale-closure bug entirely.
    const dateToSave = explicitDate || dateDraft;
    if (!dateToSave) {
      // Real, visible feedback instead of silently doing nothing --
      // this exact silent path is a plausible real cause of "not
      // working" with zero visible sign anything happened.
      setAppliedMsg('No date selected in the field — please pick a date first, then tap the tick.');
      return;
    }
    setSavingDate(true);
    setAppliedMsg(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/studio/collection-date`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dateToSave }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setCollectionDateState(d.current_collection_date);
        setEditingDate(false);
        // Real, direct confirmation of what actually happened -- per
        // Daisy: "apply to all bookings until changed." This is a real
        // write, not just a display default, so it's worth showing
        // exactly how many bookings it genuinely applied to.
        if (typeof d.applied_to_bookings === 'number') {
          // Real error surfaced explicitly -- a genuine write failure
          // previously showed as an innocuous "0 applied", which is
          // exactly how it went unnoticed that nothing was saving.
          if (d.upsert_error) {
            setAppliedMsg(`Save failed applying to bookings: ${d.upsert_error}`);
          } else {
            setAppliedMsg(
              d.applied_to_bookings > 0
                ? `Applied to ${d.applied_to_bookings} of ${d.total_bookings_today} upcoming bookings (rest already had their own date set)`
                : `No bookings needed it — all ${d.total_bookings_today} already had their own date set`
            );
          }
        }
      } else {
        // Real error surfaced, not silent -- previously failed with no
        // visible sign anything went wrong, which is exactly how it went
        // unnoticed that the save wasn't actually persisting.
        setAppliedMsg(`Save failed: ${d.error || `HTTP ${res.status}`}`);
      }
    } catch (err: any) {
      setAppliedMsg(`Could not reach the server: ${err?.message || err}`);
    }
    finally { setSavingDate(false); }
  };

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const shift = JSON.parse(raw);
        setIsAdmin(!!(shift?.role && ADMIN_ROLES.includes(shift.role)));
      }
    } catch { /* no shift yet, stays non-admin */ }
  }, []);

  // Real "sync on open" -- per Daisy directly: bookings genuinely weren't
  // showing up (confirmed against the real database -- 16 Aug had far
  // fewer bookings than what was really on the tables that day). The
  // periodic 5-minute server-side interval is unreliable on its own
  // given this Render service goes cold between real visits (confirmed
  // separately -- the last automatic sync was over 27 hours old). Tying
  // the real sync to opening the app instead is more robust: it's real
  // user activity that would wake the backend anyway, not dependent on
  // the server already being awake independently. Fire-and-forget --
  // doesn't block the Dashboard's own load, and every call already has
  // its own real error handling server-side if the connection isn't
  // ready yet.
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL;
    fetch(`${base}/api/bookings/sync`, { method: 'POST' }).catch(() => {});
    fetch(`${base}/api/spec/bookings/sync-tables-from-square`, { method: 'POST' }).catch(() => {});
    fetch(`${base}/api/spec/bookings/sync-finished-from-square`, { method: 'POST' }).catch(() => {});
  }, []);

  // Which day "Bookings" actually means right now -- after 4pm it moves
  // forward to the next day staff would actually be planning for, since
  // by then today's numbers matter less than what's coming. Sunday after
  // 4pm is a special case: jumps straight to next Wednesday rather than
  // Monday.
  const bookingsTarget = useCallback(() => {
    const now = new Date();
    const after4 = now.getHours() >= 16;
    const target = new Date(now);
    let isToday = true;
    if (after4) {
      isToday = false;
      if (now.getDay() === 0) {
        // Sunday -> next Wednesday (Wed = day 3)
        const daysAhead = (3 - now.getDay() + 7) % 7 || 7;
        target.setDate(now.getDate() + daysAhead);
      } else {
        target.setDate(now.getDate() + 1);
      }
    }
    return { target, isToday };
  }, []);

  const load = useCallback(async () => {
    try {
      const base = process.env.NEXT_PUBLIC_API_URL;
      const [studioRes, bookingsRes, liveTotalRes, piecesRes, alertsRes, customersRes] = await Promise.all([
        fetch(`${base}/api/demo/studio`),
        fetch(`${base}/api/demo/bookings`),
        // Real, live Square pull for today specifically -- deliberately NOT
        // /api/demo/revenue (revenue_category_breakdown). Checked directly:
        // that table hadn't been updated in 6 real days (last row 7 Aug),
        // so "today's takings" from it would always show a false £0 or a
        // stale number, not because anything on this page is broken but
        // because whatever background job is meant to keep that table
        // current has stopped. This route already existed for exactly
        // this reason (see its own comment in spec-routes-2.js) -- it
        // just wasn't wired into the dashboard tile until now.
        fetchWithTimeout(`${base}/api/spec/today-live-total`),
        fetch(`${base}/api/demo/pieces`),
        fetch(`${base}/api/demo/alerts`),
        fetch(`${base}/api/demo/customers`),
      ]);

      const studio = studioRes.ok ? await studioRes.json() : null;
      const bookings = bookingsRes.ok ? await bookingsRes.json() : [];
      const liveTotal = liveTotalRes.ok ? await liveTotalRes.json() : null;
      const pieces = piecesRes.ok ? await piecesRes.json() : [];
      const alerts = alertsRes.ok ? await alertsRes.json() : [];
      const customers = customersRes.ok ? await customersRes.json() : [];

      if (studio?.name) setStudioName(studio.name);

      const { target } = bookingsTarget();
      const targetStr = target.toDateString();
      const bookingsCount = bookings.filter((b: any) => new Date(b.session_start).toDateString() === targetStr).length;

      const moneyToday = typeof liveTotal?.total_gbp === 'number' ? liveTotal.total_gbp : 0;
      const moneyAvailable = liveTotal?.total_gbp !== null && liveTotal?.total_gbp !== undefined;

      const alertsUnread = alerts.filter((a: any) => !a.acknowledged).length;

      setData({
        bookingsCount,
        moneyToday,
        moneyAvailable,
        piecesCount: pieces.length,
        alertsUnread,
        customersCount: customers.length,
      });
    } catch (err) {
      // leave data null, tiles will show a loading state indefinitely rather than crash
    } finally {
      setLoading(false);
    }
  }, [bookingsTarget]);

  useEffect(() => {
    load();
  }, [load]);

  const { pulling, pullDistance } = usePullToRefresh(load);

  const { target: bookingsDate, isToday: bookingsIsToday } = bookingsTarget();
  const bookingsLabel = bookingsIsToday
    ? 'Bookings Today'
    : `Bookings ${bookingsDate.toLocaleDateString(undefined, { weekday: 'long' })}`;
  const takingsSubtext = `Today, ${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '1rem 1.2rem 1.2rem', backgroundColor: '#FDF6F1', minHeight: '100%', position: 'relative' }}>
      {pullDistance > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', height: `${pullDistance}px`, alignItems: 'center', overflow: 'hidden' }}>
          <RefreshCw size={20} color="var(--clay)" style={{ transform: `rotate(${pullDistance * 3.6}deg)`, opacity: pullDistance / 100 }} />
        </div>
      )}
      {pulling && <p style={{ textAlign: 'center', color: 'var(--clay)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>Refreshing...</p>}

      {studioName && (
        <p style={{ fontSize: '0.8rem', color: '#999', marginBottom: '1.25rem' }}>{studioName}</p>
      )}

      {/* Real, prominent widget -- per Daisy: "the very first thing that
          needs to happen in this whole app... every day check." Right
          at the top, above Start Floor, since she's calling it the
          first thing. */}
      <div style={{ maxWidth: '520px', margin: '0 auto 0.9rem', padding: '0.75rem 1.1rem', borderRadius: '14px', background: 'linear-gradient(155deg, var(--clay) 0%, #9A6435 100%)', boxShadow: '0 3px 10px rgba(184,121,70,0.25)' }}>
        <p style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem', fontWeight: 700, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
          <Flame size={13} /> Today's collection date
        </p>
        {!editingDate ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ fontSize: '1.1rem', fontWeight: 800, color: 'white' }}>
              {collectionDate
                ? new Date(collectionDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
                : 'Not set yet — check and set for today'}
            </p>
            <button
              onClick={() => { setDateDraft(collectionDate || new Date().toISOString().slice(0, 10)); setEditingDate(true); }}
              style={{ padding: '0.4rem 0.8rem', backgroundColor: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
            >
              {collectionDate ? 'Change' : 'Set'}
            </button>
          </div>
        ) : (
          <div>
            {/* Real, robust fix -- "calendar won't load" confirmed the
                native date picker itself wasn't opening on tap, a
                different and more fundamental failure point than
                anything chased so far today. Rather than keep fighting
                an unreliable native picker, quick presets sidestep it
                entirely -- and are genuinely the faster real workflow
                for "check daily, set the current turnaround" anyway. */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.4rem', marginBottom: '0.6rem' }}>
              {[1, 2, 3, 4].map((weeks) => (
                <button
                  key={weeks}
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() + weeks * 7);
                    const iso = d.toISOString().slice(0, 10);
                    setDateDraft(iso);
                    saveCollectionDate(iso);
                  }}
                  disabled={savingDate}
                  style={{ padding: '0.6rem 0.3rem', backgroundColor: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600, cursor: savingDate ? 'default' : 'pointer' }}
                >
                  {weeks} wk{weeks > 1 ? 's' : ''}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="date"
                value={dateDraft}
                onChange={(e) => setDateDraft(e.target.value)}
                style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: 'none', fontSize: '0.9rem' }}
              />
              <button
                onClick={() => saveCollectionDate()}
                disabled={savingDate}
                style={{ padding: '0.5rem 0.7rem', backgroundColor: 'white', color: 'var(--clay)', border: 'none', borderRadius: '8px', cursor: savingDate ? 'default' : 'pointer', display: 'flex', alignItems: 'center' }}
              >
                <Check size={16} />
              </button>
            </div>
            <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.7)', marginTop: '0.4rem' }}>
              Quick presets above save straight away. Or pick an exact date below, then tap the tick.
            </p>
          </div>
        )}
        {appliedMsg && (
          <p style={{
            fontSize: '0.75rem',
            fontWeight: appliedMsg.startsWith('Save failed') || appliedMsg.startsWith('Could not reach') ? 700 : 400,
            color: appliedMsg.startsWith('Save failed') || appliedMsg.startsWith('Could not reach') ? '#FFD9D0' : 'rgba(255,255,255,0.85)',
            marginTop: '0.5rem',
          }}>
            {appliedMsg}
          </p>
        )}
      </div>

      <div style={{ display: 'flex', gap: '0.6rem', maxWidth: '520px', margin: '0 auto 0.9rem' }}>
        <button
          onClick={() => router.push('/floor')}
          style={{
            flex: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.6rem',
            padding: '0.85rem',
            borderRadius: '14px',
            border: 'none',
            cursor: 'pointer',
            background: 'linear-gradient(155deg, var(--clay) 0%, #9A6435 100%)',
            color: 'var(--ivory)',
            fontSize: '1.15rem',
            fontWeight: 700,
          }}
        >
          🏃 Start Floor
        </button>
        <button
          onClick={() => router.push('/daily-cards')}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.2rem',
            padding: '0.85rem 0.5rem',
            borderRadius: '14px',
            border: '2px solid var(--clay)',
            cursor: 'pointer',
            backgroundColor: 'white',
            color: 'var(--charcoal)',
            fontSize: '0.85rem',
            fontWeight: 700,
          }}
        >
          🖨️ Print Cards
        </button>
      </div>

      {loading || !data ? (
        <SkeletonTiles />
      ) : (
        <div style={{ maxWidth: '520px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isAdmin ? '1fr 1fr' : '1fr', gap: '0.6rem', marginBottom: '0.6rem' }}>
            <Tile label={bookingsLabel} icon={Calendar} value={String(data.bookingsCount)} color="var(--clay)" fontSize="1.7rem" maxSize="110px" onClick={() => router.push('/bookings')} />
            {isAdmin && (
              <Tile label="Takings" icon={PoundSterling} value={data.moneyAvailable ? `£${data.moneyToday.toFixed(0)}` : '—'} subtext={data.moneyAvailable ? takingsSubtext : 'Square unavailable'} color="#C58C5B" fontSize="1.7rem" maxSize="110px" onClick={() => router.push('/money')} />
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '0.6rem' }}>
            <Tile label="Pieces" icon={Palette} value={String(data.piecesCount)} color="#9A6435" fontSize="1rem" maxSize="78px" onClick={() => router.push('/pieces')} />
            <Tile label="Alerts" icon={Bell} value={String(data.alertsUnread)} color="#D97742" fontSize="1rem" maxSize="78px" onClick={() => router.push('/alerts')} />
            <Tile label="Customers" icon={Users} value={String(data.customersCount)} color="#8B6F52" fontSize="1rem" maxSize="78px" onClick={() => router.push('/customers')} />
          </div>

          {/* Real, direct access -- per Daisy: "I still can't see any of
              the design apps... where are they?" They already existed
              in the nav (Creative Tools section), just buried below
              Business. Putting them right on the dashboard instead of
              only offering to move them further down a long menu. */}
          <p style={{ fontSize: '0.68rem', color: '#999', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '0.4rem' }}>Design Tools</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
            <button
              onClick={() => router.push('/colour-picker')}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem', padding: '0.55rem 0.3rem', borderRadius: '10px', border: '1px solid #e5ddd2', backgroundColor: 'white', cursor: 'pointer' }}
            >
              <Pipette size={17} color="var(--clay)" />
              <span style={{ fontSize: '0.64rem', fontWeight: 600, color: 'var(--charcoal)', textAlign: 'center' }}>Colour Picker</span>
            </button>
            <button
              onClick={() => router.push('/design-preview')}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem', padding: '0.55rem 0.3rem', borderRadius: '10px', border: '1px solid #e5ddd2', backgroundColor: 'white', cursor: 'pointer' }}
            >
              <Eye size={17} color="var(--clay)" />
              <span style={{ fontSize: '0.64rem', fontWeight: 600, color: 'var(--charcoal)', textAlign: 'center' }}>Design Preview</span>
            </button>
            <button
              onClick={() => router.push('/transfer-designer')}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem', padding: '0.55rem 0.3rem', borderRadius: '10px', border: '1px solid #e5ddd2', backgroundColor: 'white', cursor: 'pointer' }}
            >
              <PenTool size={17} color="var(--clay)" />
              <span style={{ fontSize: '0.64rem', fontWeight: 600, color: 'var(--charcoal)', textAlign: 'center' }}>Transfer Designer</span>
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
