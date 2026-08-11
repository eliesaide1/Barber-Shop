import crypto from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ApiError } from '../middleware/error.js';

/**
 * Signing in with Google or Apple.
 *
 * ── Why the provider is not the identity ─────────────────────────────────────
 *
 * The app already has Firebase, and Firebase Auth would do all of this. It is
 * still the wrong tool here: this shop has its own `User` collection that every
 * appointment, order and loyalty card points at by `_id`, its own JWTs, its own
 * refresh-token versioning. Handing identity to Firebase would mean migrating
 * all of that, and making a third party a hard dependency of *logging in* —
 * where today it is an optional transport for push that the whole app runs fine
 * without.
 *
 * So the provider is only ever asked one question: *is this really who they say
 * they are?* The answer is a verified email and a stable subject id, and from
 * there the shop's own account system takes over. Google and Apple become extra
 * doors into the same building rather than a new building.
 *
 * ── What "verified" has to mean ──────────────────────────────────────────────
 *
 * The token is checked against the provider's own public keys, and the audience
 * is checked against our client ids. Skipping the audience check is the classic
 * hole: a token minted for *any other app* would otherwise be accepted here, and
 * anyone with an app of their own could sign in as anybody.
 */

/** Google's own verifier handles key fetching, caching and rotation. */
let googleClient = null;
const google = () => (googleClient ??= new OAuth2Client());

/**
 * Apple's public keys.
 *
 * Fetched here rather than through a JWKS library: `jwks-rsa` depends on a
 * `jose` that is ESM-only and cannot be required from it, and the whole job is
 * one fetch plus `createPublicKey({ format: 'jwk' })`, which Node does natively.
 * One less dependency in the path of signing in.
 */
/* Read per call rather than at load, so the test suite can stand up its own key
   server on whatever port it is given and still exercise the real signature,
   issuer and audience checks instead of stubbing them out. */
const appleKeysUrl = () => process.env.APPLE_KEYS_URL || 'https://appleid.apple.com/auth/keys';
const APPLE_KEY_TTL = 24 * 60 * 60 * 1000;
/* Apple rotates keys, so an unrecognised `kid` is a reason to refetch — but
   only once in a while, or an invalid token could be used to make us hammer
   Apple on every request. */
const APPLE_REFETCH_FLOOR = 60_000;

let appleKeys = { keys: [], fetchedAt: 0 };

async function appleSigningKey(kid) {
  const stale = Date.now() - appleKeys.fetchedAt > APPLE_KEY_TTL;
  const unknown = !appleKeys.keys.some((k) => k.kid === kid);
  const mayRefetch = Date.now() - appleKeys.fetchedAt > APPLE_REFETCH_FLOOR;

  if (stale || (unknown && mayRefetch)) {
    const res = await fetch(appleKeysUrl());
    if (!res.ok) throw new Error(`Apple keys returned ${res.status}`);
    const body = await res.json();
    appleKeys = { keys: body.keys ?? [], fetchedAt: Date.now() };
  }

  const jwk = appleKeys.keys.find((k) => k.kid === kid);
  if (!jwk) throw new Error('no matching Apple signing key');
  return crypto.createPublicKey({ key: jwk, format: 'jwk' });
}

export const providerConfigured = (provider) =>
  provider === 'google' ? env.googleClientIds.length > 0 : env.appleClientIds.length > 0;

/**
 * @returns {{provider: string, subject: string, email: string, emailVerified: boolean, name: string}}
 */
export async function verifyIdentityToken(provider, idToken) {
  if (!providerConfigured(provider)) {
    throw new ApiError(
      501,
      `Signing in with ${provider === 'google' ? 'Google' : 'Apple'} is not set up for this shop yet`,
    );
  }
  return provider === 'google' ? verifyGoogle(idToken) : verifyApple(idToken);
}

async function verifyGoogle(idToken) {
  let payload;
  try {
    const ticket = await google().verifyIdToken({
      idToken,
      /* Every client id we ship — web, Android, iOS. A token minted for another
         app fails here, which is the whole point of the check. */
      audience: env.googleClientIds,
    });
    payload = ticket.getPayload();
  } catch {
    throw new ApiError(401, 'Google could not confirm that sign-in — try again');
  }

  if (!payload?.sub) throw new ApiError(401, 'Google returned an account we cannot read');

  return {
    provider: 'google',
    subject: payload.sub,
    email: (payload.email ?? '').toLowerCase(),
    emailVerified: Boolean(payload.email_verified),
    name: payload.name ?? '',
  };
}

async function verifyApple(idToken) {
  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded?.header?.kid) throw new ApiError(401, 'That Apple sign-in could not be read');

  let key;
  try {
    key = await appleSigningKey(decoded.header.kid);
  } catch {
    throw new ApiError(401, 'Apple could not confirm that sign-in — try again');
  }

  let payload;
  try {
    payload = jwt.verify(idToken, key, {
      algorithms: ['RS256'],
      issuer: 'https://appleid.apple.com',
      audience: env.appleClientIds,
    });
  } catch {
    throw new ApiError(401, 'Apple could not confirm that sign-in — try again');
  }

  if (!payload?.sub) throw new ApiError(401, 'Apple returned an account we cannot read');

  return {
    provider: 'apple',
    subject: payload.sub,
    email: (payload.email ?? '').toLowerCase(),
    /* Apple sends this as a string on some flows and a boolean on others.
       A private relay address is verified by construction — Apple owns it. */
    emailVerified: payload.email_verified === true || payload.email_verified === 'true',
    /* Apple gives the name once, at the very first authorisation, and never
       again — so it arrives from the app rather than from the token. */
    name: '',
  };
}
