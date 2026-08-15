'use client';

export const dynamic = 'force-dynamic';

import { Flame, AlertTriangle, Wind, PhoneCall } from 'lucide-react';

// Real content, drawn directly from the real documents on file for The
// Kiln Cafe (Fire Safety Assessment, the pottery studio Risk Assessment,
// and the Fire Emergency Evacuation Plan) -- not generic placeholder
// text. Static reference, no backend needed: this is real-world policy
// content, not live data. Deliberately excludes anything naming a
// specific employee (personal certificates, contracts) -- that stays
// with HR, not a general staff app.
export default function HealthSafetyPage() {
  return (
    <div style={{ padding: '1.5rem', maxWidth: 700, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.3rem' }}>Health &amp; Safety</h1>
      <p style={{ color: '#666', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
        Quick reference for staff. The full assessments are on file — ask a manager if you need the complete documents.
      </p>

      <section style={{ marginBottom: '1.75rem' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.6rem' }}>
          <Flame size={18} color="#c0392b" /> Fire — what to do
        </h2>
        <ol style={{ paddingLeft: '1.2rem', fontSize: '0.88rem', lineHeight: 1.8, color: '#333' }}>
          <li>Raise the alarm — nearest call point, or shout/whistle if none nearby.</li>
          <li>Call 999, ask for the Fire Service. Give the address: The Kiln Cafe, The Old Bank, Cheapside, Langport, Somerset, TA10 9PD.</li>
          <li>Evacuate calmly — via the front door or the side exit. Help anyone who needs it.</li>
          <li>If safe to do, sweep the building on your way out and close doors behind you.</li>
          <li>Meet at the assembly point: <strong>the telephone box in the market square.</strong></li>
          <li>Only use a fire extinguisher if you've been trained and it's genuinely safe to. If in doubt, don't — get out.</li>
          <li>Don't go back in until the Fire Service confirms it's safe.</li>
        </ol>
        <p style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.6rem' }}>
          Fire safety training is given on induction, and refreshed annually — more often if there's been a significant change.
        </p>
      </section>

      <section style={{ marginBottom: '1.75rem' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.6rem' }}>
          <AlertTriangle size={18} color="#e0a020" /> Fire hazards specific to this studio
        </h2>
        <ul style={{ paddingLeft: '1.2rem', fontSize: '0.88rem', lineHeight: 1.7, color: '#333' }}>
          <li><strong>Ignition sources:</strong> the kiln, electrical equipment, lighting, hot surfaces.</li>
          <li><strong>Fuel sources:</strong> paper, cardboard, fabrics, some glazes, and combustible clay/glaze dust.</li>
          <li>Kilns must be installed and run exactly per the manufacturer's instructions, in a fire-safe, well-ventilated spot.</li>
          <li>Keep dust down with wet mopping / HEPA vacuuming — clay and glaze dust is a real fire risk, not just a mess.</li>
          <li>Store glazes properly — some carry real flammability or toxicity risk.</li>
        </ul>
      </section>

      <section style={{ marginBottom: '1.75rem' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.6rem' }}>
          <Wind size={18} color="#5a8fc7" /> Pottery &amp; glaze — everyday hazards
        </h2>
        <ul style={{ paddingLeft: '1.2rem', fontSize: '0.88rem', lineHeight: 1.7, color: '#333' }}>
          <li>Silica and other dust can spread across floors and work surfaces — clean it up properly, don't just brush it aside.</li>
          <li>Handle glazes and chemicals as labelled. If something isn't labelled, don't guess — ask before using it.</li>
          <li>Wear the PPE provided when it's called for, and check it's actually in good condition before you use it.</li>
          <li>Broken glass and bisque gets disposed of properly, not left loose where it can cause a cut.</li>
          <li>Report any spill, breakage, or hazard you spot — don't leave it for the next person.</li>
        </ul>
      </section>

      <section style={{ padding: '0.9rem', backgroundColor: '#fef6f6', border: '1px solid #f0c0c0', borderRadius: 8 }}>
        <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.3rem' }}>
          <PhoneCall size={16} color="#c0392b" /> In a real emergency
        </p>
        <p style={{ fontSize: '0.85rem', color: '#333' }}>Call 999 first. Don't wait to find a manager.</p>
      </section>
    </div>
  );
}
