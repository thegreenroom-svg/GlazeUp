'use client';

export const dynamic = 'force-dynamic';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Camera, Type, Star, Heart, Flower2, Sparkles, Circle, Trash2 } from 'lucide-react';
import { SaveAndCharge } from '@/components/SaveAndCharge';
import { STUDIO_COLOURS } from '@/lib/glazes';

type MotifKind = 'text' | 'star' | 'heart' | 'flower' | 'swirl' | 'dot';

interface Element {
  id: number;
  kind: MotifKind;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  text?: string;
  font?: string;
  colour: string;
}

// Per the master doc: "draggable/resizable/rotatable text (4 fonts) and
// simple motif shapes (star, heart, flower, swirl, dot)".
const FONTS = ['Instrument Sans', 'Georgia', 'Courier New', 'Brush Script MT'];
// The studio's real 19 confirmed stocked Stroke & Coat colours, shared
// with Colour Picker and Design Preview -- a transfer design should use
// the same real glazes it'll actually be fired in, not arbitrary colours.
const COLOURS = STUDIO_COLOURS.map((c) => c.hex);

function drawMotif(ctx: CanvasRenderingContext2D, kind: MotifKind, size: number, colour: string) {
  ctx.fillStyle = colour;
  ctx.strokeStyle = colour;
  ctx.lineWidth = 2;
  const r = size / 2;
  switch (kind) {
    case 'star': {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (Math.PI / 5) * i - Math.PI / 2;
        const rad = i % 2 === 0 ? r : r * 0.42;
        const px = Math.cos(a) * rad, py = Math.sin(a) * rad;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'heart': {
      ctx.beginPath();
      ctx.moveTo(0, r * 0.3);
      ctx.bezierCurveTo(-r, -r * 0.5, -r * 0.5, -r, 0, -r * 0.3);
      ctx.bezierCurveTo(r * 0.5, -r, r, -r * 0.5, 0, r * 0.3);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'flower': {
      for (let i = 0; i < 5; i++) {
        const a = (Math.PI * 2 / 5) * i;
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, r * 0.42, r * 0.24, a, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'swirl': {
      ctx.beginPath();
      for (let t = 0; t < 12; t += 0.2) {
        const rad = (t / 12) * r;
        const x = Math.cos(t * 1.6) * rad, y = Math.sin(t * 1.6) * rad;
        t === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      break;
    }
    case 'dot':
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
}

export default function TransferDesignerPage() {
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [elements, setElements] = useState<Element[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [colour, setColour] = useState(COLOURS[0]);
  const [font, setFont] = useState(FONTS[0]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);
  const dragging = useRef<{ id: number; offX: number; offY: number } | null>(null);

  const redraw = () => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    if (photo) ctx.drawImage(photo, 0, 0, c.width, c.height);
    else { ctx.fillStyle = '#F7F4EE'; ctx.fillRect(0, 0, c.width, c.height); }

    elements.forEach((el) => {
      ctx.save();
      ctx.translate(el.x, el.y);
      ctx.rotate((el.rotation * Math.PI) / 180);
      ctx.scale(el.scale, el.scale);

      if (el.kind === 'text') {
        ctx.fillStyle = el.colour;
        ctx.font = `600 22px "${el.font}"`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(el.text || '', 0, 0);
      } else {
        drawMotif(ctx, el.kind, 60, el.colour);
      }

      if (selectedId === el.id) {
        ctx.strokeStyle = 'var(--clay)'.includes('var') ? '#B87946' : el.colour;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(-40, -25, 80, 50);
        ctx.setLineDash([]);
      }
      ctx.restore();
    });
  };

  useEffect(redraw, [elements, photo, selectedId]);

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
    img.onload = () => {
      const c = canvasRef.current;
      if (c) {
        const maxW = 340;
        const scale = Math.min(1, maxW / img.width);
        c.width = img.width * scale;
        c.height = img.height * scale;
      }
      setPhoto(img);
    };
    img.src = URL.createObjectURL(f);
  };

  const addMotif = (kind: MotifKind) => {
    const c = canvasRef.current;
    const el: Element = {
      id: nextId.current++,
      kind,
      x: (c?.width || 340) / 2,
      y: (c?.height || 340) / 2,
      rotation: 0,
      scale: 1,
      colour,
      ...(kind === 'text' ? { text: 'Made with love', font } : {}),
    };
    setElements((prev) => [...prev, el]);
    setSelectedId(el.id);
  };

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = pos(e);
    const hit = [...elements].reverse().find((el) => Math.hypot(el.x - p.x, el.y - p.y) < 45 * el.scale);
    if (hit) {
      setSelectedId(hit.id);
      dragging.current = { id: hit.id, offX: p.x - hit.x, offY: p.y - hit.y };
      e.currentTarget.setPointerCapture(e.pointerId);
    } else {
      setSelectedId(null);
    }
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragging.current) return;
    const p = pos(e);
    const { id, offX, offY } = dragging.current;
    setElements((prev) => prev.map((el) => (el.id === id ? { ...el, x: p.x - offX, y: p.y - offY } : el)));
  };

  const up = () => { dragging.current = null; };

  const selected = elements.find((el) => el.id === selectedId);

  const updateSelected = (patch: Partial<Element>) => {
    if (!selectedId) return;
    setElements((prev) => prev.map((el) => (el.id === selectedId ? { ...el, ...patch } : el)));
  };

  const removeSelected = () => {
    setElements((prev) => prev.filter((el) => el.id !== selectedId));
    setSelectedId(null);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem', maxWidth: '600px' }}>
      <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>Transfer Designer</h1>
      <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
        Photograph your piece, then add text and motifs to plan a transfer before it goes on for real.
      </p>

      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display: 'none' }} />
      <button
        onClick={() => fileRef.current?.click()}
        style={{ width: '100%', padding: '0.7rem', border: '2px dashed #ccc', borderRadius: '8px', backgroundColor: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', marginBottom: '0.8rem', fontSize: '0.85rem', color: '#666' }}
      >
        <Camera size={16} color="var(--clay)" /> {photo ? 'Choose a different photo' : 'Photograph your piece'}
      </button>

      <canvas
        ref={canvasRef}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
        style={{ width: '100%', maxWidth: 340, border: '1px solid #eee', borderRadius: '8px', touchAction: 'none', display: 'block', marginBottom: '0.8rem' }}
      />

      <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
        <button onClick={() => addMotif('text')} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.4rem 0.7rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', backgroundColor: '#f0f0f0' }}><Type size={14} /> Text</button>
        <button onClick={() => addMotif('star')} style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: 'none', cursor: 'pointer', backgroundColor: '#f0f0f0' }}><Star size={14} /></button>
        <button onClick={() => addMotif('heart')} style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: 'none', cursor: 'pointer', backgroundColor: '#f0f0f0' }}><Heart size={14} /></button>
        <button onClick={() => addMotif('flower')} style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: 'none', cursor: 'pointer', backgroundColor: '#f0f0f0' }}><Flower2 size={14} /></button>
        <button onClick={() => addMotif('swirl')} style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: 'none', cursor: 'pointer', backgroundColor: '#f0f0f0' }}><Sparkles size={14} /></button>
        <button onClick={() => addMotif('dot')} style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: 'none', cursor: 'pointer', backgroundColor: '#f0f0f0' }}><Circle size={14} /></button>
      </div>

      <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.8rem' }}>
        {COLOURS.map((c) => (
          <button
            key={c}
            onClick={() => { setColour(c); updateSelected({ colour: c }); }}
            style={{ width: 26, height: 26, borderRadius: '50%', backgroundColor: c, border: colour === c ? '2px solid #B87946' : '1px solid #ddd', cursor: 'pointer' }}
          />
        ))}
      </div>

      {selected && (
        <div style={{ padding: '0.8rem', backgroundColor: '#f9f9f9', borderRadius: '8px', marginBottom: '0.8rem' }}>
          <p style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.5rem' }}>Editing selected {selected.kind}</p>

          {selected.kind === 'text' && (
            <>
              <input
                value={selected.text}
                onChange={(e) => updateSelected({ text: e.target.value })}
                style={{ width: '100%', padding: '0.4rem', border: '1px solid #ddd', borderRadius: '5px', fontSize: '0.85rem', marginBottom: '0.5rem', boxSizing: 'border-box' }}
              />
              <select
                value={selected.font}
                onChange={(e) => updateSelected({ font: e.target.value })}
                style={{ width: '100%', padding: '0.4rem', border: '1px solid #ddd', borderRadius: '5px', fontSize: '0.85rem', marginBottom: '0.5rem' }}
              >
                {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
            <span style={{ fontSize: '0.75rem', color: '#666', width: '3.5rem' }}>Rotate</span>
            <input type="range" min={0} max={360} value={selected.rotation} onChange={(e) => updateSelected({ rotation: Number(e.target.value) })} style={{ flex: 1 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
            <span style={{ fontSize: '0.75rem', color: '#666', width: '3.5rem' }}>Size</span>
            <input type="range" min={0.4} max={2.5} step={0.1} value={selected.scale} onChange={(e) => updateSelected({ scale: Number(e.target.value) })} style={{ flex: 1 }} />
          </div>

          <button
            onClick={removeSelected}
            style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.35rem 0.7rem', backgroundColor: 'white', color: '#c33', border: '1px solid #f0c8c8', borderRadius: '5px', cursor: 'pointer', fontSize: '0.78rem' }}
          >
            <Trash2 size={13} /> Remove
          </button>
        </div>
      )}

      <p style={{ fontSize: '0.75rem', color: '#999' }}>
        Tap a shape or text on the design to select and drag it. This plans placement — a real transfer decal is applied by staff.
      </p>

      {elements.length > 0 && (
        <div style={{ marginTop: '0.8rem' }}>
          <SaveAndCharge tool="transfer-designer" label="Transfer Design" />
        </div>
      )}
    </motion.div>
  );
}
