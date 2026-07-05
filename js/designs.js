/**
 * GlazeUp · Built-in Design Library
 *
 * All designs are drawn with Canvas 2D — no external images needed.
 * Each design has: id, name, category, draw(ctx, w, h)
 *
 * TO ADD A NEW DESIGN:
 *   1. Add an entry to BUILTIN_DESIGNS below
 *   2. Write a draw(ctx, w, h) function — ctx is a Canvas 2D context,
 *      w and h are the drawing area dimensions
 *   3. That's it — it auto-appears in the library
 *
 * TO ADD A NEW BISQUE SHAPE:
 *   1. Add an entry to BUILTIN_SHAPES below
 *   2. Same draw(ctx, w, h) pattern
 */

// ═══════════════════════════════════════════
// TRANSFER DESIGNS
// ═══════════════════════════════════════════

const BUILTIN_DESIGNS = [

  // ── FLORALS ──
  {
    id: 'daisy', name: 'Daisy', category: 'Florals',
    draw(ctx, w, h) {
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.35;
      ctx.strokeStyle = 'currentColor'; ctx.lineWidth = 2; ctx.fillStyle = 'rgba(176,58,46,0.15)';
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        ctx.beginPath();
        ctx.ellipse(cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5, r * 0.35, r * 0.15, a, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(176,58,46,0.3)';
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  },
  {
    id: 'rose', name: 'Rose', category: 'Florals',
    draw(ctx, w, h) {
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.38;
      ctx.strokeStyle = 'currentColor'; ctx.lineWidth = 1.5;
      for (let ring = 3; ring >= 0; ring--) {
        const petals = 5 + ring * 2, pr = r * (ring + 1) / 4;
        ctx.fillStyle = `rgba(176,58,46,${0.1 + ring * 0.06})`;
        for (let i = 0; i < petals; i++) {
          const a = (i / petals) * Math.PI * 2 + ring * 0.3;
          ctx.beginPath();
          ctx.ellipse(cx + Math.cos(a) * pr * 0.4, cy + Math.sin(a) * pr * 0.4, pr * 0.35, pr * 0.2, a, 0, Math.PI * 2);
          ctx.fill(); ctx.stroke();
        }
      }
    }
  },
  {
    id: 'sunflower', name: 'Sunflower', category: 'Florals',
    draw(ctx, w, h) {
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.38;
      ctx.strokeStyle = '#8B6914'; ctx.lineWidth = 1.5; ctx.fillStyle = '#E8C840';
      for (let i = 0; i < 14; i++) {
        const a = i * Math.PI / 7;
        ctx.beginPath();
        ctx.ellipse(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55, r * 0.3, r * 0.1, a, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }
      ctx.fillStyle = '#8B6914'; ctx.beginPath(); ctx.arc(cx, cy, r * 0.25, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#654321';
      for (let i = 0; i < 20; i++) {
        const a = i * 2.4, d = r * 0.05 + i * r * 0.01;
        ctx.beginPath(); ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1.5, 0, Math.PI * 2); ctx.fill();
      }
    }
  },
  {
    id: 'wildflowers', name: 'Wildflowers', category: 'Florals',
    draw(ctx, w, h) {
      ctx.strokeStyle = '#5a7a3e'; ctx.lineWidth = 1.5;
      const stems = [[w * 0.3, h], [w * 0.5, h], [w * 0.7, h]];
      stems.forEach(([sx, sy], i) => {
        ctx.beginPath(); ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo(sx + (i - 1) * 15, h * 0.5, sx + (i - 1) * 8, h * 0.25); ctx.stroke();
      });
      const cols = ['rgba(176,58,46,0.5)', 'rgba(232,165,152,0.6)', 'rgba(126,87,194,0.5)'];
      stems.forEach(([sx], i) => {
        const fx = sx + (i - 1) * 8, fy = h * 0.25;
        ctx.fillStyle = cols[i];
        for (let p = 0; p < 5; p++) {
          const a = p * Math.PI * 2 / 5 - Math.PI / 2;
          ctx.beginPath(); ctx.ellipse(fx + Math.cos(a) * 12, fy + Math.sin(a) * 12, 8, 4, a, 0, Math.PI * 2);
          ctx.fill(); ctx.stroke();
        }
        ctx.fillStyle = '#D4A820'; ctx.beginPath(); ctx.arc(fx, fy, 4, 0, Math.PI * 2); ctx.fill();
      });
    }
  },
  {
    id: 'wreath', name: 'Wreath', category: 'Florals',
    draw(ctx, w, h) {
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.35;
      ctx.strokeStyle = '#5a7a3e'; ctx.lineWidth = 1.5;
      // Leaf wreath
      for (let i = 0; i < 16; i++) {
        const a = i * Math.PI * 2 / 16;
        const lx = cx + Math.cos(a) * r, ly = cy + Math.sin(a) * r;
        ctx.fillStyle = `rgba(90,122,62,${0.2 + Math.random() * 0.15})`;
        ctx.beginPath();
        ctx.ellipse(lx, ly, r * 0.18, r * 0.08, a + Math.PI / 2, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }
      // Small flowers at quarters
      for (let q = 0; q < 4; q++) {
        const a = q * Math.PI / 2 - Math.PI / 4;
        const fx = cx + Math.cos(a) * r, fy = cy + Math.sin(a) * r;
        ctx.fillStyle = 'rgba(176,58,46,0.35)';
        for (let p = 0; p < 5; p++) {
          const pa = p * Math.PI * 2 / 5;
          ctx.beginPath(); ctx.arc(fx + Math.cos(pa) * 5, fy + Math.sin(pa) * 5, 3, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  },

  // ── GEOMETRIC ──
  {
    id: 'polkadots', name: 'Polka Dots', category: 'Geometric',
    draw(ctx, w, h) {
      ctx.fillStyle = 'currentColor';
      const sp = w / 5;
      for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) {
        const ox = r % 2 ? sp / 2 : 0;
        ctx.globalAlpha = 0.6;
        ctx.beginPath(); ctx.arc(c * sp + ox, r * (h / 5), sp * 0.18, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  },
  {
    id: 'chevron', name: 'Chevrons', category: 'Geometric',
    draw(ctx, w, h) {
      ctx.strokeStyle = 'currentColor'; ctx.lineWidth = 3;
      const rows = 6, gap = h / rows;
      for (let r = 0; r < rows; r++) {
        const y = r * gap + gap / 2;
        ctx.beginPath();
        for (let x = 0; x < w + 20; x += 30) {
          ctx.moveTo(x, y); ctx.lineTo(x + 15, y - 10); ctx.lineTo(x + 30, y);
        }
        ctx.stroke();
      }
    }
  },
  {
    id: 'mandala', name: 'Mandala', category: 'Geometric',
    draw(ctx, w, h) {
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.42;
      ctx.strokeStyle = 'currentColor'; ctx.lineWidth = 1.5;
      for (let ring = 1; ring <= 4; ring++) {
        const rr = r * ring / 4;
        ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
        const n = 6 * ring;
        for (let i = 0; i < n; i++) {
          const a = i * Math.PI * 2 / n;
          ctx.beginPath();
          ctx.ellipse(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, rr * 0.15, rr * 0.08, a, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
  },
  {
    id: 'stripes', name: 'Stripes', category: 'Geometric',
    draw(ctx, w, h) {
      const gap = w / 8;
      for (let i = 0; i < 9; i++) {
        ctx.fillStyle = i % 2 ? 'currentColor' : 'rgba(176,58,46,0.12)';
        ctx.globalAlpha = i % 2 ? 0.5 : 0.3;
        ctx.fillRect(i * gap, 0, gap, h);
      }
      ctx.globalAlpha = 1;
    }
  },
  {
    id: 'diamonds', name: 'Diamonds', category: 'Geometric',
    draw(ctx, w, h) {
      ctx.strokeStyle = 'currentColor'; ctx.lineWidth = 1.5;
      const cols = 4, rows = 5;
      const cw = w / cols, ch = h / rows;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const cx = c * cw + cw / 2, cy = r * ch + ch / 2;
        ctx.fillStyle = (r + c) % 2 ? 'rgba(176,58,46,0.15)' : 'transparent';
        ctx.beginPath();
        ctx.moveTo(cx, cy - ch / 2); ctx.lineTo(cx + cw / 2, cy);
        ctx.lineTo(cx, cy + ch / 2); ctx.lineTo(cx - cw / 2, cy);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
  },
  {
    id: 'circles', name: 'Concentric', category: 'Geometric',
    draw(ctx, w, h) {
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.45;
      ctx.strokeStyle = 'currentColor'; ctx.lineWidth = 1.5;
      for (let i = 6; i >= 1; i--) {
        ctx.globalAlpha = 0.15 + (7 - i) * 0.08;
        ctx.fillStyle = 'currentColor';
        ctx.beginPath(); ctx.arc(cx, cy, r * i / 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      for (let i = 1; i <= 6; i++) {
        ctx.beginPath(); ctx.arc(cx, cy, r * i / 6, 0, Math.PI * 2); ctx.stroke();
      }
    }
  },

  // ── TEXT ──
  {
    id: 'happy-birthday', name: 'Happy Birthday', category: 'Text',
    draw(ctx, w, h) {
      ctx.fillStyle = 'currentColor'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const s = Math.min(w, h);
      ctx.font = `bold ${s * 0.1}px Georgia`; ctx.fillText('Happy', w / 2, h * 0.35);
      ctx.font = `bold ${s * 0.14}px Georgia`; ctx.fillText('Birthday', w / 2, h * 0.55);
      ctx.globalAlpha = 0.3;
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        ctx.beginPath(); ctx.arc(w / 2 + Math.cos(a) * s * 0.38, h / 2 + Math.sin(a) * s * 0.38, 3, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  },
  {
    id: 'love-heart', name: 'Love Heart', category: 'Text',
    draw(ctx, w, h) {
      const cx = w / 2, cy = h / 2, s = Math.min(w, h) * 0.35;
      ctx.fillStyle = 'currentColor'; ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.moveTo(cx, cy + s * 0.7);
      ctx.bezierCurveTo(cx - s * 1.2, cy - s * 0.2, cx - s * 0.4, cy - s, cx, cy - s * 0.4);
      ctx.bezierCurveTo(cx + s * 0.4, cy - s, cx + s * 1.2, cy - s * 0.2, cx, cy + s * 0.7);
      ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `italic ${s * 0.32}px Georgia`; ctx.fillText('love', cx, cy + s * 0.05);
    }
  },
  {
    id: 'nameplate', name: 'Name Plate', category: 'Text',
    draw(ctx, w, h) {
      const cx = w / 2, cy = h / 2, bw = w * 0.7, bh = h * 0.3;
      ctx.strokeStyle = 'currentColor'; ctx.lineWidth = 2;
      ctx.strokeRect(cx - bw / 2, cy - bh / 2, bw, bh);
      ctx.strokeRect(cx - bw / 2 + 4, cy - bh / 2 + 4, bw - 8, bh - 8);
      ctx.fillStyle = 'currentColor'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `italic ${bh * 0.35}px Georgia`; ctx.fillText('your name', cx, cy);
    }
  },
  {
    id: 'best-mum', name: 'Best Mum', category: 'Text',
    draw(ctx, w, h) {
      const cx = w / 2, cy = h / 2, s = Math.min(w, h);
      ctx.fillStyle = 'currentColor'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `${s * 0.08}px Georgia`; ctx.fillText("World's Best", cx, cy - s * 0.08);
      ctx.font = `bold ${s * 0.18}px Georgia`; ctx.fillText('Mum', cx, cy + s * 0.08);
      // hearts
      ctx.globalAlpha = 0.3; ctx.font = `${s * 0.06}px serif`;
      ctx.fillText('♥', cx - s * 0.25, cy); ctx.fillText('♥', cx + s * 0.25, cy);
      ctx.globalAlpha = 1;
    }
  },

  // ── NATURE ──
  {
    id: 'butterfly', name: 'Butterfly', category: 'Nature',
    draw(ctx, w, h) {
      const cx = w / 2, cy = h / 2, s = Math.min(w, h) * 0.35;
      ctx.strokeStyle = 'currentColor'; ctx.lineWidth = 1.5;
      ctx.fillStyle = 'rgba(176,58,46,0.25)';
      ctx.beginPath(); ctx.ellipse(cx - s * 0.5, cy - s * 0.2, s * 0.5, s * 0.7, -0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(cx + s * 0.5, cy - s * 0.2, s * 0.5, s * 0.7, 0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(176,58,46,0.15)';
      ctx.beginPath(); ctx.ellipse(cx - s * 0.35, cy + s * 0.3, s * 0.25, s * 0.4, -0.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(cx + s * 0.35, cy + s * 0.3, s * 0.25, s * 0.4, 0.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'currentColor'; ctx.beginPath(); ctx.ellipse(cx, cy, s * 0.06, s * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx - 2, cy - s * 0.45); ctx.quadraticCurveTo(cx - s * 0.3, cy - s * 0.9, cx - s * 0.4, cy - s * 0.85); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + 2, cy - s * 0.45); ctx.quadraticCurveTo(cx + s * 0.3, cy - s * 0.9, cx + s * 0.4, cy - s * 0.85); ctx.stroke();
    }
  },
  {
    id: 'leaf', name: 'Leaf', category: 'Nature',
    draw(ctx, w, h) {
      const cx = w / 2, cy = h / 2, s = Math.min(w, h) * 0.4;
      ctx.fillStyle = 'rgba(102,160,90,0.25)'; ctx.strokeStyle = '#5a7a3e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, cy - s);
      ctx.bezierCurveTo(cx + s * 0.8, cy - s * 0.5, cx + s * 0.6, cy + s * 0.5, cx, cy + s);
      ctx.bezierCurveTo(cx - s * 0.6, cy + s * 0.5, cx - s * 0.8, cy - s * 0.5, cx, cy - s);
      ctx.fill(); ctx.stroke();
      ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx, cy - s); ctx.lineTo(cx, cy + s); ctx.stroke();
      for (let i = 1; i < 5; i++) {
        const y = cy - s + i * s * 0.45;
        ctx.beginPath(); ctx.moveTo(cx, y); ctx.quadraticCurveTo(cx + s * 0.3, y - s * 0.1, cx + s * 0.45, y + s * 0.05); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, y); ctx.quadraticCurveTo(cx - s * 0.3, y - s * 0.1, cx - s * 0.45, y + s * 0.05); ctx.stroke();
      }
    }
  },
  {
    id: 'stars', name: 'Stars', category: 'Nature',
    draw(ctx, w, h) {
      function star(cx, cy, r) {
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = i * Math.PI * 2 / 5 - Math.PI / 2;
          const ax = cx + Math.cos(a) * r, ay = cy + Math.sin(a) * r;
          const ba = a + Math.PI / 5;
          const bx = cx + Math.cos(ba) * r * 0.4, by = cy + Math.sin(ba) * r * 0.4;
          i === 0 ? ctx.moveTo(ax, ay) : ctx.lineTo(ax, ay);
          ctx.lineTo(bx, by);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.strokeStyle = 'currentColor'; ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(176,58,46,0.2)'; star(w * 0.3, h * 0.25, w * 0.12);
      ctx.fillStyle = 'rgba(176,58,46,0.35)'; star(w * 0.7, h * 0.35, w * 0.15);
      ctx.fillStyle = 'rgba(176,58,46,0.5)'; star(w * 0.45, h * 0.65, w * 0.18);
      ctx.fillStyle = 'rgba(176,58,46,0.2)'; star(w * 0.75, h * 0.7, w * 0.1);
      ctx.fillStyle = 'rgba(176,58,46,0.15)'; star(w * 0.2, h * 0.75, w * 0.08);
    }
  },
  {
    id: 'feather', name: 'Feather', category: 'Nature',
    draw(ctx, w, h) {
      const cx = w / 2, cy = h / 2, s = Math.min(w, h) * 0.4;
      ctx.strokeStyle = 'currentColor'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx, cy - s); ctx.quadraticCurveTo(cx + s * 0.15, cy, cx - s * 0.1, cy + s); ctx.stroke();
      for (let i = 0; i < 12; i++) {
        const t = i / 12, px = cx + (s * 0.15 * t) * (1 - t) * 4 - s * 0.1 * t, py = cy - s + t * s * 2;
        ctx.fillStyle = `rgba(176,58,46,${0.1 + t * 0.15})`;
        ctx.beginPath();
        ctx.ellipse(px + (i % 2 ? -1 : 1) * s * 0.15, py, s * 0.2, s * 0.06, i % 2 ? -0.3 : 0.3, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }
    }
  },
  {
    id: 'paw-prints', name: 'Paw Prints', category: 'Nature',
    draw(ctx, w, h) {
      function paw(cx, cy, s, angle) {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle);
        ctx.fillStyle = 'currentColor'; ctx.globalAlpha = 0.5;
        // Pad
        ctx.beginPath(); ctx.ellipse(0, s * 0.1, s * 0.25, s * 0.2, 0, 0, Math.PI * 2); ctx.fill();
        // Toes
        const toes = [[-s * 0.22, -s * 0.15], [-s * 0.08, -s * 0.28], [s * 0.08, -s * 0.28], [s * 0.22, -s * 0.15]];
        toes.forEach(([tx, ty]) => { ctx.beginPath(); ctx.arc(tx, ty, s * 0.1, 0, Math.PI * 2); ctx.fill(); });
        ctx.globalAlpha = 1; ctx.restore();
      }
      const s = Math.min(w, h) * 0.2;
      paw(w * 0.3, h * 0.2, s, -0.3);
      paw(w * 0.6, h * 0.35, s, 0.15);
      paw(w * 0.35, h * 0.55, s, -0.1);
      paw(w * 0.65, h * 0.7, s, 0.25);
    }
  },

  // ── SEASONAL ──
  {
    id: 'xmas-tree', name: 'Christmas Tree', category: 'Seasonal',
    draw(ctx, w, h) {
      const cx = w / 2, s = Math.min(w, h);
      ctx.fillStyle = 'rgba(90,122,62,0.35)'; ctx.strokeStyle = '#5a7a3e'; ctx.lineWidth = 1.5;
      // Tree layers
      for (let i = 0; i < 3; i++) {
        const y = h * 0.15 + i * s * 0.2, bw = s * (0.15 + i * 0.12);
        ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(cx + bw, y + s * 0.25); ctx.lineTo(cx - bw, y + s * 0.25); ctx.closePath();
        ctx.fill(); ctx.stroke();
      }
      // Trunk
      ctx.fillStyle = '#8B6914'; ctx.fillRect(cx - s * 0.04, h * 0.78, s * 0.08, s * 0.1);
      // Star
      ctx.fillStyle = '#D4A820'; ctx.font = `${s * 0.08}px serif`; ctx.textAlign = 'center'; ctx.fillText('★', cx, h * 0.14);
    }
  },
  {
    id: 'snowflake', name: 'Snowflake', category: 'Seasonal',
    draw(ctx, w, h) {
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.38;
      ctx.strokeStyle = 'currentColor'; ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.stroke();
        // Branches
        for (let b = 1; b <= 2; b++) {
          const bx = cx + Math.cos(a) * r * b / 3, by = cy + Math.sin(a) * r * b / 3;
          const bl = r * 0.2;
          ctx.beginPath(); ctx.moveTo(bx, by);
          ctx.lineTo(bx + Math.cos(a + 0.6) * bl, by + Math.sin(a + 0.6) * bl); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(bx, by);
          ctx.lineTo(bx + Math.cos(a - 0.6) * bl, by + Math.sin(a - 0.6) * bl); ctx.stroke();
        }
      }
    }
  },
  {
    id: 'easter-egg', name: 'Easter Egg', category: 'Seasonal',
    draw(ctx, w, h) {
      const cx = w / 2, cy = h / 2, rw = Math.min(w, h) * 0.28, rh = rw * 1.3;
      ctx.fillStyle = 'rgba(176,58,46,0.1)'; ctx.strokeStyle = 'currentColor'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      // Bands
      ctx.lineWidth = 1.5;
      for (let i = -2; i <= 2; i++) {
        const y = cy + i * rh * 0.28;
        ctx.beginPath();
        ctx.moveTo(cx - rw * Math.cos(Math.asin(Math.abs(i) * 0.28)), y);
        ctx.lineTo(cx + rw * Math.cos(Math.asin(Math.abs(i) * 0.28)), y);
        ctx.stroke();
      }
      // Zigzag
      ctx.beginPath();
      for (let x = cx - rw * 0.7; x < cx + rw * 0.7; x += 8) {
        ctx.lineTo(x, cy + ((x / 8) % 2 ? -6 : 6));
      }
      ctx.stroke();
    }
  }
];

// ═══════════════════════════════════════════
// BISQUE SHAPES
// ═══════════════════════════════════════════

const BUILTIN_SHAPES = [
  {
    id: 'mug', name: 'Mug', category: 'Drinkware',
    draw(ctx, w, h) {
      const cx = w / 2, bw = w * 0.45, bh = h * 0.52, top = h * 0.22;
      ctx.fillStyle = '#f0e0d6'; ctx.strokeStyle = '#c8a898'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx - bw / 2, top); ctx.lineTo(cx - bw / 2 + 5, top + bh);
      ctx.lineTo(cx + bw / 2 - 5, top + bh); ctx.lineTo(cx + bw / 2, top); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + bw / 2, top + bh * 0.2);
      ctx.quadraticCurveTo(cx + bw / 2 + bw * 0.3, top + bh * 0.5, cx + bw / 2, top + bh * 0.8); ctx.stroke();
    }
  },
  {
    id: 'plate', name: 'Plate', category: 'Tableware',
    draw(ctx, w, h) {
      const cx = w / 2, cy = h / 2, rx = w * 0.42, ry = h * 0.25;
      ctx.fillStyle = '#f0e0d6'; ctx.strokeStyle = '#c8a898'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(cx, cy, rx * 0.7, ry * 0.7, 0, 0, Math.PI * 2); ctx.stroke();
    }
  },
  {
    id: 'bowl', name: 'Bowl', category: 'Tableware',
    draw(ctx, w, h) {
      const cx = w / 2, top = h * 0.35, bw = w * 0.55;
      ctx.fillStyle = '#f0e0d6'; ctx.strokeStyle = '#c8a898'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx - bw / 2, top);
      ctx.quadraticCurveTo(cx - bw / 2 + 10, top + h * 0.4, cx, top + h * 0.45);
      ctx.quadraticCurveTo(cx + bw / 2 - 10, top + h * 0.4, cx + bw / 2, top);
      ctx.lineTo(cx - bw / 2, top); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(cx, top, bw / 2, h * 0.06, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  },
  {
    id: 'vase', name: 'Vase', category: 'Decorative',
    draw(ctx, w, h) {
      const cx = w / 2;
      ctx.fillStyle = '#f0e0d6'; ctx.strokeStyle = '#c8a898'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx - 15, h * 0.12);
      ctx.lineTo(cx - 12, h * 0.2); ctx.quadraticCurveTo(cx - w * 0.25, h * 0.45, cx - w * 0.2, h * 0.78);
      ctx.lineTo(cx + w * 0.2, h * 0.78); ctx.quadraticCurveTo(cx + w * 0.25, h * 0.45, cx + 12, h * 0.2);
      ctx.lineTo(cx + 15, h * 0.12); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  },
  {
    id: 'tile', name: 'Tile / Coaster', category: 'Decorative',
    draw(ctx, w, h) {
      const s = Math.min(w, h) * 0.6, cx = w / 2, cy = h / 2;
      ctx.fillStyle = '#f0e0d6'; ctx.strokeStyle = '#c8a898'; ctx.lineWidth = 2;
      ctx.fillRect(cx - s / 2, cy - s / 2, s, s); ctx.strokeRect(cx - s / 2, cy - s / 2, s, s);
    }
  },
  {
    id: 'heart-dish', name: 'Heart Dish', category: 'Decorative',
    draw(ctx, w, h) {
      const cx = w / 2, cy = h / 2, s = Math.min(w, h) * 0.38;
      ctx.fillStyle = '#f0e0d6'; ctx.strokeStyle = '#c8a898'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, cy + s * 0.7);
      ctx.bezierCurveTo(cx - s * 1.2, cy - s * 0.2, cx - s * 0.4, cy - s, cx, cy - s * 0.35);
      ctx.bezierCurveTo(cx + s * 0.4, cy - s, cx + s * 1.2, cy - s * 0.2, cx, cy + s * 0.7);
      ctx.fill(); ctx.stroke();
    }
  },
  {
    id: 'egg-cup', name: 'Egg Cup', category: 'Drinkware',
    draw(ctx, w, h) {
      const cx = w / 2;
      ctx.fillStyle = '#f0e0d6'; ctx.strokeStyle = '#c8a898'; ctx.lineWidth = 2;
      // Cup
      ctx.beginPath(); ctx.moveTo(cx - 18, h * 0.35);
      ctx.quadraticCurveTo(cx - 22, h * 0.55, cx - 14, h * 0.6);
      ctx.lineTo(cx + 14, h * 0.6);
      ctx.quadraticCurveTo(cx + 22, h * 0.55, cx + 18, h * 0.35);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // Stem
      ctx.fillRect(cx - 6, h * 0.6, 12, h * 0.08);
      ctx.strokeRect(cx - 6, h * 0.6, 12, h * 0.08);
      // Base
      ctx.beginPath(); ctx.ellipse(cx, h * 0.7, 20, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  },
  {
    id: 'figurine', name: 'Figurine', category: 'Decorative',
    draw(ctx, w, h) {
      const cx = w / 2;
      ctx.fillStyle = '#f0e0d6'; ctx.strokeStyle = '#c8a898'; ctx.lineWidth = 2;
      // Head
      ctx.beginPath(); ctx.arc(cx, h * 0.25, w * 0.1, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      // Body
      ctx.beginPath(); ctx.moveTo(cx - w * 0.08, h * 0.33);
      ctx.quadraticCurveTo(cx - w * 0.15, h * 0.55, cx - w * 0.12, h * 0.75);
      ctx.lineTo(cx + w * 0.12, h * 0.75);
      ctx.quadraticCurveTo(cx + w * 0.15, h * 0.55, cx + w * 0.08, h * 0.33);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }
];

// ═══════════════════════════════════════════
// CATEGORY HELPERS
// ═══════════════════════════════════════════

function getDesignCategories() {
  return [...new Set(BUILTIN_DESIGNS.map(d => d.category))];
}

function getDesignsByCategory(category) {
  return BUILTIN_DESIGNS.filter(d => d.category === category);
}

function getDesignById(id) {
  return BUILTIN_DESIGNS.find(d => d.id === id);
}

function getShapeById(id) {
  return BUILTIN_SHAPES.find(s => s.id === id);
}

export {
  BUILTIN_DESIGNS, BUILTIN_SHAPES,
  getDesignCategories, getDesignsByCategory, getDesignById, getShapeById
};
