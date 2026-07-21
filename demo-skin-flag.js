// ═══════════════════════════════════════════════════════════════════
// THE ONE SWITCH. 21 Jul 2026, per the radical-demo brief: "everything
// behind ONE feature flag so the entire redesign reverts with a single
// switch at commercialisation."
//
// true  -> both apps wear the radical Kiln Cafe demo skin
// false -> both apps render exactly as before, byte-for-byte behaviour
//
// This file is included by admin/dashboard-local.html AND app/index.html,
// so this single line governs both apps at once. Everything the skin
// does lives in css/demo-skin.css scoped under html.demo-skin — no
// business logic anywhere is conditional on this flag.
// ═══════════════════════════════════════════════════════════════════
window.DEMO_SKIN = true;
