#!/usr/bin/env node
/**
 * check.js — the check that would have caught today's bugs.
 *
 * node --check only parses. It cannot see a function deleted while its
 * caller remains, a variable that vanished when a later edit overwrote
 * an earlier one, a route registered twice, or a field the server stops
 * sending while the client still reads it. Every one of those shipped
 * today and was found by Daisy trying to use the app.
 *
 * Run: node check.js
 * Exits non-zero if anything is wrong, so it can gate a push.
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const HTML = ['admin/dashboard-local.html', 'admin/packing.html', 'admin/takings.html', 'admin/breakdown.html', 'admin/bookings.html', 'admin/prices.html', 'admin/order.html',
              'admin/match-test.html', 'app/index.html'];
const JS = ['server.js', 'demo-skin.js', 'shelf-matcher.js'];

let problems = [], warnings = [], checked = 0;
const fail = (m) => problems.push(m);
const warn = (m) => warnings.push(m);

const read = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return null; } };

// Inline scripts from an HTML file, concatenated.
function inlineJs(html) {
  let out = '';
  const re = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) out += m[1] + '\n;\n';
  return out;
}

// ── 1. SYNTAX ───────────────────────────────────────────────────────
const { execSync } = require('child_process');
function syntax(name, code) {
  const tmp = `/tmp/_chk_${Math.random().toString(36).slice(2)}.js`;
  fs.writeFileSync(tmp, code);
  try { execSync(`node --check ${tmp}`, { stdio: 'pipe' }); }
  catch (e) { fail(`${name}: syntax — ${String(e.stderr).split('\n')[1] || ''}`); }
  finally { fs.unlinkSync(tmp); }
}

// ── 2. NAMES USED BUT NEVER DEFINED ─────────────────────────────────
// The 'backed is not defined' and 'lastDiag' class. Deliberately
// conservative: only flags identifiers that look like our own
// (kc/tb/_ prefixes or camelCase we declared elsewhere in the file),
// so it doesn't drown in browser globals.
const BUILTIN = new Set(`
window document console navigator location fetch Promise Array Object String Number Boolean
Math JSON Date RegExp Error Map Set WeakMap Symbol Image FileReader Blob File FormData Event
setTimeout setInterval clearTimeout clearInterval requestAnimationFrame cancelAnimationFrame
alert confirm prompt localStorage sessionStorage encodeURIComponent decodeURIComponent
parseInt parseFloat isNaN isFinite URL URLSearchParams AbortController MutationObserver
createImageBitmap devicePixelRatio getComputedStyle IntersectionObserver ResizeObserver
setImmediate queueMicrotask ArrayBuffer Uint8Array Uint8ClampedArray Int8Array Float32Array
BigInt Proxy Reflect TextEncoder TextDecoder AbortSignal Response Request Headers
async await atob btoa performance crypto
require module exports process Buffer __dirname __filename global structuredClone
undefined null true false NaN Infinity this arguments cv Tesseract THREE
`.trim().split(/\s+/));

function definedNames(code) {
  const d = new Set();
  for (const m of code.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)/g)) d.add(m[1]);
  for (const m of code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) d.add(m[1]);
  // destructuring: const { a, b } = ...
  for (const m of code.matchAll(/\b(?:const|let|var)\s*\{([^}]+)\}/g))
    for (const part of m[1].split(',')) {
      const n = part.split(':').pop().trim().split('=')[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(n)) d.add(n);
    }
  for (const m of code.matchAll(/\b(?:const|let|var)\s*\[([^\]]+)\]/g))
    for (const part of m[1].split(',')) {
      const n = part.trim().split('=')[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(n)) d.add(n);
    }
  for (const m of code.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)) d.add(m[1]);
  // parameters
  for (const m of code.matchAll(/(?:function\s*[\w$]*\s*|\(\s*)\(([^)]*)\)\s*(?:=>|\{)/g))
    for (const part of m[1].split(',')) {
      const n = part.trim().split('=')[0].trim().replace(/^\.\.\./, '');
      if (/^[A-Za-z_$][\w$]*$/.test(n)) d.add(n);
    }
  for (const m of code.matchAll(/([A-Za-z_$][\w$]*)\s*=>/g)) d.add(m[1]);
  for (const m of code.matchAll(/\bcatch\s*\(\s*([A-Za-z_$][\w$]*)/g)) d.add(m[1]);
  for (const m of code.matchAll(/\bclass\s+([A-Za-z_$][\w$]*)/g)) d.add(m[1]);
  for (const m of code.matchAll(/\bfor\s*\(\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) d.add(m[1]);
  // Object-literal shorthand methods: `_renderBanner() { … }` — these
  // are real definitions and were being reported as missing.
  for (const m of code.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm)) d.add(m[1]);
  // Guarded optional calls: `if (typeof openTour === 'function')` is a
  // deliberate cross-file hook, not a fault.
  for (const m of code.matchAll(/typeof\s+([A-Za-z_$][\w$]*)\s*[=!]==?\s*['"]function['"]/g)) d.add(m[1]);
  return d;
}

// Called as a function, not preceded by a dot.
function calledNames(code) {
  const c = new Map();
  // Strip comments AND string/template literals before scanning. Words
  // inside them are prose, not calls — 'missing after build()' in an
  // error message and 'customers have painted' in a prompt were both
  // reported as undefined functions.
  const stripped = code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    // Regex literals: /\bthere(?:'ll| will)/ read as a call to there().
    // Matched only where a regex can legally start, so division isn't
    // mistaken for one.
    .replace(/(^|[=(,:;&|!?{}\[\]\n]\s*)\/(?![*\/])(?:[^\/\\\n]|\\.)+\/[gimsuy]*/g, '$1/RE/')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
  for (const m of stripped.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
    const n = m[1];
    if (BUILTIN.has(n)) continue;
    if (/^(if|for|while|switch|catch|return|typeof|new|function|await|async|else|do|throw|delete|void|in|of|case|yield)$/.test(n)) continue;
    c.set(n, (c.get(n) || 0) + 1);
  }
  return c;
}

