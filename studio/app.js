/* ══════════════════════════════════════════════════════════════════
   THE KILN CAFE — studio app. 4 Aug 2026, built from scratch.

   READ-ONLY BY CONSTRUCTION. Daisy's instruction: show the live data,
   let people move around it, but never send anything back to Square,
   the bookings or the till. That is not a convention here — the
   fetch wrapper below physically refuses any request that is not a
   GET, and refuses any URL not on the allow-list. A write cannot be
   made from this app even by mistake.

   Nothing persists. No storage, no cookies. Log in again and you get
   the live data fresh, with every practice tap cleared.
   ══════════════════════════════════════════════════════════════════ */
'use strict';

const STUDIO = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3';
const API = location.origin;

/* ── the guard ───────────────────────────────────────────────────── */
const ALLOWED = [
  '/api/staff/team-for-login', '/api/bookings/day', '/api/floor/active',
  '/api/pos/items', '/api/packing/queue', '/api/takings/today',
  '/api/takings/breakdown', '/api/takings/history', '/api/analytics/dashboard',
];
async function read(path, params = {}) {
  const url = new URL(path, API);
  if (!ALLOWED.includes(url.pathname))
    throw new Error('Blocked: ' + url.pathname + ' is not a read this app is allowed to make.');
  url.searchParams.set('studioId', STUDIO);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
  const r = await fetch(url, { method: 'GET', cache: 'no-store' });
  if (!r.ok) throw new Error('The server answered ' + r.status + '.');
  return r.json();
}

/* ── state (memory only, cleared on every load) ──────────────────── */
let me = null, view = 'login', stack = [], day = new Date(),
    bookings = [], floor = [], priceGroups = [], cat = null, ticket = [], tickWhere = 'Practice ticket';

const $ = id => document.getElementById(id);
const money = n => '£' + (n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hhmm = d => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const isoDay = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const DAYNAME = d => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

/* The real floor, as the studio is actually laid out. */
const TABLES = [
  ['Table 1','Main Studio',6],['Table 2','Main Studio',4],['Table 3','Main Studio',4],
  ['Table 4','Main Studio',6],['Table 5','Main Studio',6],['Table 6','Main Studio',4],
  ['Table 7','Main Studio',4],['Table 8','Main Studio',8],
  ['Lounge 1','Lounge',4],['Lounge 2','Lounge',4],['Lounge 3','Lounge',4],
  ['Lounge 4','Lounge',4],['Lounge 5','Lounge',4],['Lounge 6','Lounge',4],
  ['The Vault','The Vault',14],
];
const short = n => n.replace('Table ', 'T').replace('Lounge ', 'L').replace('The Vault', 'Vault');

/* Square writes the room into the service name; this is the only
   thing that reliably says which room a booking belongs to. */
function roomOf(b) {
  const s = (b.space_name || b.room || '').toLowerCase();
  if (s.includes('vault')) return 'The Vault';
  if (s.includes('lounge') || s.includes('evening')) return 'Lounge';
  return 'Main Studio';
}
const serviceShort = b => {
  const s = b.space_name || 'Session';
  return s.replace(/\*[^*]*\*/g, '').replace(/\s+/g, ' ').replace(/ - .*$/, '').trim() || 'Session';
};

/* ── navigation ──────────────────────────────────────────────────── */
const PANES = {
  login: ['The Kiln Cafe', ''],
  home:  ['The Kiln Cafe', ''],
  floor: ['Floor', 'Tap a table'],
  day:   ['Bookings', ''],
  bk:    ['Booking', ''],
  till:  ['Till', 'Practice only — nothing is sent'],
  pack:  ['Packing', 'Pieces waiting to go home'],
  money: ['Money', 'Live from Square'],
};

function go(v, push = true) {
  if (push && v !== view) stack.push(view);
  view = v;
  document.querySelectorAll('.pane').forEach(p => p.classList.remove('on'));
  $('p-' + v).classList.add('on');
  const [t, s] = PANES[v] || ['', ''];
  $('ttl').textContent = t; $('sub').textContent = s;
  $('back').classList.toggle('on', v !== 'login' && v !== 'home');
  $('main').scrollTop = 0;
  syncTicket();
  if (v === 'floor') loadFloor();
  if (v === 'day') loadDay();
  if (v === 'till') loadTill();
  if (v === 'pack') loadPack();
  if (v === 'money') loadMoney();
  if (v === 'home') loadHome();
}
function back() { go(stack.pop() || 'home', false); }

/* ── login ───────────────────────────────────────────────────────── */
function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
}
async function loadLogin() {
  $('greet').textContent = greeting();
  try {
    const d = await read('/api/staff/team-for-login');
    const team = (d.team || d.members || d || []).filter(p => p && p.name);
    if (!team.length) throw new Error('No team came back.');
    $('people').innerHTML = team.map(p => `
      <button class="person" data-id="${esc(p.id)}" data-name="${esc(p.name)}" data-role="${esc(p.role || '')}">
        <span class="n">${esc(p.name)}</span>
        <span class="r">${esc(p.role || '')}</span>
        ${p.onShift || p.on_shift ? '<span class="on-shift">ON SHIFT</span>' : ''}
      </button>`).join('');
    $('people').querySelectorAll('.person').forEach(b =>
      b.onclick = () => signIn(b.dataset.name, b.dataset.role));
  } catch (e) {
    $('people').innerHTML = `<div class="err" style="grid-column:1/-1">Couldn't reach the studio.
      ${esc(e.message)}<br><br>You can still look around with the practice team.</div>
      <button class="person" id="fallback" style="grid-column:1/-1"><span class="n">Carry on anyway</span>
      <span class="r">Practice, no live data</span></button>`;
    $('fallback').onclick = () => signIn('there', '');
  }
}
const ADMIN = ['general manager', 'co-director', 'studio executive', 'director'];
function signIn(name, role) {
  me = { name, role, admin: ADMIN.some(r => (role || '').toLowerCase().includes(r)) };
  ticket = []; stack = [];                       // every login starts clean
  $('who').textContent = name;
  go('home', false);
}

