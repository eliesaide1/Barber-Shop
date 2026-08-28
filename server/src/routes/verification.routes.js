import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

import { User } from '../models/User.js';
import { Verification, codeMatches, generateCode, hashCode } from '../models/Verification.js';
import { getSettings } from '../models/ShopSettings.js';
import { sendTemplate, toWhatsAppNumber, whatsappConfigured } from '../lib/whatsapp.js';
import { asyncHandler, ApiError } from '../middleware/error.js';
import { env } from '../config/env.js';

export const verificationRouter = Router();

/* A number may be sent this many codes before it has to wait out the window. */
const MAX_SENDS = 5;
const SEND_WINDOW_MS = 60 * 60 * 1000;
/* And a code may be guessed at this many times before it is abandoned. */
const MAX_ATTEMPTS = 5;
/* How long between codes, so "resend" cannot be held down. */
const RESEND_COOLDOWN_MS = 60 * 1000;

/**
 * Whether a new account has to prove its number at all.
 *
 * Two switches, and both must be on: the shop asking for it, and WhatsApp
 * actually being able to carry a message. A shop that turns this on before
 * connecting WhatsApp would otherwise close its own front door — nobody could
 * register, and the reason would be invisible from the app.
 */
/** Whether a real code can actually be put on somebody's phone. */
function canSend(settings) {
  return Boolean(whatsappConfigured() && settings.verification?.templateName);
}

/** The number that is answered without messaging anybody, if the shop set one. */
function testNumber(settings) {
  const v = settings.verification;
  return v?.testPhone && v?.testCode ? toWhatsAppNumber(v.testPhone) : null;
}

/**
 * Whether a new account has to prove its number at all.
 *
 * On only when the shop asks *and* there is some way to answer — a live
 * template, or a test number that answers itself. A shop that turned this on
 * with neither would close its own front door: nobody could register, and from
 * the app the reason would be invisible.
 */
export async function verificationRequired() {
  const settings = await getSettings();
  if (!settings.verification?.required) return false;
  return canSend(settings) || Boolean(testNumber(settings));
}

/**
 * The proof carried from "this number answered" to "make me an account".
 *
 * A short-lived signed claim rather than a row to look up: it says one thing,
 * about one number, and it is spent by `/auth/register` reading it. Fifteen
 * minutes is long enough to finish typing a sign-up form and far too short to
 * be worth passing to somebody else.
 */
const PROOF_TTL = '15m';
const signProof = (phone) =>
  jwt.sign({ phone, use: 'signup' }, env.jwtSecret, { expiresIn: PROOF_TTL });

export function verifiedPhoneFrom(token) {
  try {
    const claims = jwt.verify(String(token), env.jwtSecret);
    return claims.use === 'signup' ? claims.phone : null;
  } catch {
    return null;
  }
}

verificationRouter.post(
  '/start',
  asyncHandler(async (req, res) => {
    const { phone } = z.object({ phone: z.string().min(6).max(30) }).parse(req.body);

    if (!(await verificationRequired())) {
      /* Nothing to prove. Said plainly so the app can move straight on rather
         than waiting for a code that is never coming. */
      return res.json({ required: false });
    }

    const number = toWhatsAppNumber(phone);
    if (!number) throw new ApiError(422, 'That does not look like a number WhatsApp can reach');

    /* An existing account is refused here rather than at the end. Sending a
       code to a number that cannot be used would be asking somebody to prove
       something in order to be told no. */
    if (await User.exists({ phone: { $in: [number, phone] } })) {
      throw new ApiError(409, 'That number already has an account. Try signing in.');
    }

    const settings = await getSettings();
    const ttlMs = (settings.verification.ttlMinutes ?? 10) * 60 * 1000;
    const now = Date.now();

    const existing = await Verification.findOne({ phone: number });
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

    /* The test number is answered rather than messaged. Everything after this
       is identical — it still expires, still counts wrong guesses, is still
       spent when used — so what is being tested is the real flow and not a
       path that only exists in testing. */
    const isTest = testNumber(settings) === number;
    const code = isTest ? String(settings.verification.testCode) : generateCode();

    if (!isTest) {
      if (!canSend(settings)) {
        throw new ApiError(
          503,
          'Sign-up verification is not available right now. Please try again later.',
        );
      }
      const sent = await sendTemplate(number, {
        name: settings.verification.templateName,
        language: settings.verification.templateLanguage,
        variables: [code],
      });
      /* Stored only once it has actually gone. Writing first would leave a live
         code against a number that was never told what it is — and the person
         would be locked into a cooldown for a message they never received. */
      if (!sent.ok) {
        throw new ApiError(502, 'Could not send the code right now. Please try again.');
      }
    }

    await Verification.findOneAndUpdate(
      { phone: number },
      {
        $set: {
          codeHash: hashCode(code),
          attempts: 0,
          lastSentAt: new Date(now),
          expiresAt: new Date(now + ttlMs),
        },
        $inc: { sends: existing ? 1 : 0 },
        $setOnInsert: { phone: number },
      },
      { upsert: true, new: true },
    );

    res.json({ required: true, expiresInSeconds: Math.round(ttlMs / 1000) });
  }),
);

verificationRouter.post(
  '/check',
  asyncHandler(async (req, res) => {
    const { phone, code } = z
      .object({ phone: z.string().min(6).max(30), code: z.string().regex(/^\d{4,8}$/, 'Enter the code') })
      .parse(req.body);

    if (!(await verificationRequired())) return res.json({ required: false });

    const number = toWhatsAppNumber(phone);
    if (!number) throw new ApiError(422, 'That does not look like a number WhatsApp can reach');

    const row = await Verification.findOne({ phone: number });
    /* Expired and never-requested are the same answer on purpose: both mean
       "start again", and distinguishing them tells somebody probing which
       numbers have a code in flight. */
    if (!row) throw new ApiError(410, 'That code has expired. Ask for a new one.');

    if (!codeMatches(code, row.codeHash)) {
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

    res.json({ verificationToken: signProof(number), phone: number });
  }),
);
