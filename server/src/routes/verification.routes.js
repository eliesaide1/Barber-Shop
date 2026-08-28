import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

import { User } from '../models/User.js';
import { Verification, codeMatches, generateCode, hashCode } from '../models/Verification.js';
import { getSettings } from '../models/ShopSettings.js';
import { sendTemplate, toWhatsAppNumber, whatsappConfigured } from '../lib/whatsapp.js';
import { emailConfigured, sendEmail, verificationEmail } from '../lib/email.js';
import { asyncHandler, ApiError } from '../middleware/error.js';
import { env } from '../config/env.js';

export const verificationRouter = Router();

/* A target may be sent this many codes before it has to wait out the window. */
const MAX_SENDS = 5;
const SEND_WINDOW_MS = 60 * 60 * 1000;
/* And a code may be guessed at this many times before it is abandoned. */
const MAX_ATTEMPTS = 5;
/* How long between codes, so "resend" cannot be held down. */
const RESEND_COOLDOWN_MS = 60 * 1000;

const channelOf = (settings) => (settings.verification?.channel === 'email' ? 'email' : 'whatsapp');

/**
 * The one string that identifies whoever is being verified.
 *
 * Normalised here and nowhere else, so the row written by `/start`, the row
 * looked up by `/check`, and the name inside the proof are all the same string.
 * "Elie@Example.COM " and "elie@example.com" proving to be two different people
 * is exactly the bug this exists to prevent.
 */
function normaliseTarget(channel, raw) {
  if (channel === 'email') {
    const email = String(raw ?? '').trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
  }
  return toWhatsAppNumber(raw);
}

/** Whether a real code can actually reach somebody on this channel. */
function canSend(settings) {
  if (channelOf(settings) === 'email') return emailConfigured();
  return Boolean(whatsappConfigured() && settings.verification?.templateName);
}

/** The target that is answered without sending anything, if the shop set one. */
function testTarget(settings) {
  const v = settings.verification;
  if (!v?.testPhone || !v?.testCode) return null;
  return normaliseTarget(channelOf(settings), v.testPhone);
}

/**
 * Whether a new account has to prove itself at all.
 *
 * On only when the shop asks *and* there is some way to answer — a channel that
 * can actually send, or a test target that answers itself. A shop that turned
 * this on with neither would close its own front door: nobody could register,
 * and from the app the reason would be invisible.
 */
export async function verificationRequired() {
  const settings = await getSettings();
  if (!settings.verification?.required) return false;
  return canSend(settings) || Boolean(testTarget(settings));
}

/** Which channel sign-up asks on — the app verifies a different field for each. */
export async function verificationChannel() {
  return channelOf(await getSettings());
}

/**
 * The proof carried from "this answered" to "make me an account".
 *
 * A short-lived signed claim rather than a row to look up: it says one thing,
 * about one target, and it is spent by `/auth/register` reading it. Fifteen
 * minutes is long enough to finish typing a sign-up form and far too short to
 * be worth passing to somebody else.
 */
const PROOF_TTL = '15m';
const signProof = (channel, target) =>
  jwt.sign({ channel, target, use: 'signup' }, env.jwtSecret, { expiresIn: PROOF_TTL });

/** `{channel, target}` when the proof is good, otherwise null. */
export function verifiedFrom(token) {
  try {
    const claims = jwt.verify(String(token), env.jwtSecret);
    if (claims.use !== 'signup' || !claims.target) return null;
    return { channel: claims.channel, target: claims.target };
  } catch {
    return null;
  }
}

/** Where a target lives on a User, per channel. */
const userFieldFor = (channel) => (channel === 'email' ? 'email' : 'phone');

const targetFrom = (channel, body) =>
  normaliseTarget(channel, channel === 'email' ? body.email : body.phone);