/* ── home ────────────────────────────────────────────────────────── */
async function loadHome() {
  $('sub').textContent = DAYNAME(new Date());
  const t = [
    ['floor', '▦', 'Floor', 'Who is in, table by table', 'floorN'],
    ['day',   '◷', 'Bookings', 'The day, table by table', 'dayN'],
    ['till',  '£', 'Till', 'Prices and a practice ticket', null],
    ['pack',  '◲', 'Packing', 'Pieces waiting to go home', 'packN'],
  ];
  if (me && me.admin) t.push(['money', '£', 'Money', 'Takings, live from Square', 'moneyN']);
  $('hometiles').innerHTML = t.map(([v, ic, title, sub, slot]) => `
    <button class="tile" data-go="${v}">
      <span class="ic">${ic}</span>
      <span>${slot ? `<span class="big" id="${slot}">—</span>` : ''}
        <span class="t">${title}</span><span class="s">${sub}</span></span>
    </button>`).join('');
  $('hometiles').querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
  countUp();
}
async function countUp() {
  read('/api/bookings/day', { date: isoDay(new Date()) })
    .then(d => {
      const n = (d.bookings || []).length;
      if ($('dayN')) $('dayN').textContent = n;
      const now = Date.now();
      const live = (d.bookings || []).filter(b => {
        const s = b.session_start ? new Date(b.session_start).getTime() : 0;
        const e = b.session_end ? new Date(b.session_end).getTime() : s + 2 * 36e5;
        return s && s <= now && e >= now;
      }).length;
      if ($('floorN')) $('floorN').textContent = live;
    }).catch(() => {});
  read('/api/packing/queue').then(d => {
    if ($('packN')) $('packN').textContent = d.count != null ? d.count : (d.pieces || []).length;
  }).catch(() => {});
  if (me && me.admin) read('/api/takings/today').then(d => {
    if ($('moneyN')) $('moneyN').textContent = d.value == null ? '—' : money(d.value).replace('.00', '');
  }).catch(() => {});
}

