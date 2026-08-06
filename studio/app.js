/* ══════════════════════════════════════════════════════════════════
   THE KILN CAFE — studio app. 4 Aug 2026, built from scratch.

   READ-ONLY AGAINST THE BUSINESS. Daisy's instruction: show the live
   data, let people move around it, but never send anything back to
   Square, the bookings or the till. The fetch wrapper below (read())
   physically refuses any request that is not a GET, and refuses any
   URL not on the allow-list — a write to any of THAT data cannot be
   made from this app even by mistake.

   One deliberate exception, added 4 Aug: David asked for a real login
   with real per-person codes, directors able to reset one another's.
   That needs to actually write — but only to staff_pins, never to a
   booking, the till or Square. Kept in a completely separate function
   (writePin, below read()) rather than folded into read()'s allow-list,
   so the boundary between "the read-only data layer" and "the one
   place this app is allowed to touch something real" stays visible in
   the code's shape, not just a comment.

   Nothing else persists. No storage, no cookies. Log in again and you
   get the live data fresh, with every practice tap cleared.
   ══════════════════════════════════════════════════════════════════ */
'use strict';

const STUDIO = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3';
const API = location.origin;

/* ── the guard ───────────────────────────────────────────────────── */
const ALLOWED = [
  '/api/staff/team-for-login', '/api/bookings/day', '/api/bookings/search', '/api/floor/active',
  '/api/floor/tables', '/api/pos/items', '/api/packing/queue', '/api/takings/today',
  '/api/takings/breakdown', '/api/takings/history', '/api/analytics/dashboard',
  '/api/ai-usage', '/api/pieces/for-booking', '/api/gift-cards/lookup',
];
async function read(path, params = {}) {
  const url = new URL(path, API);
  const ok = ALLOWED.includes(url.pathname) || url.pathname.startsWith('/api/floor/items/');
  if (!ok)
    throw new Error('Blocked: ' + url.pathname + ' is not a read this app is allowed to make.');
  url.searchParams.set('studioId', STUDIO);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
  const r = await fetch(url, { method: 'GET', cache: 'no-store' });
  if (!r.ok) {
    // [4 Aug] Every other write/read helper in this file (search,
    // writePin) already prefers the server's own {error:"..."} body
    // over a bare status code — read() was the one place that didn't,
    // caught when the gift-card lookup's genuinely useful "No gift
    // card found with that number" was being thrown away in favour of
    // "The server answered 404." Every existing caller of read() gets
    // the better message too now, not just vouchers.
    const d = await r.json().catch(() => ({}));
    throw new Error(d.error || ('The server answered ' + r.status + '.'));
  }
  return r.json();
}

/* THE ONE EXCEPTION, and it is deliberate.
   /api/packing/find-listed is a POST only because it carries a photo.
   Its handler was read line by line on 4 Aug: it touches no table —
   no insert, no update, no upsert, no delete. It sends the picture and
   the wanted list to the vision model and returns where things are.
   Nothing in the studio changes. It does cost roughly a third of a
   penny per photo, so the price of every search is shown on screen.
   Nothing else may use this path. */
const SEARCH_PATH = '/api/packing/find-listed';
async function search(body) {
  const r = await fetch(API + SEARCH_PATH, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, studioId: STUDIO }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || ('the server answered ' + r.status));
  return d;
}

/* A SECOND sanctioned exception, same reasoning as the first.
   /api/pieces/describe-group is a POST only because it carries a
   photo — already live, already used by the studio's own shelf-scan
   work, read line by line here again on 4 Aug: it calls the vision
   model, logs its own cost to ai_usage (bookkeeping, not a booking or
   a piece), and returns descriptions. Nothing in the studio changes.
   [4 Aug] David, looking at two blank "e.g. blue mug, white spots"
   fields: "Ai should describe." Right — the model already writes
   better painting-first descriptions than asking someone to type from
   a placeholder example, and this exact endpoint already exists for
   precisely that job. Reused as-is, not rebuilt. */
const DESCRIBE_PATH = '/api/pieces/describe-group';
async function describeCrop(photoBase64) {
  const r = await fetch(API + DESCRIBE_PATH, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photoBase64, studioId: STUDIO }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || ('the server answered ' + r.status));
  return d;
}

/* THE ONE PLACE THIS APP WRITES ANYTHING REAL, and it is deliberate.
   David: "an actual login for everyone, their own code, admin can
   reset it." That's staff identity, not business data — never a
   booking, never the till, never Square. Three endpoints only, none
   of them reachable through read()'s guard:
     verify-pin  — checks a PIN, changes nothing (kept separate from
                   shift-login on the server specifically so /studio
                   never has to clock anyone in for real just to
                   confirm who they are)
     set-pin     — a staff member choosing their own PIN, first time
     reset-pin   — director-only, needs the director's OWN PIN, clears
                   someone else's so they can set a new one
   Every other write this app could make — seating someone, ringing
   something up, saving a piece — is still refused, unchanged. */
const PIN_WRITES = ['/api/staff/verify-pin', '/api/staff/set-pin', '/api/staff/reset-pin'];
async function writePin(path, body) {
  if (!PIN_WRITES.includes(path))
    throw new Error('Blocked: ' + path + ' is not a write this app is allowed to make.');
  const r = await fetch(API + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, studioId: STUDIO }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || ('the server answered ' + r.status));
  return d;
}

/* ── state (memory only, cleared on every load) ──────────────────── */
let me = null, view = 'login', stack = [], day = new Date(),
    bookings = [], floor = [], priceGroups = [], cat = null, ticket = [], tickWhere = 'New order',
    tillTable = null;

/* [4 Aug] David: rang items into a table's till, went to another
   booking, came back — the till had forgotten everything, even though
   nothing was ever sent. Real people keep buying through a visit.
   ticket alone is one shared scratchpad; localTickets keeps one PER
   booking (or per table, if there's no booking behind it), so leaving
   and returning shows exactly what was there. Still entirely local —
   nothing here has ever been read from or written to Square. */
let localTickets = {}, ticketKey = null, ticketKeyIsBooking = false;
/* [4 Aug] David: "everything needs to link together... photograph the
   table, then find these things on the shelf... the app needs to work,
   start to finish, circle." Same local-only pattern as localTickets:
   pieces created by tapping the table photo are kept here, keyed by
   booking code, so Her Pieces and Find Them On The Shelf can use them
   in the SAME practice session — completing the loop without writing
   anything to the real pottery_pieces table. */
let localPieces = {};
function loadTicketFor(key, isBooking) {
  ticketKey = key; ticketKeyIsBooking = !!isBooking;
  ticket = (key && localTickets[key]) ? localTickets[key] : [];
}

