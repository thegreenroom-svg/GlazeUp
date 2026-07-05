/**
 * GlazeUp · Main Application
 *
 * Customer-facing PWA with three tools:
 *   1. Colour Matcher  — snap a photo, match to glazes
 *   2. Transfer Preview — overlay decal designs on bisque
 *   3. Print Output     — scale and print transfer sheets
 */

import { loadStudioConfig } from './studio-config.js';
import { BUILTIN_DESIGNS, BUILTIN_SHAPES, getDesignCategories, getDesignsByCategory } from './designs.js';
import { STROKE_AND_COAT, DEFAULT_STOCKED, hexToRgb, rgbToHex, findBestMatch, extractDominant } from './glazes.js';

// ═══════════════════════════════════════════
// APP STATE
// ═══════════════════════════════════════════

let studioConfig = null;
let currentPalette = STROKE_AND_COAT;
let stockedNames = DEFAULT_STOCKED;

// Transfer preview state
let bisqueImage = null;       // { type: 'photo', img: Image } or { type: 'shape', shape: object }
let currentDesign = null;
let overlayState = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 0.8 };
let canvasSize = 400;

// Touch gesture state
const touch = {
  pointers: [],
  startX: 0, startY: 0,
  startOvX: 0, startOvY: 0,
  startDist: 0, startAngle: 0,
  startScale: 1, startRot: 0
};

// ═══════════════════════════════════════════
// INITIALISATION
// ═══════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  studioConfig = await loadStudioConfig();
  buildPaletteGrid();
  setupEventListeners();
});

function setupEventListeners() {
  // Tab navigation
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Colour matcher file inputs
  document.getElementById('col-cam').addEventListener('change', e => {
    if (e.target.files[0]) processColourImage(e.target.files[0]);
  });
  document.getElementById('col-file').addEventListener('change', e => {
    if (e.target.files[0]) processColourImage(e.target.files[0]);
  });

  // Bisque camera input
  document.getElementById('bisque-cam').addEventListener('change', e => {
    if (!e.target.files[0]) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => { bisqueImage = { type: 'photo', img }; showDesignPicker(); };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(e.target.files[0]);
  });

  // Touch gestures on canvas
  const cWrap = document.getElementById('canvas-wrap');
  cWrap.addEventListener('pointerdown', onPointerDown);
  cWrap.addEventListener('pointermove', onPointerMove);
  cWrap.addEventListener('pointerup', onPointerEnd);
  cWrap.addEventListener('pointercancel', onPointerEnd);

  // Sliders
  ['ctrl-opacity', 'ctrl-size', 'ctrl-rotate'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateOverlay);
  });
  document.getElementById('print-width').addEventListener('input', updatePrintSize);
  document.getElementById('print-copies').addEventListener('input', updatePrintSize);

  // Resize handler
  window.addEventListener('resize', () => {
    if (currentDesign && document.getElementById('preview-step3').style.display !== 'none') {
      renderPreview();
    }
  });
}

// ═══════════════════════════════════════════
// TAB NAVIGATION
// ═══════════════════════════════════════════

function switchTab(id) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + id).classList.add('active');
  document.querySelector(`[data-tab="${id}"]`).classList.add('active');
}

// Expose for inline onclick handlers
window.switchTab = switchTab;

// ═══════════════════════════════════════════
// COLOUR MATCHER
// ═══════════════════════════════════════════

