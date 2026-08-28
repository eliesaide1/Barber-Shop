import { Router } from 'express';
import { z } from 'zod';
import { getSettings, fillTokens } from '../models/ShopSettings.js';
import { User } from '../models/User.js';
import { asyncHandler, ApiError } from '../middleware/error.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { broadcast } from '../lib/realtime.js';
import { sendTemplate, whatsappConfigured, toWhatsAppNumber } from '../lib/whatsapp.js';
import { emailConfigured } from '../lib/email.js';
import { sweepBirthdays } from '../lib/birthdays.js';

export const settingsRouter = Router();

const birthdayBody = z.object({
  enabled: z.boolean().optional(),
  templateName: z
    .string()
    .max(80)
    /* Meta's own rule for template names, worth enforcing here so a typo is
       caught in the CMS rather than as a rejected send a year later. */
    .regex(/^[a-z0-9_]*$/, 'Lowercase letters, numbers and underscores only')
    .optional(),
  templateLanguage: z.string().max(10).optional(),
  variables: z
    .array(
      z
        .string()
        .max(300)
        /* A newline or a run of spaces gets a template message rejected by the
           API, and the rejection reads as a mysterious 400 hours later. */
        .refine((v) => !/[\n\r\t]/.test(v), 'No line breaks — WhatsApp rejects them')
        .refine((v) => !/ {5,}/.test(v), 'No long runs of spaces — WhatsApp rejects them'),
    )
    .max(10)
    .optional(),
  /* What the greeting comes with. `reward` mints a real, trackable entry on the
     client's card; `text` is only words in the message. */
  offer: z.enum(['none', 'text', 'reward']).optional(),
  rewardLabel: z.string().min(2).max(80).optional(),
  rewardValue: z.coerce.number().min(0).max(10_000).nullable().optional(),
  rewardExpiryDays: z.coerce.number().int().min(1, 'At least a day').max(365, 'A year at most').optional(),
  inAppTitle: z.string().min(2).max(80).optional(),
  inAppBody: z.string().min(2).max(400).optional(),
  sendHour: z.coerce.number().int().min(0).max(23).optional(),
});

const verificationBody = z.object({
  required: z.boolean().optional(),
  channel: z.enum(['whatsapp', 'email']).optional(),
  templateName: z.string().max(120).optional(),
  templateLanguage: z.string().max(10).optional(),
  ttlMinutes: z.coerce.number().min(2).max(60).optional(),
  /* Either a number or an email, depending on the channel — checked against
     the channel being saved rather than the one already stored. */
  testPhone: z.string().max(200).optional(),
  /* Four to eight digits, matching what /verify/check will accept — a test code
     the check would refuse is a door that looks open and is not. */
  testCode: z
    .string()
    .max(8)
    .refine((v) => v.trim() === '' || /^\d{4,8}$/.test(v.trim()), 'Use 4 to 8 digits')
    .optional(),
});

const contactBody = z.object({
  enabled: z.boolean().optional(),
  whatsapp: z
    .string()
    .max(30)
    .refine(
      (v) => v.trim() === '' || toWhatsAppNumber(v) !== null,
      'That does not look like a number WhatsApp can reach',
    )
    .optional(),
  greeting: z.string().max(300).optional(),
});

const loyaltyBody = z.object({
  goal: z.coerce
    .number()
    .int()
    .min(1, 'At least one visit')
    .max(50, 'Fifty is not a loyalty card')
    .optional(),
  freeCutValue: z.coerce.number().min(0).max(10_000).optional(),
});

const marketplaceBody = z.object({
  hideAllPrices: z.boolean().optional(),
  priceEnquiry: z.string().min(2).max(300).optional(),
});

/** Staff can read the settings; only an admin may change them. */
settingsRouter.get(
  '/',
  requireAuth,
  requireRole('artist', 'admin'),
  asyncHandler(async (_req, res) => {
    const settings = await getSettings();
    res.json({
      birthday: settings.birthday,
      contact: settings.contact,
      marketplace: settings.marketplace,
      verification: settings.verification,
      loyalty: settings.loyalty,
      /* What the app will actually dial, so the CMS shows the effect of what
         was typed rather than the typing. */
      contactNumber: toWhatsAppNumber(settings.contact.whatsapp),
      /* So the CMS can say plainly whether WhatsApp will actually go out, rather
         than letting somebody switch it on and wonder why nothing happens. The
         credentials themselves stay in the environment and are never sent. */
      whatsapp: { configured: whatsappConfigured() },
      email: { configured: emailConfigured() },
    });
  }),
);

