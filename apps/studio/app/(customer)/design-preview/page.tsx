'use client';

export const dynamic = 'force-dynamic';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Camera, Undo2, Trash2 } from 'lucide-react';
import { SaveAndCharge } from '@/components/SaveAndCharge';
import { STUDIO_COLOURS } from '@/lib/glazes';

interface Stroke {
  colour: string;
  width: number;
  points: { x: number; y: number }[];
}

// The studio's real 19 confirmed stocked Stroke & Coat colours, shared
// with Colour Picker and Transfer Designer so the same real glaze always
// looks the same everywhere in the app.
const QUICK_COLOURS = STUDIO_COLOURS;

export default function DesignPreviewPage() {
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [colour, setColour] = useState(QUICK_COLOURS[0].hex);
  const [brushSize, setBrushSize] = useState(14);
  const [drawing, setDrawing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const currentRef = useRef<Stroke | null>(null);

  const redraw = () => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx || !photo) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(photo, 0, 0, c.width, c.height);

    const all = currentRef.current ? [...strokes, currentRef.current] : strokes;
    ctx.globalAlpha = 0.72;
    all.forEach((s) => {
      if (s.points.length === 0) return;
      ctx.strokeStyle = s.colour;
      ctx.lineWidth = s.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      if (s.points.length === 1) {
        // A single tap with no drag -- still show a dab, same as before,
        // rather than nothing at all.
        ctx.arc(s.points[0].x, s.points[0].y, s.width / 2, 0, Math.PI * 2);
        ctx.fillStyle = s.colour;
        ctx.fill();
      } else {
        s.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();
      }
    });
    ctx.globalAlpha = 1;
  };

  useEffect(redraw, [strokes, photo]);

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
      setStrokes([]);
    };
    img.src = URL.createObjectURL(f);
  };

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!photo) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    // Real pressure-sensitive fine detail, where a stylus reports it (an
    // Apple Pencil or similar reports real pressure via the Pointer Events
    // API; a plain finger touch always reports a flat 0.5, a mouse
    // reports 0.5 or nothing) -- falls back to the chosen brush size on a
    // finger, same behaviour as before this was here.
    const p = e.pressure && e.pressure > 0 && e.pressure !== 0.5 ? e.pressure : null;
    currentRef.current = {
      colour,
      width: p ? Math.max(2, brushSize * p * 1.6) : brushSize,
      points: [pos(e)],
    };
    setDrawing(true);
    redraw();
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing || !currentRef.current) return;
    currentRef.current.points.push(pos(e));
    redraw();
  };

  const up = () => {
    if (currentRef.current) setStrokes((s) => [...s, currentRef.current!]);
    currentRef.current = null;
    setDrawing(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem', maxWidth: '600px' }}>
      <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>Design Preview</h1>
      <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
        Photograph your actual piece, then paint colour straight onto the photo to see how it might look. Works with a stylus for fine detail.
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
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerLeave={up}
            style={{ width: '100%', borderRadius: '8px', cursor: 'crosshair', display: 'block', marginBottom: '0.8rem', touchAction: 'none' }}
          />

          <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#333', marginBottom: '0.4rem' }}>
            {QUICK_COLOURS.find((c) => c.hex === colour)?.name || 'Colour'}
            {' '}
            <span style={{ color: '#999', fontWeight: 400 }}>
              ({QUICK_COLOURS.find((c) => c.hex === colour)?.code})
            </span>
          </p>
          <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
            {QUICK_COLOURS.map((c) => (
              <button
                key={c.hex}
                onClick={() => setColour(c.hex)}
                title={`${c.name} (${c.code})`}
                aria-label={`${c.name}, ${c.code}`}
                style={{ width: 30, height: 30, borderRadius: '50%', backgroundColor: c.hex, cursor: 'pointer', border: colour === c.hex ? '3px solid var(--clay)' : '1px solid #ddd' }}
              />
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.8rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#666' }}>Brush size</span>
            <input type="range" min={2} max={50} value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} style={{ flex: 1 }} />
            <span style={{ fontSize: '0.8rem', color: '#999', width: '1.5rem' }}>{brushSize}</span>
          </div>

          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button
              onClick={() => setStrokes((s) => s.slice(0, -1))}
              disabled={strokes.length === 0}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', padding: '0.5rem', backgroundColor: '#f0f0f0', border: 'none', borderRadius: '6px', cursor: strokes.length ? 'pointer' : 'not-allowed', fontSize: '0.85rem', opacity: strokes.length ? 1 : 0.5 }}
            >
              <Undo2 size={15} /> Undo
            </button>
            <button
              onClick={() => setStrokes([])}
              disabled={strokes.length === 0}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', padding: '0.5rem', backgroundColor: '#f0f0f0', border: 'none', borderRadius: '6px', cursor: strokes.length ? 'pointer' : 'not-allowed', fontSize: '0.85rem', opacity: strokes.length ? 1 : 0.5 }}
            >
              <Trash2 size={15} /> Clear
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              style={{ flex: 1, padding: '0.5rem', backgroundColor: 'var(--clay)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              New photo
            </button>
          </div>

          {strokes.length > 0 && (
            <div style={{ marginTop: '0.8rem' }}>
              <SaveAndCharge tool="design-preview" label="Design Preview" />
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