function processColourImage(file) {
  const capture = document.getElementById('colour-capture');
  const loading = document.getElementById('colour-loading');
  const preview = document.getElementById('colour-preview');
  const results = document.getElementById('colour-results');

  capture.style.display = 'none';
  loading.style.display = 'block';
  results.style.display = 'none';

  const reader = new FileReader();
  reader.onload = ev => {
    const img = document.getElementById('colour-preview-img');
    img.onload = () => {
      loading.style.display = 'none';
      preview.style.display = 'block';

      const cv = document.getElementById('col-canvas');
      const scale = Math.min(300 / img.naturalWidth, 300 / img.naturalHeight, 1);
      cv.width = Math.round(img.naturalWidth * scale);
      cv.height = Math.round(img.naturalHeight * scale);
      const ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0, cv.width, cv.height);

      const dominant = extractDominant(ctx.getImageData(0, 0, cv.width, cv.height));
      const list = document.getElementById('match-list');
      list.innerHTML = '';

      dominant.forEach(rgb => {
        const { colour, score } = findBestMatch(rgb, currentPalette);
        const stocked = stockedNames.includes(colour.name);
        const card = document.createElement('div');
        card.className = 'match-card';
        card.innerHTML = `
          <div class="sw-from" style="background:${rgbToHex(...rgb)}"></div>
          <span class="arrow">→</span>
          <div class="sw-to" style="background:${colour.hex}"></div>
          <div class="match-info">
            <div class="match-name">${colour.name}${stocked ? ' ✓' : ''}</div>
            <div class="match-code">${colour.code}${stocked ? ' · In stock' : ''}</div>
          </div>
          <span class="match-score">${score}%</span>`;
        list.appendChild(card);
      });
      results.style.display = 'block';
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

window.colourReset = function() {
  document.getElementById('colour-capture').style.display = 'block';
  document.getElementById('colour-preview').style.display = 'none';
  document.getElementById('colour-results').style.display = 'none';
  document.getElementById('colour-loading').style.display = 'none';
  document.getElementById('col-cam').value = '';
  document.getElementById('col-file').value = '';
};

function buildPaletteGrid() {
  const grid = document.getElementById('palette-grid');
  grid.innerHTML = '';
  currentPalette.forEach(c => {
    const stocked = stockedNames.includes(c.name);
    const chip = document.createElement('div');
    chip.className = 'pal-chip';
    chip.innerHTML = `
      <div class="pal-dot${stocked ? ' stocked' : ''}" style="background:${c.hex}"></div>
      <div class="pal-name">${c.name}</div>`;
    grid.appendChild(chip);
  });
}

// ═══════════════════════════════════════════
// TRANSFER PREVIEW — Step 1: Bisque selection
// ═══════════════════════════════════════════

window.showBisqueShapes = function() {
  document.getElementById('preview-step1').style.display = 'none';
  const cont = document.getElementById('bisque-shapes');
  cont.style.display = 'block';
  const grid = document.getElementById('shape-grid');
  if (grid.children.length) return;

  BUILTIN_SHAPES.forEach(s => {
    const wrap = document.createElement('div');
    const div = document.createElement('div');
    div.className = 'design-thumb';
    const cv = document.createElement('canvas');
    cv.width = 120; cv.height = 120;
    s.draw(cv.getContext('2d'), 120, 120);
    div.appendChild(cv);
    div.onclick = () => selectBisqueShape(s);
    wrap.appendChild(div);
    const label = document.createElement('div');
    label.className = 'design-thumb-label';
    label.textContent = s.name;
    wrap.appendChild(label);
    grid.appendChild(wrap);
  });
};

function selectBisqueShape(shape) {
  bisqueImage = { type: 'shape', shape };
  document.getElementById('bisque-shapes').style.display = 'none';
  showDesignPicker();
}

window.backToStep1 = function() {
  document.getElementById('bisque-shapes').style.display = 'none';
  document.getElementById('preview-step1').style.display = 'block';
};

// ═══════════════════════════════════════════
// TRANSFER PREVIEW — Step 2: Design picker
// ═══════════════════════════════════════════

function showDesignPicker() {
  document.getElementById('preview-step1').style.display = 'none';
  document.getElementById('preview-step2').style.display = 'block';

  const cats = getDesignCategories();
  const catBar = document.getElementById('design-cats');
  if (!catBar.children.length) {
    cats.forEach((cat, i) => {
      const pill = document.createElement('button');
      pill.className = 'cat-pill' + (i === 0 ? ' active' : '');
      pill.textContent = cat;
      pill.onclick = () => filterDesigns(cat, pill);
      catBar.appendChild(pill);
    });
  }
  filterDesigns(cats[0], catBar.firstChild);
}

function filterDesigns(cat, pill) {
  document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
  pill.classList.add('active');
  const grid = document.getElementById('design-grid');
  grid.innerHTML = '';

  getDesignsByCategory(cat).forEach(d => {
    const wrap = document.createElement('div');
    const div = document.createElement('div');
    div.className = 'design-thumb';
    const cv = document.createElement('canvas');
    cv.width = 120; cv.height = 120;
    // Set currentColor for designs that use it
    const thumbCtx = cv.getContext('2d');
    thumbCtx.strokeStyle = studioConfig?.branding?.primaryColour || '#b03a2e';
    thumbCtx.fillStyle = studioConfig?.branding?.primaryColour || '#b03a2e';
    d.draw(thumbCtx, 120, 120);
    div.appendChild(cv);
    div.onclick = () => selectDesign(d);
    wrap.appendChild(div);
    const label = document.createElement('div');
    label.className = 'design-thumb-label';
    label.textContent = d.name;
    wrap.appendChild(label);
    grid.appendChild(wrap);
  });
}

function selectDesign(design) {
  currentDesign = design;
  document.getElementById('preview-step2').style.display = 'none';
  document.getElementById('preview-step3').style.display = 'block';
  resetOverlay();
  renderPreview();
}

window.changeDesign = function() {
  document.getElementById('preview-step3').style.display = 'none';
  showDesignPicker();
};

window.startOver = function() {
  bisqueImage = null;
  currentDesign = null;
  document.getElementById('preview-step2').style.display = 'none';
  document.getElementById('preview-step3').style.display = 'none';
  document.getElementById('bisque-shapes').style.display = 'none';
  document.getElementById('preview-step1').style.display = 'block';
  document.getElementById('bisque-cam').value = '';
};

// ═══════════════════════════════════════════
// TRANSFER PREVIEW — Step 3: Canvas rendering
// ═══════════════════════════════════════════

function renderPreview() {
  const wrap = document.getElementById('canvas-wrap');
  const bcv = document.getElementById('bisque-canvas');
  const ocv = document.getElementById('overlay-canvas');
  const w = wrap.clientWidth, h = wrap.clientHeight;
  const dpr = window.devicePixelRatio || 1;
  canvasSize = w;

  [bcv, ocv].forEach(c => {
    c.width = w * dpr; c.height = h * dpr;
    c.style.width = w + 'px'; c.style.height = h + 'px';
  });

  const bctx = bcv.getContext('2d');
  bctx.scale(dpr, dpr);
  bctx.fillStyle = '#e8ddd6';
  bctx.fillRect(0, 0, w, h);

  if (bisqueImage) {
    if (bisqueImage.type === 'photo') {
      const img = bisqueImage.img;
      const ar = img.width / img.height;
      let dw = w, dh = h;
      if (ar > w / h) { dh = w / ar; } else { dw = h * ar; }
      bctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    } else {
      bisqueImage.shape.draw(bctx, w, h);
    }
  }
  updateOverlay();
}

function updateOverlay() {
  if (!currentDesign) return;
  const ocv = document.getElementById('overlay-canvas');
  const dpr = window.devicePixelRatio || 1;
  const w = ocv.width / dpr, h = ocv.height / dpr;
  const ctx = ocv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const opacity = document.getElementById('ctrl-opacity').value / 100;
  const scale = document.getElementById('ctrl-size').value / 100;
  const rotation = document.getElementById('ctrl-rotate').value * Math.PI / 180;

  document.getElementById('val-opacity').textContent = Math.round(opacity * 100) + '%';
  document.getElementById('val-size').textContent = Math.round(scale * 100) + '%';
  document.getElementById('val-rotate').textContent = Math.round(rotation * 180 / Math.PI) + '°';

  overlayState.opacity = opacity;
  overlayState.scale = scale;
  overlayState.rotation = rotation;

  const dw = w * scale, dh = h * scale;
  ctx.globalAlpha = opacity;
  ctx.save();
  ctx.translate(overlayState.x + w / 2, overlayState.y + h / 2);
  ctx.rotate(rotation);
  ctx.translate(-dw / 2, -dh / 2);

  // Set currentColor to studio primary
  const primary = studioConfig?.branding?.primaryColour || '#b03a2e';
  ctx.strokeStyle = primary;
  ctx.fillStyle = primary;
  currentDesign.draw(ctx, dw, dh);
  ctx.restore();
  ctx.globalAlpha = 1;
}

window.centreOverlay = function() { overlayState.x = 0; overlayState.y = 0; updateOverlay(); };

function resetOverlay() {
  overlayState = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 0.8 };
  document.getElementById('ctrl-opacity').value = 80;
  document.getElementById('ctrl-size').value = 80;
  document.getElementById('ctrl-rotate').value = 0;
  updateOverlay();
}
window.resetOverlay = resetOverlay;

// ═══════════════════════════════════════════
// TOUCH GESTURES (drag, pinch-to-zoom, rotate)
// ═══════════════════════════════════════════

function getPointerDist(p) {
  if (p.length < 2) return 0;
  const dx = p[1].x - p[0].x, dy = p[1].y - p[0].y;
  return Math.sqrt(dx * dx + dy * dy);
}

function getPointerAngle(p) {
  if (p.length < 2) return 0;
  return Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x);
}