/* ── floor ───────────────────────────────────────────────────────── */
async function loadFloor() {
  try {
    const d = await read('/api/bookings/day', { date: isoDay(new Date()) });
    bookings = d.bookings || [];
  } catch (e) {
    $('floor').innerHTML = `<div class="err">Couldn't read today's bookings. ${esc(e.message)}</div>`;
    return;
  }
  const now = Date.now();
  const byTable = {};
  bookings.forEach(b => {
    const s = b.session_start ? new Date(b.session_start).getTime() : 0;
    const e = b.session_end ? new Date(b.session_end).getTime() : s + 2 * 36e5;
    const state = (s && s <= now && e >= now) ? 'live' : (s > now ? 'soon' : 'past');
    if (state === 'past') return;
    let t = b.table_number != null ? String(b.table_number) : null;
    if (t && /^\d+$/.test(t)) t = 'Table ' + t;
    if (!t) {                                     // not seated — park in its room
      const room = roomOf(b);
      const free = TABLES.filter(x => x[1] === room && !byTable[x[0]]);
      t = free.length ? free[0][0] : null;
    }
    if (!t) return;
    if (!byTable[t] || state === 'live') byTable[t] = { b, state };
  });
  let h = '';
  ['Main Studio', 'Lounge', 'The Vault'].forEach(room => {
    h += `<div class="roomname">${room}</div><div class="grid3">`;
    TABLES.filter(t => t[1] === room).forEach(([name, , seats]) => {
      const hit = byTable[name];
      const cls = hit ? hit.state : '';
      const note = hit ? (hit.state === 'live' ? esc(hit.b.customer_name || 'In now')
                        : 'at ' + hhmm(hit.b.session_start)) : seats + ' seats';
      h += `<button class="tbl ${cls}" data-t="${esc(name)}"><span class="n">${short(name)}</span>
        <span class="s">${note}</span></button>`;
    });
    h += '</div>';
  });
  $('floor').innerHTML = h;
  $('floor').querySelectorAll('[data-t]').forEach(el => el.onclick = () => {
    const hit = byTable[el.dataset.t];
    if (hit) openBooking(hit.b); else { tickWhere = el.dataset.t; go('till'); }
  });
}

/* ── day ─────────────────────────────────────────────────────────── */
const OPEN = 9, CLOSE = 18, PX = 15;
async function loadDay() {
  $('daylbl').textContent = DAYNAME(day);
  $('cal').innerHTML = ''; $('daynote').innerHTML = '';
  let d;
  try { d = await read('/api/bookings/day', { date: isoDay(day) }); }
  catch (e) { $('daynote').innerHTML = `<div class="err">Couldn't read that day. ${esc(e.message)}</div>`; return; }
  const list = d.bookings || [];
  if (!list.length) { $('daynote').innerHTML = '<div class="empty">Nothing booked this day.</div>'; return; }

  // Columns are tables, the way Square is set up here.
  const cols = [...new Set(list.map(b => {
    let t = b.table_number != null ? String(b.table_number) : null;
    if (t && /^\d+$/.test(t)) t = 'T' + t;
    return t || short(roomOf(b) === 'The Vault' ? 'The Vault' : roomOf(b) === 'Lounge' ? 'Lounge 1' : 'Table 1');
  }))].sort();
  const rows = (CLOSE - OPEN) * 4;
  const cal = $('cal');
  cal.style.gridTemplateColumns = `44px repeat(${cols.length},112px)`;
  cal.style.gridTemplateRows = `28px repeat(${rows},${PX}px)`;
  let h = '<div class="nub"></div>' + cols.map(c => `<div class="colh">${esc(c)}</div>`).join('');
  for (let r = 0; r < rows; r += 4)
    h += `<div class="gut" style="grid-row:${r + 2}/span 4;grid-column:1">${OPEN + r / 4}:00</div>`;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols.length; c++)
    h += `<div class="cell${(r + 1) % 4 === 0 ? ' h' : ''}" style="grid-row:${r + 2};grid-column:${c + 2}"></div>`;

  const now = Date.now();
  list.forEach((b, i) => {
    if (!b.session_start) return;
    const st = new Date(b.session_start), en = b.session_end ? new Date(b.session_end) : new Date(st.getTime() + 2 * 36e5);
    let t = b.table_number != null ? String(b.table_number) : null;
    if (t && /^\d+$/.test(t)) t = 'T' + t;
    const key = t || short(roomOf(b) === 'The Vault' ? 'The Vault' : roomOf(b) === 'Lounge' ? 'Lounge 1' : 'Table 1');
    const ci = cols.indexOf(key); if (ci < 0) return;
    const startRow = Math.round((st.getHours() * 60 + st.getMinutes() - OPEN * 60) / 15) + 2;
    if (startRow < 2) return;
    const span = Math.max(2, Math.round((en - st) / 6e4 / 15));
    const state = en.getTime() < now ? 'past' : (st.getTime() <= now ? 'now' : '');
    h += `<button class="ev ${state}" data-i="${i}"
      style="grid-row:${startRow}/span ${span};grid-column:${ci + 2}">
      <span class="t">${hhmm(st)}</span><span class="n">${esc(b.customer_name || 'Booking')}</span></button>`;
  });
  cal.innerHTML = h;
  cal.querySelectorAll('[data-i]').forEach(el => el.onclick = () => openBooking(list[+el.dataset.i]));

  if (isoDay(day) === isoDay(new Date())) {
    const n = new Date(), m = n.getHours() * 60 + n.getMinutes();
    if (m > OPEN * 60 && m < CLOSE * 60) {
      const top = 28 + ((m - OPEN * 60) / 15) * PX;
      cal.insertAdjacentHTML('beforeend',
        `<div class="redline" style="top:${top}px;left:44px;width:${cols.length * 112}px"></div>`);
    }
  }
  $('daynote').innerHTML = `<div class="note">${list.length} booked${d.covers ? ' · ' + d.covers + ' covers' : ''}.
    Columns are tables, as Square has them.</div>`;
}
function shift(n) { day = new Date(day.getTime() + n * 864e5); loadDay(); }

