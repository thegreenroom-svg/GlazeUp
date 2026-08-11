'use client';

export const dynamic = 'force-dynamic';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Upload } from 'lucide-react';

// Simple silhouettes for the common blank shapes. Drawn as paths rather than
// images so they scale cleanly and need no assets.
const SHAPES: Record<string, { label: string; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void }> = {
  mug: {
    label: 'Mug',
    draw: (ctx, w, h) => {
      const bw = w * 0.44, bh = h * 0.5, x = w / 2 - bw / 2, y = h / 2 - bh / 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + bw, y);
      ctx.lineTo(x + bw * 0.92, y + bh);
      ctx.lineTo(x + bw * 0.08, y + bh);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(x + bw + bw * 0.16, y + bh * 0.38, bw * 0.19, bh * 0.2, 0, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
    },
  },
  plate: {
    label: 'Plate',
    draw: (ctx, w, h) => {
      ctx.beginPath();
      ctx.ellipse(w / 2, h / 2, w * 0.33, h * 0.33, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(w / 2, h / 2, w * 0.26, h * 0.26, 0, 0, Math.PI * 2);
      ctx.stroke();
    },
  },
  bowl: {
    label: 'Bowl',
    draw: (ctx, w, h) => {
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.42, w * 0.3, h * 0.09, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(w / 2 - w * 0.3, h * 0.42);
      ctx.quadraticCurveTo(w / 2, h * 0.78, w / 2 + w * 0.3, h * 0.42);
      ctx.stroke();
    },
  },
  jug: {
    label: 'Jug',
    draw: (ctx, w, h) => {
      const bw = w * 0.36, x = w / 2 - bw / 2, y = h * 0.3, bh = h * 0.42;
      ctx.beginPath();
      ctx.moveTo(x, y + bh);
      ctx.lineTo(x, y + bh * 0.25);
      ctx.quadraticCurveTo(x, y, x + bw * 0.5, y);
      ctx.quadraticCurveTo(x + bw, y, x + bw, y + bh * 0.25);
      ctx.lineTo(x + bw, y + bh);
      ctx.closePath();
      ctx.stroke();
    },
  },
};

export default function DesignPreviewPage() {
  const [shape, setShape] = useState<string>('mug');
  const [design, setDesign] = useState<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(0.5);
  const [offsetY, setOffsetY] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const redraw = () => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#FAF7F2';
    ctx.fillRect(0, 0, c.width, c.height);

    if (design) {
      const dw = c.width * scale;
      const dh = (design.height / design.width) * dw;
      ctx.globalAlpha = 0.92;
      ctx.drawImage(design, c.width / 2 - dw / 2, c.height / 2 - dh / 2 + offsetY, dw, dh);
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = '#8a8175';
    ctx.lineWidth = 2;
    SHAPES[shape].draw(ctx, c.width, c.height);
  };

  useEffect(redraw, [shape, design, scale, offsetY]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = 340;
    c.height = 340;
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const img = new Image();
    img.onload = () => setDesign(img);
    img.src = URL.createObjectURL(f);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem', maxWidth: '600px' }}>
      <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>Design Preview</h1>
      <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
        See roughly how a design will sit on a shape before anyone picks up a brush.
      </p>

      <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.8rem', flexWrap: 'wrap' }}>
        {Object.entries(SHAPES).map(([k, s]) => (
          <button
            key={k}
            onClick={() => setShape(k)}
            style={{
              padding: '0.4rem 0.8rem', borderRadius: '999px', border: 'none', cursor: 'pointer', fontSize: '0.8rem',
              backgroundColor: shape === k ? 'var(--clay)' : '#f0f0f0',
              color: shape === k ? 'white' : '#444',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
      <button
        onClick={() => fileRef.current?.click()}
        style={{ width: '100%', padding: '0.8rem', border: '2px dashed #ccc', borderRadius: '8px', backgroundColor: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', marginBottom: '1rem', fontSize: '0.88rem', color: '#666' }}
      >
        <Upload size={17} color="var(--clay)" /> {design ? 'Choose a different design' : 'Upload a design'}
      </button>

      <canvas ref={canvasRef} style={{ width: '100%', maxWidth: 340, border: '1px solid #eee', borderRadius: '8px', display: 'block', marginBottom: '0.8rem' }} />

      {design && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#666', width: '3.5rem' }}>Size</span>
            <input type="range" min={0.1} max={1} step={0.02} value={scale} onChange={(e) => setScale(Number(e.target.value))} style={{ flex: 1 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#666', width: '3.5rem' }}>Up/down</span>
            <input type="range" min={-100} max={100} value={offsetY} onChange={(e) => setOffsetY(Number(e.target.value))} style={{ flex: 1 }} />
          </div>
        </div>
      )}
    </motion.div>
  );
}