function onPointerDown(e) {
  e.preventDefault();
  touch.pointers.push({ id: e.pointerId, x: e.clientX, y: e.clientY });

  if (touch.pointers.length === 1) {
    touch.startOvX = overlayState.x;
    touch.startOvY = overlayState.y;
    touch.startX = e.clientX;
    touch.startY = e.clientY;
  }
  if (touch.pointers.length === 2) {
    touch.startDist = getPointerDist(touch.pointers);
    touch.startAngle = getPointerAngle(touch.pointers);
    touch.startScale = parseFloat(document.getElementById('ctrl-size').value);
    touch.startRot = parseFloat(document.getElementById('ctrl-rotate').value);
  }
  e.target.closest('.preview-canvas-wrap')?.setPointerCapture(e.pointerId);
}

function onPointerMove(e) {
  e.preventDefault();
  const idx = touch.pointers.findIndex(p => p.id === e.pointerId);
  if (idx < 0) return;
  touch.pointers[idx] = { id: e.pointerId, x: e.clientX, y: e.clientY };

  if (touch.pointers.length === 1) {
    overlayState.x = touch.startOvX + (e.clientX - touch.startX);
    overlayState.y = touch.startOvY + (e.clientY - touch.startY);
    updateOverlay();
  } else if (touch.pointers.length === 2) {
    const dist = getPointerDist(touch.pointers);
    const angle = getPointerAngle(touch.pointers);
    if (touch.startDist > 0) {
      const ratio = dist / touch.startDist;
      const newSize = Math.max(20, Math.min(200, touch.startScale * ratio));
      document.getElementById('ctrl-size').value = newSize;
    }
    const angleDiff = (angle - touch.startAngle) * 180 / Math.PI;
    const newRot = (touch.startRot + angleDiff * 0.55 + 360) % 360;
    document.getElementById('ctrl-rotate').value = newRot;
    updateOverlay();
  }
}