/* ── booking ─────────────────────────────────────────────────────── */
function openBooking(b) {
  const st = b.session_start ? new Date(b.session_start) : null;
  const en = b.session_end ? new Date(b.session_end) : null;
  const mins = st && en ? Math.round((en - st) / 6e4) : null;
  const row = (k, v) => v ? `<div class="row"><div><div class="k">${k}</div>
    <div class="l" style="margin-top:3px">${esc(v)}</div></div></div>` : '';
  $('bk').innerHTML = `
    <div class="card">
      <div style="font-family:var(--serif);font-weight:900;font-size:24px">${esc(b.customer_name || 'Booking')}</div>
      ${st ? `<div style="font-family:var(--serif);font-weight:900;font-size:19px;margin-top:9px">
        ${hhmm(st)}${en ? ' – ' + hhmm(en) : ''}
        ${mins ? `<span style="font-family:var(--ui);font-size:12.5px;font-weight:600;color:var(--clay)">
        (${Math.floor(mins / 60)} hr${Math.floor(mins / 60) === 1 ? '' : 's'} ${mins % 60} mins)</span>` : ''}</div>
        <div style="font-size:13px;font-weight:600">${DAYNAME(st)}</div>` : ''}
    </div>
    <div class="card">
      ${row('Service', b.space_name)}
      ${row('Painters', b.party_size)}
      ${row('Table', b.table_number != null ? b.table_number : 'Not seated yet')}
      ${row('Phone', b.customer_phone)}
      ${row('Email', b.customer_email)}
      ${row('Notes', b.notes)}
      ${row('Reference', b.booking_code)}
    </div>
    <button class="btn" id="bk-till">Open a practice ticket</button>
    <div class="note">Read-only: this booking can't be changed from here. Use Square for anything real.</div>`;
  $('bk-till').onclick = () => {
    tickWhere = (b.customer_name || 'Booking') + (b.table_number != null ? ' · Table ' + b.table_number : '');
    go('till');
  };
  go('bk');
}

/* ── till (practice ticket, never sent) ──────────────────────────────
   Prefers the real Square catalogue (/api/pos/items). That table is
   empty until someone runs the catalogue pull, which is why the till
   read "no prices stored yet" — nothing broken, never fetched.
   Rather than show an empty screen, it falls back to the studio's real
   categories and their real average selling price, worked out from
   four years of actual sales. Labelled as exactly that, never dressed
   up as the catalogue. */
let tillMode = null;

async function loadTill() {
  if (priceGroups.length) return paintTill();
  try {
    const d = await read('/api/pos/items');
    if ((d.groups || []).length) {
      priceGroups = d.groups; tillMode = 'catalogue';
      cat = priceGroups[0].category; return paintTill();
    }
  } catch (e) { /* fall through to the categories below */ }

  try {
    const b = await read('/api/takings/breakdown');
    // Square's own catch-all is not something anyone rings up — it is an
    // artefact of items having no category. It belongs on Money, not here.
    const groups = (b.groups || [])
      .filter(g => (g.categories || []).length || g.category)
      .filter(g => !/unclassified|^other$/i.test(g.group || g.category || ''));
    if (!groups.length) throw new Error('no categories');
    priceGroups = groups.map(g => ({
      category: g.group || g.category,
      items: (g.categories || []).map(c => ({
        name: String(c.category || c.name || '').replace(/^PB |^S\. /, ''),
        price: c.items ? (c.revenue / c.items) : 0,
      })).filter(i => i.name && i.price > 0).sort((a, b2) => b2.price - a.price),
    })).filter(g => g.items.length);
    if (!priceGroups.length) throw new Error('no items');
    tillMode = 'average'; cat = priceGroups[0].category; paintTill();
  } catch (e) {
    $('items').innerHTML = `<div class="err" style="grid-column:1/-1">
      Couldn't read prices or categories. ${esc(e.message)}</div>`;
  }
}

