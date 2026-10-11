import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// [11 Oct] SERVER-SIDE LOCK ON STAFF PAGES.
//
// The PIN gate is client-side: it hides screens, it does not protect them.
// With a URL, anyone could open the owner's numbers. This checks, before a
// staff page is served, that the request carries a shift token signed by
// the server (see shiftToken in the backend), using the same PIN_SECRET.
//
// Public: the customer's own booking page, the membership page, and the
// root, where the PIN pad itself lives. Everything else under the app is
// staff. With no PIN_SECRET set on this service the lock stays off, so a
// half-configured deploy cannot lock everyone out.

const PUBLIC = ['/', '/membership', '/my-booking'];

async function verify(token: string, secret: string): Promise<boolean> {
  const dot = token.lastIndexOf('.');
  if (dot < 1) return false;
  const body = token.slice(0, dot), sig = token.slice(dot + 1);
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(body)));
  let b64 = '';
  for (let i = 0; i < mac.length; i++) b64 += String.fromCharCode(mac[i]);
  const expected = btoa(b64).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return false;
  try {
    const json = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.exp === 'number' && json.exp > Date.now();
  } catch { return false; }
}

export async function middleware(req: NextRequest) {
  const secret = process.env.PIN_SECRET;
  if (!secret) return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (PUBLIC.includes(pathname)) return NextResponse.next();
  const token = req.cookies.get('glazeup_token')?.value;
  if (token && await verify(decodeURIComponent(token), secret)) return NextResponse.next();
  // Not signed in: to the PIN pad, remembering where they were going.
  const url = req.nextUrl.clone();
  url.pathname = '/';
  url.search = pathname !== '/' ? `?next=${encodeURIComponent(pathname + req.nextUrl.search)}` : '';
  return NextResponse.redirect(url);
}

export const config = {
  // Pages only: not Next's own files, not the API, not static assets.
  matcher: ['/((?!_next/|api/|favicon|.*\\..*).*)'],
};
