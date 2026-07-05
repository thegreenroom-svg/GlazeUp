import express from 'express';

const router = express.Router();

/**
 * POST /api/auth/signup
 * Create a new studio account
 */
router.post('/signup', async (req, res) => {
  const { studioName, studioSlug, email, phone } = req.body;
  const supabase = req.app.locals.supabase;

  if (!studioName || !studioSlug || !email) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Check slug is unique
    const { data: existing } = await supabase
      .from('studios')
      .select('id')
      .eq('slug', studioSlug.toLowerCase())
      .single();

    if (existing) {
      return res.status(409).json({ error: 'Studio slug already taken' });
    }

    // Create studio
    const { data: studio, error } = await supabase
      .from('studios')
      .insert({
        name: studioName,
        slug: studioSlug.toLowerCase(),
        email,
        phone
      })
      .select()
      .single();

    if (error) throw error;

    // Create default branding
    await supabase
      .from('studio_branding')
      .insert({
        studio_id: studio.id,
        primary_colour: '#b03a2e',
        secondary_colour: '#faf4ef',
        accent_colour: '#7a3a2e',
        text_colour: '#3d1c12'
      });

    // Create default glaze palette
    const { data: palette } = await supabase
      .from('glaze_palettes')
      .insert({
        studio_id: studio.id,
        name: 'Default',
        brand: 'Stroke & Coat',
        is_default: true
      })
      .select()
      .single();

    // TODO: Insert default Stroke & Coat colours

    res.status(201).json({
      studioId: studio.id,
      slug: studio.slug,
      message: 'Studio created successfully'
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/studio-exists
 * Check if a studio slug is available
 */
router.post('/studio-exists', async (req, res) => {
  const { slug } = req.body;
  const supabase = req.app.locals.supabase;

  if (!slug) {
    return res.status(400).json({ error: 'Slug required' });
  }

  const { data, error } = await supabase
    .from('studios')
    .select('id')
    .eq('slug', slug.toLowerCase())
    .single();

  if (error) {
    return res.json({ available: true });
  }

  res.json({ available: !data });
});

/**
 * GET /api/auth/studio/:slug
 * Get public studio info (for loading correct branding on customer app)
 */
router.get('/studio/:slug', async (req, res) => {
  const { slug } = req.params;
  const supabase = req.app.locals.supabase;

  const { data: studio, error } = await supabase
    .from('studios')
    .select(`
      id,
      name,
      slug,
      tagline: studio_branding(primary_colour, secondary_colour, accent_colour, text_colour, font_display, font_body),
      branding: studio_branding(*)
    `)
    .eq('slug', slug.toLowerCase())
    .single();

  if (error || !studio) {
    return res.status(404).json({ error: 'Studio not found' });
  }

  res.json(studio);
});

export default router;