const $ = id => document.getElementById(id);
const money = n => '£' + (n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hhmm = d => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const isoDay = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const DAYNAME = d => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

/* [4 Aug] Was hardcoded from a one-off read of studio_tables. Daisy asked
   whether the layout had since changed — it hadn't, names and capacities
   still matched exactly — but hardcoding it meant the app would never
   have noticed if it had. /api/floor/tables is a GET, so there is no
   reason not to read the real thing: loaded once at boot, this constant
   becomes the fallback if that read ever fails, not the source of truth. */
let TABLES = [
  ['Table 1','Main Studio',6],['Table 2','Main Studio',4],['Table 3','Main Studio',4],
  ['Table 4','Main Studio',6],['Table 5','Main Studio',6],['Table 6','Main Studio',4],
  ['Table 7','Main Studio',4],['Table 8','Main Studio',8],
  ['Lounge 1','Lounge',4],['Lounge 2','Lounge',4],['Lounge 3','Lounge',4],
  ['Lounge 4','Lounge',4],['Lounge 5','Lounge',4],['Lounge 6','Lounge',4],
  ['The Vault','The Vault',14],
];
let TABLE_POS = {};    // name -> {row, col}, filled once the real layout loads
let tablesLoaded = false;

async function loadTables() {
  try {
    const d = await read('/api/floor/tables');
    const t = d.tables || [];
    if (!t.length) throw new Error('empty');
    TABLES = t.map(x => [x.name, x.room, x.capacity])
      .sort((a, b) => (t.find(x => x.name === a[0]).sort_order || 0) -
                       (t.find(x => x.name === b[0]).sort_order || 0));
    TABLE_POS = {};
    t.forEach(x => { TABLE_POS[x.name] = { row: x.grid_row || 0, col: x.grid_col || 0 }; });
  } catch (e) {
    // stays on the fallback above — never leaves the floor blank
  }
  tablesLoaded = true;
}
const short = n => n.replace('Table ', 'T').replace('Lounge ', 'L').replace('The Vault', 'Vault');

/* [4 Aug] David: "choose a table for the booking and go through
   workflows" + "add table no at till" — then, rightly, "surely we can
   use the existing bookings and complete then clear the day?" So this
   is deliberately small: real bookings, a table chosen LOCALLY to walk
   the workflow through, one tap clears it back to nothing. No fake
   data invented, nothing written — picking a table here can no more
   seat someone than the practice ticket can ring one up.
   Shared by the booking's Seated step and the Till header. */
function tablePickerHTML(selected) {
  const rooms = [...new Set(TABLES.map(t => t[1]))];
  return `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">
    ${rooms.map(room => TABLES.filter(t => t[1] === room).map(([name]) =>
      `<button class="chip pickt ${name === selected ? 'on' : ''}" data-tbl="${esc(name)}"
        style="min-height:34px;padding:6px 12px;font-size:11.5px">${esc(short(name))}</button>`
    ).join('')).join('')}
  </div>`;
}
function wireTablePicker(root, onPick) {
  root.querySelectorAll('.pickt').forEach(b => b.onclick = () => onPick(b.dataset.tbl));
}

/* One tap to clear every local, unsaved choice — the practice ticket,
   any table picked at Till, table-photo marks not yet saved. Nothing
   here was ever real, so "clearing" is just resetting JS state; logging
   out already did this implicitly, this makes it an explicit,
   immediate action instead. */
function clearPracticeState() {
  ticket = []; tillTable = null; tickWhere = 'New order';
  localTickets = {}; ticketKey = null; ticketKeyIsBooking = false; localPieces = {};   // null BEFORE syncTicket, or it would re-save just this one
  marks = []; tableShot = null;
  syncTicket();
  if (view === 'bk' && bkNow) paintBooking();
  if (view === 'till') paintTill();
}

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
  till:  ['Till', 'Real prices — nothing is sent'],
  pack:  ['Packing', 'Pieces waiting to go home'],
  money: ['Money', 'Live from Square'],
  pins:  ['Staff PINs', 'Director-only'],
  vouchers: ['Gift Vouchers', 'Live from Square'],
};

function go(v, push = true) {
  if (push && v !== view) stack.push(view);
  view = v;
  document.querySelectorAll('.pane').forEach(p => p.classList.remove('on'));
  $('p-' + v).classList.add('on');
  const [t, s] = PANES[v] || ['', ''];
  $('ttl').textContent = t; $('sub').textContent = s;
  $('back').classList.toggle('on', v !== 'login' && v !== 'home');
  $('hometap2').classList.toggle('on', v !== 'login' && v !== 'home');
  $('main').scrollTop = 0;
  syncTicket();
  if (v === 'floor') loadFloor();
  if (v === 'day') loadDay();
  if (v === 'till') loadTill();
  if (v === 'pack') loadPack();
  if (v === 'money') loadMoney();
  if (v === 'pins') loadPins();
  if (v === 'vouchers') loadVouchers();
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
  $('pinpanel').innerHTML = '';
  try {
    const d = await read('/api/staff/team-for-login');
    const team = (d.team || d.members || d || []).filter(p => p && p.name);
    if (!team.length) throw new Error('No team came back.');
    $('people').innerHTML = team.map(p => `
      <button class="person" data-id="${esc(p.id)}" data-name="${esc(p.name)}" data-role="${esc(p.role || '')}"
        data-pin="${p.hasPinSet ? '1' : '0'}">
        <span class="n">${esc(p.name)}</span>
        <span class="r">${esc(p.role || '')}</span>
        ${p.onShift || p.on_shift ? '<span class="on-shift">ON SHIFT</span>' : ''}
      </button>`).join('');
    $('people').querySelectorAll('.person').forEach(b => {
      const p = { id: b.dataset.id, name: b.dataset.name, role: b.dataset.role };
      b.onclick = () => (b.dataset.pin === '1') ? paintPin(p) : paintSetPin(p);
    });
  } catch (e) {
    $('people').innerHTML = `<div class="err" style="grid-column:1/-1">Couldn't reach the studio.
      ${esc(e.message)}<br><br>You can still look around, but nothing will be live.</div>
      <button class="person" id="fallback" style="grid-column:1/-1"><span class="n">Carry on anyway</span>
      <span class="r">No connection — nothing live</span></button>`;
    $('fallback').onclick = () => signIn('there', '');
  }
}

/* [4 Aug] David: "an actual login for everyone, with their own code."
   Tap a name -> if they've set a PIN before, prove it's them; if not,
   let them choose one now. Either way ends the same place signIn()
   always has. writePin's guard is the only thing that can reach these
   three endpoints — nothing else in the app can. */
function pinShell(p, heading, sub, buttonLabel) {
  $('people').innerHTML = '';
  $('pinpanel').innerHTML = `
    <div style="text-align:center;padding:20px 18px 8px">
      <div style="font-family:var(--serif);font-weight:900;font-size:22px">${esc(p.name)}</div>
      <div style="font-size:12.5px;color:var(--clay);margin:4px 0 2px">${heading}</div>
      ${sub ? `<div style="font-size:11px;color:var(--clay);margin-bottom:14px">${sub}</div>` : '<div style="margin-bottom:14px"></div>'}
      <input type="password" inputmode="numeric" pattern="[0-9]*" id="pinentry" maxlength="6"
        style="width:170px;text-align:center;font-size:24px;letter-spacing:.35em;padding:12px 8px;
        border:1.5px solid var(--line);border-radius:12px;font-family:var(--ui);background:var(--card)">
      <div id="pinerr" style="color:var(--brick);font-size:12px;margin-top:10px;min-height:16px"></div>
      <button class="btn" id="pingo" style="margin-top:10px;max-width:230px;margin-left:auto;margin-right:auto">${buttonLabel}</button>
      <button class="btn ghost" id="pinback" style="margin-top:8px;max-width:230px;margin-left:auto;margin-right:auto">Not you? Go back</button>
    </div>`;
  $('pinback').onclick = () => loadLogin();
  const entry = $('pinentry'); entry.focus();
  entry.onkeydown = e => { if (e.key === 'Enter') $('pingo').click(); };
  return entry;
}
function paintPin(p) {
  pinShell(p, 'Enter your PIN', '', 'Continue');
  $('pingo').onclick = async () => {
    const pin = $('pinentry').value.trim();
    if (!pin) return;
    $('pinerr').textContent = '';
    try {
      const d = await writePin('/api/staff/verify-pin', { staffMemberId: p.id, pin });
      if (d.ok) signIn(p.name, p.role, p.id);
      else { $('pinerr').textContent = 'Wrong PIN — try again.'; $('pinentry').value = ''; $('pinentry').focus(); }
    } catch (e) { $('pinerr').textContent = e.message; }
  };
}
function paintSetPin(p) {
  pinShell(p, 'No PIN set yet — choose one now', '4 to 6 digits, whatever you\'ll remember', 'Set PIN');
  $('pingo').onclick = async () => {
    const pin = $('pinentry').value.trim();
    if (!/^\d{4,6}$/.test(pin)) { $('pinerr').textContent = '4 to 6 digits.'; return; }
    try {
      const d = await writePin('/api/staff/set-pin', { staffMemberId: p.id, pin });
      if (d.ok) signIn(p.name, p.role, p.id);
      else $('pinerr').textContent = d.error || 'Could not set a PIN.';
    } catch (e) { $('pinerr').textContent = e.message; }
  };
}
const ADMIN = ['general manager', 'co-director', 'studio executive', 'director'];
function signIn(name, role, id) {
  me = { name, role, id, admin: ADMIN.some(r => (role || '').toLowerCase().includes(r)) };
  ticket = []; stack = [];                       // every login starts clean
  priceGroups = []; tillMode = null; parentCatSel = null; cat = null; tillTable = null; day = new Date();
  localTickets = {}; ticketKey = null; ticketKeyIsBooking = false; localPieces = {};
  $('who').textContent = name;
  go('home', false);
  if (!tablesLoaded) loadTables();               // real layout, once; falls back silently
}

