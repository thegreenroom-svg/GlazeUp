// [9 Oct] Which version of the app is deployed right now. Read at run time
// (not inlined at build), so a page loaded before a deploy can tell it is
// out of date. Render sets RENDER_GIT_COMMIT for every deploy.
export const dynamic = 'force-dynamic';

export function GET() {
  const build = process.env['RENDER_GIT_COMMIT'] || null;
  return Response.json({ build }, { headers: { 'Cache-Control': 'no-store' } });
}
