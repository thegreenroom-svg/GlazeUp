'use client';

export const dynamic = 'force-dynamic';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Camera, Undo2, Trash2, Paintbrush, PaintBucket, Sparkles, X } from 'lucide-react';
import { SaveAndCharge } from '@/components/SaveAndCharge';
import { STUDIO_COLOURS } from '@/lib/glazes';
import { gradientSwatch, gradientActionCard, iconBadge, sectionLabel } from '@/lib/bougie';

// The studio's real 19 confirmed stocked Stroke & Coat colours, shared
// with Colour Picker and Transfer Designer so the same real glaze always
// looks the same everywhere in the app.
const QUICK_COLOURS = STUDIO_COLOURS;

type Tool = 'brush' | 'fill' | 'sticker';

interface Sticker {
  id: number;
  x: number;
  y: number;
  size: number;
  colour: string;
}

function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

// Real, faithful port of the original flood-fill algorithm (found in git
// history, commit 71b7776) -- samples the ORIGINAL photo (base canvas) to
// decide which pixels belong to the tapped region, but paints the result
// onto the paint layer, so the photo itself is never altered and repeated
// fills stay based on the real photo, not previous paint.
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
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    if (dist > tolerance) continue;

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

export default function DesignPreviewPage() {
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [tool, setTool] = useState<Tool>('brush');
  const [colour, setColour] = useState(QUICK_COLOURS[0].hex);
  const [brushSize, setBrushSize] = useState(14);
  const [opacity, setOpacity] = useState(0.72);
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [draggingSticker, setDraggingSticker] = useState<number | null>(null);
  const [hasContent, setHasContent] = useState(false);

  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const paintCanvasRef = useRef<HTMLCanvasElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  // Real undo -- pixel-snapshot stack of the paint layer only (the photo
  // never changes), capped at 20, same as the original.
  const undoStack = useRef<ImageData[]>([]);
  const dragOffset = useRef({ x: 0, y: 0 });

  const baseCtx = () => baseCanvasRef.current?.getContext('2d') || null;
  const paintCtx = () => paintCanvasRef.current?.getContext('2d') || null;

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const img = new Image();
    img.onload = () => {
      const base = baseCanvasRef.current;
      const paint = paintCanvasRef.current;
      if (!base || !paint) return;
      const maxW = 360;
      const scale = Math.min(1, maxW / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      base.width = w; base.height = h;
      paint.width = w; paint.height = h;
      const bctx = base.getContext('2d')!;
      bctx.drawImage(img, 0, 0, w, h);
      paint.getContext('2d')!.clearRect(0, 0, w, h);
      undoStack.current = [];
      setStickers([]);
      setHasContent(false);
      setPhoto(img);
    };
    img.src = URL.createObjectURL(f);
  };

  const canvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = paintCanvasRef.current!;
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
    if (!photo) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = canvasPoint(e);

    if (tool === 'brush') {
      // Real pressure sensitivity where a stylus reports it -- falls back
      // to the chosen brush size on a finger or mouse.
      const p = e.pressure && e.pressure > 0 && e.pressure !== 0.5 ? e.pressure : null;
      const size = p ? Math.max(2, brushSize * p * 1.6) : brushSize;
      saveUndoState();
      drawing.current = true;
      lastPoint.current = pt;
      paintDot(pt, size);
      setHasContent(true);
    } else if (tool === 'fill') {
      const bctx = baseCtx(), pctx = paintCtx();
      if (!bctx || !pctx) return;
      saveUndoState();
      floodFill(bctx, pctx, pt, colour, opacity);
      setHasContent(true);
    } else if (tool === 'sticker') {
      setStickers((prev) => [...prev, { id: Date.now(), x: pt.x, y: pt.y, size: 70, colour }]);
      setHasContent(true);
    }
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || tool !== 'brush' || !lastPoint.current) return;
    const p = e.pressure && e.pressure > 0 && e.pressure !== 0.5 ? e.pressure : null;
    const size = p ? Math.max(2, brushSize * p * 1.6) : brushSize;
    const pt = canvasPoint(e);
    paintLine(lastPoint.current, pt, size);
    lastPoint.current = pt;
  };

  const up = () => {
    drawing.current = false;
    lastPoint.current = null;
  };

  const undo = () => {
    const pctx = paintCtx();
    if (!pctx || undoStack.current.length === 0) return;
    const prev = undoStack.current.pop()!;
    pctx.putImageData(prev, 0, 0);
  };

  const clearAll = () => {
    const pctx = paintCtx();
    if (!pctx) return;
    saveUndoState();
    pctx.clearRect(0, 0, pctx.canvas.width, pctx.canvas.height);
    setStickers([]);
    setHasContent(false);
  };

  const removeSticker = (id: number) => setStickers((prev) => prev.filter((s) => s.id !== id));

  const stickerDrag = (id: number, e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const sticker = stickers.find((s) => s.id === id);
    if (!sticker || !stackRef.current) return;
    const r = stackRef.current.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - r.left - sticker.x, y: e.clientY - r.top - sticker.y };
    setDraggingSticker(id);
  };

  const stickerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingSticker == null || !stackRef.current) return;
    const r = stackRef.current.getBoundingClientRect();
    const x = e.clientX - r.left - dragOffset.current.x;
    const y = e.clientY - r.top - dragOffset.current.y;
    setStickers((prev) => prev.map((s) => (s.id === draggingSticker ? { ...s, x, y } : s)));
  };

  const stickerUp = () => setDraggingSticker(null);

  const TOOLS: { id: Tool; label: string; icon: typeof Paintbrush }[] = [
    { id: 'brush', label: 'Brush', icon: Paintbrush },
    { id: 'fill', label: 'Fill area', icon: PaintBucket },
    { id: 'sticker', label: 'Colour sticker', icon: Sparkles },
  ];

  return (
    <div style={{ backgroundColor: 'var(--ivory)', minHeight: '100%' }}>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ padding: '2rem 1.5rem', maxWidth: '600px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.9rem', fontWeight: 800, marginBottom: '0.3rem', color: 'var(--charcoal)', letterSpacing: '-0.02em' }}>Design Preview</h1>
        <p style={{ color: 'var(--charcoal)', opacity: 0.65, fontSize: '0.92rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
          Photograph your actual piece, then paint, fill, or place colour straight onto the photo to see how it might look. Works with a stylus for fine detail.
        </p>

        {!photo ? (
          <label
            onClick={(e) => {
              // Real, maximally robust combined approach given severe time
              // pressure -- the plain label-wrap (native browser
              // label-click-through to its input) still wasn't opening
              // the picker for Daisy despite working structurally
              // identically on Colour Picker. Rather than keep guessing
              // at why, this explicitly also fires .click() on the real
              // input as a second, independent trigger path -- if the
              // native label mechanism is what's failing here, this JS
              // fallback covers it; if it's something else entirely, the
              // visible confirm() surfaces real diagnostic detail to
              // screenshot for next time rather than silent failure.
              const input = e.currentTarget.querySelector('input[type="file"]') as HTMLInputElement | null;
              if (input) {
                try {
                  input.click();
                } catch (err: any) {
                  // eslint-disable-next-line no-alert
                  confirm(`Design Preview: even the explicit .click() fallback failed. Error: ${err?.message || err}. Please screenshot this and send it over.`);
                }
              } else {
                // eslint-disable-next-line no-alert
                confirm('Design Preview: could not find the real file input in the DOM at all when tapped. Please screenshot this and send it over.');
              }
            }}
            style={{ ...gradientActionCard(), width: '100%', padding: '2.2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem', position: 'relative' }}
          >
            {/* Real fix, confirmed by the red test button that React and
                click handling both work fine on this page: the actual
                problem was narrower -- calling fileRef.current.click() on
                a hidden input succeeded as a JS call with no error, but
                iOS Safari wasn't reliably opening its native picker in
                response, a known category of quirk with that exact
                hidden-input-plus-programmatic-click pattern. This removes
                the indirection entirely: the real file input IS the
                visible label, so tapping it is a genuine native browser
                interaction, not a simulated one. */}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={onFile}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
            />
            <div style={iconBadge(52)}>
              <Camera size={24} color="white" />
            </div>
            <span style={{ color: 'var(--charcoal)', fontSize: '0.92rem', fontWeight: 600 }}>Photograph your piece</span>
          </label>
        ) : (
          <>
            <div
              ref={stackRef}
              onPointerMove={stickerMove}
              onPointerUp={stickerUp}
              style={{ position: 'relative', width: '100%', maxWidth: 360, marginBottom: '0.8rem' }}
          >
            <canvas ref={baseCanvasRef} style={{ width: '100%', borderRadius: '8px', display: 'block' }} />
            <canvas
              ref={paintCanvasRef}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerLeave={up}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', cursor: tool === 'sticker' ? 'copy' : 'crosshair', touchAction: 'none' }}
            />
            {stickers.map((s) => (
              <div
                key={s.id}
                onPointerDown={(e) => stickerDrag(s.id, e)}
                style={{
                  position: 'absolute',
                  left: s.x - s.size / 2,
                  top: s.y - s.size / 2,
                  width: s.size,
                  height: s.size,
                  borderRadius: '50%',
                  backgroundColor: s.colour,
                  opacity: 0.72,
                  border: '2px solid rgba(255,255,255,0.8)',
                  cursor: 'grab',
                  touchAction: 'none',
                }}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); removeSticker(s.id); }}
                  style={{ position: 'absolute', top: -8, right: -8, width: 22, height: 22, borderRadius: '50%', backgroundColor: 'white', border: '1px solid #ddd', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}
                  aria-label="Remove sticker"
                >
                  <X size={12} color="#c33" />
                </button>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.8rem' }}>
            {TOOLS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTool(id)}
                title={label}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem', padding: '0.5rem 0.3rem', borderRadius: '6px', border: tool === id ? '2px solid var(--clay)' : '1px solid #ddd', backgroundColor: tool === id ? 'var(--clay)18' : 'white', color: tool === id ? 'var(--clay)' : '#666', cursor: 'pointer', fontSize: '0.72rem', fontWeight: tool === id ? 700 : 400 }}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>

          <p style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--charcoal)', marginBottom: '0.5rem' }}>
            {QUICK_COLOURS.find((c) => c.hex === colour)?.name || 'Colour'}
            {' '}
            <span style={{ color: 'var(--stone)', fontWeight: 400 }}>
              ({QUICK_COLOURS.find((c) => c.hex === colour)?.code})
            </span>
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.7rem', flexWrap: 'wrap' }}>
            {QUICK_COLOURS.map((c) => (
              <button
                key={c.hex}
                onClick={() => setColour(c.hex)}
                title={`${c.name} (${c.code})`}
                aria-label={`${c.name}, ${c.code}`}
                style={{
                  ...gradientSwatch(c.hex, 32),
                  cursor: 'pointer',
                  border: 'none',
                  outline: colour === c.hex ? '2.5px solid var(--clay)' : 'none',
                  outlineOffset: '2px',
                }}
              />
            ))}
          </div>

          {tool === 'brush' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.8rem' }}>
              <span style={{ fontSize: '0.8rem', color: '#666' }}>Brush size</span>
              <input type="range" min={2} max={50} value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} style={{ flex: 1 }} />
              <span style={{ fontSize: '0.8rem', color: '#999', width: '1.5rem' }}>{brushSize}</span>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.8rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#666' }}>Opacity</span>
            <input type="range" min={20} max={100} value={Math.round(opacity * 100)} onChange={(e) => setOpacity(Number(e.target.value) / 100)} style={{ flex: 1 }} />
            <span style={{ fontSize: '0.8rem', color: '#999', width: '2.2rem' }}>{Math.round(opacity * 100)}%</span>
          </div>

          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button
              onClick={undo}
              disabled={undoStack.current.length === 0}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', padding: '0.5rem', backgroundColor: '#f0f0f0', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              <Undo2 size={15} /> Undo
            </button>
            <button
              onClick={clearAll}
              disabled={!hasContent}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', padding: '0.5rem', backgroundColor: '#f0f0f0', border: 'none', borderRadius: '6px', cursor: hasContent ? 'pointer' : 'not-allowed', fontSize: '0.85rem', opacity: hasContent ? 1 : 0.5 }}
            >
              <Trash2 size={15} /> Clear
            </button>
            <label
              style={{ flex: 1, padding: '0.5rem', backgroundColor: 'var(--clay)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', textAlign: 'center', position: 'relative' }}
            >
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={onFile}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
              />
              New photo
            </label>
          </div>

          {hasContent && (
            <div style={{ marginTop: '0.8rem' }}>
              <SaveAndCharge tool="design-preview" label="Design Preview" />
            </div>
          )}
        </>
      )}
      </motion.div>
    </div>
  );
}
