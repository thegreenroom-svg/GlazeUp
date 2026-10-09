'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { PageShell } from '@/components/PageShell';
import { Loader, Check, AlertTriangle, CircleDashed } from 'lucide-react';

// Three jobs have stopped quietly so far: takings for 43 days, pieces for
// 27, the catalogue refresh this morning. Every one was found weeks late,
// by noticing a number that looked wrong.
//
// A job that fails loudly is a nuisance. A job that stops quietly is a
// liability, because everything downstream carries on working and carries
// on being wrong. This screen exists so that stops being possible.

const B = { text: 'var(--charcoal)', stone: 'var(--stone)', sand: 'var(--sand)' };

const PLAIN: Record<string, string> = {
  'revenue-sync': 'Takings from Square',
  'bookings-sync': 'Bookings from Square',
  'catalogue-refresh': 'The bisque catalogue',
  'shape-recognition': 'Working out shapes',
  'backfill-ingest': 'Photos from the iPad',
  'ticket-match': 'Checking shapes against the till',
  'photo-read': 'Reading the iPad photos',
  'ipad-ping': 'The iPad Shortcut ran',
};

const ago = (m: number | null) => {
  if (m === null) return 'never';
  if (m < 2) return 'just now';
  if (m < 90) return `${m} minutes ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} hours ago`;
  return `${Math.round(h / 24)} days ago`;
};

interface Job {
  job: string; mins_ago: number | null; stale_after_mins: number;
  state: 'ok' | 'stale' | 'never'; last_error: string | null;
}

