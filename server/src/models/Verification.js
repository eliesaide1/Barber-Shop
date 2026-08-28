import mongoose from 'mongoose';
import crypto from 'node:crypto';

/**
 * A code sent to somebody, waiting to be typed back.
 *
 * `target` is a mobile number in dialled digits or an email in lower case —
 * whichever channel the shop asks on — normalised before it gets here so the
 * same person typed three ways is one row rather than three.
 *
 * One row per target, replaced on each new request rather than accumulated:
 * asking again means the first code is no longer wanted, and leaving it valid
 * would mean two live codes for one number and twice the surface to guess at.
 *
 * ── The code is stored hashed ────────────────────────────────────────────────
 *
 * It is a credential for the few minutes it lives — it is the only thing
 * standing between somebody and an account on a number they do not own — and a
 * database dump should not hand over the ones currently in flight. Hashed with
 * SHA-256 rather than bcrypt on purpose: six digits has so little entropy that
 * a slow hash buys nothing an attacker with the dump could not brute-force
 * offline in seconds regardless. What actually protects it is the attempt
 * limit, the expiry, and the fact that it is gone the moment it is used.
 */
const verificationSchema = new mongoose.Schema(
  {
    channel: { type: String, enum: ['whatsapp', 'email'], required: true },
    target: { type: String, required: true, unique: true, index: true },
    codeHash: { type: String, required: true },

    /* Wrong guesses against this code. The row dies at the limit rather than
       throttling, because a code being guessed at is a code to abandon. */
    attempts: { type: Number, default: 0 },
    /* How many codes this number has been sent in the current window — the
       thing that stops an app being used to send somebody messages all night. */
    sends: { type: Number, default: 1 },
    lastSentAt: { type: Date, default: Date.now },

    /* Mongo removes the row itself once this passes. Expiry is not enforced by
       reading the field and hoping every code path remembers to check it. */
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true },
);

/** Six digits, from a source suitable for a credential. */
export function generateCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

/**
 * Compared in constant time.
 *
 * Six digits is a small space, and a comparison that returns early on the first
 * wrong character leaks how much of it was right. `timingSafeEqual` throws on a
 * length mismatch, so both sides are hashes and therefore always equal length.
 */
export function codeMatches(code, storedHash) {
  const a = Buffer.from(hashCode(code), 'hex');
  const b = Buffer.from(String(storedHash), 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export const Verification = mongoose.model('Verification', verificationSchema);
