import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

/**
 * Sending an email, through whichever provider the shop has.
 *
 * Two, because the choice is a trade the shop has to make rather than one this
 * file can make for them:
 *
 *   resend  — an API key and nothing else, but mail from an unverified domain
 *             is either refused or lands in spam, so a domain has to be pointed
 *             at them before real customers can be reached.
 *   smtp    — any inbox they already own, working within the hour. Consumer
 *             providers throttle and their mail is filtered harder, which for a
 *             sign-up code means somebody simply cannot register.
 *
 * Absent means absent: nothing here throws on a missing key, and the caller is
 * told it could not send. Verification stays switched off rather than the app
 * failing in a way nobody can see from the outside.
 */

let transport = null;

/** Whether mail can actually leave the building. */
export function emailConfigured() {
  if (env.emailProvider === 'resend') return Boolean(env.resendApiKey && env.emailFrom);
  if (env.emailProvider === 'smtp') {
    return Boolean(env.smtpHost && env.smtpUser && env.smtpPassword && env.emailFrom);
  }
  return false;
}

function smtpTransport() {
  if (transport) return transport;
  transport = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    /* 465 is implicit TLS; everything else negotiates with STARTTLS. Getting
       this wrong hangs the connection rather than failing, which is a much
       worse way to find out. */
    secure: env.smtpPort === 465,
    auth: { user: env.smtpUser, pass: env.smtpPassword },
  });
  return transport;
}

async function sendViaResend({ to, subject, text, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: env.emailFrom, to: [to], subject, text, html }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    /* Their message is far more use than the status — "domain is not verified"
       and "you can only send to your own address in test mode" are both things
       somebody can act on, and both look like a generic failure otherwise. */
    return { ok: false, error: data?.message || `Resend returned ${res.status}` };
  }
  return { ok: true, id: data?.id };
}

async function sendViaSmtp({ to, subject, text, html }) {
  try {
    const info = await smtpTransport().sendMail({ from: env.emailFrom, to, subject, text, html });
    return { ok: true, id: info.messageId };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Never throws. A caller deciding what to tell somebody is better placed than a
 * stack trace, and a failed send is an outcome rather than an exception.
 *
 * @returns {Promise<{ok: boolean, skipped?: string, error?: string, id?: string}>}
 */
export async function sendEmail({ to, subject, text, html }) {
  if (!emailConfigured()) return { ok: false, skipped: 'not configured' };
  if (!to || !subject) return { ok: false, skipped: 'nothing to send' };

  try {
    return env.emailProvider === 'resend'
      ? await sendViaResend({ to, subject, text, html })
      : await sendViaSmtp({ to, subject, text, html });
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * The sign-up code, as an email.
 *
 * Plain text alongside the HTML because a code is the one thing that must
 * survive a client that refuses to render anything — and because a message
 * whose entire content is an image of a number is what a phishing filter is
 * built to catch.
 */
export function verificationEmail(code, shopName, minutes) {
  const shop = shopName || 'the shop';
  return {
    subject: `${code} is your ${shop} code`,
    text: [
      `${code} is your code to finish signing up at ${shop}.`,
      ``,
      `It expires in ${minutes} minutes.`,
      `If you did not ask for this, you can ignore this email — no account has been created.`,
    ].join('\n'),
    html: `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:420px">
        <p style="font-size:15px;color:#1b1713">Your code to finish signing up at <b>${shop}</b>:</p>
        <p style="font-size:34px;font-weight:800;letter-spacing:6px;color:#8a5a10;margin:18px 0">${code}</p>
        <p style="font-size:13px;color:#6b6055">It expires in ${minutes} minutes.</p>
        <p style="font-size:13px;color:#6b6055">
          If you did not ask for this, ignore this email — no account has been created.
        </p>
      </div>`,
  };
}