settingsRouter.patch(
  '/',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        birthday: birthdayBody.optional(),
        contact: contactBody.optional(),
        marketplace: marketplaceBody.optional(),
        verification: verificationBody.optional(),
        loyalty: loyaltyBody.optional(),
      })
      .parse(req.body);

    const settings = await getSettings();
    if (body.contact) Object.assign(settings.contact, body.contact);
    if (body.marketplace) Object.assign(settings.marketplace, body.marketplace);
    if (body.verification) {
      Object.assign(settings.verification, body.verification);
      /* Same refusal the birthday greeting makes: switching it on with no
         template would send nothing and report success — except here the cost
         is that nobody can register at all. */
      /* A test number counts as a way through, which is the whole point of
         having one before the template is approved. Requiring verification with
         neither is the case that locks everybody out. */
      const hasTestTarget = Boolean(
        settings.verification.testPhone && settings.verification.testCode,
      );
      const onEmail = settings.verification.channel === 'email';

      if (settings.verification.testPhone) {
        const ok = onEmail
          ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.verification.testPhone.trim())
          : toWhatsAppNumber(settings.verification.testPhone) !== null;
        if (!ok) {
          throw new ApiError(422, onEmail ? 'That is not a valid email' : 'That is not a usable number', {
            fields: { 'verification.testPhone': onEmail ? 'Enter an email' : 'Enter a number' },
          });
        }
      }

      /* WhatsApp needs a template before it can carry anything; email needs a
         provider, which is set in the environment rather than here — so the
         only thing this can check for email is the test target. */
      const wayThrough = onEmail
        ? emailConfigured() || hasTestTarget
        : Boolean(settings.verification.templateName) || hasTestTarget;

      if (settings.verification.required && !wayThrough) {
        throw new ApiError(
          422,
          onEmail
            ? 'Connect an email provider, or set a test address — otherwise nobody can sign up'
            : 'Name the approved WhatsApp template, or set a test number — otherwise nobody can sign up',
          { fields: { 'verification.testPhone': 'Needed to switch verification on' } },
        );
      }
      /* Half a test number is worse than none: it looks configured and answers
         nothing. */
      if (Boolean(settings.verification.testPhone) !== Boolean(settings.verification.testCode)) {
        throw new ApiError(422, 'A test number needs both a number and a code', {
          fields: { 'verification.testCode': 'Set both, or clear both' },
        });
      }
    }
    if (body.loyalty) Object.assign(settings.loyalty, body.loyalty);
    if (body.birthday) {
      Object.assign(settings.birthday, body.birthday);
      /* Switching it on with no template would send nothing and report success,
         which is the worst of both. */
      if (settings.birthday.enabled && whatsappConfigured() && !settings.birthday.templateName) {
        throw new ApiError(
          422,
          'Name the approved WhatsApp template, or the greeting will only go out inside the app',
          { fields: { 'birthday.templateName': 'Required once WhatsApp is connected' } },
        );
      }
    }
    settings.updatedBy = req.user._id;
    await settings.save();

    /* These are the shop itself — its hours, its loyalty goal, whether prices
       are published, the number the basket is sent to. The app reads them once
       at sign-in and had no way of hearing that any of it moved, so a shop
       that changed its closing time was telling nobody already holding the app
       open. There is nothing to send but the fact: `/config` is one request,
       and it is the one thing every client wants after this. */
    broadcast('settings:changed', {});

    res.json({
      birthday: settings.birthday,
      contact: settings.contact,
      marketplace: settings.marketplace,
      verification: settings.verification,
      loyalty: settings.loyalty,
      contactNumber: toWhatsAppNumber(settings.contact.whatsapp),
      whatsapp: { configured: whatsappConfigured() },
      email: { configured: emailConfigured() },
    });
  }),
);

/**
 * Send the real thing to one number, now.
 *
 * A template is approved by Meta but its *variables* are edited here, and the
 * only way to know a greeting reads well — and that the template name is right,
 * and the number resolves — is to look at one. Cheaper than finding out on a
 * client's birthday.
 */
settingsRouter.post(
  '/birthday/test',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { phone } = z.object({ phone: z.string().min(6) }).parse(req.body);
    if (!whatsappConfigured()) throw new ApiError(501, 'WhatsApp is not connected on this server');

    const settings = await getSettings();
    const config = settings.birthday;
    if (!config.templateName) throw new ApiError(422, 'Name the approved template first');

    const tokens = { name: req.user.name.split(' ')[0], shop: 'VIA Barber House' };
    const result = await sendTemplate(phone, {
      name: config.templateName,
      language: config.templateLanguage,
      variables: config.variables.map((v) => fillTokens(v, tokens)),
    });

    if (!result.ok) {
      throw new ApiError(
        502,
        result.error ?? `Not sent — ${result.skipped}`,
      );
    }
    res.json({ ok: true, to: toWhatsAppNumber(phone), id: result.id });
  }),
);

/**
 * Run the birthday sweep now.
 *
 * The sweep is idempotent by the year mark, so this cannot double-greet anybody
 * — it exists so an owner who has just switched the feature on does not have to
 * wait until tomorrow to find out whether it works.
 */
settingsRouter.post(
  '/birthday/run',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (_req, res) => {
    res.json(await sweepBirthdays());
  }),
);

/** Who has a birthday coming, so the shop can see the feature is alive. */
settingsRouter.get(
  '/birthday/upcoming',
  requireAuth,
  requireRole('artist', 'admin'),
  asyncHandler(async (_req, res) => {
    const clients = await User.find({ role: 'client', active: true, dateOfBirth: { $ne: '' } })
      .select('name dateOfBirth phone notifications birthdayGreetedYear')
      .limit(500);

    const today = new Date();
    const withinAMonth = clients
      .map((u) => {
        const [, month, day] = u.dateOfBirth.split('-').map(Number);
        /* Days until the next occurrence, wrapping the year end. */
        const next = new Date(today.getFullYear(), month - 1, day);
        if (next < new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
          next.setFullYear(today.getFullYear() + 1);
        }
        const days = Math.round((next - new Date(today.toDateString())) / 86_400_000);
        return {
          id: u.id,
          name: u.name,
          dateOfBirth: u.dateOfBirth,
          daysAway: days,
          whatsappOptIn: Boolean(u.notifications?.whatsapp),
          reachable: Boolean(toWhatsAppNumber(u.phone)),
        };
      })
      .filter((c) => c.daysAway <= 31)
      .sort((a, b) => a.daysAway - b.daysAway);

    res.json(withinAMonth);
  }),
);
