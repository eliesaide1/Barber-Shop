import { Router } from 'express';
import { z } from 'zod';
import { getSettings, fillTokens } from '../models/ShopSettings.js';
import { User } from '../models/User.js';
import { asyncHandler, ApiError } from '../middleware/error.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { sendTemplate, whatsappConfigured, toWhatsAppNumber } from '../lib/whatsapp.js';
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
      /* What the app will actually dial, so the CMS shows the effect of what
         was typed rather than the typing. */
      contactNumber: toWhatsAppNumber(settings.contact.whatsapp),
      /* So the CMS can say plainly whether WhatsApp will actually go out, rather
         than letting somebody switch it on and wonder why nothing happens. The
         credentials themselves stay in the environment and are never sent. */
      whatsapp: { configured: whatsappConfigured() },
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
      })
      .parse(req.body);

    const settings = await getSettings();
    if (body.contact) Object.assign(settings.contact, body.contact);
    if (body.marketplace) Object.assign(settings.marketplace, body.marketplace);
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

    res.json({
      birthday: settings.birthday,
      contact: settings.contact,
      marketplace: settings.marketplace,
      contactNumber: toWhatsAppNumber(settings.contact.whatsapp),
      whatsapp: { configured: whatsappConfigured() },
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

    const tokens = { name: req.user.name.split(' ')[0], shop: 'FadeRoom' };
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
