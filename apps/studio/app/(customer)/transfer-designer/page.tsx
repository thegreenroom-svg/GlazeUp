'use client';

export const dynamic = 'force-dynamic';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Camera, Type, Star, Heart, Flower2, Sparkles, Circle, Trash2, Paintbrush, Pen, PaintBucket, Wand2, Undo2, MousePointer2 } from 'lucide-react';
import { SaveAndCharge } from '@/components/SaveAndCharge';
import { STUDIO_COLOURS } from '@/lib/glazes';

type MotifKind = 'text' | 'star' | 'heart' | 'flower' | 'swirl' | 'dot';
type Mode = 'place' | 'draw' | 'trace';
type DrawTool = 'brush' | 'pen' | 'fill';
type TraceStrength = 'light' | 'medium' | 'strong';

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

const FONTS = ['Instrument Sans', 'Georgia', 'Courier New', 'Brush Script MT'];
// The studio's real 19 confirmed stocked Stroke & Coat colours, shared
// with Colour Picker and Design Preview -- a transfer design should use
// the same real glazes it'll actually be fired in, not arbitrary colours.
const COLOURS = STUDIO_COLOURS;

function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

// Real, faithful port of the original flood-fill algorithm (commit
//71b7776) -- samples the base layer (photo or trace) for the region
// boundary, paints the blended result onto the paint layer.
function floodFill(baseCtx: CanvasRenderingContext2D, paintCtx: CanvasRenderingContext2D, startPt: { x: number; y: number }, colour: string, opacity: number) {
  const w = baseCtx.canvas.width, h = baseCtx.canvas.height;
  const baseData = baseCtx.getImageData(0, 0, w, h).data;
  const paintData = paintCtx.getImageData(0, 0, w, h);
  const startX = Math.floor(startPt.x), startY = Math.floor(startPt.y);
  if (startX < 0 || startY < 0 || startX >= w || startY >= h) return;
  const startIdx = (startY * w + startX) * 4;
  const targetR = baseData[startIdx], targetG = baseData[startIdx + 1], targetB = baseData[startIdx + 2];
  const tolerance = 42;
  const fillRgb = hexToRgb(colour);
  const fillAlpha = Math.round(opacity * 255);
  const visited = new Uint8Array(w * h);
  const stack: [number, number][] = [[startX, startY]];
  while (stack.length) {
    const [x, y] = stack.pop()!;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const pos = y * w + x;
    if (visited[pos]) continue;
    const i = pos * 4;
    const dr = baseData[i] - targetR, dg = baseData[i + 1] - targetG, db = baseData[i + 2] - targetB;
    if (Math.sqrt(dr * dr + dg * dg + db * db) > tolerance) continue;
    visited[pos] = 1;
    const pi = pos * 4;
    const existingAlpha = paintData.data[pi + 3] / 255;
    const outAlpha = fillAlpha / 255 + existingAlpha * (1 - fillAlpha / 255);
    if (outAlpha > 0) {
      paintData.data[pi] = Math.round((fillRgb.r * (fillAlpha / 255) + paintData.data[pi] * existingAlpha * (1 - fillAlpha / 255)) / outAlpha);
      paintData.data[pi + 1] = Math.round((fillRgb.g * (fillAlpha / 255) + paintData.data[pi + 1] * existingAlpha * (1 - fillAlpha / 255)) / outAlpha);
      paintData.data[pi + 2] = Math.round((fillRgb.b * (fillAlpha / 255) + paintData.data[pi + 2] * existingAlpha * (1 - fillAlpha / 255)) / outAlpha);
    }
    paintData.data[pi + 3] = Math.round(outAlpha * 255);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  paintCtx.putImageData(paintData, 0, 0);
}

// Real, faithful port of the original Sobel edge detector (commit
// 916ead1) -- greyscale, Sobel gradient magnitude, threshold by detail
// level, near-black lines on white. Runs entirely on-device, no AI.
function runTrace(baseCtx: CanvasRenderingContext2D, strength: TraceStrength) {
  const w = baseCtx.canvas.width, h = baseCtx.canvas.height;
  const src = baseCtx.getImageData(0, 0, w, h);
  const s = src.data;
  const grey = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) grey[i] = 0.299 * s[i * 4] + 0.587 * s[i * 4 + 1] + 0.114 * s[i * 4 + 2];
  const thresh = strength === 'light' ? 145 : strength === 'strong' ? 70 : 100;
  const out = baseCtx.createImageData(w, h);
  const o = out.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = 255; o[i * 4 + 3] = 255; continue;
      }
      const tl = grey[i - w - 1], tc = grey[i - w], tr = grey[i - w + 1];
      const ml = grey[i - 1], mr = grey[i + 1];
      const bl = grey[i + w - 1], bc = grey[i + w], br = grey[i + w + 1];
      const gx = (tr + 2 * mr + br) - (tl + 2 * ml + bl);
      const gy = (bl + 2 * bc + br) - (tl + 2 * tc + tr);
      const mag = Math.sqrt(gx * gx + gy * gy);
      const v = mag > thresh ? 30 : 255;
      o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = v;
      o[i * 4 + 3] = 255;
    }
  }
  baseCtx.putImageData(out, 0, 0);
}

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
  const [colour, setColour] = useState(COLOURS[0].hex);
  const [font, setFont] = useState(FONTS[0]);
  const [mode, setMode] = useState<Mode>('place');
  const [drawTool, setDrawTool] = useState<DrawTool>('brush');
  const [brushSize, setBrushSize] = useState(10);
  const [opacity, setOpacity] = useState(0.85);
  const [traceStrength, setTraceStrength] = useState<TraceStrength>('medium');
  const [traced, setTraced] = useState(false);
  const [hasContent, setHasContent] = useState(false);

  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const paintCanvasRef = useRef<HTMLCanvasElement>(null);
  const topCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);
  const dragging = useRef<{ id: number; offX: number; offY: number } | null>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  // Real undo -- pixel-snapshot stack of the paint layer, capped at 20.
  const undoStack = useRef<ImageData[]>([]);

  const baseCtx = () => baseCanvasRef.current?.getContext('2d') || null;
  const paintCtx = () => paintCanvasRef.current?.getContext('2d') || null;

  // Top layer -- placed text/motifs, redrawn fresh every change. Same
  // behaviour as before this rewrite, just isolated to its own layer so
  // it composites cleanly over the photo/trace and paint layers below.
  const redrawTop = () => {
    const c = topCanvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
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
        ctx.strokeStyle = '#B87946';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(-40, -25, 80, 50);
        ctx.setLineDash([]);
      }
      ctx.restore();
    });
  };

  useEffect(redrawTop, [elements, selectedId]);

  const setupCanvases = (img: HTMLImageElement | null) => {
    const base = baseCanvasRef.current, paint = paintCanvasRef.current, top = topCanvasRef.current;
    if (!base || !paint || !top) return;
    const maxW = 340;
    const w = img ? Math.round(img.width * Math.min(1, maxW / img.width)) : 340;
    const h = img ? Math.round(img.height * Math.min(1, maxW / img.width)) : 340;
    base.width = w; base.height = h;
    paint.width = w; paint.height = h;
    top.width = w; top.height = h;
    const bctx = base.getContext('2d')!;
    if (img) bctx.drawImage(img, 0, 0, w, h);
    else { bctx.fillStyle = '#F7F4EE'; bctx.fillRect(0, 0, w, h); }
    paint.getContext('2d')!.clearRect(0, 0, w, h);
    undoStack.current = [];
    setTraced(false);
    setHasContent(false);
  };

  useEffect(() => { setupCanvases(null); }, []);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const img = new Image();
    img.onload = () => { setupCanvases(img); setPhoto(img); };
    img.src = URL.createObjectURL(f);
  };

  const addMotif = (kind: MotifKind) => {
    const c = topCanvasRef.current;
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
    setHasContent(true);
  };

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = topCanvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };

  const saveUndoState = () => {
    const pctx = paintCtx();
    if (!pctx) return;
    undoStack.current.push(pctx.getImageData(0, 0, pctx.canvas.width, pctx.canvas.height));
    if (undoStack.current.length > 20) undoStack.current.shift();
  };

  const paintDot = (pt: { x: number; y: number }, size: number) => {
    const pctx = paintCtx();
    if (!pctx) return;
    pctx.globalAlpha = opacity;
    pctx.fillStyle = colour;
    pctx.beginPath();
    pctx.arc(pt.x, pt.y, size / 2, 0, Math.PI * 2);
    pctx.fill();
    pctx.globalAlpha = 1;
  };

  const paintLine = (from: { x: number; y: number }, to: { x: number; y: number }, size: number) => {
    const pctx = paintCtx();
    if (!pctx) return;
    pctx.globalAlpha = opacity;
    pctx.strokeStyle = colour;
    pctx.lineWidth = size;
    pctx.lineCap = 'round';
    pctx.lineJoin = 'round';
    pctx.beginPath();
    pctx.moveTo(from.x, from.y);
    pctx.lineTo(to.x, to.y);
    pctx.stroke();
    pctx.globalAlpha = 1;
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (mode === 'draw') {
      e.currentTarget.setPointerCapture(e.pointerId);
      const p = pos(e);
      if (drawTool === 'fill') {
        const bctx = baseCtx(), pctx = paintCtx();
        if (!bctx || !pctx) return;
        saveUndoState();
        floodFill(bctx, pctx, p, colour, opacity);
        setHasContent(true);
        return;
      }
      // Pen: fine, consistent line, no pressure variance -- for crisp
      // outlines. Brush: real pressure sensitivity where a stylus
      // reports it, same as Design Preview.
      const pressure = e.pressure && e.pressure > 0 && e.pressure !== 0.5 ? e.pressure : null;
      const size = drawTool === 'pen' ? Math.min(4, brushSize * 0.35) : (pressure ? Math.max(2, brushSize * pressure * 1.6) : brushSize);
      saveUndoState();
      drawing.current = true;
      lastPoint.current = p;
      paintDot(p, size);
      setHasContent(true);
      return;
    }
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
    if (mode === 'draw') {
      if (!drawing.current || !lastPoint.current || drawTool === 'fill') return;
      const pressure = e.pressure && e.pressure > 0 && e.pressure !== 0.5 ? e.pressure : null;
      const size = drawTool === 'pen' ? Math.min(4, brushSize * 0.35) : (pressure ? Math.max(2, brushSize * pressure * 1.6) : brushSize);
      const p = pos(e);
      paintLine(lastPoint.current, p, size);
      lastPoint.current = p;
      return;
    }
    if (!dragging.current) return;
    const p = pos(e);
    const { id, offX, offY } = dragging.current;
    setElements((prev) => prev.map((el) => (el.id === id ? { ...el, x: p.x - offX, y: p.y - offY } : el)));
  };

  const up = () => {
    drawing.current = false;
    lastPoint.current = null;
    dragging.current = null;
  };

  const undoPaint = () => {
    const pctx = paintCtx();
    if (!pctx || undoStack.current.length === 0) return;
    const prev = undoStack.current.pop()!;
    pctx.putImageData(prev, 0, 0);
  };

  const applyTrace = () => {
    const bctx = baseCtx();
    if (!bctx) return;
    runTrace(bctx, traceStrength);
    setTraced(true);
  };

  const restorePhoto = () => {
    const base = baseCanvasRef.current;
    const bctx = base?.getContext('2d');
    if (!base || !bctx) return;
    bctx.clearRect(0, 0, base.width, base.height);
    if (photo) bctx.drawImage(photo, 0, 0, base.width, base.height);
    else { bctx.fillStyle = '#F7F4EE'; bctx.fillRect(0, 0, base.width, base.height); }
    setTraced(false);
  };

  const selected = elements.find((el) => el.id === selectedId);

  const updateSelected = (patch: Partial<Element>) => {
    if (!selectedId) return;
    setElements((prev) => prev.map((el) => (el.id === selectedId ? { ...el, ...patch } : el)));
  };

  const removeSelected = () => {
    setElements((prev) => prev.filter((el) => el.id !== selectedId));
    setSelectedId(null);
  };

  const DRAW_TOOLS: { id: DrawTool; label: string; icon: typeof Paintbrush }[] = [
    { id: 'brush', label: 'Brush', icon: Paintbrush },
    { id: 'pen', label: 'Pen', icon: Pen },
    { id: 'fill', label: 'Fill area', icon: PaintBucket },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem', maxWidth: '600px' }}>
      <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>Transfer Designer</h1>
      <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
        Photograph your piece, then draw, fill, trace, or add text and motifs to plan a transfer before it goes on for real.
      </p>

      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }} />
      <button
        onClick={() => fileRef.current?.click()}
        style={{ width: '100%', padding: '0.7rem', border: '2px dashed #ccc', borderRadius: '8px', backgroundColor: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', marginBottom: '0.8rem', fontSize: '0.85rem', color: '#666' }}
      >
        <Camera size={16} color="var(--clay)" /> {photo ? 'Choose a different photo' : 'Photograph your piece'}
      </button>

      <div style={{ position: 'relative', width: '100%', maxWidth: 340, marginBottom: '0.8rem' }}>
        <canvas ref={baseCanvasRef} style={{ width: '100%', border: '1px solid #eee', borderRadius: '8px', display: 'block' }} />
        <canvas ref={paintCanvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
        <canvas
          ref={topCanvasRef}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', touchAction: 'none', cursor: mode === 'draw' ? 'crosshair' : 'default' }}
        />
      </div>

      <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.7rem' }}>
        {([
          { id: 'place' as Mode, label: 'Place', icon: MousePointer2 },
          { id: 'draw' as Mode, label: 'Draw', icon: Paintbrush },
          { id: 'trace' as Mode, label: 'Trace', icon: Wand2 },
        ]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setMode(id)}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', padding: '0.5rem', borderRadius: '6px', border: mode === id ? '2px solid var(--clay)' : '1px solid #ddd', backgroundColor: mode === id ? 'var(--clay)18' : 'white', color: mode === id ? 'var(--clay)' : '#666', fontWeight: mode === id ? 700 : 400, cursor: 'pointer', fontSize: '0.8rem' }}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {mode === 'draw' && (
        <>
          <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.6rem' }}>
            {DRAW_TOOLS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setDrawTool(id)}
                title={label}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem', padding: '0.4rem 0.3rem', borderRadius: '6px', border: drawTool === id ? '2px solid var(--clay)' : '1px solid #ddd', backgroundColor: drawTool === id ? 'var(--clay)18' : 'white', color: drawTool === id ? 'var(--clay)' : '#666', cursor: 'pointer', fontSize: '0.68rem', fontWeight: drawTool === id ? 700 : 400 }}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
          {drawTool !== 'fill' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.6rem' }}>
              <span style={{ fontSize: '0.78rem', color: '#666' }}>{drawTool === 'pen' ? 'Pen weight' : 'Brush size'}</span>
              <input type="range" min={2} max={40} value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} style={{ flex: 1 }} />
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.6rem' }}>
            <span style={{ fontSize: '0.78rem', color: '#666' }}>Opacity</span>
            <input type="range" min={20} max={100} value={Math.round(opacity * 100)} onChange={(e) => setOpacity(Number(e.target.value) / 100)} style={{ flex: 1 }} />
          </div>
        </>
      )}

      {mode === 'trace' && (
        <div style={{ marginBottom: '0.8rem' }}>
          <p style={{ fontSize: '0.78rem', color: '#666', marginBottom: '0.5rem' }}>
            Turn your photo into outlines to trace over, then switch to Draw to paint your own version.
          </p>
          <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.5rem' }}>
            {(['light', 'medium', 'strong'] as TraceStrength[]).map((s) => (
              <button
                key={s}
                onClick={() => setTraceStrength(s)}
                style={{ flex: 1, padding: '0.4rem', borderRadius: '6px', border: traceStrength === s ? '2px solid var(--clay)' : '1px solid #ddd', backgroundColor: traceStrength === s ? 'var(--clay)18' : 'white', color: traceStrength === s ? 'var(--clay)' : '#666', cursor: 'pointer', fontSize: '0.75rem', textTransform: 'capitalize' }}
              >
                {s === 'light' ? 'Simple' : s === 'strong' ? 'Detailed' : 'Balanced'}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button onClick={applyTrace} disabled={!photo} style={{ flex: 1, padding: '0.55rem', backgroundColor: 'var(--clay)', color: 'white', border: 'none', borderRadius: '6px', cursor: photo ? 'pointer' : 'not-allowed', fontSize: '0.8rem', fontWeight: 600, opacity: photo ? 1 : 0.5 }}>
              Trace this photo
            </button>
            <button onClick={restorePhoto} disabled={!traced} style={{ padding: '0.55rem 0.8rem', backgroundColor: '#f0f0f0', border: 'none', borderRadius: '6px', cursor: traced ? 'pointer' : 'not-allowed', fontSize: '0.8rem', opacity: traced ? 1 : 0.5 }}>
              Photo back
            </button>
          </div>
        </div>
      )}

      {mode === 'place' && (
        <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
          <button onClick={() => addMotif('text')} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.4rem 0.7rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', backgroundColor: '#f0f0f0' }}><Type size={14} /> Text</button>
          <button onClick={() => addMotif('star')} style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: 'none', cursor: 'pointer', backgroundColor: '#f0f0f0' }}><Star size={14} /></button>
          <button onClick={() => addMotif('heart')} style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: 'none', cursor: 'pointer', backgroundColor: '#f0f0f0' }}><Heart size={14} /></button>
          <button onClick={() => addMotif('flower')} style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: 'none', cursor: 'pointer', backgroundColor: '#f0f0f0' }}><Flower2 size={14} /></button>
          <button onClick={() => addMotif('swirl')} style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: 'none', cursor: 'pointer', backgroundColor: '#f0f0f0' }}><Sparkles size={14} /></button>
          <button onClick={() => addMotif('dot')} style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: 'none', cursor: 'pointer', backgroundColor: '#f0f0f0' }}><Circle size={14} /></button>
        </div>
      )}

      {mode !== 'trace' && (
        <>
          <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#333', marginBottom: '0.4rem' }}>
            {COLOURS.find((c) => c.hex === colour)?.name || 'Colour'}
            {' '}
            <span style={{ color: '#999', fontWeight: 400 }}>
              ({COLOURS.find((c) => c.hex === colour)?.code})
            </span>
          </p>
          <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.8rem', flexWrap: 'wrap' }}>
            {COLOURS.map((c) => (
              <button
                key={c.hex}
                onClick={() => { setColour(c.hex); updateSelected({ colour: c.hex }); }}
                title={`${c.name} (${c.code})`}
                aria-label={`${c.name}, ${c.code}`}
                style={{ width: 26, height: 26, borderRadius: '50%', backgroundColor: c.hex, border: colour === c.hex ? '2px solid #B87946' : '1px solid #ddd', cursor: 'pointer' }}
              />
            ))}
          </div>
        </>
      )}

      {mode === 'draw' && (
        <button
          onClick={undoPaint}
          disabled={undoStack.current.length === 0}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', width: '100%', padding: '0.45rem', backgroundColor: '#f0f0f0', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem', marginBottom: '0.6rem' }}
        >
          <Undo2 size={13} /> Undo stroke
        </button>
      )}

      {selected && mode === 'place' && (
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
        {mode === 'place'
          ? 'Tap a shape or text on the design to select and drag it.'
          : mode === 'draw'
          ? 'Draw freehand — works with a stylus for pressure-sensitive lines.'
          : 'Trace turns your photo into outlines you can paint over in Draw mode.'}
        {' '}This plans placement — a real transfer decal is applied by staff.
      </p>

      {(elements.length > 0 || hasContent) && (
        <div style={{ marginTop: '0.8rem' }}>
          <SaveAndCharge tool="transfer-designer" label="Transfer Design" />
        </div>
      )}
    </motion.div>
  );
}
