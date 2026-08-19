'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { PageShell } from '@/components/PageShell';
import { PoundSterling, Calendar, RefreshCw } from 'lucide-react';
import { SkeletonRows } from '@/components/Skeleton';

interface RevenueRow {
  metric_date: string;
  category: string;
  revenue_cents: number;
  item_count: number;
}

interface BreakdownCategory {
  category: string;
  revenue: number;
  items: number;
  pct: number;
}

interface BreakdownGroup {
  group: string;
  revenue: number;
  items: number;
  categoryCount: number;
  pct: number;
  categories: BreakdownCategory[];
}

type RangeFilter = 'all' | 'year' | '90' | '30';

// Same three admin roles the PIN system and dashboard already gate real
// financial figures behind (apps/studio/components/PinGate.tsx).
const ADMIN_ROLES = ['General Manager', 'Co-Director', 'Studio Executive'];
const SESSION_KEY = 'glazeup_shift';

// Same fix applied across the app this session: a plain fetch() has no
// timeout. The sync below does real, potentially slow work (full Square
// catalog pull + up to a year of orders), so it gets a longer ceiling
// than the usual 20s.
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 60000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export default function MoneyPage() {
  const [rows, setRows] = useState<RevenueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveToday, setLiveToday] = useState<{ total_gbp: number; order_count: number; pulled_at: string } | null>(null);
  const [liveError, setLiveError] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [breakdownGroups, setBreakdownGroups] = useState<BreakdownGroup[]>([]);
  const [breakdownStats, setBreakdownStats] = useState<{ total: number; totalItems: number; earliest: string; latest: string; categoryCount: number } | null>(null);
  const [breakdownLoading, setBreakdownLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [range, setRange] = useState<RangeFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState('');

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const shift = JSON.parse(raw);
        setIsAdmin(!!(shift?.role && ADMIN_ROLES.includes(shift.role)));
      }
    } catch { /* no shift yet, stays non-admin */ }
  }, []);

  const loadFlatRows = () => {
    setLoading(true);
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/revenue`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load');
        return res.json();
      })
      .then(setRows)
      .catch(() => setError('Could not load takings.'))
      .finally(() => setLoading(false));
  };

  // Real, grouped, clickable breakdown -- ported from the same recovered
  // history as the sync (backend/spec-routes-2.js,
  // registerRevenueBreakdownRoute). Groups by the real naming convention
  // already present in Square's own categories, not a hardcoded list --
  // anything genuinely unexpected (external sales, events, whatever the
  // catalog actually has) lands in an honest 'Other' group rather than
  // being hidden or force-fit.
  const loadGroupedBreakdown = (r: RangeFilter) => {
    setBreakdownLoading(true);
    const params = new URLSearchParams();
    if (r !== 'all') {
      const from = new Date();
      if (r === 'year') from.setMonth(0, 1);
      else from.setDate(from.getDate() - parseInt(r, 10));
      params.set('from', from.toISOString().slice(0, 10));
    }
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/revenue/breakdown?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((d) => {
        setBreakdownGroups(d.groups || []);
        setBreakdownStats(d.stats || null);
      })
      .catch(() => setBreakdownGroups([]))
      .finally(() => setBreakdownLoading(false));
  };

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  useEffect(() => {
    loadFlatRows();
    loadGroupedBreakdown(range);

    // Genuinely live, straight from Square -- the synced breakdown below can
    // fall behind (it has, checked directly: several real days at times),
    // so this bypasses that entirely for today's real figure.
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/today-live-total`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((d) => (d.total_gbp === null ? setLiveError(true) : setLiveToday(d)))
      .catch(() => setLiveError(true));
  }, []);

  useEffect(() => {
    loadGroupedBreakdown(range);
  }, [range]);

  // Runs the real, restored category sync (backend/spec-routes-2.js,
  // registerRevenueCategorySyncRoute) -- ported from the proven pre-rewrite
  // logic, not reinvented. No scheduler exists anywhere for this yet (no
  // pg_cron, no Render Cron Job, no in-process timer), so this manual
  // trigger is the real way to catch up until one is set up outside this
  // backend.
  const runSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetchWithTimeout(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/revenue/sync?daysBack=30`, { method: 'POST' });
      const d = await res.json();
      if (!res.ok || !d.synced) {
        setSyncResult(d.error || 'Sync failed.');
        return;
      }
      setSyncResult(`Synced ${d.dates_synced.length} day${d.dates_synced.length === 1 ? '' : 's'} · ${d.orders_processed} orders · ${d.rows_written} rows written.`);
      loadFlatRows();
      loadGroupedBreakdown(range);
    } catch (err: any) {
      setSyncResult(err?.name === 'AbortError' ? 'Taking too long -- try again' : 'Sync failed.');
    } finally {
      setSyncing(false);
    }
  };

  const byDate: { [key: string]: number } = {};
  rows.forEach((r) => {
    byDate[r.metric_date] = (byDate[r.metric_date] || 0) + r.revenue_cents / 100;
  });
  const sortedDates = Object.entries(byDate).sort(([a], [b]) => (a < b ? 1 : -1));
  const recentTotal = sortedDates.length > 0 ? sortedDates[0][1] : 0;
  const mostRecentDate = sortedDates.length > 0 ? sortedDates[0][0] : null;
  const daysStale = mostRecentDate
    ? Math.floor((Date.now() - new Date(mostRecentDate).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <PageShell title="Money">
      

      {error && <div style={{ padding: '1rem', backgroundColor: '#fee', color: '#c33', borderRadius: '4px', marginBottom: '1.5rem' }}>{error}</div>}

      {loading ? (
        <SkeletonRows count={5} />
      ) : (
        <>
          <div style={{ padding: '1.5rem', backgroundColor: 'white', border: '2px solid var(--clay)', borderRadius: '8px', marginBottom: '1rem', maxWidth: '300px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <PoundSterling size={20} color="var(--clay)" />
              <p style={{ color: '#666', fontSize: '0.875rem' }}>Today, live from Square</p>
            </div>
            {liveError ? (
              <p style={{ color: '#c33', fontSize: '0.85rem' }}>Could not reach Square right now.</p>
            ) : liveToday ? (
              <>
                <h2 style={{ fontSize: '2rem', fontWeight: 'bold' }}>£{liveToday.total_gbp.toFixed(2)}</h2>
                <p style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.25rem' }}>
                  {liveToday.order_count} order{liveToday.order_count === 1 ? '' : 's'} · pulled {new Date(liveToday.pulled_at).toLocaleTimeString()}
                </p>
              </>
            ) : (
              <p style={{ color: '#999', fontSize: '0.85rem' }}>Loading...</p>
            )}
          </div>

          {mostRecentDate && (
            <div style={{ padding: '1.5rem', backgroundColor: 'white', border: `2px solid ${daysStale && daysStale > 1 ? '#e0a020' : '#00aa00'}`, borderRadius: '8px', marginBottom: '1rem', maxWidth: '300px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <Calendar size={20} color={daysStale && daysStale > 1 ? '#e0a020' : '#00aa00'} />
                <p style={{ color: '#666', fontSize: '0.875rem' }}>Category breakdown, most recent synced day</p>
              </div>
              <h2 style={{ fontSize: '2rem', fontWeight: 'bold' }}>£{recentTotal.toFixed(2)}</h2>
              <p style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.25rem' }}>{new Date(mostRecentDate).toLocaleDateString()}</p>
              {daysStale !== null && daysStale > 1 && (
                <p style={{ fontSize: '0.75rem', color: '#e0a020', marginTop: '0.4rem', fontWeight: 600 }}>
                  ⚠ {daysStale} days behind — the category sync hasn't run recently. The figure above is real, live Square data instead.
                </p>
              )}
            </div>
          )}

          {isAdmin && (
            <div style={{ marginBottom: '1.5rem', maxWidth: '300px' }}>
              <button
                onClick={runSync}
                disabled={syncing}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1rem', backgroundColor: syncing ? '#ccc' : 'var(--clay)', color: 'white', border: 'none', borderRadius: '6px', cursor: syncing ? 'default' : 'pointer', fontSize: '0.85rem', fontWeight: 600 }}
              >
                <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} /> {syncing ? 'Syncing (may take a minute)...' : 'Sync category breakdown now'}
              </button>
              <p style={{ fontSize: '0.72rem', color: '#999', marginTop: '0.4rem' }}>
                Pulls real Square orders + catalog categories for the last 30 days. No automatic schedule exists yet -- this is the real way to catch up until one's set up.
              </p>
              {syncResult && <p style={{ fontSize: '0.78rem', color: syncResult.includes('Synced') ? '#00aa00' : '#c33', marginTop: '0.5rem', fontWeight: 600 }}>{syncResult}</p>}
            </div>
          )}

          {/* Category breakdown -- groups & sub-categories, clickable.
              Ported design: tap a group header to expand its real
              categories, each with revenue, item count and % of total. */}
          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '1.5rem', border: '1px solid #ddd', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.9rem' }}>Category Breakdown</h2>

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
              {(['all', 'year', '90', '30'] as RangeFilter[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  style={{
                    padding: '0.4rem 0.8rem', borderRadius: 6, fontSize: '0.8rem', cursor: 'pointer',
                    border: range === r ? '1.5px solid var(--clay)' : '1px solid #ddd',
                    backgroundColor: range === r ? 'var(--clay)' : 'white',
                    color: range === r ? 'white' : '#333', fontWeight: range === r ? 700 : 400,
                  }}
                >
                  {r === 'all' ? 'All time' : r === 'year' ? 'This year' : `${r} days`}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              placeholder="Filter categories..."
              style={{ width: '100%', padding: '0.5rem 0.7rem', borderRadius: 6, border: '1px solid #ddd', fontSize: '0.85rem', marginBottom: '1rem' }}
            />

            {breakdownLoading ? (
              <p style={{ color: '#999', fontSize: '0.85rem' }}>Loading...</p>
            ) : breakdownGroups.length === 0 ? (
              <p style={{ color: '#999', fontSize: '0.85rem' }}>No breakdown data for this range.</p>
            ) : (
              <>
                {breakdownStats && (
                  <p style={{ fontSize: '0.78rem', color: '#666', marginBottom: '0.9rem' }}>
                    £{breakdownStats.total.toFixed(2)} total · {breakdownStats.totalItems} items · {breakdownStats.categoryCount} categories · {new Date(breakdownStats.earliest).toLocaleDateString()} – {new Date(breakdownStats.latest).toLocaleDateString()}
                  </p>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {breakdownGroups.map((g) => {
                    const filteredCats = categoryFilter.trim()
                      ? g.categories.filter((c) => c.category.toLowerCase().includes(categoryFilter.trim().toLowerCase()))
                      : g.categories;
                    if (categoryFilter.trim() && filteredCats.length === 0) return null;
                    const isOpen = expandedGroups.has(g.group);
                    const isWarn = g.group === 'Unclassified in Square' || g.group === 'Other';
                    return (
                      <div key={g.group} style={{ border: `1px solid ${isWarn ? '#e0c060' : '#ddd'}`, borderRadius: 10, overflow: 'hidden' }}>
                        <button
                          onClick={() => toggleGroup(g.group)}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.8rem 1rem', background: isWarn ? '#fffdf5' : 'white', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                        >
                          <span style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', color: '#999', fontSize: '0.8rem' }}>▶</span>
                          <span style={{ flex: 1, fontWeight: 700, fontSize: '0.9rem', color: isWarn ? '#8a5a00' : '#222' }}>{g.group}</span>
                          <span style={{ fontSize: '0.72rem', color: '#999' }}>{g.categoryCount} categories</span>
                          <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>£{g.revenue.toFixed(2)}</span>
                        </button>
                        <div style={{ height: 5, backgroundColor: '#f0f0f0', margin: '0 1rem' }}>
                          <div style={{ height: '100%', width: `${g.pct}%`, backgroundColor: isWarn ? '#e0a020' : '#3E7C6A' }} />
                        </div>
                        {isOpen && (
                          <div style={{ borderTop: '1px solid #eee' }}>
                            {filteredCats.map((c) => (
                              <div key={c.category} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem 1rem 0.6rem 2.2rem', borderTop: '1px solid #f5f5f5', fontSize: '0.82rem' }}>
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.category}</span>
                                <span style={{ fontSize: '0.72rem', color: '#999', width: 48, textAlign: 'right' }}>{c.items} items</span>
                                <span style={{ fontSize: '0.72rem', color: '#999', width: 40, textAlign: 'right' }}>{c.pct.toFixed(1)}%</span>
                                <span style={{ fontWeight: 700, width: 70, textAlign: 'right' }}>£{c.revenue.toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '1.5rem', border: '1px solid #ddd' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Calendar size={20} /> Takings by Day
            </h2>
            {sortedDates.length === 0 ? (
              <p style={{ color: '#999' }}>No takings data available.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {sortedDates.map(([date, total]) => (
                  <div key={date} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #eee' }}>
                    <span>{new Date(date).toLocaleDateString()}</span>
                    <span style={{ fontWeight: '600' }}>£{total.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </PageShell>
  );
}
