'use client';

export const dynamic = 'force-dynamic';

import { Wine, Flame, HeartPulse } from 'lucide-react';

// Real content, drawn from the real training materials on file (the
// Alcohol Licensing Act 2003 trainer reference, and the Fire Safety
// Log Book's training requirements) -- not generic placeholder text.
// Static reference, no backend needed. Deliberately doesn't name
// individual staff or reference anyone's personal certificates (First
// Aid etc.) -- that's tracked with HR, not shown in a general staff app.
export default function TrainingPage() {
  return (
    <div style={{ padding: '1.5rem', maxWidth: 700, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.3rem' }}>Training</h1>
      <p style={{ color: '#666', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
        Quick reference for staff. Full training records are kept with a manager.
      </p>

      <section style={{ marginBottom: '1.75rem' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.6rem' }}>
          <Wine size={18} color="#7a3b96" /> Serving alcohol (The Lounge)
        </h2>
        <p style={{ fontSize: '0.85rem', color: '#333', marginBottom: '0.6rem' }}>
          Required under the Licensing Act 2003 for anyone serving alcohol. Every supply must be made or authorised by a personal licence holder.
        </p>
        <ul style={{ paddingLeft: '1.2rem', fontSize: '0.88rem', lineHeight: 1.7, color: '#333' }}>
          <li><strong>Challenge 25:</strong> if someone looks under 25, ask for ID. Accepted: passport, UK/EU photo driving licence, or a PASS-approved proof-of-age card.</li>
          <li>No valid ID → refuse the sale, log it (date, time, reason), let a supervisor know.</li>
          <li>Also refuse if someone appears drunk, or looks like they're buying for a minor.</li>
          <li>Refuse calmly, explain why, ask them to leave quietly, then log it.</li>
          <li>Log any refusal, accident, fight, police visit, lost property, or safeguarding concern — date, time, what happened, what you did.</li>
        </ul>
        <p style={{ fontSize: '0.78rem', color: '#999', marginTop: '0.6rem' }}>
          Selling to someone under 18 carries a fine of up to £5,000 and can put the whole premises licence at risk — this isn't a small thing to get right.
        </p>
      </section>

      <section style={{ marginBottom: '1.75rem' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.6rem' }}>
          <Flame size={18} color="#c0392b" /> Fire safety
        </h2>
        <p style={{ fontSize: '0.85rem', color: '#333', marginBottom: '0.6rem' }}>
          Given on induction, and refreshed annually (more often if things change or staff turnover is high). Every staff member should know:
        </p>
        <ul style={{ paddingLeft: '1.2rem', fontSize: '0.85rem', lineHeight: 1.7, color: '#333' }}>
          <li>What to do on discovering a fire, and on hearing the alarm</li>
          <li>How to raise the alarm (nearest call point)</li>
          <li>How to call the Fire Service (999)</li>
          <li>How to evacuate the premises, and where the fire exits are</li>
          <li>Not to use a fire extinguisher unless trained — see the Health &amp; Safety page for the full steps</li>
        </ul>
      </section>

      <section>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.6rem' }}>
          <HeartPulse size={18} color="#2e7d32" /> First aid
        </h2>
        <p style={{ fontSize: '0.85rem', color: '#333' }}>
          There are trained first aiders on the team. If there's an incident, ask a manager who's on shift right now.
        </p>
      </section>
    </div>
  );
}
