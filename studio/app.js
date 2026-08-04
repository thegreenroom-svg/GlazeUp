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
const DOCK = [
  ['home',  '⌂', 'Home'],
  ['floor', '▦', 'Floor'],
  ['day',   '◷', 'Bookings'],
  ['till',  '£', 'Till'],
  ['pack',  '◲', 'Packing'],
];

function go(v, push = true) {
  if (push && v !== view) stack.push(view);
  view = v;
  document.querySelectorAll('.pane').forEach(p => p.classList.remove('on'));
  $('p-' + v).classList.add('on');
  const [t, s] = PANES[v] || ['', ''];
  $('ttl').textContent = t; $('sub').textContent = s;
  $('back').classList.toggle('on', v !== 'login' && v !== 'home');
  $('dock').style.display = (v === 'login') ? 'none' : 'flex';
  document.querySelectorAll('#dock button').forEach(b =>
    b.classList.toggle('on', b.dataset.v === v));
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

/* ── till (practice ticket, never sent) ──────────────────────────── */
async function loadTill() {
  if (priceGroups.length) return paintTill();
  try {
    const d = await read('/api/pos/items');
    priceGroups = d.groups || [];
    if (!priceGroups.length) {
      $('items').innerHTML = `<div class="empty" style="grid-column:1/-1">No prices stored yet.<br>
        They're pulled from Square on the admin side.</div>`;
      return;
    }
    cat = priceGroups[0].category;
    paintTill();
  } catch (e) {
    $('items').innerHTML = `<div class="err" style="grid-column:1/-1">Couldn't read prices. ${esc(e.message)}</div>`;
  }
}
function paintTill() {
  $('cats').innerHTML = priceGroups.map(g =>
    `<button class="chip ${g.category === cat ? 'on' : ''}" data-c="${esc(g.category)}">${esc(g.category)}</button>`).join('');
  $('cats').querySelectorAll('[data-c]').forEach(b => b.onclick = () => { cat = b.dataset.c; paintTill(); });
  const g = priceGroups.find(x => x.category === cat) || priceGroups[0];
  $('items').innerHTML = (g.items || []).map((it, i) =>
    `<button class="item" data-i="${i}"><span class="n">${esc(it.name)}</span>
     <span class="p">${money(it.price)}</span></button>`).join('');
  $('items').querySelectorAll('[data-i]').forEach(b => b.onclick = () => {
    const it = g.items[+b.dataset.i]; ticket.push({ n: it.name, p: it.price }); syncTicket();
  });
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

/* ── packing ─────────────────────────────────────────────────────── */
async function loadPack() {
  try {
    const d = await read('/api/packing/queue');
    const p = d.pieces || [];
    if (!p.length) { $('pack').innerHTML = '<div class="empty">Nothing waiting. All caught up.</div>'; return; }
    const by = {};
    p.forEach(x => { const k = x.booking_id || 'Studio shelf'; (by[k] = by[k] || []).push(x); });
    $('pack').innerHTML = Object.entries(by).map(([who, list]) => `
      <div class="card"><h2>${esc(who)}</h2>
        ${list.map(x => `<div class="row"><div>
          <div class="l">${esc(x.piece_type || x.label || 'Piece')}</div>
          ${x.notes ? `<div class="m">${esc(x.notes)}</div>` : ''}</div>
          <div class="v" style="font-size:11px;color:var(--clay)">${esc(x.status || '')}</div></div>`).join('')}
      </div>`).join('');
  } catch (e) {
    $('pack').innerHTML = `<div class="err">Couldn't read the packing queue. ${esc(e.message)}</div>`;
  }
}

/* ── money (admin only) ──────────────────────────────────────────── */
async function loadMoney() {
  if (!me || !me.admin) { $('money').innerHTML = '<div class="empty">Takings are for the directors.</div>'; return; }
  try {
    const [t, b] = await Promise.all([
      read('/api/takings/today'),
      read('/api/takings/breakdown').catch(() => ({})),
    ]);
    const cats = (b.categories || b.breakdown || []).slice(0, 12);
    $('money').innerHTML = `
      <div class="card"><div class="k">${esc(t.label || 'Today')}</div>
        <div class="fig" style="margin-top:5px">${t.value == null ? '—' : money(t.value)}</div>
        <div class="m" style="color:var(--clay);font-size:11.5px;margin-top:4px">
          ${t.synced ? 'Live from Square' : 'Last recorded figure'}</div></div>
      ${cats.length ? `<div class="card"><h2>Where it came from</h2>
        ${cats.map(c => `<div class="row"><div class="l">${esc(c.category || c.name)}</div>
          <div class="v">${money((c.revenue_cents != null ? c.revenue_cents / 100 : c.total) || 0)}</div></div>`).join('')}
      </div>` : ''}`;
  } catch (e) {
    $('money').innerHTML = `<div class="err">Couldn't read takings. ${esc(e.message)}</div>`;
  }
}

/* ── boot ────────────────────────────────────────────────────────── */
$('dock').innerHTML = DOCK.map(([v, ic, l]) =>
  `<button data-v="${v}"><span class="ic">${ic}</span>${l}</button>`).join('');
$('dock').querySelectorAll('[data-v]').forEach(b => b.onclick = () => go(b.dataset.v));
$('back').onclick = back;
$('prev').onclick = () => shift(-1);
$('next').onclick = () => shift(1);
$('tkclear').onclick = () => { ticket = []; syncTicket(); };
$('dock').style.display = 'none';
loadLogin();