function paintTill() {
  $('cats').innerHTML = priceGroups.map(g =>
    `<button class="chip ${g.category === cat ? 'on' : ''}" data-c="${esc(g.category)}">${esc(g.category)}</button>`).join('');
  $('cats').querySelectorAll('[data-c]').forEach(b => b.onclick = () => { cat = b.dataset.c; paintTill(); });
  const g = priceGroups.find(x => x.category === cat) || priceGroups[0];
  const banner = tillMode === 'average'
    ? `<div class="note" style="grid-column:1/-1;margin:0 0 4px">These are your real categories with
       the <strong>average</strong> you actually sell each at, worked out from four years of takings —
       not the Square price list. The real one appears here once the catalogue is pulled from Square.</div>`
    : '';
  $('items').innerHTML = banner + (g.items || []).map((it, i) =>
    `<button class="item" data-i="${i}"><span class="n">${esc(it.name)}</span>
     <span class="p">${money(it.price)}</span></button>`).join('');
  $('items').querySelectorAll('[data-i]').forEach(b => b.onclick = () => {
    const it = g.items[+b.dataset.i]; ticket.push({ n: it.name, p: it.price }); syncTicket();
  });
  $('sub').textContent = tillMode === 'average'
    ? 'Average prices — practice only' : 'Practice only — nothing is sent';
}

function syncTicket() {
  const show = view === 'till' && ticket.length > 0;
  $('ticket').classList.toggle('up', show);
  $('tkwhere').textContent = tickWhere;
  $('tktotal').textContent = money(ticket.reduce((s, i) => s + i.p, 0));
  $('tklines').innerHTML = ticket.map((i, ix) =>
    `<div style="display:flex;justify-content:space-between;font-size:12.5px;padding:3px 0">
     <span>${esc(i.n)}</span><span>${money(i.p)}
     <button data-x="${ix}" style="background:none;border:none;color:var(--clay);
     cursor:pointer;padding:0 0 0 8px;font-size:13px">✕</button></span></div>`).join('');
  $('tklines').querySelectorAll('[data-x]').forEach(b =>
    b.onclick = () => { ticket.splice(+b.dataset.x, 1); syncTicket(); });
}

/* ── packing ─────────────────────────────────────────────────────────
   Shaped like a booking, not a parts list — Jenny already thinks in
   bookings, so this opens the same way: whose it is, when it's due,
   how many pieces, and the table photo when there is one. The chalk
   tags carry the collect date and the NOT PAID warnings, and those
   ride along in the notes, so they surface here rather than being
   found at the counter. */
let packBookings = null;

async function loadPack() {
  if (packBookings) return paintPack();
  try {
    const d = await read('/api/packing/queue');
    const pieces = d.pieces || [];
    if (!pieces.length) { $('pack').innerHTML = '<div class="empty">Nothing waiting. All caught up.</div>'; return; }
    const by = {};
    pieces.forEach(p => {
      const k = p.booking_id || 'Studio shelf';
      (by[k] = by[k] || { who: k, pieces: [], photo: null, unpaid: false, collect: null }).pieces.push(p);
      const g = by[k];
      if (!g.photo && p.reference_photo_url) g.photo = p.reference_photo_url;
      const n = p.notes || '';
      if (/not paid|\bNP\b/i.test(n)) g.unpaid = true;
      const m = n.match(/collect\s+(\d{1,2}\/\d{1,2})/i);
      if (m && !g.collect) g.collect = m[1];
    });
    packBookings = Object.values(by).sort((a, b) =>
      (b.unpaid - a.unpaid) || a.who.localeCompare(b.who));
    paintPack();
  } catch (e) {
    $('pack').innerHTML = `<div class="err">Couldn't read the packing queue. ${esc(e.message)}</div>`;
  }
}

