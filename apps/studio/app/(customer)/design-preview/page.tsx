'use client';

export const dynamic = 'force-dynamic';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Camera } from 'lucide-react';

interface Fill {
  x: number;
  y: number;
  colour: string;
  size: number;
}

// The studio's real 82-colour range, matching the Colour Picker so a preview
// uses glazes that actually exist on the shelf.
const QUICK_COLOURS = [
  '#f2a8c0', '#c81e2c', '#f9d423', '#8dc63f', '#2c4f9e', '#5b3a7a',
  '#e8721f', '#f0836b', '#1a1a1a', '#f5f0e6', '#5e3d24', '#6a3b96',
];

export default function DesignPreviewPage() {
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [fills, setFills] = useState<Fill[]>([]);
  const [colour, setColour] = useState(QUICK_COLOURS[0]);
  const [brushSize, setBrushSize] = useState(28);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const redraw = () => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx || !photo) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(photo, 0, 0, c.width, c.height);
    fills.forEach((f) => {
      ctx.globalAlpha = 0.72;
      ctx.fillStyle = f.colour;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  };

  useEffect(redraw, [fills, photo]);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const img = new Image();
    img.onload = () => {
      const c = canvasRef.current;
      if (c) {
        const maxW = 360;
        const scale = Math.min(1, maxW / img.width);
        c.width = img.width * scale;
        c.height = img.height * scale;
      }
      setPhoto(img);
      setFills([]);
    };
    img.src = URL.createObjectURL(f);
  };

  const paint = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current;
    if (!c || !photo) return;
    const rect = c.getBoundingClientRect();
    const point = 'touches' in e ? e.touches[0] : e;
    const x = (point.clientX - rect.left) * (c.width / rect.width);
    const y = (point.clientY - rect.top) * (c.height / rect.height);
    setFills((prev) => [...prev, { x, y, colour, size: brushSize }]);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem', maxWidth: '600px' }}>
      <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>Design Preview</h1>
      <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
        Photograph your actual piece, then dab colour straight onto the photo to see how it might look.
      </p>

      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display: 'none' }} />

      {!photo ? (
        <button
          onClick={() => fileRef.current?.click()}
          style={{ width: '100%', padding: '2rem', border: '2px dashed #ccc', borderRadius: '8px', backgroundColor: 'white', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}
        >
          <Camera size={30} color="var(--clay)" />
          <span style={{ color: '#666', fontSize: '0.9rem' }}>Photograph your piece</span>
        </button>
      ) : (
        <>
          <canvas
            ref={canvasRef}
            onClick={paint}
            style={{ width: '100%', borderRadius: '8px', cursor: 'crosshair', display: 'block', marginBottom: '0.8rem', touchAction: 'none' }}
          />

          <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
            {QUICK_COLOURS.map((c) => (
              <button
                key={c}
                onClick={() => setColour(c)}
                aria-label={`Colour ${c}`}
                style={{ width: 30, height: 30, borderRadius: '50%', backgroundColor: c, cursor: 'pointer', border: colour === c ? '3px solid var(--clay)' : '1px solid #ddd' }}
              />
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.8rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#666' }}>Brush size</span>
            <input type="range" min={8} max={60} value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} style={{ flex: 1 }} />
          </div>

          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button
              onClick={() => setFills((f) => f.slice(0, -1))}
              disabled={fills.length === 0}
              style={{ flex: 1, padding: '0.5rem', backgroundColor: '#f0f0f0', border: 'none', borderRadius: '6px', cursor: fills.length ? 'pointer' : 'not-allowed', fontSize: '0.85rem' }}
            >
              Undo
            </button>
            <button
              onClick={() => setFills([])}
              disabled={fills.length === 0}
              style={{ flex: 1, padding: '0.5rem', backgroundColor: '#f0f0f0', border: 'none', borderRadius: '6px', cursor: fills.length ? 'pointer' : 'not-allowed', fontSize: '0.85rem' }}
            >
              Clear
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              style={{ flex: 1, padding: '0.5rem', backgroundColor: 'var(--clay)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              New photo
            </button>
          </div>
        </>
      )}
    </motion.div>
  );
}
