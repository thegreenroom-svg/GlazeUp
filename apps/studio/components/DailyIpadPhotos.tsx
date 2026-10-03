'use client';

import { useEffect, useRef, useState } from 'react';
import { compressPhotoForUpload } from '@/lib/compressPhoto';
import { Upload, Copy, Check, ChevronDown, ChevronUp, Loader } from 'lucide-react';

// Daily photos from the iPad.
//
// Daisy: "I still really want to daily copy the photos taken with the iPad
// into the app" -- the table photos with the chalk tags, so recognition
// has them. Two ways in, both landing in the same queue:
//
//   1. On its own: an iPad Shortcut that runs every evening and sends the
//      last few days' camera photos. Anything already sent is ignored.
//   2. By hand: pick photos here and send them.
//
// Every photo then goes through the backfill read on the five-minute
// loop: chalk tag, booking, pieces, and shape recognition after that.

const API = process.env.NEXT_PUBLIC_API_URL;

interface Setup {
  token: string;
  last_received_at: string | null;
  week: { received: number; matched: number; waiting: number; needs_a_look: number; pieces: number };
}

function CopyLine({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div style={{ margin: '0.35rem 0' }}>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>{label}</div>
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
        <code style={{
          flex: 1, minWidth: 0, overflowX: 'auto', whiteSpace: 'nowrap', padding: '0.45rem 0.6rem',
          backgroundColor: 'var(--ivory)', border: '1px solid var(--sand)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-sm)',
        }}>{value}</code>
        <button
          onClick={() => { navigator.clipboard?.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => {}); }}
          style={{ border: '1px solid var(--stone)', background: '#fff', borderRadius: 'var(--radius-sm)', padding: '0.4rem 0.55rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-xs)' }}
        >{done ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}</button>
      </div>
    </div>
  );
}