function onPointerEnd(e) {
  touch.pointers = touch.pointers.filter(p => p.id !== e.pointerId);
}

// ═══════════════════════════════════════════
// PRINT
// ═══════════════════════════════════════════

window.sendToPrint = function() {
  if (!currentDesign) return;
  switchTab('print');
  document.getElementById('print-empty').style.display = 'none';
  document.getElementById('print-ready').style.display = 'block';
  updatePrintSize();
};

function updatePrintSize() {
  if (!currentDesign) return;
  const widthMM = parseInt(document.getElementById('print-width').value);
  const copies = parseInt(document.getElementById('print-copies').value);
  document.getElementById('val-print-w').textContent = widthMM;
  document.getElementById('val-print-copies').textContent = copies;

  // Render at 300 DPI
  const dpi = 300, mmToInch = 25.4;
  const pxW = Math.round(widthMM / mmToInch * dpi);
  const pxH = pxW;
  document.getElementById('print-size-info').textContent = `${widthMM}mm × ${widthMM}mm · ${pxW}px @ 300dpi`;

  const pcv = document.getElementById('print-canvas');
  pcv.width = pxW; pcv.height = pxH; pcv.style.maxWidth = '100%';
  const ctx = pcv.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, pxW, pxH);

  // Set currentColor
  const primary = studioConfig?.branding?.primaryColour || '#b03a2e';
  ctx.strokeStyle = primary; ctx.fillStyle = primary;
  ctx.save();
  ctx.translate(pxW / 2, pxH / 2);
  ctx.rotate(overlayState.rotation);
  ctx.translate(-pxW / 2, -pxH / 2);
  currentDesign.draw(ctx, pxW, pxH);
  ctx.restore();

  // Prepare tiled print render
  const rcv = document.getElementById('print-render');
  const cols = Math.min(copies, 3), rows = Math.ceil(copies / cols);
  const gap = Math.round(5 / mmToInch * dpi);
  rcv.width = cols * pxW + (cols - 1) * gap;
  rcv.height = rows * pxH + (rows - 1) * gap;
  const rctx = rcv.getContext('2d');
  rctx.fillStyle = '#fff'; rctx.fillRect(0, 0, rcv.width, rcv.height);
  let n = 0;
  for (let r = 0; r < rows && n < copies; r++) {
    for (let c = 0; c < cols && n < copies; c++, n++) {
      rctx.drawImage(pcv, c * (pxW + gap), r * (pxH + gap));
    }
  }
}

window.doPrint = function() {
  document.getElementById('print-output').style.display = 'flex';
  setTimeout(() => {
    window.print();
    document.getElementById('print-output').style.display = 'none';
  }, 150);
};

window.downloadDesign = function() {
  if (!currentDesign) return;
  const pcv = document.getElementById('print-canvas');
  const link = document.createElement('a');
  link.download = `glazeup-transfer-${currentDesign.id}.png`;
  link.href = pcv.toDataURL('image/png');
  link.click();
};

window.downloadTiled = function() {
  if (!currentDesign) return;
  const rcv = document.getElementById('print-render');
  const link = document.createElement('a');
  link.download = `glazeup-sheet-${currentDesign.id}.png`;
  link.href = rcv.toDataURL('image/png');
  link.click();
};
