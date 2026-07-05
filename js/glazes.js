/**
 * GlazeUp · Default Glaze Data
 *
 * This is the built-in Mayco Stroke & Coat palette used as a default
 * for new studios. Each studio can override with their own palette
 * via the admin dashboard.
 */

const STROKE_AND_COAT = [
  { code:"SC-2",  name:"Meow",             hex:"#3A3A3A" },
  { code:"SC-6",  name:"Sunkissed",        hex:"#F5D080" },
  { code:"SC-10", name:"Teal Next Time",   hex:"#2A8C82" },
  { code:"SC-11", name:"Blue Yonder",      hex:"#3A6EB5" },
  { code:"SC-12", name:"Moody Blue",       hex:"#4A5A90" },
  { code:"SC-14", name:"Java Jump",        hex:"#6B4226" },
  { code:"SC-15", name:"Tuxedo",           hex:"#222222" },
  { code:"SC-16", name:"Cotton Tail",      hex:"#F5F0E8" },
  { code:"SC-20", name:"Cashew Later",     hex:"#C8A878" },
  { code:"SC-23", name:"Jack O' Lantern",  hex:"#E87830" },
  { code:"SC-24", name:"Dandelion",        hex:"#F0C832" },
  { code:"SC-25", name:"Crackerjack",      hex:"#B87028" },
  { code:"SC-26", name:"Green Thumb",      hex:"#3A8848" },
  { code:"SC-27", name:"Sour Apple",       hex:"#8BC838" },
  { code:"SC-28", name:"Blue Grass",       hex:"#287850" },
  { code:"SC-29", name:"Blue Grass (alt)", hex:"#287850" },
  { code:"SC-30", name:"Blue Dawn",        hex:"#5090C0" },
  { code:"SC-31", name:"The Blues",        hex:"#3868A8" },
  { code:"SC-33", name:"Fruit of the Vine",hex:"#784088" },
  { code:"SC-35", name:"Gray Hare",        hex:"#989898" },
  { code:"SC-36", name:"Irish Luck",       hex:"#2E7830" },
  { code:"SC-38", name:"Rosey Posey",      hex:"#D86880" },
  { code:"SC-39", name:"Army Surplus",     hex:"#5A6838" },
  { code:"SC-40", name:"Blueberry Hill",   hex:"#384890" },
  { code:"SC-41", name:"Brown Cow",        hex:"#704828" },
  { code:"SC-42", name:"Butter Me Up",     hex:"#F8E060" },
  { code:"SC-45", name:"My Blue Heaven",   hex:"#5888C8" },
  { code:"SC-46", name:"Lime Ricky",       hex:"#9CD838" },
  { code:"SC-48", name:"Camel Back",       hex:"#B89858" },
  { code:"SC-49", name:"Grout Expectations",hex:"#A09890" },
  { code:"SC-51", name:"Poo Bear",         hex:"#A07850" },
  { code:"SC-52", name:"Scar-let",         hex:"#C02830" },
  { code:"SC-53", name:"Orange Ya Happy",  hex:"#E88040" },
  { code:"SC-56", name:"Chip Off The Old Block", hex:"#786850" },
  { code:"SC-57", name:"What A Downer",    hex:"#5E8060" },
  { code:"SC-65", name:"Peri-Twinkle",     hex:"#8080C0" },
  { code:"SC-66", name:"Grapel",           hex:"#684090" },
  { code:"SC-68", name:"Candy Apple Red",  hex:"#D82020" },
  { code:"SC-72", name:"Celadon",          hex:"#90B0A0" },
  { code:"SC-73", name:"Pink-A-Boo",       hex:"#F0A8B8" },
  { code:"SC-74", name:"Hot Tamale",       hex:"#D94030" },
  { code:"SC-75", name:"Orange-A-Peel",    hex:"#F09030" },
  { code:"SC-76", name:"Cara-bein Blue",   hex:"#40B8D0" },
  { code:"SC-77", name:"Glo Worm",         hex:"#B8E838" },
  { code:"SC-79", name:"Pinkie Swear",     hex:"#E8A0B0" },
  { code:"SC-80", name:"Orkid",            hex:"#B868A0" },
  { code:"SC-85", name:"Walkie Talkie",    hex:"#50C0B0" },
  { code:"SC-88", name:"Tu Tu Tango",      hex:"#E06898" },
  { code:"SC-89", name:"Cutie Pie Honey",  hex:"#D0A050" },
  { code:"SC-95", name:"Mango Tango",      hex:"#E8A060" },
  { code:"SC-97", name:"Cant-aloupe",      hex:"#F0B070" }
];

// The 19 confirmed in-stock at The Kiln Cafe
// Other studios will configure their own stock via admin
const DEFAULT_STOCKED = [
  "Pink-A-Boo", "Teal Next Time", "Blue Yonder", "Grapel", "Tuxedo",
  "Dandelion", "Green Thumb", "Sour Apple", "Blue Grass", "Gray Hare",
  "Army Surplus", "Orange Ya Happy", "Poo Bear", "Peri-Twinkle",
  "Hot Tamale", "Cara-bein Blue", "Orkid", "Pinkie Swear", "Cotton Tail"
];

// ── Colour matching algorithms ──

function hexToRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

/** Weighted colour distance (human-perception-adjusted) */
function colourDistance(a, b) {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db);
}

/** Find best matching glaze for an RGB colour */
function findBestMatch(rgb, palette = STROKE_AND_COAT) {
  let best = null, bestDist = Infinity;
  palette.forEach(c => {
    const d = colourDistance(rgb, hexToRgb(c.hex));
    if (d < bestDist) { bestDist = d; best = c; }
  });
  return { colour: best, score: Math.max(0, Math.round(100 - (bestDist / 441) * 100)) };
}

/** Extract dominant colours from ImageData */
function extractDominant(imageData, count = 5) {
  const px = imageData.data, buckets = {};
  for (let i = 0; i < px.length; i += 32) {
    if (px[i + 3] < 128) continue;
    const key = `${Math.round(px[i] / 32) * 32},${Math.round(px[i + 1] / 32) * 32},${Math.round(px[i + 2] / 32) * 32}`;
    buckets[key] = (buckets[key] || 0) + 1;
  }
  const top = [];
  for (const [k] of Object.entries(buckets).sort((a, b) => b[1] - a[1])) {
    const rgb = k.split(',').map(Number);
    if (!top.some(e => colourDistance(rgb, e) < 64)) top.push(rgb);
    if (top.length >= count) break;
  }
  return top;
}

export {
  STROKE_AND_COAT, DEFAULT_STOCKED,
  hexToRgb, rgbToHex, colourDistance, findBestMatch, extractDominant
};
