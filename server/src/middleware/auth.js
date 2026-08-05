import { verifyAccessToken } from '../lib/tokens.js';
import { User } from '../models/User.js';
import { Artist } from '../models/Artist.js';
import { ApiError } from './error.js';

function bearer(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

/** Populates req.user. Throws 401 when the token is missing or bad. */
export async function requireAuth(req, _res, next) {
  try {
    const token = bearer(req);
    if (!token) throw new ApiError(401, 'Sign in to continue');

    let claims;
    try {
      claims = verifyAccessToken(token);
    } catch (err) {
      throw new ApiError(401, err.name === 'TokenExpiredError' ? 'Session expired' : 'Invalid session');
    }

    const user = await User.findById(claims.sub);
    if (!user || !user.active) throw new ApiError(401, 'Account is not active');

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** Route guard: requireRole('artist', 'admin') */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new ApiError(401, 'Sign in to continue'));
    if (!roles.includes(req.user.role)) return next(new ApiError(403, 'Not allowed'));
    return next();
  };
}

/** Loads req.artist for the signed-in artist. Admins pass through without one. */
export async function attachArtist(req, _res, next) {
  try {
    if (req.user?.role === 'artist') {
      req.artist = await Artist.findOne({ user: req.user._id });
      if (!req.artist) throw new ApiError(403, 'No artist profile is linked to this account');
    }
    next();
  } catch (err) {
    next(err);
  }
}

/** Optional auth — used by catalogue routes that personalise when signed in. */
export async function maybeAuth(req, _res, next) {
  const token = bearer(req);
  if (!token) return next();
  try {
    const claims = verifyAccessToken(token);
    req.user = await User.findById(claims.sub);
  } catch {
    /* An expired token on a public route is not an error — carry on anonymous. */
  }
  return next();
}
