'use client';

export const dynamic = 'force-dynamic';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Undo2, Trash2, Download, Circle, Square as SquareIcon, Minus, Pencil } from 'lucide-react';

type Tool = 'pen' | 'line' | 'rect' | 'circle';

interface Stroke {
  tool: Tool;
  colour: string;
  width: number;
  points: { x: number; y: number }[];
}

const COLOURS = ['#2B2B2B', '#E8785D', '#EFC04A', '#7FA05A', '#5E9FB0', '#4A6B96', '#A98BC0', '#F0BFC8', '#B5623F'];

export default function TransferDesignerPage() {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [tool, setTool] = useState<Tool>('pen');
  const [colour, setColour] = useState(COLOURS[0]);
  const [width, setWidth] = useState(4);
  const [drawing, setDrawing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentRef = useRef<Stroke | null>(null);

  const redraw = () => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, c.width, c.height);

    const all = currentRef.current ? [...strokes, currentRef.current] : strokes;
    all.forEach((s) => {
      ctx.strokeStyle = s.colour;
      ctx.lineWidth = s.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (s.points.length === 0) return;

      if (s.tool === 'pen') {
        ctx.beginPath();
        s.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();
      } else {
        const a = s.points[0];
        const b = s.points[s.points.length - 1];
        ctx.beginPath();
        if (s.tool === 'line') {
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
        } else if (s.tool === 'rect') {
          ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y);
        } else {
          const r = Math.hypot(b.x - a.x, b.y - a.y);
          ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
        }
        ctx.stroke();
      }
    });
  };

  useEffect(redraw, [strokes]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = 340;
    c.height = 340;
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    // Pressure-sensitive where the stylus reports it, per the spec's
    // tablet/stylus support. Falls back to the chosen width on a finger.
    const p = e.pressure && e.pressure > 0 && e.pressure !== 0.5 ? e.pressure : null;
    currentRef.current = {
      tool,
      colour,
      width: p ? Math.max(1, width * p * 2) : width,
      points: [pos(e)],
    };
    setDrawing(true);
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

  const download = () => {
    const c = canvasRef.current;
    if (!c) return;
    const a = document.createElement('a');
    a.download = `transfer-design-${Date.now()}.png`;
    a.href = c.toDataURL('image/png');
    a.click();
  };

  const tools: { key: Tool; icon: React.ReactNode; label: string }[] = [
    { key: 'pen', icon: <Pencil size={15} />, label: 'Draw' },
    { key: 'line', icon: <Minus size={15} />, label: 'Line' },
    { key: 'rect', icon: <SquareIcon size={15} />, label: 'Box' },
    { key: 'circle', icon: <Circle size={15} />, label: 'Circle' },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem', maxWidth: '600px' }}>
      <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>Transfer Designer</h1>
      <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
        Draw a design, then download it to print as a transfer.
      </p>

      <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
        {tools.map((t) => (
          <button
            key={t.key}
            onClick={() => setTool(t.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.4rem 0.65rem',
              borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.8rem',
              backgroundColor: tool === t.key ? 'var(--clay)' : '#f0f0f0',
              color: tool === t.key ? 'white' : '#444',
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
        {COLOURS.map((c) => (
          <button
            key={c}
            onClick={() => setColour(c)}
            aria-label={`Colour ${c}`}
            style={{
              width: 30, height: 30, borderRadius: '50%', backgroundColor: c, cursor: 'pointer',
              border: colour === c ? '3px solid var(--clay)' : '1px solid #ddd',
            }}
          />
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.8rem' }}>
        <span style={{ fontSize: '0.8rem', color: '#666' }}>Thickness</span>
        <input type="range" min={1} max={20} value={width} onChange={(e) => setWidth(Number(e.target.value))} style={{ flex: 1 }} />
        <span style={{ fontSize: '0.8rem', width: '1.5rem' }}>{width}</span>
      </div>

      <canvas
        ref={canvasRef}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
        style={{ width: '100%', maxWidth: 340, border: '1px solid #ddd', borderRadius: '8px', touchAction: 'none', display: 'block', marginBottom: '0.8rem' }}
      />

      <div style={{ display: 'flex', gap: '0.4rem' }}>
        <button
          onClick={() => setStrokes((s) => s.slice(0, -1))}
          disabled={strokes.length === 0}
          style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.5rem 0.8rem', backgroundColor: '#f0f0f0', border: 'none', borderRadius: '6px', cursor: strokes.length ? 'pointer' : 'not-allowed', fontSize: '0.85rem', opacity: strokes.length ? 1 : 0.5 }}
        >
          <Undo2 size={15} /> Undo
        </button>
        <button
          onClick={() => setStrokes([])}
          disabled={strokes.length === 0}
          style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.5rem 0.8rem', backgroundColor: '#f0f0f0', border: 'none', borderRadius: '6px', cursor: strokes.length ? 'pointer' : 'not-allowed', fontSize: '0.85rem', opacity: strokes.length ? 1 : 0.5 }}
        >
          <Trash2 size={15} /> Clear
        </button>
        <button
          onClick={download}
          disabled={strokes.length === 0}
          style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.5rem 0.8rem', backgroundColor: 'var(--clay)', color: 'white', border: 'none', borderRadius: '6px', cursor: strokes.length ? 'pointer' : 'not-allowed', fontSize: '0.85rem', marginLeft: 'auto', opacity: strokes.length ? 1 : 0.5 }}
        >
          <Download size={15} /> Save
        </button>
      </div>
    </motion.div>
  );
}