// Node files get NO name filter: there are few ambient globals, so
// anything called and not defined is worth reporting. Browser files
// keep a prefix filter, otherwise every DOM and library global would
// be reported.
//
// [25 Jul] This filter is why 'chunkedBackfill is not defined' reached
// the live server minutes after the checker was written to catch
// exactly that. The name did not match the prefix list, so it was
// skipped. A checker that only looks where it expects trouble is not a
// checker.
const BROWSER_PREFIX = /^(_|kc|tb|open|load|render|draw|say|show|close|paint|assign|find|describe|shrink|gridded|cell|pick|money|nice|esc|words|weight|similarity|build|sort|gaps|edit|mark|zoom|sweep|match|apply|check|sync|chunk|handle|update|get|set|is|has|to|fmt|format)/i;

// [2 Aug] SCREAMING_CASE identifiers used but never declared. Caught a
// live one the moment it was written: SQUARE_ENVIRONMENT referenced
// bare in a new endpoint when every other call site correctly uses
// process.env.SQUARE_ENVIRONMENT. checkNames only looks at things
// CALLED as functions, so a plain variable reference slipped straight
// past it — and a ReferenceError inside a try/catch would have
// surfaced as a vague "sync failed" rather than the real cause.
function checkConstants(name, code, isNode) {
  if (!isNode) return;
  const declared = new Set();
  for (const m of code.matchAll(/(?:const|let|var)\s+([A-Z][A-Z0-9_]{2,})/g)) declared.add(m[1]);
  for (const m of code.matchAll(/process\.env\.([A-Z][A-Z0-9_]{2,})/g)) declared.add(m[1]);
  const stripped = code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
  // Object-literal keys (MIN_TRANSITIONS: 12) declare a property, not a
  // variable — and LEARN.MIN_TRANSITIONS reads one. Neither is an
  // undeclared identifier; both were reported as such on first run.
  for (const m of code.matchAll(/([A-Z][A-Z0-9_]{2,})\s*:/g)) declared.add(m[1]);
  const missing = new Set();
  for (const m of stripped.matchAll(/(?<![.\w$])([A-Z][A-Z0-9_]{2,})(?![\w$])/g)) {
    const n = m[1];
    if (declared.has(n) || BUILTIN.has(n)) continue;
    if (/^(GET|POST|PUT|DELETE|PATCH|OK|JSON|URL|UTC|API|SQL|HTML|CSS|ID|UUID|NULL|TRUE|FALSE|AND|OR|NOT|SELECT|FROM|WHERE|ERROR|WARN|INFO)$/.test(n)) continue;
    missing.add(n);
  }
  if (missing.size) fail(`${name}: SCREAMING_CASE used but never declared — ${[...missing].join(', ')}`);
}

