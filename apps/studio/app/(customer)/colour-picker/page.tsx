'use client';

export const dynamic = 'force-dynamic';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Camera, Plus, Trash2 } from 'lucide-react';
import { STUDIO_COLOURS, type StudioColour } from '@/lib/glazes';

type Glaze = StudioColour;

const STARTER: Glaze[] = STUDIO_COLOURS;

const STORAGE_KEY = 'glazeup_palette';

function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

// Perceptual-ish distance. Weighted RGB is closer to how the eye judges
// difference than plain Euclidean, and is enough for "which glaze is nearest".
function distance(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) {
  const rMean = (a.r + b.r) / 2;
  const dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b;
  return Math.sqrt((2 + rMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rMean) / 256) * db * db);
}

// Real theoretical max for this weighted-RGB formula -- pure black vs pure
// white, the furthest apart two colours can ever be. Used to turn a raw
// distance into an honest 0-100% match, not an arbitrary scale.
const MAX_DISTANCE = distance({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 });

function matchPercent(d: number) {
  return Math.max(0, Math.round(100 - (d / MAX_DISTANCE) * 100));
}

export default function ColourPickerPage() {
  const [palette, setPalette] = useState<Glaze[]>(STARTER);
  const [picked, setPicked] = useState<{ r: number; g: number; b: number } | null>(null);
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [editingPalette, setEditingPalette] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setPalette(JSON.parse(saved));
    } catch { /* first run */ }
  }, []);

  const savePalette = (next: Glaze[]) => {
    setPalette(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImgSrc(URL.createObjectURL(f));
    setPicked(null);
  };

  useEffect(() => {
    if (!imgSrc) return;
    const img = new Image();
    img.onload = () => {
      const c = canvasRef.current;
      if (!c) return;
      const maxW = 340;
      const scale = Math.min(1, maxW / img.width);
      c.width = img.width * scale;
      c.height = img.height * scale;
      c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
    };
    img.src = imgSrc;
  }, [imgSrc]);

  const pick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) * (c.width / rect.width));
    const y = Math.floor((e.clientY - rect.top) * (c.height / rect.height));
    const d = c.getContext('2d')?.getImageData(x, y, 1, 1).data;
    if (d) setPicked({ r: d[0], g: d[1], b: d[2] });
  };

  const matches = picked
    ? palette
        .map((g) => ({ ...g, d: distance(picked, hexToRgb(g.hex)) }))
        .sort((a, b) => a.d - b.d)
    : [];

  return (
    <div style={{ backgroundColor: 'var(--ivory)', minHeight: '100%' }}>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ padding: '2rem 1.5rem', maxWidth: '600px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.9rem', fontWeight: 800, marginBottom: '0.3rem', color: 'var(--charcoal)', letterSpacing: '-0.02em' }}>Colour Picker</h1>
        <p style={{ color: 'var(--charcoal)', opacity: 0.65, fontSize: '0.92rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
          Have a vase, curtains, or a photo you love? Photograph it, tap the colour, and see how well each of our real glazes would match once fired.
        </p>

        <div style={{ padding: '0.85rem 1rem', backgroundColor: 'var(--sand)', borderRadius: '12px', fontSize: '0.8rem', marginBottom: '1.75rem', color: 'var(--charcoal)', opacity: 0.85 }}>
          Matching against the real 19 Stroke &amp; Coat colours actually stocked in the studio. An unfired pot will look far paler than its eventual match.
        </div>

        {/* Real, always-visible palette browse -- separate from "Edit
            palette" below, which is for actually changing entries and
            doesn't need to be the default view. */}
        <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--clay)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.7rem' }}>Our 19 real glazes</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: '0.7rem', marginBottom: '2rem' }}>
          {palette.map((g) => (
            <div key={g.code} style={{ textAlign: 'center' }}>
              <div style={{
                width: '100%', aspectRatio: '1', borderRadius: '50%',
                background: `linear-gradient(155deg, ${g.hex} 0%, ${g.hex}dd 100%)`,
                boxShadow: `0 3px 10px ${g.hex}55, inset 0 1px 2px rgba(255,255,255,0.4)`,
                marginBottom: '0.4rem',
              }} />
              <p style={{ fontSize: '0.68rem', fontWeight: 700, lineHeight: 1.2, color: 'var(--charcoal)' }}>{g.name}</p>
              <p style={{ fontSize: '0.62rem', color: 'var(--stone)' }}>Nº{g.code}</p>
            </div>
          ))}
        </div>

        <label
          style={{
            width: '100%', padding: '2rem', borderRadius: '16px', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem', marginBottom: '1.75rem', position: 'relative',
            background: 'linear-gradient(155deg, var(--sand) 0%, #DCC9AC 100%)',
            boxShadow: '0 4px 14px rgba(184,121,70,0.18)',
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onFile}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
          />
          <div style={{ width: 52, height: 52, borderRadius: '50%', backgroundColor: 'var(--clay)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 8px rgba(184,121,70,0.4)' }}>
            <Camera size={24} color="white" />
          </div>
          <span style={{ color: 'var(--charcoal)', fontSize: '0.92rem', fontWeight: 600 }}>Take or choose a photo</span>
        </label>

        {imgSrc && (
          <canvas
            ref={canvasRef}
            onClick={pick}
            style={{ width: '100%', borderRadius: '16px', cursor: 'crosshair', marginBottom: '1.25rem', display: 'block', boxShadow: '0 4px 16px rgba(43,39,36,0.12)' }}
          />
        )}

        {picked && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', marginBottom: '1.5rem', padding: '0.9rem 1rem', backgroundColor: 'white', borderRadius: '14px', boxShadow: '0 3px 10px rgba(43,39,36,0.08)' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', boxShadow: `0 3px 8px rgba(${picked.r},${picked.g},${picked.b},0.4), inset 0 1px 2px rgba(255,255,255,0.4)`, backgroundColor: `rgb(${picked.r},${picked.g},${picked.b})`, flexShrink: 0 }} />
              <div>
                <p style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--charcoal)' }}>Picked colour</p>
                <p style={{ fontSize: '0.75rem', color: 'var(--stone)', fontFamily: 'monospace' }}>
                  rgb({picked.r}, {picked.g}, {picked.b})
                </p>
              </div>
            </div>

            <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--clay)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.7rem' }}>All 19, ranked by match</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.75rem' }}>
              {matches.map((m, i) => (
                <div
                  key={m.code}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '0.7rem 0.9rem', borderRadius: '12px',
                    backgroundColor: 'white',
                    boxShadow: i === 0 ? '0 4px 14px rgba(184,121,70,0.22)' : '0 2px 6px rgba(43,39,36,0.06)',
                    border: i === 0 ? '1.5px solid var(--clay)' : '1px solid transparent',
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: `linear-gradient(155deg, ${m.hex} 0%, ${m.hex}dd 100%)`,
                    boxShadow: `0 2px 6px ${m.hex}55, inset 0 1px 2px rgba(255,255,255,0.4)`,
                  }} />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: i === 0 ? 700 : 500, fontSize: '0.88rem', color: 'var(--charcoal)' }}>
                      Nº{m.code} {m.name}
                    </p>
                    {i === 0 && <p style={{ fontSize: '0.72rem', color: 'var(--clay)', fontWeight: 600 }}>closest match</p>}
                  </div>
                  <div style={{
                    padding: '0.3rem 0.6rem', borderRadius: '999px', flexShrink: 0,
                    backgroundColor: i === 0 ? 'var(--clay)' : 'var(--sand)',
                  }}>
                    <p style={{ fontWeight: 700, fontSize: '0.85rem', color: i === 0 ? 'white' : 'var(--charcoal)' }}>
                      {matchPercent(m.d)}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <button
          onClick={() => setEditingPalette(!editingPalette)}
          style={{ fontSize: '0.85rem', color: 'var(--clay)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          {editingPalette ? 'Done editing' : 'Edit palette'}
        </button>

        {editingPalette && (
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', backgroundColor: 'white', borderRadius: '14px', padding: '1rem', boxShadow: '0 3px 10px rgba(43,39,36,0.08)' }}>
            {palette.map((g, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <input
                  type="color"
                  value={g.hex}
                  onChange={(e) => {
                    const next = [...palette];
                    next[idx] = { ...g, hex: e.target.value };
                    savePalette(next);
                  }}
                  style={{ width: 38, height: 34, border: '1px solid var(--stone)', borderRadius: '8px', padding: 0 }}
                />
                <input
                  value={g.code}
                  onChange={(e) => { const n = [...palette]; n[idx] = { ...g, code: e.target.value }; savePalette(n); }}
                  placeholder="Nº"
                  style={{ width: 54, padding: '0.4rem', border: '1px solid var(--stone)', borderRadius: '8px', fontSize: '0.85rem' }}
                />
                <input
                  value={g.name}
                  onChange={(e) => { const n = [...palette]; n[idx] = { ...g, name: e.target.value }; savePalette(n); }}
                  placeholder="Name"
                  style={{ flex: 1, padding: '0.4rem', border: '1px solid var(--stone)', borderRadius: '8px', fontSize: '0.85rem' }}
                />
                <button
                  onClick={() => savePalette(palette.filter((_, i) => i !== idx))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c33' }}
                  aria-label="Remove glaze"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            <button
              onClick={() => savePalette([...palette, { code: '', name: 'New glaze', hex: '#cccccc' }])}
              style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.5rem', backgroundColor: 'var(--sand)', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', justifyContent: 'center', fontWeight: 600, color: 'var(--charcoal)' }}
            >
              <Plus size={14} /> Add a glaze
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
