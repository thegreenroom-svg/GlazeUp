'use client';
import { useEffect, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { PhotoWithBoxes, PieceBox, pieceColour } from '@/components/PieceBoxes';

// [6 Oct] Daisy: the cards are the interface -- tap a picture and it should
// fill the screen, for identifying the piece. A 40px thumbnail is enough to
// spot a mug; it is not enough to tell two white mugs apart on a shelf.

export type ViewerPiece = {
  photo: string | null;
  box: PieceBox | null;
  piece_type?: string | null;
  description?: string | null;
  note?: string | null;
};

/**
 * The close-up, at the box's real proportions. The small thumbnails squash
 * every box into a square; at full screen that distortion would make a
 * tall jug look like a bowl, so the image is measured first.
 */
function CloseUp({ url, box }: { url: string; box: PieceBox | null }) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    setDims(null);
    const img = new Image();
    img.onload = () => setDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = url;
  }, [url]);

  if (!box || !dims) {
    return <img src={url} alt="" style={{ maxWidth: '100%', maxHeight: '55vh', objectFit: 'contain', display: 'block', margin: '0 auto', borderRadius: 8 }} />;
  }
  // A little room around the piece, so a rim at the edge of the box is not cut.
  const pad = 4;
  const l = Math.max(0, box.left_pct - pad), t = Math.max(0, box.top_pct - pad);
  const r = Math.min(100, box.right_pct + pad), b = Math.min(100, box.bottom_pct + pad);
  const w = r - l, h = b - t;
  const aspect = (w * dims.w) / (h * dims.h);
  return (
    <div style={{
      width: `min(92vw, calc(55vh * ${aspect}))`,
      aspectRatio: String(aspect),
      margin: '0 auto', borderRadius: 8,
      backgroundImage: `url(${url})`,
      backgroundSize: `${(100 / w) * 100}% ${(100 / h) * 100}%`,
      backgroundPosition: `${w >= 100 ? 0 : (l / (100 - w)) * 100}% ${h >= 100 ? 0 : (t / (100 - h)) * 100}%`,
      backgroundRepeat: 'no-repeat',
      backgroundColor: '#111',
    }} />
  );
}

export function PieceViewer({
  pieces,
  start = 0,
  title,
  onClose,
}: {
  pieces: ViewerPiece[];
  start?: number;
  title?: string;
  onClose: () => void;
}) {
  const [i, setI] = useState(Math.min(Math.max(start, 0), Math.max(pieces.length - 1, 0)));
  const touchX = useRef<number | null>(null);
  const n = pieces.length;
  const go = (d: number) => setI((x) => (x + d + n) % n);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);

  if (!n) return null;
  const p = pieces[i];
  // The other pieces from the same photo, so the whole table shows with
  // this one picked out rather than one lonely box.
  const samePhoto = pieces
    .map((q, k) => ({ q, k }))
    .filter(({ q }) => q.photo && q.photo === p.photo);

  return (
    <div
      className="no-print"
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchX.current == null || n < 2) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
      }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        backgroundColor: 'rgba(20,16,12,0.96)', color: '#f6f1ea',
        overflowY: 'auto', textAlign: 'center',
        padding: 'calc(env(safe-area-inset-top, 0px) + 0.8rem) 1rem calc(env(safe-area-inset-bottom, 0px) + 1.5rem)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
        <span style={{ fontSize: 'var(--text-sm)', opacity: 0.7, textAlign: 'left' }}>
          {title}{n > 1 ? ` · ${i + 1} of ${n}` : ''}
        </span>
        <button onClick={onClose} aria-label="Close" style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 999, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'inherit' }}>
          <X size={22} />
        </button>
      </div>

      <div style={{ position: 'relative' }}>
        {p.photo
          ? <CloseUp url={p.photo} box={p.box} />
          : <div style={{ padding: '4rem 1rem', opacity: 0.6 }}>No photo of this piece</div>}
        {n > 1 && (
          <>
            <button onClick={() => go(-1)} aria-label="Previous" style={navBtn('left')}><ChevronLeft size={24} /></button>
            <button onClick={() => go(1)} aria-label="Next" style={navBtn('right')}><ChevronRight size={24} /></button>
          </>
        )}
      </div>

      <p style={{ fontSize: 'var(--text-lg)', fontWeight: 700, marginTop: '0.9rem', textTransform: 'capitalize' }}>
        <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 999, background: pieceColour(i), marginRight: 8, verticalAlign: 'middle' }} />
        {p.piece_type || 'Piece'}
      </p>
      {p.description && <p style={{ fontSize: 'var(--text-sm)', opacity: 0.8, marginTop: '0.2rem' }}>{p.description}</p>}
      {p.note && <p style={{ fontSize: 'var(--text-sm)', color: '#e8a23c', fontWeight: 600, marginTop: '0.35rem' }}>{p.note}</p>}

      {p.photo && (
        <div style={{ marginTop: '1.2rem', maxWidth: 560, marginInline: 'auto', borderRadius: 8, overflow: 'hidden' }}>
          <p style={{ fontSize: 'var(--text-xs)', opacity: 0.6, marginBottom: '0.4rem', textAlign: 'left' }}>The table it came from. Tap another piece to switch.</p>
          <PhotoWithBoxes
            src={p.photo}
            pieces={samePhoto.map(({ q, k }) => ({ index: k + 1, piece_type: q.piece_type, box: q.box }))}
            activeIndex={samePhoto.findIndex(({ k }) => k === i)}
            onPick={(j) => setI(samePhoto[j].k)}
          />
        </div>
      )}
    </div>
  );
}

function navBtn(side: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute', top: '50%', [side]: 0, transform: 'translateY(-50%)',
    background: 'rgba(0,0,0,0.45)', border: 'none', borderRadius: 999,
    width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff',
  } as React.CSSProperties;
}