export function DailyIpadPhotos() {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [showHow, setShowHow] = useState(false);
  const [sending, setSending] = useState<{ done: number; total: number; added: number; skipped: number; failed: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => fetch(`${API}/api/spec/backfill/ingest-setup`, { cache: 'no-store' })
    .then((r) => r.json()).then((d) => { if (!d.error) setSetup(d); }).catch(() => {});
  useEffect(() => { load(); }, []);

  const send = async (files: FileList | null) => {
    if (!files?.length || !setup) return;
    const list = Array.from(files);
    const st = { done: 0, total: list.length, added: 0, skipped: 0, failed: 0 };
    setSending({ ...st });
    for (const f of list) {
      try {
        // Large enough to read a chalk tag across a table, small enough to send quickly.
        const jpeg = await compressPhotoForUpload(f, 2048, 0.88);
        const fd = new FormData();
        fd.append('photo', jpeg, 'table.jpg');
        fd.append('token', setup.token);
        if (f.lastModified) fd.append('taken_at', new Date(f.lastModified).toISOString());
        const r = await fetch(`${API}/api/spec/backfill/ingest`, { method: 'POST', body: fd });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) st.failed++; else if (d.duplicate) st.skipped++; else st.added++;
      } catch { st.failed++; }
      st.done++;
      setSending({ ...st });
    }
    if (fileRef.current) fileRef.current.value = '';
    load();
  };

  const url = `${API}/api/spec/backfill/ingest`;
  const last = setup?.last_received_at
    ? new Date(setup.last_received_at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div style={{ backgroundColor: '#fff', border: '1px solid var(--sand)', borderRadius: 'var(--radius-lg)', padding: '1rem', marginBottom: '1rem' }}>
      <div style={{ fontWeight: 700, fontSize: 'var(--text-lg)', color: 'var(--charcoal)' }}>Daily from the iPad</div>
      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)', marginTop: '0.2rem', lineHeight: 1.45 }}>
        Table photos with the chalk tag in shot. Each one is matched to its booking by the name on the tag, and the pieces go on to shape recognition.
      </div>

      {setup && (
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.75rem', fontSize: 'var(--text-sm)' }}>
          <span><b>{setup.week.received}</b> <span style={{ color: 'var(--muted)' }}>sent this week</span></span>
          <span><b>{setup.week.matched}</b> <span style={{ color: 'var(--muted)' }}>matched</span></span>
          <span><b>{setup.week.pieces}</b> <span style={{ color: 'var(--muted)' }}>pieces</span></span>
          {setup.week.waiting > 0 && <span><b>{setup.week.waiting}</b> <span style={{ color: 'var(--muted)' }}>being read</span></span>}
          {setup.week.needs_a_look > 0 && <span style={{ color: 'var(--danger)' }}><b>{setup.week.needs_a_look}</b> need a look</span>}
        </div>
      )}
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', marginTop: '0.3rem' }}>
        {last ? `Last photo received ${last}` : 'Nothing received from the iPad yet.'}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.8rem', alignItems: 'center' }}>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => send(e.target.files)} />
        <button
          onClick={() => fileRef.current?.click()} disabled={!setup || (sending !== null && sending.done < sending.total)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 0.95rem', borderRadius: 999, border: 'none', backgroundColor: 'var(--clay)', color: '#fff', fontWeight: 600, fontSize: 'var(--text-sm)', cursor: 'pointer' }}
        >
          {sending && sending.done < sending.total ? <Loader size={15} className="animate-spin" /> : <Upload size={15} />} Send photos now
        </button>
        {sending && (
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>
            {sending.done < sending.total
              ? `Sending ${sending.done + 1} of ${sending.total}...`
              : `Done: ${sending.added} new${sending.skipped ? `, ${sending.skipped} already had` : ''}${sending.failed ? `, ${sending.failed} failed` : ''}. They are read within five minutes.`}
          </span>
        )}
      </div>

      <button onClick={() => setShowHow(!showHow)} style={{ marginTop: '0.8rem', border: 'none', background: 'none', padding: 0, color: 'var(--clay)', fontWeight: 600, fontSize: 'var(--text-sm)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {showHow ? <ChevronUp size={16} /> : <ChevronDown size={16} />} Set the iPad to send them by itself every evening
      </button>

      {showHow && setup && (
        <div style={{ marginTop: '0.6rem', fontSize: 'var(--text-sm)', color: 'var(--charcoal)', lineHeight: 1.55 }}>
          <p style={{ margin: '0 0 0.5rem' }}>Do this once on the studio iPad, in the <b>Shortcuts</b> app. It takes about five minutes.</p>
          <CopyLine label="Address to send to" value={url} />
          <CopyLine label="Studio key" value={setup.token} />
          <ol style={{ paddingLeft: '1.2rem', margin: '0.6rem 0 0' }}>
            <li><b>Automation</b> tab, then <b>New Automation</b>, then <b>Time of Day</b>. Pick a time after the last session, say 6:30pm, <b>Daily</b>, and choose <b>Run Immediately</b>. Then <b>New Blank Automation</b>.</li>
            <li>Add <b>Find Photos</b>. Add filters: <i>Date Taken is in the last 3 days</i>, <i>Media Type is Image</i>, <i>Is a Screenshot is false</i>. (Three days so a missed evening catches up. Photos already sent are ignored.)</li>
            <li>Add <b>Repeat with Each</b>, using the photos from step 2.</li>
            <li>Inside the repeat, add <b>Convert Image</b>: Repeat Item to <b>JPEG</b>.</li>
            <li>Still inside, add <b>Get Details of Images</b>: <b>Date Taken</b> of Repeat Item. Then <b>Format Date</b>: that date, format <b>ISO 8601</b>.</li>
            <li>Still inside, add <b>Get Contents of URL</b>. Paste the address above. Tap the arrow: Method <b>POST</b>, Request Body <b>Form</b>. Add three fields:
              <ul style={{ paddingLeft: '1.1rem', margin: '0.2rem 0' }}>
                <li><b>token</b>, Text: paste the studio key</li>
                <li><b>taken_at</b>, Text: the Formatted Date</li>
                <li><b>photo</b>, File: the Converted Image</li>
              </ul>
            </li>
            <li>Tap <b>Done</b>. Tap the automation once and run it to test: the count above goes up.</li>
          </ol>
          <p style={{ margin: '0.6rem 0 0', color: 'var(--muted)', fontSize: 'var(--text-xs)' }}>
            Keep the iPad on charge and on the studio Wi-Fi in the evening. Photos without a chalk tag, like stock or kiln shots, are read and set aside, not matched to anyone. The key only lets photos in; it cannot read anything out.
          </p>
        </div>
      )}
    </div>
  );
}