verificationRouter.post(
  '/start',
  asyncHandler(async (req, res) => {
    const body = z
      .object({ phone: z.string().max(30).optional(), email: z.string().max(200).optional() })
      .parse(req.body);

    const settings = await getSettings();
    const channel = channelOf(settings);

    if (!(await verificationRequired())) {
      /* Nothing to prove. Said plainly so the app can move straight on rather
         than waiting for a code that is never coming. */
      return res.json({ required: false, channel });
    }

    const target = targetFrom(channel, body);
    if (!target) {
      throw new ApiError(
        422,
        channel === 'email'
          ? 'Enter a valid email'
          : 'That does not look like a number WhatsApp can reach',
      );
    }

    /* An existing account is refused here rather than at the end. Sending a
       code to something that cannot be used would be asking somebody to prove
       something in order to be told no. */
    if (await User.exists({ [userFieldFor(channel)]: target })) {
      throw new ApiError(
        409,
        channel === 'email'
          ? 'That email already has an account. Try signing in.'
          : 'That number already has an account. Try signing in.',
      );
    }

    const ttlMinutes = settings.verification.ttlMinutes ?? 10;
    const ttlMs = ttlMinutes * 60 * 1000;
    const now = Date.now();

    const existing = await Verification.findOne({ target });
    if (existing) {
      const since = now - new Date(existing.lastSentAt).getTime();
      if (since < RESEND_COOLDOWN_MS) {
        throw new ApiError(
          429,
          `Wait ${Math.ceil((RESEND_COOLDOWN_MS - since) / 1000)}s before asking for another code`,
        );
      }
      /* The window is measured from the first send, so somebody cannot reset it
         by spacing requests exactly one cooldown apart. */
      const windowOpen = now - new Date(existing.createdAt).getTime() < SEND_WINDOW_MS;
      if (windowOpen && existing.sends >= MAX_SENDS) {
        throw new ApiError(429, 'Too many codes requested. Try again later.');
      }
    }

    /* The test target is answered rather than messaged. Everything after this
       is identical — it still expires, still counts wrong guesses, is still
       spent when used — so what gets tested is the real flow rather than a path
       that only exists in testing. */
    const isTest = testTarget(settings) === target;
    const code = isTest ? String(settings.verification.testCode) : generateCode();

    if (!isTest) {
      if (!canSend(settings)) {
        /* Deliberately in the 400s. A 5xx has its message replaced with
           "Something went wrong" in production — right for a genuine fault,
           wrong here, where somebody is left staring at a button that appears
           broken. */
        throw new ApiError(409, 'We can’t send a code there yet. Please try again later.');
      }

      const sent =
        channel === 'email'
          ? await sendEmail({
              to: target,
              ...verificationEmail(code, settings.shop?.name, ttlMinutes),
            })
          : await sendTemplate(target, {
              name: settings.verification.templateName,
              language: settings.verification.templateLanguage,
              variables: [code],
            });

      /* Stored only once it has actually gone. Writing first would leave a live
         code against somebody who was never told what it is — and they would be
         locked into a cooldown for a message they never received. */
      if (!sent.ok) {
        throw new ApiError(502, 'Could not send the code right now. Please try again.');
      }
    }

    await Verification.findOneAndUpdate(
      { target },
      {
        $set: {
          channel,
          codeHash: hashCode(code),
          attempts: 0,
          lastSentAt: new Date(now),
          expiresAt: new Date(now + ttlMs),
        },
        $inc: { sends: existing ? 1 : 0 },
        $setOnInsert: { target },
      },
      { upsert: true, new: true },
    );

    res.json({ required: true, channel, expiresInSeconds: Math.round(ttlMs / 1000) });
  }),
);

verificationRouter.post(
  '/check',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        phone: z.string().max(30).optional(),
        email: z.string().max(200).optional(),
        code: z.string().regex(/^\d{4,8}$/, 'Enter the code'),
      })
      .parse(req.body);

    const settings = await getSettings();
    const channel = channelOf(settings);
    if (!(await verificationRequired())) return res.json({ required: false, channel });

    const target = targetFrom(channel, body);
    if (!target) throw new ApiError(422, 'That is not something we can send a code to');

    const row = await Verification.findOne({ target });
    /* Expired and never-requested are the same answer on purpose: both mean
       "start again", and distinguishing them tells somebody probing which
       addresses have a code in flight. */
    if (!row) throw new ApiError(410, 'That code has expired. Ask for a new one.');

    if (!codeMatches(body.code, row.codeHash)) {
      row.attempts += 1;
      if (row.attempts >= MAX_ATTEMPTS) {
        await row.deleteOne();
        throw new ApiError(429, 'Too many wrong tries. Ask for a new code.');
      }
      await row.save();
      throw new ApiError(422, 'That code is not right', {
        fields: { code: `${MAX_ATTEMPTS - row.attempts} tries left` },
      });
    }

    /* Spent. A code that still works after it has been used is one that can be
       used twice, and the proof it produces is the thing worth keeping. */
    await row.deleteOne();

    res.json({ verificationToken: signProof(channel, target), channel, target });
  }),
);
