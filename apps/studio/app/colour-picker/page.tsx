'use client';

export const dynamic = 'force-dynamic';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Camera, Plus, Trash2 } from 'lucide-react';

interface Glaze {
  code: string;
  name: string;
  hex: string;
}

// The studio's REAL 82-colour Mayco Stroke & Coat range, pulled directly
// from the live customer app's own STUDIO_COLOURS array (app/index.html on
// main) rather than reconstructed -- this is the exact palette customers
// already see and build favourites from there. Hex values approximate the
// FIRED tile, which is the right matching target: an unfired pot looks far
// paler than its eventual colour.
const STARTER: Glaze[] = [
  { code: 'SC-16', name: 'Cotton Tail', hex: '#f5f0e6' },
  { code: 'SC-37', name: 'Ivory Tower', hex: '#f0e6d2' },
  { code: 'SC-55', name: 'Yella Bout It', hex: '#f5d020' },
  { code: 'SC-6', name: 'Sunkissed', hex: '#f7c948' },
  { code: 'SC-42', name: 'Butter Me Up', hex: '#f9e17a' },
  { code: 'SC-24', name: 'Dandelion', hex: '#f9d423' },
  { code: 'SC-97', name: 'Cant-elope', hex: '#f4a13a' },
  { code: 'SC-102', name: 'Just Peachy', hex: '#f6b98a' },
  { code: 'SC-23', name: 'Jack O\'Lantern', hex: '#e8721f' },
  { code: 'SC-75', name: 'Orange-A-Peel', hex: '#eb7a1f' },
  { code: 'SC-50', name: 'Orange Ya Happy', hex: '#f0862a' },
  { code: 'SC-2', name: 'Melon-choly', hex: '#f0836b' },
  { code: 'SC-89', name: 'Cutie Pie Coral', hex: '#f27a63' },
  { code: 'SC-88', name: 'Tu Tu Tango', hex: '#e8437a' },
  { code: 'SC-73', name: 'Candy Apple Red', hex: '#c81e2c' },
  { code: 'SC-74', name: 'Hot Tamale', hex: '#d8331f' },
  { code: 'SC-87', name: 'Ruby Slippers', hex: '#a3162a' },
  { code: 'SC-81', name: 'Cinnamon Stix', hex: '#9c4a2e' },
  { code: 'SC-1', name: 'Pink-A-Boo', hex: '#f2a8c0' },
  { code: 'SC-100', name: 'Makin Me Blush', hex: '#f0b8be' },
  { code: 'SC-70', name: 'Pink-A-Dot', hex: '#eb9fb8' },
  { code: 'SC-95', name: 'Pinkie Swear', hex: '#f3a9c4' },
  { code: 'SC-17', name: 'Cheeky Pinky', hex: '#e8799f' },
  { code: 'SC-18', name: 'Rosey Posey', hex: '#d9738c' },
  { code: 'SC-3', name: 'Wine About It', hex: '#5e1a2e' },
  { code: 'SC-40', name: 'Blueberry Hill', hex: '#2c4f9e' },
  { code: 'SC-13', name: 'Grapel', hex: '#5b3a7a' },
  { code: 'SC-85', name: 'Orkid', hex: '#9a5bb0' },
  { code: 'SC-103', name: 'Lavendear', hex: '#b39ddb' },
  { code: 'SC-53', name: 'Purple Haze', hex: '#6a3b96' },
  { code: 'SC-72', name: 'Grape Jelly', hex: '#4a2560' },
  { code: 'SC-71', name: 'Purple-Licious', hex: '#7a3d99' },
  { code: 'SC-33', name: 'Fruit Of The Vine', hex: '#42225c' },
  { code: 'SC-104', name: 'Grape Expectations', hex: '#6e3f8f' },
  { code: 'SC-45', name: 'My Blue Heaven', hex: '#5b9bd5' },
  { code: 'SC-91', name: 'Seabreeze', hex: '#7fc7c2' },
  { code: 'SC-65', name: 'Peri-Twinkle', hex: '#7b8fd6' },
  { code: 'SC-30', name: 'Blue Dawn', hex: '#2f6fb0' },
  { code: 'SC-31', name: 'The Blues', hex: '#274b8f' },
  { code: 'SC-11', name: 'Blue Yonder', hex: '#3a6fb5' },
  { code: 'SC-58', name: '501 Blues', hex: '#3c5a8c' },
  { code: 'SC-76', name: 'Cara-bein Blue', hex: '#1c94a8' },
  { code: 'SC-12', name: 'Moody Blue', hex: '#345a8a' },
  { code: 'SC-96', name: 'Aqu-ward', hex: '#4fb8b0' },
  { code: 'SC-101', name: 'Spruce It Up', hex: '#3c6e4f' },
  { code: 'SC-9', name: 'Jaded', hex: '#3c8f6e' },
  { code: 'SC-28', name: 'Blue Isle', hex: '#2e8f9e' },
  { code: 'SC-10', name: 'Teal Next Time', hex: '#1f7d7a' },
  { code: 'SC-29', name: 'Blue Grass', hex: '#4a8f7e' },
  { code: 'SC-32', name: 'Bluebeard', hex: '#1c3f6e' },
  { code: 'SC-93', name: 'Honeydew List', hex: '#c8dca0' },
  { code: 'SC-43', name: 'Lettuce Alone', hex: '#7bab4a' },
  { code: 'SC-7', name: 'Leapin\' Lizard', hex: '#8dc63f' },
  { code: 'SC-26', name: 'Green Thumb', hex: '#4f8f3a' },
  { code: 'SC-8', name: 'Just Froggy', hex: '#6fae3e' },
  { code: 'SC-36', name: 'Irish Luck', hex: '#2e7d3e' },
  { code: 'SC-77', name: 'Glo-Worm', hex: '#9fd83a' },
  { code: 'SC-78', name: 'Lime Light', hex: '#c4e034' },
  { code: 'SC-98', name: 'Slime Time', hex: '#a8c93a' },
  { code: 'SC-27', name: 'Sour Apple', hex: '#9ecb3f' },
  { code: 'SC-52', name: 'Toad-ily Green', hex: '#5e8f4a' },
  { code: 'SC-79', name: 'It\'s Sage', hex: '#8fa878' },
  { code: 'SC-39', name: 'Army Surplus', hex: '#5e6b3e' },
  { code: 'SC-86', name: 'Old Lace', hex: '#f2e8d5' },
  { code: 'SC-54', name: 'Vanilla Dip', hex: '#f0dfc0' },
  { code: 'SC-20', name: 'Cashew Later', hex: '#c9a877' },
  { code: 'SC-46', name: 'Rawhide', hex: '#b78a5e' },
  { code: 'SC-51', name: 'Poo Bear', hex: '#7a5230' },
  { code: 'SC-5', name: 'Tiger Tail', hex: '#c9752e' },
  { code: 'SC-25', name: 'Crackerjack Brown', hex: '#6e4423' },
  { code: 'SC-80', name: 'Basketball', hex: '#a85a2e' },
  { code: 'SC-41', name: 'Brown Cow', hex: '#5c3b23' },
  { code: 'SC-48', name: 'Camel Back', hex: '#c9a06a' },
  { code: 'SC-14', name: 'Java Bean', hex: '#3c2718' },
  { code: 'SC-34', name: 'Down To Earth', hex: '#6e5233' },
  { code: 'SC-92', name: 'Café Ole', hex: '#5e3d24' },
  { code: 'SC-90', name: 'Elephant Ears', hex: '#8a7d6e' },
  { code: 'SC-83', name: 'Tip Taupe', hex: '#a89684' },
  { code: 'SC-60', name: 'Silver Lining', hex: '#a8adb0' },
  { code: 'SC-35', name: 'Gray Hare', hex: '#7e8286' },
  { code: 'SC-99', name: 'Char-ming', hex: '#4a4a4a' },
  { code: 'SC-15', name: 'Tuxedo', hex: '#1a1a1a' },
];


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