export default function HeartbeatPage() {
  const [d, setD] = useState<{ jobs: Job[]; stale: number; never: number } | null>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/heartbeat`, { cache: 'no-store' })
      .then((r) => r.json()).then(setD).catch(() => setD({ jobs: [], stale: 0, never: 0 }));
  }, []);

  if (!d) return (
    <PageShell title="Is everything running?" subtitle="The jobs that keep the numbers honest">
      <p style={{ color: B.stone, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <Loader size={15} className="animate-spin" /> Checking
      </p>
    </PageShell>
  );

  return (
    <PageShell title="Is everything running?" subtitle="The jobs that keep the numbers honest">
      <p style={{ color: B.text, fontSize: 'var(--text-sm)', lineHeight: 1.55, marginBottom: '0.9rem' }}>
        {d.stale === 0 && d.never === 0
          ? 'Everything has run recently.'
          : `${d.stale} stopped, ${d.never} never run.`}
      </p>

      {d.jobs.map((j) => {
        const bad = j.state !== 'ok';
        const colour = j.state === 'ok' ? '#3D7A4A' : j.state === 'stale' ? '#B0203C' : '#9B8C85';
        return (
          <div key={j.job} style={{
            display: 'flex', gap: '0.6rem', alignItems: 'flex-start', backgroundColor: '#fff',
            border: `1px solid ${bad ? colour + '55' : B.sand}`, borderRadius: 'var(--radius-md)',
            padding: '0.7rem 0.85rem', marginBottom: '0.45rem',
          }}>
            {j.state === 'ok' ? <Check size={16} color={colour} style={{ flexShrink: 0, marginTop: 2 }} />
              : j.state === 'stale' ? <AlertTriangle size={16} color={colour} style={{ flexShrink: 0, marginTop: 2 }} />
              : <CircleDashed size={16} color={colour} style={{ flexShrink: 0, marginTop: 2 }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: B.text, fontWeight: 700, fontSize: 'var(--text-sm)' }}>
                {PLAIN[j.job] || j.job}
              </p>
              <p style={{ color: bad ? colour : B.stone, fontSize: 'var(--text-xs)', marginTop: '0.12rem' }}>
                {j.state === 'never'
                  ? 'has not run yet'
                  : `last worked ${ago(j.mins_ago)}`}
                {j.state === 'stale' ? ` · expected every ${Math.round(j.stale_after_mins / 60) || 1}h` : ''}
              </p>
              {j.last_error && (
                <p style={{ color: B.stone, fontSize: 'var(--text-xs)', marginTop: '0.25rem', lineHeight: 1.4 }}>
                  {j.last_error}
                </p>
              )}
            </div>
          </div>
        );
      })}

      <OpsPanels />

      <p style={{ color: B.stone, fontSize: 'var(--text-xs)', marginTop: '1rem', lineHeight: 1.5 }}>
        Never run usually means a job is not wired up yet, which is a different
        problem from one that has stopped. Render also sleeps an idle service,
        so a quiet night can show as a gap without anything being broken.
      </p>
    </PageShell>
  );
}


// [9 Oct] Daisy: "Do all." The report card, the alerts and the test set,
// under the jobs, so "is it working?" has one place to look.
const API = process.env.NEXT_PUBLIC_API_URL;
function OpsPanels() {
  const [today, setToday] = useState<any>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [bench, setBench] = useState<{ running: boolean; runs: any[] } | null>(null);
  const loadBench = () => fetch(`${API}/api/spec/shapes/benchmark`, { cache: 'no-store' }).then((r) => r.json()).then(setBench).catch(() => {});
  useEffect(() => {
    fetch(`${API}/api/spec/report/daily`, { cache: 'no-store' }).then((r) => r.json()).then(setToday).catch(() => {});
    fetch(`${API}/api/spec/report/recent`, { cache: 'no-store' }).then((r) => r.json()).then((d) => setReports(d.reports || [])).catch(() => {});
    fetch(`${API}/api/spec/alerts`, { cache: 'no-store' }).then((r) => r.json()).then((d) => setAlerts(d.alerts || [])).catch(() => {});
    loadBench();
  }, []);
  const runBench = async () => {
    await fetch(`${API}/api/spec/shapes/benchmark`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ n: 30 }) }).catch(() => {});
    setBench((b) => (b ? { ...b, running: true } : b));
    const t = setInterval(async () => {
      const r = await fetch(`${API}/api/spec/shapes/benchmark`, { cache: 'no-store' }).then((x) => x.json()).catch(() => null);
      if (r) { setBench(r); if (!r.running) clearInterval(t); }
    }, 15000);
  };
  const box = { background: '#fff', border: `1px solid ${B.sand}`, borderRadius: 'var(--radius-md)', padding: '0.8rem 0.9rem', marginTop: '0.9rem' } as const;
  const h = { color: B.text, fontWeight: 700, fontSize: 'var(--text-sm)', marginBottom: '0.35rem' } as const;
  const line = (r: any) => `${r.photographed}/${r.painting_tables} photographed · ${r.pieces} pieces: ${r.confirmed_by_till} till, ${r.confirmed_by_person} staff, ${r.guesses} guesses, ${r.unknown} unknown · £${Number(r.pottery_value_gbp || 0).toFixed(2)} · AI £${Number(r.ai_cost_gbp || 0).toFixed(2)}`;
  return (
    <>
      {alerts.length > 0 && (
        <div style={{ ...box, borderColor: '#b03a2e66' }}>
          <p style={{ ...h, color: '#b03a2e' }}>Alerts</p>
          {alerts.map((a) => <p key={a.id} style={{ fontSize: 'var(--text-sm)', color: '#b03a2e', marginTop: '0.2rem' }}>{a.message}</p>)}
        </div>
      )}
      {today && today.day && (
        <div style={box}>
          <p style={h}>Today so far</p>
          <p style={{ fontSize: 'var(--text-sm)', color: B.text, lineHeight: 1.5 }}>{line(today)}</p>
          {today.no_photo?.length > 0 && <p style={{ fontSize: 'var(--text-xs)', color: '#b03a2e', marginTop: '0.25rem' }}>No photo: {today.no_photo.join(', ')}</p>}
          {today.ai_checked > 0 && <p style={{ fontSize: 'var(--text-xs)', color: B.stone, marginTop: '0.25rem' }}>Recognition checked {today.ai_checked} times today, right {today.ai_right}.</p>}
        </div>
      )}
      {reports.length > 0 && (
        <div style={box}>
          <p style={h}>Nightly report cards</p>
          {reports.map((r) => (
            <p key={r.day} style={{ fontSize: 'var(--text-xs)', color: B.text, marginTop: '0.3rem', lineHeight: 1.45 }}>
              <strong>{new Date(`${r.day}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</strong> · {line(r)}
            </p>
          ))}
        </div>
      )}
      <div style={box}>
        <p style={h}>Shape recognition test</p>
        <p style={{ fontSize: 'var(--text-xs)', color: B.stone, lineHeight: 1.5 }}>
          Runs recognition fresh on 30 pieces whose shape is already known and scores it. Takes a few minutes and costs a few pence. Run it before and after a change to see whether it helped.
        </p>
        {bench?.runs?.map((r: any) => (
          <p key={r.id} style={{ fontSize: 'var(--text-sm)', color: B.text, marginTop: '0.3rem' }}>
            {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}: <strong>{r.exact} of {r.pieces} exactly right</strong>{r.family ? `, ${r.family} right shape wrong size` : ''}{r.none ? `, ${r.none} no answer` : ''}
          </p>
        ))}
        <button onClick={runBench} disabled={!!bench?.running} style={{ marginTop: '0.6rem', padding: '0.5rem 1rem', borderRadius: 999, border: 'none', background: bench?.running ? '#ddd' : 'var(--clay)', color: 'white', fontWeight: 700, fontSize: 'var(--text-sm)' }}>
          {bench?.running ? 'Running…' : 'Run the test'}
        </button>
      </div>
      <div style={box}>
        <p style={h}>iPad check-in</p>
        <p style={{ fontSize: 'var(--text-xs)', color: B.stone, lineHeight: 1.5 }}>
          So a quiet iPad and a broken one can be told apart: at the start of the Shortcut, add a "Get contents of URL" step that POSTs to the same address as the photo upload but ending /api/spec/ipad/ping, with the same studio key (form field "token"). "The iPad Shortcut ran" above then shows the last time it ran, photos or not.
        </p>
      </div>
    </>
  );
}
