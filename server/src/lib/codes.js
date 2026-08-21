import crypto from 'node:crypto';
import { env } from '../config/env.js';

/* Six readable characters, derived from a real HMAC-SHA256 over the shop
   secret. The prototype used a 32-bit FNV hash with the secret shipped in the
   client bundle; here the secret never leaves the server and the client only
   ever sees the digest.

   Ambiguous glyphs (0/O, 1/I) are dropped so a code read aloud at the chair
   or typed off a screen can't land on the wrong character. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function sign(payload, length = 6) {
  const mac = crypto.createHmac('sha256', env.shopSecret).update(payload).digest();
  let out = '';
  for (let i = 0; i < length; i += 1) out += ALPHABET[mac[i] % ALPHABET.length];
  return out;
}

/* Constant-time compare so a caller can't learn a code character by character
   from response timing. */
export function safeEqual(a, b) {
  const bufA = Buffer.from(String(a ?? ''));
  const bufB = Buffer.from(String(b ?? ''));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/* ---------- rotating check-in token ----------
   The artist's screen shows this; it changes every CHECKIN_WINDOW_MS, so a
   photograph of it is worthless a minute later and a scan proves the client
   was physically at the chair. */
export const checkinWindow = (at = Date.now()) => Math.floor(at / env.checkinWindowMs);

export const checkinSignature = (artistId, window) => sign(`C|${artistId}|${window}`);

export const checkinToken = (artistId, window = checkinWindow()) =>
  `FR1|C|${artistId}|${window}|${checkinSignature(artistId, window)}`;

export function checkinExpiresIn(at = Date.now()) {
  return env.checkinWindowMs - (at % env.checkinWindowMs);
}

/**
 * Accepts either a full scanned token or the 6-character code read out loud.
 * The previous window is honoured too, so a scan that lands a moment after the
 * code rotates still counts.
 *
 * @returns {{ok: true, artistId: string} | {ok: false, reason: string}}
 */
export function verifyCheckin(raw, artistIds) {
  const value = String(raw ?? '').trim();
  if (!value) return { ok: false, reason: 'Enter the code under your artist’s QR' };

  const now = checkinWindow();
  const windows = [now, now - 1];
  const parts = value.split('|');

  if (parts.length === 5 && parts[0] === 'FR1' && parts[1] === 'C') {
    const [, , artistId, windowRaw, signature] = parts;
    const window = Number(windowRaw);
    if (!windows.includes(window)) {
      return { ok: false, reason: 'That code expired — ask for a fresh one' };
    }
    if (!safeEqual(signature, checkinSignature(artistId, window))) {
      return { ok: false, reason: 'That code isn’t from VIA Barber House' };
    }
    return { ok: true, artistId };
  }

  /* Typed fallback: try every active artist against both live windows. */
  const typed = value.toUpperCase();
  for (const window of windows) {
    for (const artistId of artistIds) {
      if (safeEqual(typed, checkinSignature(artistId, window))) return { ok: true, artistId };
    }
  }
  return { ok: false, reason: 'Code not recognised — check it and retry' };
}

/* ---------- order & reward codes ----------
   Salted with a random nonce so they are unguessable, then checked for
   uniqueness by the caller against the collection's unique index. */
export const orderCode = () => sign(`O|${crypto.randomUUID()}`);
export const rewardCode = (userId) => sign(`R|${userId}|${crypto.randomUUID()}`);

export const rewardToken = (code) => `FR1|R|${code}`;
export const orderToken = (code) => `FR1|O|${code}`;

/* Pulls the bare code out of a scanned token, or returns the input trimmed. */
export function readCode(raw, kind) {
  const value = String(raw ?? '').trim().toUpperCase();
  const prefix = `FR1|${kind}|`;
  if (value.startsWith(prefix)) return value.slice(prefix.length).split('|')[0];
  return value;
}
