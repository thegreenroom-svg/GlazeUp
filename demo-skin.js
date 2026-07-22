/* ═══════════════════════════════════════════════════════════════════
   THE POTTER'S DESK — the radical demo experience. 21 Jul 2026.
   Per Daisy: "total change, radically, go mad, use your imagination…
   get rid of tiles if you like… don't want to see any original."

   WHAT THIS IS: when window.DEMO_SKIN is true (the ONE switch in
   /demo-skin-flag.js), this module replaces the tile home entirely
   with a living canvas — a greeting in the studio's own hand, live
   figures, today's bookings as a flowing timeline, a typographic
   menu-card index instead of tiles, a persistent bottom dock, and a
   universal Jump bar. Flip the flag false and this file does
   NOTHING: no listeners, no DOM, byte-identical old app.

   WHAT THIS IS NOT: it is not a rewrite. Every destination it
   navigates to is the app's own real screen via the app's own real
   routing (_tileGoToTab / goToTab / the real fn names from
   GRID_NAV_STRUCTURE). Every figure comes from the same real
   endpoints the old screens use. Presentation and navigation only —
   zero business logic lives here.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (!window.DEMO_SKIN) return;

  const KC = window.KC = {};
  const $ = (id) => document.getElementById(id);
  const dark = () => window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

  /* ── tiny helpers ─────────────────────────────────────────────── */
  const money = (v) => '£' + (v || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const tm = (s) => new Date(s).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
  const firstName = () => (typeof currentShiftStaff !== 'undefined' && currentShiftStaff?.name)
    ? currentShiftStaff.name.split(' ')[0] : '';
  const isDirector = () => (typeof _isDirector === 'function') && _isDirector();
  const greeting = () => {
    const h = parseInt(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Europe/London' }), 10);
    return h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
  };

  /* ── the menu-card index: built from the app's OWN nav structure,
        so it can never drift from what the app can actually do ──── */
  function menuSections() {
    try {
      return GRID_NAV_STRUCTURE
        .filter(g => g.items && g.items.length)
        .map(g => ({
          label: g.label,
          items: g.items.map(i => ({
            id: i.tab, fn: i.fn || null,
            label: i.label.replace(/^[^\w]*\s*/, ''),   // strip leading emoji — this design is typographic
            desc: i.desc || ''
          }))
        }));
    } catch (e) { return []; }
  }

  /* ── real navigation: hide the canvas, use the app's own router ── */
  KC.go = function (id, fn) {
    KC.hideCanvas();
    try {
      if (typeof _tileGoToTab === 'function') _tileGoToTab(id, fn || null);
      else if (fn && typeof window[fn] === 'function') window[fn]();
      else if (typeof goToTab === 'function') goToTab(id);
    } catch (e) { console.warn('[desk] nav failed', id, e); }
  };

  // Walk into the studio: open the floor plan (which loads its own live
  // data and has the normal dock/back). We deliberately do NOT deep-link
  // into a room panel from here — that panel reads floor data that hasn't
  // loaded yet when arriving cold, so it opened empty and, being a fixed
  // overlay, trapped the back button. The floor plan itself shows all three
  // rooms anyway, so tapping any zone lands you on the live plan cleanly.
  KC.goRoom = function (room) {
    KC.go('floor-plan', 'showFloorPlan');
  };

  KC.hideCanvas = function () {
    const c = $('kc-canvas'); if (c) c.classList.add('kc-away');
    const m = $('kc-menu'); if (m) m.classList.remove('kc-open');
    const j = $('kc-jump'); if (j) j.classList.remove('kc-open');
  };

  KC.showCanvas = function () {
    KC.build();
    const c = $('kc-canvas');
    if (!c) throw new Error('canvas element missing after build()');
    c.classList.remove('kc-away');
    // Only now — canvas genuinely exists and is showing — is it safe
    // for CSS to hide the old tile home. If we got this far, build()
    // didn't throw, so this line only runs on real success.
    document.documentElement.classList.add('kc-desk-ready');
    // every route home refreshes the live figures — the canvas is
    // alive. Wrapped separately: a hydrate failure (e.g. a bad fetch
    // shape) must never undo a canvas that's already correctly shown.
    try { KC.hydrate(); } catch (err) { KC._fail('hydrate', err); }
    try { KC._wireDayNav && KC._wireDayNav(); } catch (e) {}
    // hide any app view left showing beneath us
    try { document.querySelectorAll('.view').forEach(v => v.style.display = 'none'); } catch (e) {}
    const fp = $('floor-table-detail'); if (fp) fp.style.display = 'none';
  };

  /* ── build once ──────────────────────────────────────────────── */
  let _built = false;
  KC.build = function () {
    if (_built) return; _built = true;

    /* THE CANVAS */
    const c = document.createElement('div');
    c.id = 'kc-canvas';
    c.innerHTML = `
      <div class="kc-paper">
        <div class="kc-masthead kc-in">
          <img class="kc-mark" src="/brand-assets/kiln-cafe-wordmark/kiln-cafe-wordmark.png" alt="">
          <div class="kc-masthead-words">
            <div class="kc-house">THE KILN CAFE</div>
            <div class="kc-house-sub">Langport · Somerset</div>
          </div>
          <button class="kc-hbp" onclick="KC.go('host-by-post','openHostByPostSection')" aria-label="Host By Post">
            <img src="/brand-assets/kiln-cafe-logo-demo/hostbypost-box-demo.svg" alt="Host By Post">
          </button>
        </div>
        <div class="kc-hello kc-in"><span id="kc-hello-line"></span></div>
        <div class="kc-wave-line kc-in"></div>

        <div class="kc-hero kc-in" id="kc-hero"></div>

        <!-- The floor plan, as the heart of the Desk. The three studio
             spaces in their own colours (matching the real floor plan) —
             tap a space to walk straight into it. Live counts fill in. -->
        <div class="kc-section kc-in">
          <div class="kc-sec-title">THE STUDIO</div>
          <div class="kc-floor" id="kc-floor">
            <button class="kc-room kc-room-lounge" onclick="KC.goRoom('Lounge')">
              <span class="kc-room-name">The Lounge</span>
              <span class="kc-room-sub" id="kc-room-lounge-sub">adults · quiet</span>
              <span class="kc-room-count" id="kc-room-lounge-n"></span>
            </button>
            <button class="kc-room kc-room-main" onclick="KC.goRoom('Main Studio')">
              <span class="kc-room-name">Main Studio</span>
              <span class="kc-room-sub" id="kc-room-main-sub">tables 1–8</span>
              <span class="kc-room-count" id="kc-room-main-n"></span>
            </button>
            <button class="kc-room kc-room-vault" onclick="KC.goRoom('The Vault')">
              <span class="kc-room-name">The Vault</span>
              <span class="kc-room-sub" id="kc-room-vault-sub">private · premium</span>
              <span class="kc-room-count" id="kc-room-vault-n"></span>
            </button>
          </div>
          <button class="kc-floor-all" onclick="KC.go('floor-plan','showFloorPlan')">Open the full floor plan ›</button>
        </div>

        <div class="kc-section kc-in">
          <div class="kc-sec-title">THE DESK</div>
          <div class="kc-index" id="kc-index"></div>
        </div>

        <div class="kc-foot kc-in">It's not all cheese and cider round here you know…</div>
      </div>`;
    document.body.appendChild(c);

    /* THE DOCK — the only persistent chrome */
    const d = document.createElement('div');
    d.id = 'kc-dock';
    d.innerHTML = `
      <button class="kc-dock-b" onclick="KC.showCanvas()" aria-label="Desk">
        <svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5M5.5 10v9h13v-9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Desk</span></button>
      <button class="kc-dock-b" onclick="KC.go('floor-plan','showFloorPlan')" aria-label="Floor">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.4" fill="currentColor"/></svg><span>Floor</span></button>
      <button class="kc-dock-b" onclick="KC.go('kiln','openKiln')" aria-label="Kiln">
        <svg viewBox="0 0 24 24"><path d="M12 3c3 3.5 6 5.6 6 9.4A6 6 0 0 1 6 12.4C6 8.6 9 6.5 12 3Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg><span>Kiln</span></button>
      <button class="kc-dock-b" id="kc-dock-money" aria-label="Money">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9.5 15V9.2h3a2 2 0 0 1 0 4H9.5m0 0H14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><span>Money</span></button>
      <button class="kc-dock-b" onclick="KC.openMenu()" aria-label="Everything">
        <svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>Menu</span></button>`;
    document.body.appendChild(d);
    $('kc-dock-money').onclick = () => {
      // 22 Jul — Money now opens the Admin Hub (one clear door to everything
      // money + admin), replacing the smaller header ⚡ which is being removed.
      // Non-directors still get the gentle takings note.
      if (isDirector()) {
        if (typeof openAdminHub === 'function') { KC.hideCanvas && KC.hideCanvas(); openAdminHub(); }
        else KC.go('dashboard', null);
      }
      else if (typeof toast === 'function') toast('Takings are for directors', 'info');
    };

    /* THE JUMP BAR — type "kiln", "table 6", "packing", land there */
    const j = document.createElement('div');
    j.id = 'kc-jump';
    j.innerHTML = `
      <div class="kc-jump-sheet">
        <input id="kc-jump-in" type="text" placeholder="Jump to… try 'kiln' or 'table 6'" autocomplete="off">
        <div id="kc-jump-out"></div>
      </div>`;
    j.addEventListener('click', e => { if (e.target === j) j.classList.remove('kc-open'); });
    document.body.appendChild(j);
    $('kc-jump-in').addEventListener('input', KC._jumpSearch);
    $('kc-jump-in').addEventListener('keydown', e => {
      if (e.key === 'Enter') { const f = $('kc-jump-out').querySelector('button'); if (f) f.click(); }
      if (e.key === 'Escape') j.classList.remove('kc-open');
    });

    const jb = document.createElement('button');
    jb.id = 'kc-jump-fab';
    jb.setAttribute('aria-label', 'Jump anywhere');
    jb.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M15.5 15.5 20 20" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
    jb.onclick = KC.openJump;
    document.body.appendChild(jb);

    /* THE MENU — a full-screen menu card, typographic, no tiles */
    const m = document.createElement('div');
    m.id = 'kc-menu';
    m.innerHTML = `
      <div class="kc-menu-inner">
        <div class="kc-menu-head">
          <div class="kc-house">EVERYTHING</div>
          <button class="kc-close" onclick="document.getElementById('kc-menu').classList.remove('kc-open')">Close</button>
        </div>
        <div class="kc-wave-line"></div>
        <div id="kc-menu-body"></div>
      </div>`;
    document.body.appendChild(m);
    KC._renderMenu();
    KC._renderIndex();
  };

  KC.openMenu = function () { $('kc-menu').classList.add('kc-open'); };
  KC.openJump = function () {
    $('kc-jump').classList.add('kc-open');
    const i = $('kc-jump-in'); i.value = ''; $('kc-jump-out').innerHTML = KC._jumpHint(); setTimeout(() => i.focus(), 60);
  };

  /* ── menu card + desk index rendering ────────────────────────── */
  function indexRow(item) {
    return `<button class="kc-row" onclick="KC.go('${item.id}', ${item.fn ? `'${item.fn}'` : 'null'})">
      <span class="kc-row-t">${item.label}</span>
      <span class="kc-row-d">${item.desc}</span>
      <span class="kc-row-a">→</span>
    </button>`;
  }
  KC._renderMenu = function () {
    const secs = menuSections();
    $('kc-menu-body').innerHTML = secs.map(s => `
      <div class="kc-menu-sec">
        <div class="kc-sec-title">${s.label.toUpperCase()}</div>
        ${s.items.map(indexRow).join('')}
      </div>`).join('') || '<div class="kc-empty">Nothing here yet.</div>';
  };
  KC._renderIndex = function () {
    // The desk index: the six things a shift actually reaches for.
    const picks = [
      { id: 'staff', fn: null, label: 'Bookings', desc: 'Start, walk-in, party' },
      { id: 'collections', fn: 'openCollections', label: 'Collections', desc: 'Ready to go home' },
      { id: 'packing', fn: 'openPacking', label: 'Packing', desc: 'Wrap the fired pieces' },
      { id: 'piecematch', fn: null, label: 'Piece matching', desc: 'Photo to booking' },
      { id: 'team', fn: null, label: 'Team & duties', desc: 'Who does what today' },
      { id: 'tell-daisy', fn: 'openTellPicker', label: 'Tell Daisy', desc: 'Good or bad, say it' },
    ];
    if (isDirector()) picks.push({ id: 'daily-digest', fn: 'openDailyDigest', label: 'Daily digest', desc: 'Yesterday · the week · what’s next' });
    $('kc-index').innerHTML = picks.map(indexRow).join('');
  };

  /* ── jump search over the real nav + real tables ─────────────── */
  KC._jumpHint = () => '<div class="kc-jump-hint">Everything in the app is one word away.</div>';
  KC._jumpSearch = function () {
    const q = $('kc-jump-in').value.trim().toLowerCase();
    const out = $('kc-jump-out');
    if (!q) { out.innerHTML = KC._jumpHint(); return; }
    const hits = [];
    // "table 6" / "t8" / "lounge 3" / "vault" → straight to the floor plan
    const tbl = q.match(/^(?:t(?:able)?\s*(\d+)|l(?:ounge)?\s*(\d+)|vault)/);
    if (tbl) hits.push({ label: 'Floor plan — ' + q, desc: 'Live tables', go: () => KC.go('floor-plan', 'showFloorPlan') });
    menuSections().forEach(s => s.items.forEach(i => {
      if ((i.label + ' ' + i.desc).toLowerCase().includes(q)) {
        hits.push({ label: i.label, desc: s.label, go: () => KC.go(i.id, i.fn) });
      }
    }));
    window.__kcHits = hits;
    out.innerHTML = hits.length
      ? hits.slice(0, 7).map((h, n) =>
          `<button class="kc-row" onclick="window.__kcHits[${n}].go()"><span class="kc-row-t">${h.label}</span><span class="kc-row-d">${h.desc}</span><span class="kc-row-a">→</span></button>`).join('')
      : '<div class="kc-jump-hint">Nothing matches — try one word, like “stock”.</div>';
  };

  /* ── day navigation: arrows + calendar to view any date ──────── */
  KC._wireDayNav = function () {
    const prev = $('kc-day-prev'), next = $('kc-day-next'),
          cal = $('kc-day-cal'), todayBtn = $('kc-day-today'),
          input = $('kc-day-date-input');
    if (!prev || prev._wired) return; // wire once
    prev._wired = true;

    const todayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
    // The day currently on screen — the one the endpoint told us it showed,
    // or the explicitly-viewed date. Arrows step from here.
    const baseDate = () => KC._viewedDate || KC._shownDate || todayStr();
    const step = (days) => {
      const dt = new Date(baseDate() + 'T12:00:00');
      dt.setDate(dt.getDate() + days);
      KC._viewedDate = dt.toLocaleDateString('en-CA');
      _refreshDay();
    };
    // Re-run just the timeline hydration (not the whole Desk) for snappy steps.
    const _refreshDay = () => { try { KC.hydrate(); } catch (e) {} _syncTodayBtn(); };
    const _syncTodayBtn = () => {
      // "Today" button only matters when we're NOT on today.
      const onToday = !KC._viewedDate || KC._viewedDate === todayStr();
      if (todayBtn) todayBtn.style.visibility = onToday ? 'hidden' : 'visible';
    };

    prev.onclick = () => step(-1);
    next.onclick = () => step(1);
    todayBtn.onclick = () => { KC._viewedDate = null; _refreshDay(); };
    cal.onclick = () => {
      input.value = baseDate();
      // showPicker() where supported (iOS/Chrome), else focus falls back.
      try { input.showPicker ? input.showPicker() : input.focus(); } catch (e) { input.focus(); }
    };
    input.onchange = () => {
      if (input.value) { KC._viewedDate = input.value; _refreshDay(); }
    };
    _syncTodayBtn();
  };

  /* ── live hydration: greeting, hero figures, the day timeline ── */
  /* ── Morning invoice nudge: once per UK day, prompt to scan invoices ── */
  KC._maybeShowInvoiceNudge = function () {
    const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
    let seen = null;
    try { seen = localStorage.getItem('kc_invoice_nudge_day'); } catch (e) {}
    if (seen === todayKey) return;              // already shown today
    if (document.getElementById('kc-inv-nudge')) return; // already on screen

    // Only show if the app actually has the scanner (openInvoiceScanner).
    if (typeof openInvoiceScanner !== 'function') return;

    const bar = document.createElement('div');
    bar.id = 'kc-inv-nudge';
    bar.innerHTML = `
      <div class="kc-inv-nudge-inner">
        <span class="kc-inv-nudge-icon">🧾</span>
        <span class="kc-inv-nudge-text">Any invoices arrived? Scan them to keep costs up to date.</span>
        <button class="kc-inv-nudge-go">Scan</button>
        <button class="kc-inv-nudge-x" aria-label="Not now">×</button>
      </div>`;
    const markSeen = () => { try { localStorage.setItem('kc_invoice_nudge_day', todayKey); } catch (e) {} };
    bar.querySelector('.kc-inv-nudge-go').onclick = () => { markSeen(); bar.remove(); try { openInvoiceScanner(); } catch (e) {} };
    bar.querySelector('.kc-inv-nudge-x').onclick = () => { markSeen(); bar.remove(); };

    // Slot it just under the greeting line.
    const anchor = $('kc-hello-line');
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(bar, anchor.nextSibling);
    }
  };

  KC.hydrate = async function () {
    $('kc-hello-line').textContent = `${greeting()}, ${firstName() || 'you'}.`;

    /* Morning nudge: once per UK day, invite whoever's on to scan any
       invoices that arrived — the habit that keeps costs current through the
       trial without anyone having to remember. Shown to everyone (anyone can
       scan their bit — coffee, Booker, cakes, bisque). Dismissable; only
       reappears the next day. Uses localStorage so it's genuinely once/day
       per device, not once per app-open. */
    try { KC._maybeShowInvoiceNudge(); } catch (e) {}

    /* hero: three living figures (skeletons until real data lands) */
    const hero = $('kc-hero');
    const dir = isDirector();
    hero.innerHTML = `
      ${dir ? `<div class="kc-fig"><div class="kc-fig-n kc-skel-t" id="kc-fig-money">&nbsp;</div><div class="kc-fig-l">taken today</div></div>` : ''}
      <div class="kc-fig"><div class="kc-fig-n kc-skel-t" id="kc-fig-floor">&nbsp;</div><div class="kc-fig-l" id="kc-fig-floor-l">on the floor</div></div>
      <div class="kc-fig"><div class="kc-fig-n kc-skel-t" id="kc-fig-kiln">&nbsp;</div><div class="kc-fig-l">in the kiln</div></div>`;

    try { if (typeof apiConnected !== 'undefined' && !apiConnected && typeof checkAPIConnection === 'function') await checkAPIConnection(); } catch (e) {}
    const base = (typeof API_URL !== 'undefined') ? API_URL : '';
    const sid = (typeof studioId !== 'undefined') ? studioId : '';

    /* the day — same endpoint the floor plan trusts. When _viewedDate is
       set (via the calendar / arrows) we ask for that exact day; otherwise
       the endpoint decides (today, or the next open day if today is empty). */
    const dateParam = KC._viewedDate ? `&date=${KC._viewedDate}` : '';
    fetch(`${base}/api/floor/active?studioId=${sid}${dateParam}`).then(r => r.json()).then(d => {
      const bs = (d.bookings || []).slice().sort((a, b) => new Date(a.session_start) - new Date(b.session_start));
      const covers = bs.reduce((s, b) => s + (b.party_size || 1), 0);
      const f = $('kc-fig-floor');
      if (f) { f.classList.remove('kc-skel-t'); f.textContent = bs.length; }
      const fl = $('kc-fig-floor-l');
      if (fl) fl.textContent = bs.length === 1 ? 'booking · ' + covers + ' covers' : 'bookings · ' + covers + ' covers';

      // Live per-room tallies for the three studio-space zones. Match each
      // booking's space to a zone; blanks/"Main"/"Family" fall to Main Studio.
      const roomCount = { lounge: 0, main: 0, vault: 0 };
      bs.forEach(b => {
        const sp = (b.room || b.space_name || '').toLowerCase();
        const n = b.party_size || 1;
        if (sp.includes('lounge')) roomCount.lounge += n;
        else if (sp.includes('vault')) roomCount.vault += n;
        else roomCount.main += n; // Main / Family / unspecified
      });
      const setRoom = (id, n) => {
        const el = $(id);
        if (el) el.textContent = n > 0 ? (n + (n === 1 ? ' in' : ' in')) : '';
      };
      setRoom('kc-room-lounge-n', roomCount.lounge);
      setRoom('kc-room-main-n', roomCount.main);
      setRoom('kc-room-vault-n', roomCount.vault);

      // Remember which day is actually on screen so the arrows step from it.
      if (d.showingDate) KC._shownDate = d.showingDate;
      const title = $('kc-day-title');
      if (title && d.showingDate) {
        const dt = new Date(d.showingDate + 'T12:00:00Z');
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
        // How many days from today is the shown date? (for tomorrow / weekday)
        const msPerDay = 86400000;
        const dayDiff = Math.round(
          (new Date(d.showingDate + 'T12:00:00Z') - new Date(today + 'T12:00:00Z')) / msPerDay
        );
        const weekday = dt.toLocaleDateString('en-GB', { weekday: 'long' }).toUpperCase();
        const nice = dt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }).toUpperCase();
        if (d.showingDate === today) {
          title.textContent = "TODAY'S BOOKINGS";
        } else if (dayDiff === 1) {
          // The most common case when today is over/empty — tomorrow.
          title.textContent = "TOMORROW'S BOOKINGS";
        } else if (d.showingDate < today) {
          // A past date the person navigated to — a record of what happened.
          title.textContent = nice;
        } else if (dayDiff >= 2 && dayDiff <= 6) {
          // Later this week — name the day ("THURSDAY'S BOOKINGS").
          title.textContent = weekday + "'S BOOKINGS";
        } else {
          // Further out — show the full date.
          title.textContent = (KC._viewedDate ? '' : 'NEXT BOOKINGS — ') + nice;
        }
      }
      const t = $('kc-timeline');
      if (!t) return;
      t.innerHTML = bs.length ? bs.slice(0, 14).map(b => `
        <button class="kc-slot" onclick="KC.go('floor-plan','showFloorPlan')">
          <span class="kc-slot-t">${b.session_start ? tm(b.session_start) : '—'}</span>
          <span class="kc-slot-dot"></span>
          <span class="kc-slot-body"><b>${b.customer_name || 'Booking'}</b><i>${b.party_size || 1} ${(b.party_size || 1) === 1 ? 'cover' : 'covers'}${b.room ? ' · ' + b.room : (b.space_name ? ' · ' + b.space_name : '')}</i></span>
        </button>`).join('') + (bs.length > 14 ? `<div class="kc-more">+ ${bs.length - 14} more on the floor plan</div>` : '')
        : `<div class="kc-empty">${KC._viewedDate ? 'No bookings on this day.' : 'A quiet book. Perfect day to tidy the glaze shelf.'}</div>`;
    }).catch(() => { const t = $('kc-timeline'); if (t) t.innerHTML = '<div class="kc-empty">Waking the server… pull back to the Desk in a moment.</div>'; });

    /* the kiln — same endpoint the kiln screen trusts */
    fetch(`${base}/api/kiln-batches/active?studioId=${sid}`).then(r => r.json()).then(d => {
      const n = (d.batches || d.data || []).length || 0;
      const k = $('kc-fig-kiln');
      if (k) { k.classList.remove('kc-skel-t'); k.textContent = n; }
    }).catch(() => { const k = $('kc-fig-kiln'); if (k) { k.classList.remove('kc-skel-t'); k.textContent = '—'; } });

    /* the money — directors only, same endpoint Takings trusts */
    if (dir) {
      fetch(`${base}/api/analytics/dashboard?studioId=${sid}&staffMemberId=${(typeof currentShiftStaff !== 'undefined' && currentShiftStaff?.id) || ''}`)
        .then(r => r.json()).then(d => {
          const days = d.revenueByDay || d.dailyRevenue || null;
          let todayV = null;
          const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
          if (Array.isArray(days)) {
            const row = days.find(x => (x.metric_date || x.date) === todayKey);
            if (row) todayV = (row.metric_value?.revenue_cents ?? row.revenue_cents ?? 0) / 100;
          }
          const m = $('kc-fig-money');
          if (m) {
            m.classList.remove('kc-skel-t');
            if (todayV !== null) m.textContent = money(todayV);
            else { m.textContent = money(d.totalRevenue || 0); const l = m.nextElementSibling; if (l) l.textContent = 'last 30 days'; }
          }
        }).catch(() => { const m = $('kc-fig-money'); if (m) { m.classList.remove('kc-skel-t'); m.textContent = '—'; } });
    }
  };

  /* ── take over Home: after the real landOnHome runs, the Desk
        covers it. One wrap, applied at load, only when the flag is
        on — flag off, this whole file already returned above. ──── */
  /* ── crash safety net: if ANYTHING in the Desk throws, at real
        Safari runtime and not just in a headless test, the app must
        NEVER go blank — old tiles stay the fallback, always. Also
        surfaces the real error on-screen (no dev tools needed) so a
        screenshot tells us exactly what broke, same pattern the app
        already uses elsewhere (the 911a7fc on-screen diagnostic). ── */
  KC._fail = function (where, err) {
    try { console.warn('[desk]', where, err); } catch (e) {}
    try {
      document.getElementById('kc-error-banner')?.remove();
      const b = document.createElement('div');
      b.id = 'kc-error-banner';
      b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#7a1f16;color:#fff;font:12px/1.4 -apple-system,sans-serif;padding:10px 14px;padding-top:calc(10px + env(safe-area-inset-top));white-space:pre-wrap;';
      b.textContent = '[Desk] ' + where + ': ' + (err && err.message ? err.message : String(err));
      document.body.appendChild(b);
      setTimeout(() => b.remove(), 12000);
    } catch (e2) {}
    // Whatever happened, make sure the ORIGINAL app is what's on
    // screen — never leave the canvas half-built covering a blank
    // page. kc-desk-ready is never added, so the CSS hiding the old
    // tile home never engages either (see demo-skin.css).
    try { document.getElementById('kc-canvas')?.classList.add('kc-away'); } catch (e3) {}
  };

  // Wrap as EARLY as possible — NOT on window.load. Real bug found
  // from Daisy's report after confirming the exact right commit was
  // live (buildId proved it, ruling out deploy lag): for anyone with
  // an EXISTING session (the common case — she's been testing all
  // night), the app auto-resumes and calls landOnHome() from inside
  // a DOMContentLoaded-era init path, which fires well before the
  // 'load' event (load waits for every image/font/resource). My old
  // wrap installed too late — the resume had already run the
  // ORIGINAL landOnHome and painted tiles before my wrap ever
  // existed. Every one of tonight's headless tests always started
  // from a clean login typed in AFTER the page's own 'load' fired,
  // so this gap was structurally invisible to them, same shape as
  // every other "my test used a different door" bug tonight.
  // demo-skin.js is loaded with `defer`, so this top-level code runs
  // after the DOM is parsed (landOnHome/_flowGraphEnter already exist
  // as globals by then — they're plain function declarations in an
  // earlier synchronous inline <script>) but BEFORE DOMContentLoaded
  // fires — which is before ANY DOMContentLoaded-triggered resume
  // logic can run. This is as early as it is possible to be.
  (function wrapHomeEntries() {
    const wrap = (name) => {
      try {
        if (typeof window[name] !== 'function') return false;
        const orig = window[name];
        window[name] = function () {
          const r = orig.apply(this, arguments);
          const after = () => {
            try {
              if (typeof currentShiftStaff !== 'undefined' && currentShiftStaff) KC.showCanvas();
            } catch (err) { KC._fail('showCanvas via ' + name, err); }
          };
          // landOnHome is async (returns a promise); _flowGraphEnter
          // is synchronous. Handle both correctly rather than
          // assuming either shape.
          if (r && typeof r.then === 'function') r.then(after); else after();
          return r;
        };
        return true;
      } catch (e) { console.warn('[desk] wrap failed for', name, e); return false; }
    };
    if (wrap('landOnHome') && wrap('_flowGraphEnter')) return;
    // Landed here before the target functions existed (shouldn't
    // happen given defer ordering, but never assume) — retry once
    // DOMContentLoaded fires, still ahead of window.load as a
    // fallback rather than silently never wrapping at all.
    document.addEventListener('DOMContentLoaded', () => { wrap('landOnHome'); wrap('_flowGraphEnter'); });
  })();
})();