export default function ColourPickerPage() {
  const [palette, setPalette] = useState<Glaze[]>(STARTER);
  const [picked, setPicked] = useState<{ r: number; g: number; b: number } | null>(null);
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
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
        .slice(0, 4)
    : [];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem', maxWidth: '600px' }}>
      <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>Colour Picker</h1>
      <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
        Photograph anything, tap a colour, and see which glazes come closest. Free tool.
      </p>

      <div style={{ padding: '0.7rem 0.9rem', backgroundColor: '#fff8e1', border: '1px solid #ffca28', borderRadius: '6px', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
        Matching against the real 82-colour Stroke &amp; Coat range customers pick from in the studio app. An unfired pot will look far paler than its eventual match.
      </div>

      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display: 'none' }} />
      <button
        onClick={() => fileRef.current?.click()}
        style={{ width: '100%', padding: '1.5rem', border: '2px dashed #ccc', borderRadius: '8px', backgroundColor: 'white', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', marginBottom: '1.25rem' }}
      >
        <Camera size={28} color="var(--clay)" />
        <span style={{ color: '#666', fontSize: '0.9rem' }}>Take or choose a photo</span>
      </button>

      {imgSrc && (
        <canvas
          ref={canvasRef}
          onClick={pick}
          style={{ width: '100%', borderRadius: '8px', cursor: 'crosshair', marginBottom: '1rem', display: 'block' }}
        />
      )}

      {picked && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', marginBottom: '1rem' }}>
            <div style={{ width: 52, height: 52, borderRadius: 8, border: '1px solid #ddd', backgroundColor: `rgb(${picked.r},${picked.g},${picked.b})` }} />
            <div>
              <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>Picked colour</p>
              <p style={{ fontSize: '0.75rem', color: '#999', fontFamily: 'monospace' }}>
                rgb({picked.r}, {picked.g}, {picked.b})
              </p>
            </div>
          </div>

          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Closest glazes</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1.5rem' }}>
            {matches.map((m, i) => (
              <div key={m.code} style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.55rem 0.7rem', backgroundColor: i === 0 ? '#fdf6f8' : '#f9f9f9', borderRadius: '6px' }}>
                <div style={{ width: 34, height: 34, borderRadius: 5, border: '1px solid #ddd', backgroundColor: m.hex, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: i === 0 ? 600 : 400, fontSize: '0.88rem' }}>
                    Nº{m.code} {m.name}
                  </p>
                  {i === 0 && <p style={{ fontSize: '0.72rem', color: 'var(--clay)' }}>closest match</p>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <button
        onClick={() => setEditing(!editing)}
        style={{ fontSize: '0.85rem', color: 'var(--clay)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        {editing ? 'Done editing' : 'Edit palette'}
      </button>

      {editing && (
        <div style={{ marginTop: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
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
                style={{ width: 38, height: 34, border: '1px solid #ddd', borderRadius: 5, padding: 0 }}
              />
              <input
                value={g.code}
                onChange={(e) => { const n = [...palette]; n[idx] = { ...g, code: e.target.value }; savePalette(n); }}
                placeholder="Nº"
                style={{ width: 54, padding: '0.4rem', border: '1px solid #ddd', borderRadius: 5, fontSize: '0.85rem' }}
              />
              <input
                value={g.name}
                onChange={(e) => { const n = [...palette]; n[idx] = { ...g, name: e.target.value }; savePalette(n); }}
                placeholder="Name"
                style={{ flex: 1, padding: '0.4rem', border: '1px solid #ddd', borderRadius: 5, fontSize: '0.85rem' }}
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
            style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.45rem', backgroundColor: '#f0f0f0', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: '0.85rem', justifyContent: 'center' }}
          >
            <Plus size={14} /> Add a glaze
          </button>
        </div>
      )}
    </motion.div>
  );
}
