// The studio's REAL stocked Mayco Stroke & Coat colours -- 19 confirmed
// colours, mined directly from real Hobby Ceramicraft order emails in a
// prior session (chat "Introduction from David", 1 Jul 2026). Hobby
// Ceramicraft supplies both bisque stock AND the Stroke & Coat underglaze
// -- confirmed directly, not assumed.
//
// This exact 19-colour list already existed, was already correct, and was
// already used across the design tools before -- lost the same way
// everything else this session has been lost, not because the data was
// ever wrong. Restoring it here as it was, not re-deriving it.
//
// Earlier in this session, before this real list was found, two other
// approaches were tried and are both wrong, kept only as a record of what
// NOT to use: (1) the full 82-colour Mayco catalogue -- too broad, most of
// those aren't stocked; (2) 34 colours sampled from a glaze tile photo,
// with only some matched to real codes by colour distance -- an honest
// attempt, but distance-matching against an incomplete reference produced
// several wrong/collided guesses. This real, invoice-confirmed 19 replaces
// both.
//
// Single source of truth -- Colour Picker, Design Preview, and Transfer
// Designer should all import from here rather than keep their own
// separate lists, so the same real colour always looks the same
// everywhere in the app.
export interface StudioColour {
  code: string;
  name: string;
  hex: string;
}

export const STUDIO_COLOURS: StudioColour[] = [
  { code: 'SC-1', name: 'Pink-A-Boo', hex: '#F48FB1' },
  { code: 'SC-10', name: 'Teal Next Time', hex: '#26A69A' },
  { code: 'SC-11', name: 'Blue Yonder', hex: '#64B5F6' },
  { code: 'SC-13', name: 'Grapel', hex: '#7E57C2' },
  { code: 'SC-15', name: 'Tuxedo', hex: '#212121' },
  { code: 'SC-20', name: 'Cashew Later', hex: '#D2B48C' },
  { code: 'SC-24', name: 'Dandelion', hex: '#FFD600' },
  { code: 'SC-26', name: 'Green Thumb', hex: '#66BB6A' },
  { code: 'SC-27', name: 'Sour Apple', hex: '#C6E436' },
  { code: 'SC-29', name: 'Blue Grass', hex: '#00897B' },
  { code: 'SC-35', name: 'Gray Hare', hex: '#9E9E9E' },
  { code: 'SC-39', name: 'Army Surplus', hex: '#8A9A5B' },
  { code: 'SC-50', name: 'Orange Ya Happy', hex: '#FF7043' },
  { code: 'SC-51', name: 'Poo Bear', hex: '#A1887F' },
  { code: 'SC-65', name: 'Peri-Twinkle', hex: '#9FA8DA' },
  { code: 'SC-74', name: 'Hot Tamale', hex: '#E53935' },
  { code: 'SC-76', name: 'Cara-bein Blue', hex: '#29B6F6' },
  { code: 'SC-85', name: 'Orkid', hex: '#BA68C8' },
  { code: 'SC-95', name: 'Pinkie Swear', hex: '#F8BBD0' },
];