function checkNames(name, code, isNode) {
  const def = definedNames(code);
  const missing = [];
  for (const [n, count] of calledNames(code)) {
    if (def.has(n)) continue;
    if (BUILTIN.has(n)) continue;
    if (isNode || BROWSER_PREFIX.test(n)) missing.push(`${n}() ×${count}`);
  }
  if (missing.length) fail(`${name}: called but never defined — ${missing.join(', ')}`);
}

// ── 3. DUPLICATE EXPRESS ROUTES ─────────────────────────────────────
// Express matches the first registration; a second is dead and silent.
function checkRoutes(server) {
  const seen = new Map();
  for (const m of server.matchAll(/app\.(get|post|put|delete|patch)\(\s*'([^']+)'/g)) {
    const key = `${m[1].toUpperCase()} ${m[2]}`;
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  for (const [k, n] of seen) if (n > 1) fail(`server.js: route registered ${n}× — ${k} (only the first is reachable)`);
  return new Set([...seen.keys()].map(k => k.split(' ')[1]));
}

// ── 4. CLIENT CALLS A ROUTE THAT DOESN'T EXIST ──────────────────────
function checkEndpoints(name, code, routes) {
  const called = new Set();
  for (const m of code.matchAll(/['"`](?:\$\{[^}]*\})?(\/api\/[A-Za-z0-9_\-\/]*)/g)) called.add(m[1]);
  const missing = [];
  for (const c of called) {
    if (c.endsWith('/')) continue;
    let ok = false;
    for (const r of routes) {
      if (r === c) { ok = true; break; }
      const pat = '^' + r.replace(/:[^/]+/g, '[^/]+') + '$';
      if (new RegExp(pat).test(c)) { ok = true; break; }
      // client built the path with a template var mid-string
      if (c.startsWith(r.split('/:')[0]) && r.includes('/:')) { ok = true; break; }
    }
    if (!ok) missing.push(c);
  }
  if (missing.length) warn(`${name}: calls endpoints with no obvious route — ${missing.join(', ')}`);
}

// ── 5. AI / ENGINE WIRING ───────────────────────────────────────────
function checkAI(server, packing) {
  const need = [
    ['OPENAI_API_KEY', /process\.env\.OPENAI_API_KEY/],
    ['describeImage()', /async function describeImage/],
    ['describe-group route', /app\.post\('\/api\/pieces\/describe-group'/],
    ['describe-shelf route', /app\.post\('\/api\/pieces\/describe-shelf'/],
    ['find-listed route', /app\.post\('\/api\/packing\/find-listed'/],
    ['usage logging', /async function logUsage/],
    ['ai-usage route', /app\.get\('\/api\/ai-usage'/],
    ['takings route', /app\.get\('\/api\/takings\/history'/],
    ['group photo route', /app\.post\('\/api\/pieces\/save-group-photo'/],
  ];
  for (const [what, re] of need) if (!re.test(server)) fail(`server.js: AI/engine wiring missing — ${what}`);

  const clientNeed = [
    ['sends gridded photo', /gridded\(rawPhoto/],
    ['reads cell', /cell: f\.cell/],
    ['draws from cell', /cellToPoint\(m\.cell\)/],
    ['shows group photo', /showLookFor/],
  ];
  for (const [what, re] of clientNeed) if (!re.test(packing)) fail(`packing.html: ${what} — MISSING`);

  // both result paths must carry the cell, or one of them silently
  // loses the circles (exactly what happened to the test bed)
  const pushes = [...packing.matchAll(/rings\.push\(\{([^}]*)\}/g)].map(m => m[1]);
  pushes.forEach((p, i) => {
    if (!/cell/.test(p)) fail(`packing.html: rings.push #${i + 1} does not pass 'cell' — that path will never draw a circle`);
    if (/\bx:|\by:/.test(p)) fail(`packing.html: rings.push #${i + 1} still passes x/y — stale coordinate version`);
  });
  if (pushes.length < 2) warn(`packing.html: expected 2 rings.push (sweep + test bed), found ${pushes.length}`);
}

// ── 6. DATA READS ───────────────────────────────────────────────────
function checkDataReads(server) {
  // Every piece query that feeds packing must exclude archived rows,
  // or deleted test data comes back to haunt a sweep.
  const queueBlock = server.match(/app\.get\('\/api\/packing\/queue'[\s\S]{0,1500}/);
  if (queueBlock) {
    if (!/archived/.test(queueBlock[0])) fail(`server.js: /api/packing/queue does not filter archived pieces`);
    if (!/select\('\*'\)|description/.test(queueBlock[0])) warn(`server.js: /api/packing/queue may not return description`);
  } else warn('server.js: could not locate /api/packing/queue to verify');
}

// ── RUN ─────────────────────────────────────────────────────────────
console.log('Checking every app…\n');

const server = read('server.js');
if (!server) { fail('server.js missing'); }
const routes = server ? checkRoutes(server) : new Set();

// demo-skin.js runs inside dashboard-local.html and legitimately calls
// functions defined there, so the pair is name-checked together.
const dashForPair = read('admin/dashboard-local.html');
const dashJs = dashForPair ? inlineJs(dashForPair) : '';
for (const f of JS) {
  const code = read(f);
  if (!code) { warn(`${f}: not found`); continue; }
  checked++;
  syntax(f, code);
  checkNames(f, f === 'demo-skin.js' ? code + '\n;\n' + dashJs : code, f === 'server.js' || f === 'shelf-matcher.js');
  checkConstants(f, code, f === 'server.js' || f === 'shelf-matcher.js');
  if (f !== 'server.js') checkEndpoints(f, code, routes);
}

const htmlCode = {};
for (const f of HTML) {
  const html = read(f);
  if (!html) { warn(`${f}: not found`); continue; }
  checked++;
  const code = inlineJs(html);
  htmlCode[f] = code;
  syntax(f, code);
  checkNames(f, code);
  checkEndpoints(f, code, routes);
  const so = (html.match(/<style[^>]*>/g) || []).length;
  const sc = (html.match(/<\/style>/g) || []).length;
  if (so !== sc) fail(`${f}: ${so} <style> vs ${sc} </style>`);
  // every inline onclick must resolve
  const def = definedNames(code);
  const dead = new Set();
  for (const m of html.matchAll(/onclick\s*=\s*["']([^"']*)["']/g))
    for (const c of m[1].matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g))
      if (!def.has(c[1]) && !BUILTIN.has(c[1]) &&
          !/^(if|for|while|return|typeof|new|function)$/.test(c[1])) dead.add(c[1]);
  if (dead.size) fail(`${f}: onclick calls undefined — ${[...dead].join(', ')}`);
}

if (server && htmlCode['admin/packing.html']) {
  checkAI(server, htmlCode['admin/packing.html']);
  checkDataReads(server);
}

console.log(`${checked} files checked, ${routes.size} server routes.\n`);
if (warnings.length) { console.log('WARNINGS'); warnings.forEach(w => console.log('  ~ ' + w)); console.log(''); }
if (problems.length) {
  console.log('PROBLEMS');
  problems.forEach(p => console.log('  ✗ ' + p));
  console.log(`\n${problems.length} problem(s). Do not push.`);
  process.exit(1);
}
console.log('✓ No problems found.');
