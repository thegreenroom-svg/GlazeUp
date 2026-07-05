/**
 * Simple JWT/token verification middleware
 * In production, use proper JWT tokens from Supabase Auth
 */

export async function verifyStudioAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  const studioId = req.params.studioId || req.body.studioId;

  if (!token || !studioId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // TODO: verify JWT token against Supabase
  // For now, just pass through
  req.studioId = studioId;
  next();
}

export default verifyStudioAuth;
