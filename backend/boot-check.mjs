// Boots the real Express app against stub env and asserts that every route
// the frontend calls is actually registered.
//
// This is the check that was missing. Twice now a route has vanished --
// /api/spec/schedule/:date, deleted with the table-sync module it happened
// to share a file with -- and neither `node --check` nor a successful Next
// build could see it. Only a real boot and a real route list can.
//
// Run: node boot-check.mjs   (from backend/)
process.env.SUPABASE_URL ||= 'https://stub.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub';
process.env.NODE_ENV = 'test';
process.env.PORT = '0';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const registered = new Set();
const { default: express } = await import('express');

// Capture every path as it registers, then stop the app actually listening.
for (const verb of ['get', 'post', 'put', 'delete', 'patch']) {
  const orig = express.application[verb];
  express.application[verb] = function (p, ...rest) {
    if (typeof p === 'string') registered.add(p);
    return orig.call(this, p, ...rest);
  };
}
express.application.listen = function () { return { close() {}, address() { return { port: 0 }; } }; };

try {
  await import('./server.js');
} catch (e) {
  console.error('BOOT FAILED:', e.message);
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.join(here, '..', 'apps', 'studio');
const calls = new Set();
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.next') continue;
    const f = path.join(d, e.name);
    if (e.isDirectory()) walk(f);
    else if (/\.tsx?$/.test(e.name)) {
      const src = fs.readFileSync(f, 'utf8');
      // Two-step, because template expressions nest brackets --
      // ${encodeURIComponent(x)} -- so a single regex over the raw source
      // stops at the inner bracket and reports a false miss. Collapsing
      // them first was worse: it silently matched NOTHING and the check
      // passed while blind, which is the most dangerous state a test can
      // be in. So: find the call, then normalise what follows.
      for (const m of src.matchAll(/NEXT_PUBLIC_API_URL\}/g)) {
        const tail = src.slice(m.index + m[0].length);
        const end = tail.search(/[`'"]/);
        if (end <= 0) continue;
        let p = tail.slice(0, end);
        if (!p.startsWith('/api/')) continue;
        // Collapse any ${...}, however nested, to a single path segment.
        let prev;
        do { prev = p; p = p.replace(/\$\{[^${}]*\}/g, ':p'); } while (p !== prev);
        p = p.replace(/\$\{.*/, ':p').replace(/\?.*$/, '').replace(/\/$/, '');
        if (p.startsWith('/api/')) calls.add(p);
      }
    }
  }
};
if (fs.existsSync(appDir)) walk(appDir);

const matchers = [...registered].map((r) => new RegExp('^' + r.replace(/:[A-Za-z_]+/g, '[^/]+') + '$'));
const missing = [...calls].filter((c) => !matchers.some((m) => m.test(c.replace(/:p/g, 'X'))));

console.log(`routes registered: ${registered.size}`);
console.log(`frontend calls:    ${calls.size}`);
if (missing.length) {
  console.error('\nMISSING ROUTES — the frontend calls these and nothing serves them:');
  missing.sort().forEach((m) => console.error('  ' + m));
  process.exit(1);
}
console.log('\nOK — every frontend call has a registered route.');