function paintPack() {
  $('sub').textContent = packBookings.length + ' waiting to go home';
  $('pack').innerHTML = packBookings.map((g, i) => `
    <button class="card" data-p="${i}" style="width:100%;text-align:left;cursor:pointer;
      display:flex;gap:12px;align-items:center;font:inherit;color:inherit">
      ${g.photo
        ? `<img src="${esc(g.photo)}" alt="" style="width:62px;height:62px;object-fit:cover;
             border-radius:11px;flex-shrink:0;border:1px solid var(--line)">`
        : `<div style="width:62px;height:62px;border-radius:11px;flex-shrink:0;
             border:1.5px dashed var(--line);display:flex;align-items:center;justify-content:center;
             font-size:9px;color:var(--clay);text-align:center;line-height:1.2;padding:4px">No photo yet</div>`}
      <span style="flex:1;min-width:0">
        <span style="display:block;font-family:var(--serif);font-weight:900;font-size:16px">${esc(g.who)}</span>
        <span style="display:block;font-size:11.5px;color:var(--clay);margin-top:2px">
          ${g.pieces.length} ${g.pieces.length === 1 ? 'piece' : 'pieces'}${g.collect ? ' · collect ' + esc(g.collect) : ''}</span>
        ${g.unpaid ? `<span style="display:inline-block;margin-top:6px;font-size:9.5px;font-weight:800;
          letter-spacing:.06em;background:rgba(163,45,33,.12);color:var(--live);
          padding:3px 8px;border-radius:10px">NOT PAID — CHARGE AT COLLECTION</span>` : ''}
      </span>
      <span style="color:var(--clay);font-size:20px">›</span>
    </button>`).join('');
  $('pack').querySelectorAll('[data-p]').forEach(b =>
    b.onclick = () => openPackBooking(packBookings[+b.dataset.p]));
}

function openPackBooking(g) {
  PANES.packbk = ['Packing', g.who];
  $('pack').innerHTML = `
    ${g.photo ? `<img src="${esc(g.photo)}" alt="The table photo for this booking"
      style="width:100%;border-radius:16px;border:1.5px solid var(--line);margin-bottom:12px">`
      : `<div class="note" style="margin-bottom:12px">No table photo on this booking yet. Once the
         studio photos are loading in, the chalk tag is read off the picture and it lands here —
         so you can see the pieces rather than hunt for them.</div>`}
    <div class="card">
      <div style="font-family:var(--serif);font-weight:900;font-size:22px">${esc(g.who)}</div>
      <div style="font-size:12px;color:var(--clay);margin-top:3px">
        ${g.pieces.length} ${g.pieces.length === 1 ? 'piece' : 'pieces'}${g.collect ? ' · collect ' + esc(g.collect) : ''}</div>
      ${g.unpaid ? `<div class="err" style="margin-top:10px"><strong>Not paid.</strong>
        The chalk tag says charge at collection.</div>` : ''}
    </div>
    <div class="card"><h2>The pieces</h2>
      ${g.pieces.map(p => `<div class="row"><div style="flex:1">
        <div class="l">${esc(p.piece_type || p.label || 'Piece')}</div>
        ${p.notes ? `<div class="m">${esc(p.notes)}</div>` : ''}</div>
        <div class="v" style="font-size:10.5px;color:var(--clay);text-transform:uppercase;
          letter-spacing:.05em">${esc(p.status || '')}</div></div>`).join('')}
    </div>
    <button class="btn ghost" id="pack-back">Back to the list</button>
    <div class="note">Read-only — marking a piece packed still happens on the real system.</div>`;
  $('pack-back').onclick = () => { paintPack(); $('main').scrollTop = 0; };
  $('main').scrollTop = 0;
}

/* ── money (admin only) ─────────────────────────────────────────────
   Everything is already on the server: /api/takings/history returns
   every recorded day back to Nov 2022 plus months, years and weekday
   averages in ONE call, and /api/takings/breakdown returns the real
   Square categories. Both are reads. Nothing is pulled on demand —
   the screen loads once and the ranges just re-slice what it has. */
let hist = null, brk = null, range = '30d';

async function loadMoney() {
  if (!me || !me.admin) { $('money').innerHTML = '<div class="empty">Takings are for the directors.</div>'; return; }
  if (hist) return paintMoney();
  $('money').innerHTML = '<div class="empty">Reading four years of takings…</div>';
  try {
    const [h, b] = await Promise.all([
      read('/api/takings/history'),
      read('/api/takings/breakdown').catch(() => null),
    ]);
    hist = h; brk = b; paintMoney();
  } catch (e) {
    $('money').innerHTML = `<div class="err">Couldn't read takings. ${esc(e.message)}</div>`;
  }
}

