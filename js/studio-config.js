/**
 * GlazeUp · Studio Configuration
 *
 * Loads white-label branding for the current studio.
 * Works in two modes:
 *   1. Standalone (demo) — uses the config object below
 *   2. Live — fetches from Supabase by studio slug
 *
 * To demo with different branding, edit DEMO_CONFIG below.
 */

// ── Demo configuration (used when no Supabase is connected) ──
const DEMO_CONFIG = {
  studio: {
    slug: 'the-kiln-cafe',
    name: 'The Kiln Cafe',
    tagline: 'Paint · Glaze · Create',
    footer: 'The Kiln Cafe · The Old Bank · Langport · Somerset · TA10 9PD',
    website: 'https://thekilncafe.com'
  },
  branding: {
    primaryColour: '#b03a2e',
    secondaryColour: '#faf4ef',
    accentColour: '#7a3a2e',
    textColour: '#3d1c12',
    fontDisplay: 'Georgia, serif',
    fontBody: 'system-ui, -apple-system, sans-serif',
    logoUrl: null  // Set to a URL or leave null for text-only header
  }
};

// ── Supabase config (fill in when ready) ──
const SUPABASE_URL = '';   // e.g. 'https://xxxxx.supabase.co'
const SUPABASE_KEY = '';   // your anon/public key

/**
 * Detect studio slug from URL
 * Supports: studio-slug.glazeup.app OR glazeup.app/s/studio-slug OR ?studio=slug
 */
function detectStudioSlug() {
  // Subdomain: the-kiln-cafe.glazeup.app
  const host = window.location.hostname;
  const parts = host.split('.');
  if (parts.length >= 3 && parts[1] === 'glazeup') {
    return parts[0];
  }
  // Path: /s/the-kiln-cafe
  const pathMatch = window.location.pathname.match(/^\/s\/([a-z0-9-]+)/);
  if (pathMatch) return pathMatch[1];
  // Query: ?studio=the-kiln-cafe
  const params = new URLSearchParams(window.location.search);
  if (params.has('studio')) return params.get('studio');
  // Default
  return 'demo';
}

/**
 * Load studio configuration
 * Returns the config object and applies CSS custom properties
 */
async function loadStudioConfig() {
  const slug = detectStudioSlug();
  let config;

  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      config = await fetchFromSupabase(slug);
    } catch (e) {
      console.warn('Supabase fetch failed, using demo config:', e);
      config = DEMO_CONFIG;
    }
  } else {
    config = DEMO_CONFIG;
  }

  applyBranding(config.branding);
  applyStudioInfo(config.studio);

  return config;
}

/**
 * Fetch studio config from Supabase
 */
async function fetchFromSupabase(slug) {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  const { data: studio, error: sErr } = await supabase
    .from('studios')
    .select('*, studio_branding(*)')
    .eq('slug', slug)
    .single();

  if (sErr || !studio) throw new Error('Studio not found: ' + slug);

  const branding = studio.studio_branding || {};
  return {
    studio: {
      id: studio.id,
      slug: studio.slug,
      name: studio.name,
      tagline: branding.tagline || 'Paint · Glaze · Create',
      footer: branding.footer_text || studio.name,
      website: studio.website
    },
    branding: {
      primaryColour: branding.primary_colour || '#b03a2e',
      secondaryColour: branding.secondary_colour || '#faf4ef',
      accentColour: branding.accent_colour || '#7a3a2e',
      textColour: branding.text_colour || '#3d1c12',
      fontDisplay: branding.font_display || 'Georgia, serif',
      fontBody: branding.font_body || 'system-ui, sans-serif',
      logoUrl: branding.logo_url
    },
    supabase
  };
}

/**
 * Apply branding colours as CSS custom properties
 */
function applyBranding(b) {
  const r = document.documentElement.style;
  r.setProperty('--gu-primary', b.primaryColour);
  r.setProperty('--gu-secondary', b.secondaryColour);
  r.setProperty('--gu-accent', b.accentColour);
  r.setProperty('--gu-text', b.textColour);
  r.setProperty('--gu-font-display', b.fontDisplay);
  r.setProperty('--gu-font-body', b.fontBody);

  // Derived colours
  r.setProperty('--gu-primary-light', b.primaryColour + '18');
  r.setProperty('--gu-border', adjustAlpha(b.accentColour, 0.25));
  r.setProperty('--gu-muted', adjustAlpha(b.textColour, 0.5));

  // Meta theme colour
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
  meta.content = b.primaryColour;
}

/**
 * Populate studio name, logo, tagline in the header
 */
function applyStudioInfo(s) {
  const nameEl = document.getElementById('studio-name');
  const taglineEl = document.getElementById('studio-tagline');
  const logoEl = document.getElementById('studio-logo');
  const footerEl = document.getElementById('studio-footer');

  if (nameEl) nameEl.textContent = s.name;
  if (taglineEl) taglineEl.textContent = s.tagline;
  if (footerEl) footerEl.textContent = s.footer;

  if (logoEl && s.logoUrl) {
    logoEl.src = s.logoUrl;
    logoEl.style.display = 'block';
  }
}

/** Utility: hex to rgba */
function adjustAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export { loadStudioConfig, detectStudioSlug, DEMO_CONFIG };
