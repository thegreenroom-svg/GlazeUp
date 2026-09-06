// [6 Sep] ONE PHOTO-AND-BOXES, USED EVERYWHERE.
//
// Daisy: "the shelf sweep, the boxes, the table photos, everything is
// all a bit sort of referenced in different routes... I'm thinking
// about ergonomics and daily use of the app in your hand."
//
// She was right that it felt scattered, and wrong about the cure -- a
// single sequenced "AI page" would group these by the technology they
// share rather than by when they happen. The table photo is taken at
// the end of a session, the box photo when the kiln is unloaded hours
// or days later, the packing match when a collection date comes round.
// Different people, different rooms, different days. Putting them on
// one page would cost taps at exactly the wrong moment: standing at a
// table holding wet pottery, you want home, 2, camera.
//
// The real mess was underneath. The same act -- point the camera, let
// the AI name what it sees, check the numbered boxes -- was written
// four separate times: 21 references to box drawing in packing, 11 in
// backfill, 3 in floor, with no shared piece between them. So it
// looked and behaved slightly differently depending which screen you
// came from, and improving the rendering meant remembering four
// places, which I would not have.
//
// One component, not one page. The steps stay where they belong in the
// day; the thing in your hand becomes the same object every time.

export type PieceBox = {
  left_pct: number;
  top_pct: number;
  right_pct: number;
  bottom_pct: number;
};

export type BoxedPiece = {
  index?: number;
  piece_type?: string | null;
  description?: string | null;
  box?: PieceBox | null;
};

// One palette, defined once. These were three separate copies of the
// same six hex codes, which is how the same piece ends up a different
// colour on two screens.
export const PIECE_COLOURS = ['#e0392b', '#1a8a3c', '#2b6fe0', '#c77a0a', '#8b3ec7', '#0a9aa8'];

export const pieceColour = (i: number) => PIECE_COLOURS[i % PIECE_COLOURS.length];

/**
 * A photo with numbered boxes drawn over it.
 *
 * The numbers sit OUTSIDE the top-left corner with a white ring, which
 * matters more than it sounds: pottery is pale, the boxes are thin, and
 * a number printed inside the box lands on the piece itself and becomes
 * unreadable against a white mug.
 */
export function PhotoWithBoxes({
  src,
  pieces,
  label,
  onPick,
  activeIndex,
}: {
  src: string;
  pieces: BoxedPiece[];
  /** Optional caption drawn into the corner of a box, e.g. a customer name. */
  label?: (piece: BoxedPiece, i: number) => string | null;
  onPick?: (i: number) => void;
  activeIndex?: number | null;
}) {
  return (
    <div style={{ position: 'relative', lineHeight: 0 }}>
      <img src={src} alt="" style={{ width: '100%', display: 'block' }} />
      {pieces.map((p, i) => {
        if (!p.box) return null;
        const colour = pieceColour(i);
        const dim = activeIndex != null && activeIndex !== i;
        const cap = label?.(p, i);
        return (
          <div
            key={i}
            onClick={onPick ? () => onPick(i) : undefined}
            style={{
              position: 'absolute',
              left: `${p.box.left_pct}%`,
              top: `${p.box.top_pct}%`,
              width: `${p.box.right_pct - p.box.left_pct}%`,
              height: `${p.box.bottom_pct - p.box.top_pct}%`,
              border: `3px solid ${colour}`,
              borderRadius: 'var(--radius-sm)',
              boxShadow: '0 0 0 1px rgba(255,255,255,0.9)',
              opacity: dim ? 0.35 : 1,
              cursor: onPick ? 'pointer' : 'default',
              pointerEvents: onPick ? 'auto' : 'none',
              transition: 'opacity 140ms',
            }}
          >
            <span
              style={{
                position: 'absolute', top: -9, left: -9,
                minWidth: 20, height: 20, padding: '0 5px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: colour, color: 'white',
                fontSize: 'var(--text-xs)', fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 0 0 2px white',
              }}
            >
              {p.index ?? i + 1}
            </span>
            {cap && (
              <span
                style={{
                  position: 'absolute', top: 0, left: 14,
                  background: colour, color: 'white',
                  fontSize: 'var(--text-xs)', fontWeight: 700,
                  padding: '1px 5px', borderRadius: '0 0 4px 0',
                  whiteSpace: 'nowrap',
                }}
              >
                {cap}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The list that goes under the photo. Same numbering and the same
 * colours as the boxes, because the number is the only thing tying a
 * line of text to a shape on a photo.
 */
export function PieceList({
  pieces,
  onPick,
  activeIndex,
}: {
  pieces: BoxedPiece[];
  onPick?: (i: number) => void;
  activeIndex?: number | null;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
      {pieces.map((p, i) => (
        <div
          key={i}
          onClick={onPick ? () => onPick(i) : undefined}
          style={{
            display: 'flex', gap: '0.5rem', alignItems: 'flex-start',
            padding: '0.25rem 0.1rem',
            opacity: activeIndex != null && activeIndex !== i ? 0.45 : 1,
            cursor: onPick ? 'pointer' : 'default',
          }}
        >
          <span
            style={{
              flexShrink: 0, width: 18, height: 18, marginTop: 2,
              borderRadius: 'var(--radius-full)',
              backgroundColor: pieceColour(i), color: 'white',
              fontSize: 'var(--text-xs)', fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {p.index ?? i + 1}
          </span>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--charcoal)' }}>
            {p.piece_type ? <b>{p.piece_type}</b> : null}
            {p.piece_type && p.description ? ' — ' : ''}
            {p.description}
          </span>
        </div>
      ))}
    </div>
  );
}