/* A plain SVG column chart. No library, no network, no tracking. */
function chart(points, label) {
  if (!points.length) return '';
  const W = 320, H = 108, max = Math.max(...points.map(p => p.v)) || 1;
  const bw = W / points.length, gap = points.length > 60 ? 0 : Math.min(2, bw * .22);
  const bars = points.map((p, i) => {
    const h = Math.max(1, (p.v / max) * (H - 18));
    return `<rect x="${(i * bw + gap / 2).toFixed(1)}" y="${(H - 14 - h).toFixed(1)}"
      width="${Math.max(.6, bw - gap).toFixed(1)}" height="${h.toFixed(1)}"
      rx="${bw > 5 ? 1.5 : 0}" fill="var(--brick)" opacity="${p.dim ? .35 : .85}"><title>${esc(p.t)}: ${money(p.v)}</title></rect>`;
  }).join('');
  const first = points[0].t, last = points[points.length - 1].t;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img"
    aria-label="${esc(label)}" style="display:block;overflow:visible">
    ${bars}<line x1="0" y1="${H - 13}" x2="${W}" y2="${H - 13}" stroke="var(--line)" stroke-width="1"/>
    <text x="0" y="${H - 2}" font-size="8.5" fill="var(--clay)" font-weight="700">${esc(first)}</text>
    <text x="${W}" y="${H - 2}" font-size="8.5" fill="var(--clay)" font-weight="700"
      text-anchor="end">${esc(last)}</text></svg>`;
}

const RANGES = [['7d','7 days'],['30d','30 days'],['12m','12 months'],['all','All time']];
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const shortMonth = ym => { const [y, m] = ym.split('-'); return MON[+m - 1] + ' ' + y.slice(2); };

function slice() {
  const days = hist.days || [], months = hist.months || [];
  if (range === '7d')  return { pts: days.slice(-7).map(d => ({ t: d.date.slice(8) + '/' + d.date.slice(5,7), v: d.revenue, dim: !d.revenue })), rows: days.slice(-7).reverse(), unit: 'day' };
  if (range === '30d') return { pts: days.slice(-30).map(d => ({ t: d.date.slice(8) + '/' + d.date.slice(5,7), v: d.revenue, dim: !d.revenue })), rows: days.slice(-30).reverse(), unit: 'day' };
  if (range === '12m') return { pts: months.slice(-12).map(m => ({ t: shortMonth(m.month), v: m.revenue })), rows: null, unit: 'month' };
  return { pts: months.map(m => ({ t: shortMonth(m.month), v: m.revenue })), rows: null, unit: 'month' };
}

function paintMoney() {
  const st = hist.stats || {}, s = slice();
  const total = s.pts.reduce((a, p) => a + p.v, 0);
  const trading = s.pts.filter(p => p.v > 0).length;
  const label = (RANGES.find(r => r[0] === range) || [])[1];

  const years = (hist.years || []).slice().reverse();
  const wd = (hist.weekdays || []).slice().sort((a, b) => b.average - a.average);

  let cats = '';
  if (brk && (brk.groups || []).length) {
    const groups = brk.groups.slice().sort((a, b) => b.revenue - a.revenue);
    const top = groups[0] ? groups[0].revenue : 1;
    cats = `<div class="card"><h2>Where the money comes from</h2>
      <div style="font-size:11px;color:var(--clay);margin:-4px 0 10px">All time, from Square's own categories</div>
      ${groups.map(g => `<div style="padding:9px 0;border-bottom:1px solid var(--line)">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline">
          <span style="font-size:13px;font-weight:700">${esc(g.group || g.category)}</span>
          <span style="font-family:var(--serif);font-weight:900;font-size:14px">${money(g.revenue)}</span></div>
        <div style="height:6px;background:var(--line);border-radius:3px;margin-top:6px;overflow:hidden">
          <div style="height:100%;width:${Math.max(2,(g.revenue/top)*100).toFixed(1)}%;
            background:${/Unclassified/i.test(g.group||'') ? 'var(--warn)' : 'var(--brick)'};border-radius:3px"></div></div>
        ${g.items ? `<div style="font-size:10.5px;color:var(--clay);margin-top:4px">${g.items.toLocaleString('en-GB')} items sold</div>` : ''}
      </div>`).join('')}
      ${groups.some(g => /Unclassified/i.test(g.group || '')) ? `<div class="note" style="margin-top:12px">
        <strong>Unclassified in Square</strong> is Square's own catch-all — items that were rung up
        without a category on them. It can't be broken down from here, because the breakdown only
        goes as deep as the category each sale carried. Putting those items into categories in
        Square is what splits this open, and it would do it retrospectively.</div>` : ''}
    </div>`;
  }

  $('money').innerHTML = `
    <div class="chips" id="rng">${RANGES.map(([k, t]) =>
      `<button class="chip ${k === range ? 'on' : ''}" data-r="${k}">${t}</button>`).join('')}</div>

    <div class="card">
      <div class="k">${esc(label)}</div>
      <div class="fig" style="margin:5px 0 2px">${money(total)}</div>
      <div style="font-size:11.5px;color:var(--clay);font-weight:600">
        ${trading} ${s.unit === 'day' ? (trading === 1 ? 'trading day' : 'trading days') : 'months'}
        ${trading ? ' · ' + money(total / trading) + ' average' : ''}</div>
      <div style="margin-top:14px">${chart(s.pts, label + ' takings')}</div>
    </div>

    ${s.rows ? `<div class="card"><h2>Day by day</h2>
      ${s.rows.map(d => `<div class="row"><div>
        <div class="l">${new Date(d.date).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})}</div>
        <div class="m">${d.txns} ${d.txns === 1 ? 'transaction' : 'transactions'}</div></div>
        <div class="v" style="${d.revenue ? '' : 'color:var(--mute)'}">${money(d.revenue)}</div></div>`).join('')}
    </div>` : ''}

    ${years.length ? `<div class="card"><h2>Year by year</h2>
      ${years.map(y => `<div class="row"><div class="l">${esc(y.year)}</div>
        <div class="v">${money(y.revenue)}</div></div>`).join('')}
    </div>` : ''}

    ${wd.length ? `<div class="card"><h2>Your best days</h2>
      <div style="font-size:11px;color:var(--clay);margin:-4px 0 8px">Average takings per weekday, all time</div>
      ${wd.map(w => `<div class="row"><div><div class="l">${esc(w.day)}</div>
        <div class="m">${w.count} recorded</div></div>
        <div class="v">${money(w.average)}</div></div>`).join('')}
    </div>` : ''}

    ${cats}

    <div class="card"><h2>All time</h2>
      <div class="row"><div class="l">Total taken</div><div class="v">${money(st.total || 0)}</div></div>
      <div class="row"><div class="l">Days recorded</div><div class="v">${(st.daysRecorded||0).toLocaleString('en-GB')}</div></div>
      <div class="row"><div class="l">Average trading day</div><div class="v">${money(st.averageTradingDay || 0)}</div></div>
      ${st.bestDay ? `<div class="row"><div><div class="l">Best day ever</div>
        <div class="m">${new Date(st.bestDay.date).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</div></div>
        <div class="v">${money(st.bestDay.revenue)}</div></div>` : ''}
      ${st.bestMonth ? `<div class="row"><div class="l">Best month</div>
        <div class="v">${esc(shortMonth(st.bestMonth.month))} · ${money(st.bestMonth.revenue)}</div></div>` : ''}
      ${st.earliest ? `<div class="row"><div class="l">Records start</div>
        <div class="v">${new Date(st.earliest).toLocaleDateString('en-GB',{month:'long',year:'numeric'})}</div></div>` : ''}
    </div>`;

  $('rng').querySelectorAll('[data-r]').forEach(b =>
    b.onclick = () => { range = b.dataset.r; paintMoney(); $('main').scrollTop = 0; });
}

/* ── boot ────────────────────────────────────────────────────────── */
$('back').onclick = back;
// The masthead is the way home from anywhere — no permanent bar taking up
// the bottom of a phone, and nothing that looks like the old app's dock.
$('hometap').onclick = () => { if (me && view !== 'login') { stack = []; go('home', false); } };
$('prev').onclick = () => shift(-1);
$('next').onclick = () => shift(1);
$('tkclear').onclick = () => { ticket = []; syncTicket(); };
loadLogin();
