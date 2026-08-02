// ═══════════════════════════════════════════════════════════════════
// THE MONEY SWITCH. 2 Aug 2026.
//
// Daisy: "strip out all the admin side for now — all the figures, all
// the margins. I don't want any of that showing anywhere in the app.
// Park it. I want to introduce it later as a separate feed."
//
// PARKED, NOT DELETED. Every endpoint, table, page and figure still
// exists and still works — /admin/takings.html, /admin/breakdown.html,
// the margins screens, the revenue sync, the whole 2022-onwards
// history. This flag only decides whether any of it is VISIBLE.
//
// Set to true and it all comes back exactly as it was. That is the
// point of a switch rather than a deletion: bringing it back later as
// a feed should be a decision, not a rebuild.
//
// Loaded before both apps, same pattern as demo-skin-flag.js, so one
// line governs the staff app and the customer app together.
// ═══════════════════════════════════════════════════════════════════
window.MONEY_VISIBLE = false;

// Applied as a class so CSS can hide whole regions without JS having
// to find every element — and so anything added later that is tagged
// financial is hidden automatically rather than needing to be
// remembered.
try {
  if (!window.MONEY_VISIBLE) {
    document.documentElement.classList.add('kc-money-parked');
  }
} catch (e) {}