/* ── home ────────────────────────────────────────────────────────── */
/* ── the front door ──────────────────────────────────────────────────
   [4 Aug] David: a walk-in gives their name, not a time slot. "Click
   table 3, Leanne" — one hop, not Home -> Bookings -> find her in a
   day grid -> tap. This box is that hop: type a name or a table
   number, tap the result, land straight on her session — the same
   workflow page Bookings already opens, nothing new to build there.
   Read-only still holds: /api/bookings/search is a GET, and picking a
   result never seats anyone — it opens what's already true. Seating
   itself is a write and happens on the real terminal, same as ringing
   up the till; this shows it back once it's done. */
let findTimer = null;
function wireFind() {
  const box = $('findbox'); if (!box) return;
  box.addEventListener('input', () => {
    clearTimeout(findTimer);
    const q = box.value.trim();
    if (q.length < 2) { $('findresults').innerHTML = ''; return; }
    findTimer = setTimeout(() => runFind(q), 220);
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#findbox') && !e.target.closest('#findresults')) $('findresults').innerHTML = '';
  });
}
async function runFind(q) {
  let bookings;
  try { bookings = (await read('/api/bookings/search', { q })).bookings || []; }
  catch (e) { $('findresults').innerHTML = `<div class="findempty">
    Couldn't search. ${esc(e.message)}</div>`; return; }
  if (!$('findbox') || $('findbox').value.trim() !== q) return;   // typed on since
  if (!bookings.length) {
    $('findresults').innerHTML = `<div class="findempty">
      No one matching "${esc(q)}" in the last 90 days.</div>`;
    return;
  }
  $('findresults').innerHTML = bookings.map((b, i) => {
    const st = b.session_start ? new Date(b.session_start) : null;
    const when = st ? (isoDay(st) === isoDay(new Date()) ? 'Today ' + hhmm(st)
      : st.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' + hhmm(st)) : '';
    return `<button class="findrow" data-f="${i}"><span class="n">${esc(b.customer_name || 'Booking')}</span>
      <span class="m">${b.table_number != null ? 'Table ' + esc(b.table_number) + ' · ' : ''}${esc(when)}</span></button>`;
  }).join('');
  $('findresults').querySelectorAll('[data-f]').forEach(el =>
    el.onclick = () => {
      const b = bookings[+el.dataset.f];
      $('findbox').value = ''; $('findresults').innerHTML = '';
      openBooking(b);
    });
}

async function loadHome() {
  $('sub').textContent = DAYNAME(new Date());
  const t = [
    ['floor', '▦', 'Floor', 'Who is in, table by table', 'floorN'],
    ['day',   '◷', 'Bookings', 'The day, table by table', 'dayN'],
    ['till',  '£', 'Till', 'Real prices, ready to use', null],
    ['pack',  '◲', 'Packing', 'Pieces waiting to go home', 'packN'],
    ['vouchers', '◈', 'Gift Vouchers', 'Check a balance, live from Square', null],
  ];
  if (me && me.admin) t.push(['money', '£', 'Money', 'Takings, live from Square', 'moneyN']);
  if (me && me.admin) t.push(['pins', '••', 'Staff PINs', 'Set or reset someone\'s code', null]);
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
  $('flbl').textContent = DAYNAME(day);
  const isToday = isoDay(day) === isoDay(new Date());
  try {
    const d = await read('/api/bookings/day', { date: isoDay(day) });
    bookings = d.bookings || [];
  } catch (e) {
    $('floor').innerHTML = `<div class="err">Couldn't read that day's bookings. ${esc(e.message)}</div>`;
    return;
  }
  const now = Date.now();
  const byTable = {};
  bookings.forEach(b => {
    const s = b.session_start ? new Date(b.session_start).getTime() : 0;
    const e = b.session_end ? new Date(b.session_end).getTime() : s + 2 * 36e5;
    // 'Live now' only means anything when looking at today. Any other
    // day — forward or back — just shows what's booked in, with no
    // claim about whether it's happening this second.
    const state = isToday
      ? ((s && s <= now && e >= now) ? 'live' : (s > now ? 'soon' : 'past'))
      : (s ? 'soon' : 'past');
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
  if (!bookings.length) {
    h += `<div class="note" style="margin-bottom:16px">
      Nothing booked in — ${DAYNAME(day)}. The tables below are real,
      just empty. Use the arrows above to look at another day.</div>`;
  }
  ['Main Studio', 'Lounge', 'The Vault'].forEach(room => {
    const inRoom = TABLES.filter(t => t[1] === room);
    const positioned = inRoom.every(([name]) => TABLE_POS[name]);
    h += `<div class="roomname">${room}</div>`;
    if (positioned && inRoom.length > 1) {
      // The real shape of the room, not reading order. studio_tables
      // carries this (grid_row/grid_col) — e.g. the Lounge is genuinely
      // two columns of three, not a left-to-right run of six.
      const rows = Math.max(...inRoom.map(([n]) => TABLE_POS[n].row)) + 1;
      const cols = Math.max(...inRoom.map(([n]) => TABLE_POS[n].col)) + 1;
      h += `<div class="gridpos" style="grid-template-columns:repeat(${cols},1fr);
        grid-template-rows:repeat(${rows},1fr)">`;
      inRoom.forEach(([name, , seats]) => {
        const p = TABLE_POS[name];
        h += tableTile(name, seats, byTable[name],
          `grid-row:${p.row + 1};grid-column:${p.col + 1}`);
      });
      h += '</div>';
    } else {
      h += '<div class="grid3">';
      inRoom.forEach(([name, , seats]) => h += tableTile(name, seats, byTable[name], ''));
      h += '</div>';
    }
  });
  $('floor').innerHTML = h;
  $('floor').querySelectorAll('[data-t]').forEach(el => el.onclick = () => {
    const hit = byTable[el.dataset.t];
    if (hit) openBooking(hit.b); else { tillTable = el.dataset.t; tickWhere = el.dataset.t; loadTicketFor(el.dataset.t); go('till'); }
  });
}

function tableTile(name, seats, hit, posStyle) {
  const cls = hit ? hit.state : '';
  const note = hit ? (hit.state === 'live' ? esc(hit.b.customer_name || 'In now')
                    : 'at ' + hhmm(hit.b.session_start)) : seats + ' seats';
  return `<button class="tbl ${cls}" data-t="${esc(name)}" style="${posStyle}">
    <span class="n">${short(name)}</span><span class="s">${note}</span></button>`;
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
function shift(n) {
  day = new Date(day.getTime() + n * 864e5);
  if (view === 'floor') loadFloor(); else loadDay();
}

/* ── booking: the whole session on one screen ────────────────────────
   [stated] Daisy: "where does it go from here? Where's the workflow?
   Where's the total for the till? Where's the photograph of the pieces
   on the table when finished?" So the booking is no longer a card that
   ends — it is the spine of the session, in the order it happens:
      who and when  ->  what's on the table (the till total)
      ->  her pieces  ->  find them on the shelf  ->  packed.
   Every step reads. None of them writes. */
let bkNow = null;
// [4 Aug] David: "it kind of all needs to be done from the one page
// instead of to go back... the booking's live all the time." Separate
// from Till's own parentCatSel/cat so browsing one never disturbs the
// other if both happen to have been opened this session.
let bkAddOpen = false, bkAddCat = null, bkAddLeaf = null;

async function openBooking(b) {
  bkNow = b; foundMap = {}; bkAddOpen = false;
  paintBooking();
  go('bk');
  // the two session reads, after the screen is already up
  const code = b.booking_code;
  if (!code) return;
  const [items, pieces] = await Promise.all([
    read('/api/floor/items/' + encodeURIComponent(code)).catch(() => null),
    read('/api/pieces/for-booking', { bookingCode: code }).catch(() => null),
  ]);
  bkNow._items = items && items.items ? items.items : [];
  bkNow._pieces = pieces && pieces.pieces ? pieces.pieces : [];
  if (view === 'bk') paintBooking();
}

function stepRow(n, title, body, done) {
  return `<div class="card" style="border-left:4px solid ${done ? 'var(--soon)' : 'var(--line)'}">
    <div style="display:flex;gap:10px;align-items:baseline">
      <span style="font-family:var(--serif);font-weight:900;font-size:13px;
        color:${done ? 'var(--soon)' : 'var(--mute)'};min-width:16px">${done ? '●' : n}</span>
      <div style="flex:1;min-width:0"><h2 style="margin-bottom:6px">${title}</h2>${body}</div></div></div>`;
}

function paintBooking() {
  const b = bkNow;
  const st = b.session_start ? new Date(b.session_start) : null;
  const en = b.session_end ? new Date(b.session_end) : null;
  const mins = st && en ? Math.round((en - st) / 6e4) : null;
  const items = b._items, pieces = b._pieces;
  const now = Date.now();
  const seated = b.table_number != null;
  const running = st && st.getTime() <= now && (!en || en.getTime() >= now);
  const finished = en && en.getTime() < now;

  const total = items ? items.reduce((s, i) =>
    s + ((i.price_cents != null ? i.price_cents / 100 : (i.price || 0)) * (i.qty || i.quantity || 1)), 0) : 0;

  const withPhoto = pieces ? pieces.filter(p => p.reference_photo_url).length : 0;
  const hasPieces = !!(pieces && pieces.length);
  // Completes the loop: no real pieces yet doesn't have to mean nothing
  // to work with. If this booking has been photographed THIS session,
  // use those — Her Pieces and Find Them On The Shelf both read from
  // whichever list is real.
  const localPcs = (b.booking_code && localPieces[b.booking_code]) || [];
  const isLocalPieces = !hasPieces && localPcs.length > 0;
  const effPieces = hasPieces ? pieces : localPcs;
  const effHasPieces = hasPieces || isLocalPieces;
  const effWithPhoto = hasPieces ? withPhoto : localPcs.filter(p => p.reference_photo_url).length;

  $('bk').innerHTML = `
    <div class="card">
      <div style="font-family:var(--serif);font-weight:900;font-size:24px">${esc(b.customer_name || 'Booking')}</div>
      ${st ? `<div style="font-family:var(--serif);font-weight:900;font-size:19px;margin-top:8px">
        ${hhmm(st)}${en ? ' – ' + hhmm(en) : ''}
        ${mins ? `<span style="font-family:var(--ui);font-size:12.5px;font-weight:600;color:var(--clay)">
        (${Math.floor(mins/60)} hr${Math.floor(mins/60)===1?'':'s'} ${mins%60} mins)</span>` : ''}</div>
        <div style="font-size:13px;font-weight:600">${DAYNAME(st)}</div>` : ''}
      <div style="font-size:12px;color:var(--clay);margin-top:6px">${esc(b.space_name || '')}</div>
      <div style="font-size:12px;font-weight:700;margin-top:9px;padding-top:9px;
        border-top:1px solid var(--line);color:${seated ? 'var(--soon)' : 'var(--clay)'}">
        ${seated
          ? `Seated · Table ${esc(b.table_number)}${b.party_size ? ' · ' + b.party_size + ' painting' : ''}`
          : `Not seated yet — lands here once someone's at the terminal`}</div>
    </div>

    ${(() => {
      // Local additions persist per booking now (loadTicketFor), so this
      // shows even when Square has nothing real yet — clearly its own
      // subtotal, never folded into `total`, which stays strictly the
      // real Square figure.
      const localItems = (b.booking_code && localTickets[b.booking_code]) || [];
      const localTotal = localItems.reduce((s, i) => s + i.p, 0);
      const localBlock = localItems.length ? `
        <div style="margin-top:12px;padding-top:12px;border-top:1.5px dashed var(--line)">
          <div class="k" style="margin-bottom:6px">Added this session — not sent</div>
          ${localItems.map(i => `<div class="row" style="padding:6px 0">
            <div class="l" style="font-size:12.5px">${esc(i.n)}</div>
            <div class="v" style="font-size:13px">${money(i.p)}</div></div>`).join('')}
          <div class="row" style="border-top:1px solid var(--line);border-bottom:none;padding-top:6px">
            <div class="l" style="font-weight:700;font-size:12.5px">Local subtotal</div>
            <div class="v" style="font-weight:800">${money(localTotal)}</div></div>
        </div>` : '';
      return stepRow(1, 'On the table', items === undefined
        ? '<div style="font-size:12.5px;color:var(--clay)">Reading the till…</div>'
        : (items && items.length
          ? `${items.map(i => `<div class="row"><div class="l">${esc(i.item_name || i.name || 'Item')}
             ${(i.qty || i.quantity) > 1 ? ' ×' + (i.qty || i.quantity) : ''}</div>
             <div class="v">${money((i.price_cents != null ? i.price_cents/100 : i.price || 0) * (i.qty || i.quantity || 1))}</div></div>`).join('')}
           <div class="row" style="border-top:1.5px solid var(--line);border-bottom:none">
             <div class="l" style="font-weight:800">Total</div>
             <div class="fig" style="font-size:22px">${money(total)}</div></div>
           <button class="btn ghost" id="bk-till">Open the till</button>${localBlock}${bkAddHTML()}`
          : `<div style="font-size:12.5px;color:var(--clay);margin-bottom:10px">Nothing rung up against this booking yet.
           It appears here as the girls add pieces and drinks at the terminal.</div>
           <button class="btn ghost" id="bk-till" style="margin-top:0">Open the till</button>${localBlock}${bkAddHTML()}`),
        !!(items && items.length));
    })()}

    ${effHasPieces ? `
    ${stepRow(2, 'Her pieces', `${isLocalPieces ? `<div class="k" style="margin-bottom:8px;
        color:var(--warn)">Added this session — not sent</div>` : ''}
           ${effPieces.map(p => `<div class="row"><div style="flex:1">
             <div class="l">${esc(p.piece_type || 'Piece')}</div>
             <div class="m">${p.reference_photo_url ? 'Photographed' : 'No photograph yet'}</div></div>
             ${p.reference_photo_url ? `<img src="${esc(p.reference_photo_url)}" alt=""
               style="width:44px;height:44px;object-fit:cover;border-radius:9px;
               border:1px solid var(--line)">` : '<div class="v" style="color:var(--mute)">○</div>'}</div>`).join('')}
           <div style="font-size:11.5px;color:var(--clay);margin-top:8px">
             ${effWithPhoto} of ${effPieces.length} photographed</div>`,
      effWithPhoto === effPieces.length)}

    ${stepRow(3, 'Find them on the shelf',
      `<div style="font-size:12.5px;color:var(--clay);margin-bottom:9px">Photograph a tray or
             shelf. Whatever of hers is in the picture gets circled.</div>
           <label class="btn" style="display:flex;align-items:center;justify-content:center;
             cursor:pointer;margin-top:0" for="bkshot">Photograph a tray or shelf</label>
           <input type="file" id="bkshot" accept="image/*" capture="environment" style="display:none">
           <div style="font-size:10.5px;color:var(--clay);text-align:center;margin-top:8px">
             About 0.3p a photo · ${spend ? spend.toFixed(1) + 'p this session' : 'nothing spent yet'}</div>
           <div id="bkfound"></div>`,
      false)}
    ` : (pieces === undefined ? `
    <div class="card" style="border-left:4px solid var(--line)">
      <div style="display:flex;gap:10px;align-items:baseline">
        <span style="font-family:var(--serif);font-weight:900;font-size:13px;color:var(--mute);min-width:16px">2</span>
        <div style="flex:1"><h2 style="margin-bottom:6px">Her pieces</h2>
        <div style="font-size:12.5px;color:var(--clay)">Reading…</div></div></div></div>
    ` : `
    <div class="card" style="border-left:4px solid var(--warn)">
      <div style="display:flex;gap:10px;align-items:baseline">
        <span style="font-family:var(--serif);font-weight:900;font-size:13px;color:var(--warn);min-width:16px">2</span>
        <div style="flex:1">
          <h2 style="margin-bottom:6px">Photograph the table</h2>
          <div style="font-size:12.5px;color:var(--clay);line-height:1.55;margin-bottom:10px">
            No pieces yet — taken from inside this booking, so it already knows whose these
            are, no chalk tag to write, none to read. Tap each piece in the photo and each one
            gets its own picture, which is what makes it findable on the shelf afterwards.</div>
          <label class="btn" style="display:flex;align-items:center;justify-content:center;
            cursor:pointer;margin-top:0" for="tableshot">Photograph the table</label>
          <input type="file" id="tableshot" accept="image/*" capture="environment" style="display:none">
          <div id="tablemark"></div>
        </div></div></div>
    `)}

    <div class="note">Read-only — this booking can't be changed from here. Use Square for anything real.</div>`;

  const tillBtn = $('bk-till');
  if (tillBtn) tillBtn.onclick = () => {
    tillTable = b.table_number != null ? 'Table ' + b.table_number : null;
    tickWhere = (b.customer_name || 'Booking') + (tillTable ? ' · ' + tillTable : '');
    loadTicketFor(b.booking_code || null, true);
    go('till');
  };
  wireBkAdd($('bk'), b);
  const shot = $('bkshot');
  if (shot) shot.onchange = e => { const f = e.target.files[0]; if (f) bookingSearch(f); };
  const tshot = $('tableshot');
  if (tshot) tshot.onchange = e => { const f = e.target.files[0]; if (f) markTable(f); };
}

/* [4 Aug] Daisy: 'do we need chalk tags if we know the booking?' No —
   and that removes the weakest link in the whole chain. The tag only
   ever existed because the girls photograph on the iPad camera, outside
   the app, so the booking was lost by the time the picture arrived and
   OCR was the only way back. Taken from inside the booking, the link is
   context, not handwriting.
   Worth knowing what that saves: of the ten tags read by hand in July,
   one name was misread outright, one surname was never legible, and one
   board had an older name ghosting underneath because tags get reused.
   Each of those is pieces attached to the wrong customer.
   Read-only for now, so this marks up and shows what WOULD be created;
   saving pieces is a write and waits on Daisy. */
let tableShot = null, marks = [];
async function markTable(file) {
  tableShot = await readFile(file); marks = [];
  paintTableMark();
}
function paintTableMark() {
  const box = $('tablemark'); if (!box || !tableShot) return;
  box.innerHTML = `
    <div style="position:relative;line-height:0;margin-top:11px">
      <img id="tableimg" src="${esc(tableShot)}" alt="The table"
        style="width:100%;border-radius:12px;border:1.5px solid var(--line);cursor:crosshair">
      ${marks.map((m, i) => `<svg viewBox="0 0 100 100" preserveAspectRatio="none"
        style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none">
        <circle cx="${m.x.toFixed(1)}" cy="${m.y.toFixed(1)}" r="7" fill="none" stroke="#2E7D32"
          stroke-width="4" vector-effect="non-scaling-stroke"/>
        <circle cx="${m.x.toFixed(1)}" cy="${m.y.toFixed(1)}" r="7" fill="none" stroke="#fff"
          stroke-width="1.3" vector-effect="non-scaling-stroke"/>
        <text x="${m.x.toFixed(1)}" y="${m.y.toFixed(1)}" fill="#fff" font-size="6" font-weight="800"
          text-anchor="middle" dominant-baseline="central" style="paint-order:stroke;
          stroke:#2E7D32;stroke-width:1.6px">${i + 1}</text></svg>`).join('')}
    </div>
    <div style="font-size:12.5px;font-weight:700;margin-top:10px">
      ${marks.length ? marks.length + (marks.length === 1 ? ' piece marked' : ' pieces marked')
                     : 'Tap each piece'}</div>
    ${marks.length ? `
      <div style="margin-top:9px">
        ${marks.map((m, i) => `<div class="row" style="gap:8px">
          <span style="font-family:var(--serif);font-weight:900;color:var(--soon);
            min-width:16px">${i + 1}</span>
          <input type="text" data-desc="${m.id}" value="${esc(m.desc || '')}"
            placeholder="${m.descLoading ? 'Describing\u2026' : 'e.g. blue mug, white spots'}"
            style="flex:1;border:1.5px solid var(--line);
            border-radius:9px;padding:8px 10px;font-size:12.5px;font-family:var(--ui);
            ${m.descLoading ? 'color:var(--clay)' : ''}">
          <button data-rm="${m.id}" style="background:none;border:none;color:var(--clay);
            font-size:16px;cursor:pointer;padding:0 2px">\u2715</button></div>`).join('')}
      </div>
      <div style="font-size:11px;color:var(--clay);margin-top:6px">
        ${marks.some(m => m.descLoading)
          ? 'AI is having a first guess at each one \u2014 colour and pattern, the same way it looks for pieces on a shelf. Check them, change anything it got wrong.'
          : 'A quick description of the colour and pattern is what makes a piece findable \u2014 form alone won\'t do, most of these started as the same blank shape.'}
        ${descSpend ? ' \u00b7 ' + descSpend.toFixed(1) + 'p on descriptions this session' : ''}</div>
      <button class="btn" id="finishmarks" style="margin-top:10px">Finish \u2014 ${marks.length}
        ${marks.length === 1 ? 'piece' : 'pieces'}</button>
      <div class="note">Read-only still holds: this saves nothing to the real system. It creates
        ${marks.length === 1 ? 'a piece' : 'pieces'} for THIS practice session only, so Her Pieces
        and Find Them On The Shelf have something real to work with straight away.</div>` : ''}`;
  const img = $('tableimg');
  if (img) img.onclick = ev => {
    const r = img.getBoundingClientRect();
    if (!(r.width > 0) || !(r.height > 0)) return;   // image hasn't laid out yet — ignore the tap
    const id = Date.now() + '-' + Math.random().toString(36).slice(2);
    marks.push({ id, x: ((ev.clientX - r.left) / r.width) * 100, y: ((ev.clientY - r.top) / r.height) * 100,
      desc: '', descLoading: true });
    paintTableMark();
    autoDescribeMark(id);
  };
  box.querySelectorAll('[data-desc]').forEach(inp =>
    inp.onchange = () => {
      const m = marks.find(x => x.id === inp.dataset.desc); if (m) m.desc = inp.value;
    });
  box.querySelectorAll('[data-rm]').forEach(btn =>
    btn.onclick = () => { marks = marks.filter(x => x.id !== btn.dataset.rm); paintTableMark(); });
  const fin = $('finishmarks');
  if (fin) fin.onclick = finishTableMarks;
}

/* The step that actually closes the loop: crop each tap into its own
   piece photo, keep whatever was typed, store as a local piece against
   THIS booking. Nothing here reaches pottery_pieces — completing the
   demo, not the real record. */
/* [4 Aug] David, looking at two blank description fields: "Ai should
   describe." Fires the instant a piece is tapped — by the time
   someone's finished tapping the rest of the table, most fields
   already have a real guess sitting in them instead of a placeholder
   to type from scratch. Never blocks Finish: if this fails, is slow,
   or the network's bad, the field just falls back to the same manual
   typing that already worked before this existed. Never clobbers a
   manual edit either — only applies its answer if the field is still
   exactly as it was left (empty, still loading) when the answer
   arrives. */
async function autoDescribeMark(id) {
  const m = marks.find(x => x.id === id); if (!m) return;
  try {
    const photo = await cropAround(tableShot, m.x, m.y);
    const d = await describeCrop(photo);
    if (typeof d.cost === 'number') descSpend += d.cost * 100;
    const still = marks.find(x => x.id === id);
    if (still && still.descLoading && !still.desc) {
      const guess = d.pieces && d.pieces[0] && d.pieces[0].description;
      if (guess) still.desc = guess;
    }
  } catch (e) {
    // A failed guess is not a failed piece — the manual field beneath
    // it has worked all along and still does.
  } finally {
    const still = marks.find(x => x.id === id);
    if (still) still.descLoading = false;
    // Never repaint out from under someone actively typing a different
    // field's description — the data's already correct in marks[], it
    // shows on the next natural repaint (another tap, a removal, Finish).
    const typing = document.activeElement && document.activeElement.matches
      && document.activeElement.matches('[data-desc]');
    if (!typing) paintTableMark();
  }
}

async function finishTableMarks() {
  const b = bkNow; if (!b || !tableShot || !marks.length) return;
  const fin = $('finishmarks');
  if (fin) { fin.disabled = true; fin.textContent = 'Saving…'; }
  const made = [];
  for (let i = 0; i < marks.length; i++) {
    const m = marks[i];
    const photo = await cropAround(tableShot, m.x, m.y);
    made.push({
      id: 'local-' + Date.now() + '-' + i,
      piece_type: m.desc || ('Piece ' + (i + 1)),
      description: m.desc || '',
      reference_photo_url: photo,
    });
  }
  const key = b.booking_code || null;
  if (key) localPieces[key] = (localPieces[key] || []).concat(made);
  marks = []; tableShot = null;
  paintBooking();
}

async function bookingSearch(file) {
  const real = bkNow._pieces || [];
  const pieces = real.length ? real : ((bkNow.booking_code && localPieces[bkNow.booking_code]) || []);
  const wanted = pieces.filter(p => !foundMap[p.id])
    .map(p => ({ id: p.id, description: p.description || p.piece_type || '' }))
    .filter(w => w.description);
  const box = $('bkfound');
  if (!wanted.length) { if (box) box.innerHTML = '<div class="note">Nothing left to look for.</div>'; return; }
  const raw = await readFile(file);
  if (box) box.innerHTML = '<div style="font-size:12.5px;color:var(--clay);padding:10px 0">Looking…</div>';
  try {
    const d = await search({ photoBase64: await gridded(raw, 1400), wanted });
    if (typeof d.cost === 'number') spend += d.cost * 100;
    const found = d.found || [];
    let rings = '';
    found.forEach(f => {
      const p = cellPoint(f.cell);
      const piece = pieces.find(x => String(x.id) === String(f.id));
      if (piece) foundMap[piece.id] = f.cell || 'in this photo';
      if (!p) return;
      rings += `<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;
        inset:0;width:100%;height:100%;pointer-events:none">
        <circle cx="${(p.x*100).toFixed(1)}" cy="${(p.y*100).toFixed(1)}" r="7" fill="none"
          stroke="#2E7D32" stroke-width="4" vector-effect="non-scaling-stroke"/>
        <circle cx="${(p.x*100).toFixed(1)}" cy="${(p.y*100).toFixed(1)}" r="7" fill="none"
          stroke="#fff" stroke-width="1.4" vector-effect="non-scaling-stroke"/></svg>`;
    });
    if (box) box.innerHTML = `<div style="margin-top:11px">
      <div style="font-family:var(--serif);font-weight:900;font-size:15px;margin-bottom:7px">
        ${found.length ? found.length + ' of ' + wanted.length + ' found' : 'None of hers in this one'}</div>
      <div style="position:relative;line-height:0">
        <img src="${esc(raw)}" alt="" style="width:100%;border-radius:12px;border:1.5px solid var(--line)">
        ${rings}</div></div>`;
  } catch (e) {
    if (box) box.innerHTML = `<div class="err">${esc(e.message)}</div>`;
  }
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

/* [4 Aug] David: "it kind of all needs to be done from the one page
   instead of to go back... the booking's live all the time." Split out
   from loadTill so the SAME catalogue load can feed an inline picker on
   the booking page too — no second network path, no duplicated logic. */
async function ensurePriceGroups() {
  if (priceGroups.length) return;
  try {
    const d = await read('/api/pos/items');
    if ((d.groups || []).length) {
      priceGroups = d.groups; tillMode = 'catalogue'; cat = priceGroups[0].category; return;
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
    tillMode = 'average'; cat = priceGroups[0].category;
  } catch (e) { /* leaves priceGroups empty; each caller shows its own message */ }
}
async function loadTill() {
  await ensurePriceGroups();
  if (priceGroups.length) return paintTill();
  $('items').innerHTML = `<div class="err" style="grid-column:1/-1">
    Couldn't read prices or categories.</div>`;
}

/* [4 Aug] Daisy: "till is not easily categorised." True once the
   catalogue autopull fills square_items — /api/pos/items returns a flat
   list, one chip per raw Square category, and the studio has 41 of
   them. The 'average' fallback already avoided this because
   /api/takings/breakdown groups server-side into five real buckets;
   this mirrors that SAME classifier so catalogue mode gets it too,
   rather than inventing a second taxonomy that could drift from it. */
function parentOf(cat) {
  const c = String(cat || '').trim();
  if (c.startsWith('PB ')) return 'Paint your own — by shape';
  if (c.startsWith('S.')) return 'Studio sessions & fees';
  if (/drink|coffee|milkshake|smoothie|alcohol/i.test(c)) return 'Drinks';
  if (/cake|food|cafe/i.test(c)) return 'Food';
  return 'Other';
}
let parentCatSel = null;

function paintTillTable() {
  const el = $('tilltable'); if (!el) return;
  if (tillTable) {
    el.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;
        background:var(--card);border:1.5px solid var(--line);border-radius:12px;padding:10px 12px">
      <span><span class="k">Table</span>
        <span style="display:block;font-family:var(--serif);font-weight:800;font-size:15px;
          margin-top:2px">${esc(short(tillTable))}</span></span>
      <button class="chip" id="tillchg" style="min-height:34px;padding:6px 12px">Change</button>
    </div>`;
    $('tillchg').onclick = () => { tillTable = null; paintTillTable(); };
  } else {
    el.innerHTML = `<div class="k" style="margin-bottom:6px">Table — none chosen</div>
      ${tablePickerHTML(null)}`;
    wireTablePicker(el, name => {
      tillTable = name;
      if (tickWhere === 'New order' || !tickWhere) tickWhere = short(name);
      // A booking-owned ticket (arrived via a booking's Open the till,
      // even one not yet seated) keeps belonging to that booking no
      // matter what table gets picked here — this is only a display
      // label. Only a table-only session (Floor / direct Till, no
      // booking behind it) may re-key itself to a newly picked table.
      if (!ticketKeyIsBooking) loadTicketFor(name);
      paintTillTable(); syncTicket();
    });
  }
}

/* Shared by Till and the booking page's inline picker — one grouping
   rule, used everywhere prices are browsed, so the two can never drift
   into different category shapes. */
function groupByParent() {
  const parents = {};
  if (tillMode === 'catalogue') {
    priceGroups.forEach(g => (parents[parentOf(g.category)] = parents[parentOf(g.category)] || []).push(g));
  } else {
    priceGroups.forEach(g => (parents[g.category] = [g]));
  }
  return parents;
}

/* [4 Aug] David: "it kind of all needs to be done from the one page
   instead of to go back... you go back and add some more... the
   booking's live all the time." Same catalogue, same categories as
   Till (via groupByParent/ensurePriceGroups), rendered inline so
   ringing something else up never means leaving the booking. */
function bkAddHTML() {
  if (!bkAddOpen) {
    return `<button class="chip" id="bkaddtoggle" style="min-height:36px;margin-top:10px">+ Add something</button>`;
  }
  if (!priceGroups.length) {
    return `<button class="chip" id="bkaddtoggle" style="min-height:36px;margin-top:10px">Close</button>
      <div style="font-size:12px;color:var(--clay);margin-top:8px">Reading prices…</div>`;
  }
  const parents = groupByParent();
  const parentNames = Object.keys(parents);
  if (!bkAddCat || !parents[bkAddCat]) bkAddCat = parentNames[0];
  const leaves = parents[bkAddCat] || [];
  if (!leaves.find(x => x.category === bkAddLeaf)) bkAddLeaf = leaves[0] && leaves[0].category;
  const g = leaves.find(x => x.category === bkAddLeaf) || leaves[0];
  return `
    <button class="chip" id="bkaddtoggle" style="min-height:36px;margin-top:10px">Close</button>
    <div class="chips" style="margin-top:8px">
      ${parentNames.map(p => `<button class="chip bkaddpc ${p === bkAddCat ? 'on' : ''}" data-pc="${esc(p)}"
        style="min-height:34px;padding:6px 12px;font-size:11.5px">${esc(p)}</button>`).join('')}
    </div>
    ${leaves.length > 1 ? `<div class="chips" style="margin-top:-2px">
      ${leaves.map(lg => `<button class="chip bkaddleaf ${lg.category === bkAddLeaf ? 'on' : ''}" data-c="${esc(lg.category)}"
        style="min-height:32px;padding:5px 11px;font-size:11px">${esc(lg.category)}</button>`).join('')}
    </div>` : ''}
    <div class="items" style="margin-top:8px">
      ${(g && g.items || []).map((it, i) => `<button class="item bkaddit" data-i="${i}">
        <span class="n">${esc(it.name)}</span><span class="p">${money(it.price)}</span></button>`).join('')}
    </div>`;
}
function wireBkAdd(root, b) {
  const t = root.querySelector('#bkaddtoggle');
  if (t) t.onclick = async () => {
    bkAddOpen = !bkAddOpen;
    if (bkAddOpen && !priceGroups.length) { paintBooking(); await ensurePriceGroups(); }
    paintBooking();
  };
  root.querySelectorAll('.bkaddpc').forEach(el =>
    el.onclick = () => { bkAddCat = el.dataset.pc; bkAddLeaf = null; paintBooking(); });
  root.querySelectorAll('.bkaddleaf').forEach(el =>
    el.onclick = () => { bkAddLeaf = el.dataset.c; paintBooking(); });
  root.querySelectorAll('.bkaddit').forEach(el => el.onclick = () => {
    const parents = groupByParent();
    const leaves = parents[bkAddCat] || [];
    const g = leaves.find(x => x.category === bkAddLeaf) || leaves[0];
    const it = g && g.items[+el.dataset.i]; if (!it) return;
    const key = b.booking_code || null;
    if (key) {
      localTickets[key] = (localTickets[key] || []).concat([{ n: it.name, p: it.price }]);
      if (ticketKey === key) ticket = localTickets[key];   // keep Till in step if it's open on the same booking
    }
    // [4 Aug] David: "I have to scroll all the way down... I don't want
    // to scroll past everything I haven't chosen to get to the next
    // phase. As soon as I put it in, [I want to be] in the booking."
    // One tap adds it and closes straight back to the compact toggle —
    // no more sitting inside a whole category's worth of items you
    // didn't want just to reach the rest of the page. bkAddCat/Leaf
    // stay set, so reopening picks up exactly where this tap left off.
    bkAddOpen = false;
    paintBooking();
    $('main').scrollTop = 0;
  });
}

function paintTill() {
  paintTillTable();
  // 'average' mode groups server-side already (/api/takings/breakdown's
  // own groupOf) — g.category there IS the parent bucket, so running
  // parentOf() on it again would classify an already-grouped name like
  // 'Paint your own — by shape' as neither PB-prefixed nor S.-prefixed
  // and dump it into 'Other'. Only catalogue mode's raw Square
  // categories (up to 41 of them) need bucketing at all.
  const parents = groupByParent();
  const parentNames = Object.keys(parents);
  if (!parentCatSel || !parents[parentCatSel]) parentCatSel = parentNames[0];
  const leaves = parents[parentCatSel] || [];
  if (!leaves.find(x => x.category === cat)) cat = leaves[0] && leaves[0].category;

  $('cats').innerHTML = parentNames.map(p =>
    `<button class="chip ${p === parentCatSel ? 'on' : ''}" data-pc="${esc(p)}">${esc(p)}</button>`).join('');
  $('cats').querySelectorAll('[data-pc]').forEach(b =>
    b.onclick = () => { parentCatSel = b.dataset.pc; cat = null; paintTill(); });

  let leafRow = '';
  if (leaves.length > 1) {
    leafRow = `<div class="chips" id="leafcats" style="margin-top:-2px;grid-column:1/-1">${leaves.map(g =>
      `<button class="chip ${g.category === cat ? 'on' : ''}" data-c="${esc(g.category)}"
        style="min-height:34px;padding:6px 12px;font-size:11.5px">${esc(g.category)}</button>`).join('')}</div>`;
  }
  const g = leaves.find(x => x.category === cat) || leaves[0];
  const banner = tillMode === 'average'
    ? `<div class="note" style="grid-column:1/-1;margin:0 0 10px">These are your real categories with
       the <strong>average</strong> you actually sell each at, worked out from four years of takings —
       not the Square price list. The real one appears here once the catalogue is pulled from Square.</div>`
    : '';
  $('items').innerHTML = `${leafRow}${banner}${(g && g.items || []).map((it, i) =>
    `<button class="item" data-i="${i}"><span class="n">${esc(it.name)}</span>
     <span class="p">${money(it.price)}</span></button>`).join('')}`;
  const leafcats = $('leafcats');
  if (leafcats) leafcats.querySelectorAll('[data-c]').forEach(b =>
    b.onclick = () => { cat = b.dataset.c; paintTill(); });
  $('items').querySelectorAll('[data-i]').forEach(b => b.onclick = () => {
    const it = g.items[+b.dataset.i]; ticket.push({ n: it.name, p: it.price }); syncTicket();
  });
  $('sub').textContent = tillMode === 'average'
    ? 'Average prices — not sent' : 'Real prices — nothing is sent';
}

/* [4 Aug] Daisy: 'want till to send, but only for demo at this stage.'
   So the flow completes — ticket, send, receipt — and nothing leaves the
   app. This does NOT call /api/pos/order and could not: the guard only
   permits GETs, and the one sanctioned POST is the shelf search. The
   receipt says so on its face, because a demo that looks like a real
   sale is how a real sale gets rung up by accident. */
function sendTicket() {
  if (!ticket.length) return;
  const lines = ticket.slice();
  const total = lines.reduce((s, i) => s + i.p, 0);
  const now = new Date();
  ticket = []; syncTicket();
  $('items').insertAdjacentHTML('afterbegin', `
    <div class="card" id="demo-receipt" style="grid-column:1/-1">
      <div style="text-align:center;font-family:ui-monospace,Menlo,monospace;font-size:11.5px;line-height:1.7">
        <div style="font-weight:700;letter-spacing:.08em">THE KILN CAFE</div>
        <div style="color:var(--clay)">The Old Bank, Cheapside, Langport</div>
        <hr style="border:none;border-top:1px dashed var(--line);margin:9px 0">
        <div style="display:flex;justify-content:space-between"><span>${esc(tickWhere)}</span></div>
        <div style="display:flex;justify-content:space-between;color:var(--clay)">
          <span>${now.toLocaleDateString('en-GB')}</span><span>${hhmm(now)}</span></div>
        <hr style="border:none;border-top:1px dashed var(--line);margin:9px 0">
        ${lines.map(i => `<div style="display:flex;justify-content:space-between;gap:12px">
          <span style="text-align:left">${esc(i.n)}</span><span>${money(i.p)}</span></div>`).join('')}
        <hr style="border:none;border-top:1px dashed var(--line);margin:9px 0">
        <div style="display:flex;justify-content:space-between;font-weight:700;font-size:13px">
          <span>TOTAL</span><span>${money(total)}</span></div>
      </div>
      <div class="err" style="margin-top:12px"><strong>Not sent — nothing reached Square.</strong>
        No payment was taken and no order exists. Ring the real one up on the till as usual.</div>
      <button class="btn ghost" id="clear-receipt">Clear</button>
    </div>`);
  $('clear-receipt').onclick = () => { const r = $('demo-receipt'); if (r) r.remove(); };
  $('main').scrollTop = 0;
}

function syncTicket() {
  if (ticketKey) localTickets[ticketKey] = ticket;   // one choke point, called after every add/remove
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
    b.onclick = () => openPackAsBooking(packBookings[+b.dataset.p]));
}

/* [4 Aug] David: "get rid of the [old] booking test thing in packing...
   I need to see right through to the end of the workflow." Packing used
   to open its own separate card with its own copy of the finder — built
   before the booking page grew the same thing properly, with the till
   and the real session steps alongside it. One workflow now, not two:
   a packing entry searches for its real booking and opens THAT, so
   photographing/finding happens on the same page as everything else. */
async function openPackAsBooking(g) {
  $('pack').innerHTML = '<div class="empty">Finding her booking…</div>';
  try {
    const d = await read('/api/bookings/search', { q: g.who });
    const hit = (d.bookings || [])[0];
    if (hit) { openBooking(hit); return; }
    $('pack').innerHTML = `<div class="empty">No booking on file for "${esc(g.who)}" in the
      last 90 days — nothing to open. This entry is real (from the packing queue), it just
      isn't tied to a bookable session.</div>
      <button class="btn ghost" id="pack-back" style="margin-top:10px">Back to the list</button>`;
    const back = $('pack-back'); if (back) back.onclick = paintPack;
  } catch (e) {
    $('pack').innerHTML = `<div class="err">Couldn't search for her booking. ${esc(e.message)}</div>`;
  }
}

/* ── the booking, as Jenny works it ──────────────────────────────────
   Tap a booking → the table photograph the girls took when they cleared
   it → photograph a tray or a piece you think is hers → the pieces get
   circled → tick them off. The whole job on one screen, in that order. */
let foundMap = {}, spend = 0, descSpend = 0;

/* An 8x8 magenta grid burned into the photo before it is sent, so the
   model READS a cell reference rather than estimating a position. Four
   earlier attempts at coordinates and named zones put rings on the
   wrong things; this was the first that landed. */
const COLS8 = ['A','B','C','D','E','F','G','H'];
function gridded(dataUrl, maxSide) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const sc = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0, c.width, c.height);
      const cw = c.width / 8, ch = c.height / 8;
      x.lineWidth = Math.max(3, Math.round(c.width / 260));
      x.strokeStyle = 'rgba(255,0,255,.95)';          // never a glaze colour
      const fs = Math.max(14, Math.round(c.width / 46));
      x.font = '800 ' + fs + 'px system-ui,sans-serif'; x.textBaseline = 'top';
      for (let r = 0; r < 8; r++) for (let col = 0; col < 8; col++) {
        const px = col * cw, py = r * ch;
        x.strokeRect(px, py, cw, ch);
        const lab = COLS8[col] + (r + 1), tw = x.measureText(lab).width;
        x.fillStyle = 'rgba(255,255,255,.95)'; x.fillRect(px + 4, py + 4, tw + 14, fs + 10);
        x.fillStyle = '#FF00FF'; x.fillText(lab, px + 11, py + 9);
      }
      x.textBaseline = 'alphabetic';
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
/* [4 Aug] Each tap becomes its own piece photo — a 34%-of-short-side
   square around the tap, same crop the studio's own earlier work
   settled on. This never leaves the device or costs anything; it only
   feeds the local "her pieces" preview and, later, the one sanctioned
   search call — same as every other photo already handled this way. */
function cropAround(dataUrl, xPct, yPct) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const side = 0.34 * Math.min(img.width, img.height);
      const cx = (xPct / 100) * img.width, cy = (yPct / 100) * img.height;
      const sx = Math.max(0, Math.min(img.width - side, cx - side / 2));
      const sy = Math.max(0, Math.min(img.height - side, cy - side / 2));
      const c = document.createElement('canvas');
      c.width = 260; c.height = 260;
      c.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, 260, 260);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
const cellPoint = ref => {
  const m = String(ref || '').trim().toUpperCase().match(/^([A-H])\s*([1-8])$/);
  if (!m) return null;
  return { x: (COLS8.indexOf(m[1]) + .5) / 8, y: (parseInt(m[2], 10) - 1 + .5) / 8 };
};
const readFile = f => new Promise((ok, no) => {
  const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(f);
});

/* ── money (admin only) ─────────────────────────────────────────────
   Everything is already on the server: /api/takings/history returns
   every recorded day back to Nov 2022 plus months, years and weekday
   averages in ONE call, and /api/takings/breakdown returns the real
   Square categories. Both are reads. Nothing is pulled on demand —
   the screen loads once and the ranges just re-slice what it has. */
let hist = null, brk = null, range = '30d';

/* ── staff PINs (director-only) ──────────────────────────────────────
   [4 Aug] David: "admin can reset it for them... just an admin
   function, for the directors." Reading the list is a normal read;
   resetting someone's PIN goes through writePin's narrow gate, and
   the server itself still requires the ACTING director's own PIN to
   prove who they are before it clears anything — this screen can't
   bypass that, and doesn't try to. If a director forgets their own
   PIN, this can't get them back in either; that's the server's own
   design (set-pin's own message says the same: ask your manager),
   not a gap to route around here. */
let pinsTeam = [];
async function loadPins() {
  try {
    const d = await read('/api/staff/team-for-login');
    pinsTeam = (d.team || []).filter(p => p && p.name);
    paintPins();
  } catch (e) {
    $('pins').innerHTML = `<div class="err">Couldn't read the team. ${esc(e.message)}</div>`;
  }
}
function paintPins(msg) {
  $('pins').innerHTML = `
    ${msg ? `<div class="note" style="margin-bottom:12px">${msg}</div>` : ''}
    <div class="card">
      ${pinsTeam.map(p => `<div class="row"><div style="flex:1">
          <div class="l">${esc(p.name)}</div>
          <div class="m">${esc(p.role || '')} · ${p.hasPinSet ? 'PIN set' : 'No PIN yet'}</div></div>
          ${p.hasPinSet ? `<button class="chip" data-reset="${esc(p.id)}" data-name="${esc(p.name)}"
            style="min-height:34px;padding:6px 12px">Reset</button>` : ''}
        </div>`).join('')}
    </div>
    <div id="resetbox"></div>
    <div class="note">Resetting clears their PIN — they'll choose a new one next time they
      log in. This needs YOUR own PIN to confirm it's really you.</div>`;
  $('pins').querySelectorAll('[data-reset]').forEach(b =>
    b.onclick = () => paintResetConfirm(b.dataset.reset, b.dataset.name));
}
function paintResetConfirm(targetId, targetName) {
  $('resetbox').innerHTML = `
    <div class="card">
      <h2>Reset ${esc(targetName)}'s PIN</h2>
      <div style="font-size:12px;color:var(--clay);margin-bottom:10px">Enter your own PIN to confirm.</div>
      <input type="password" inputmode="numeric" pattern="[0-9]*" id="resetpin" maxlength="6"
        style="width:100%;text-align:center;font-size:20px;letter-spacing:.3em;padding:10px;
        border:1.5px solid var(--line);border-radius:12px;font-family:var(--ui);background:var(--paper)">
      <div id="reseterr" style="color:var(--brick);font-size:12px;margin-top:8px;min-height:16px"></div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn" id="resetgo" style="margin-top:0">Clear the PIN</button>
        <button class="btn ghost" id="resetcancel" style="margin-top:0">Cancel</button>
      </div>
    </div>`;
  $('resetpin').focus();
  $('resetcancel').onclick = () => { $('resetbox').innerHTML = ''; };
  $('resetpin').onkeydown = e => { if (e.key === 'Enter') $('resetgo').click(); };
  $('resetgo').onclick = async () => {
    const managerPin = $('resetpin').value.trim();
    if (!managerPin) return;
    try {
      const d = await writePin('/api/staff/reset-pin', { targetStaffMemberId: targetId, managerPin });
      if (d.ok) { await loadPins(); paintPins(`${esc(targetName)}'s PIN was cleared.`); }
      else $('reseterr').textContent = d.error || 'Could not reset that PIN.';
    } catch (e) { $('reseterr').textContent = e.message; }
  };
}

/* ── gift vouchers ────────────────────────────────────────────────────
   [4 Aug] David: "Square does gift vouchers." Confirmed, not assumed —
   the Square account already connected for revenue/bookings genuinely
   supports gift cards, and looking one up is a real GET here even
   though Square's own API happens to use POST internally for it (their
   design, not a write on either end — see the server-side note beside
   the endpoint). Anyone can check a voucher, same as anyone can use
   the till — this isn't director-only. */
function loadVouchers() {
  $('vouchers').innerHTML = `
    <div class="card">
      <h2>Check a voucher</h2>
      <div style="font-size:12px;color:var(--clay);margin-bottom:10px">The number on the card
        or the receipt it came with.</div>
      <input type="text" inputmode="numeric" id="ganentry" placeholder="Gift card number"
        style="width:100%;padding:12px;font-size:15px;border:1.5px solid var(--line);
        border-radius:12px;font-family:var(--ui);background:var(--paper)">
      <button class="btn" id="gancheck" style="margin-top:10px">Check</button>
      <div id="ganresult"></div>
    </div>`;
  const go = () => checkVoucher($('ganentry').value.trim());
  $('gancheck').onclick = go;
  $('ganentry').onkeydown = e => { if (e.key === 'Enter') go(); };
  $('ganentry').focus();
}
async function checkVoucher(gan) {
  if (!gan) return;
  const box = $('ganresult');
  box.innerHTML = `<div style="font-size:12.5px;color:var(--clay);margin-top:12px">Reading…</div>`;
  try {
    const d = await read('/api/gift-cards/lookup', { gan });
    const stateGood = d.state === 'ACTIVE';
    const amount = d.balance ? money(d.balance.amount) : '—';
    box.innerHTML = `
      <div class="card" style="margin-top:12px;border-left:4px solid ${stateGood ? 'var(--soon)' : 'var(--warn)'}">
        <div style="font-family:var(--serif);font-weight:900;font-size:28px">${esc(amount)}</div>
        <div style="font-size:12.5px;color:${stateGood ? 'var(--soon)' : 'var(--warn)'};font-weight:700;
          margin-top:4px">${esc(d.state || 'UNKNOWN')}</div>
        <div style="font-size:11px;color:var(--clay);margin-top:8px;font-family:ui-monospace,monospace">
          ${esc(d.gan || gan)}</div>
      </div>`;
  } catch (e) {
    box.innerHTML = `<div class="err" style="margin-top:12px">${esc(e.message)}</div>`;
  }
}

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
$('hometap2').onclick = () => { if (me && view !== 'login') { stack = []; go('home', false); } };
$('prev').onclick = () => shift(-1);
$('next').onclick = () => shift(1);
$('fprev').onclick = () => shift(-1);
$('fnext').onclick = () => shift(1);
$('tkclear').onclick = clearPracticeState;
$('tksend').onclick = sendTicket;
wireFind();
loadLogin();
