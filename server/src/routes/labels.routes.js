import { Router } from 'express';
import { z } from 'zod';

import { Label } from '../models/Label.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { broadcast } from '../lib/realtime.js';

export const labelsRouter = Router();

/**
 * Every override, as one flat object.
 *
 * Only rows the shop has actually changed are sent. A shop that has edited
 * nothing gets `{}` and the app renders the words it shipped with, which is
 * both the smallest possible payload and the correct answer.
 *
 * Deliberately open to any signed-in user: this is the interface talking about
 * itself, and both portals draw from the same set.
 */
labelsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await Label.find({ value: { $ne: '' } }).select('key value').lean();
    const out = {};
    for (const row of rows) out[row.key] = row.value;
    res.json(out);
  }),
);

/**
 * The full catalogue, for the back office.
 *
 * Includes the defaults and the untouched rows, because editing copy means
 * seeing what is there to edit — the override-only view above would show an
 * admin an empty page on a shop that has never changed anything.
 */
labelsRouter.get(
  '/catalogue',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (_req, res) => {
    const rows = await Label.find().sort({ group: 1, key: 1 }).lean();
    res.json(rows.map(({ _id, __v, ...row }) => ({ ...row, id: String(_id) })));
  }),
);

const patchBody = z.object({
  /* key -> new wording. An empty string is meaningful: it clears the override
     and returns the label to what the app shipped with. */
  values: z.record(z.string().max(400)),
});

labelsRouter.patch(
  '/',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { values } = patchBody.parse(req.body);
    const keys = Object.keys(values);
    if (!keys.length) return res.status(204).end();

    /* Only keys the app actually asks for. A typo in the back office would
       otherwise create a row nothing ever reads, and the catalogue would fill
       with labels that do not exist. */
    const known = new Set((await Label.find({ key: { $in: keys } }).select('key').lean()).map((r) => r.key));
    const unknown = keys.filter((k) => !known.has(k));
    if (unknown.length) {
      return res.status(422).json({ message: `No such label: ${unknown.slice(0, 5).join(', ')}` });
    }

    await Label.bulkWrite(
      keys.map((key) => ({
        updateOne: { filter: { key }, update: { $set: { value: values[key].trim() } } },
      })),
    );

    broadcast('labels:changed', {});
    res.status(204).end();
  }),
);

/**
 * Registers the catalogue from the app's own source.
 *
 * Run by the extraction script rather than typed: the list of labels is a fact
 * about the code, and anything that lets it be edited by hand lets it disagree
 * with what the app asks for. Existing overrides are never touched — only the
 * default and the grouping are refreshed.
 */
labelsRouter.put(
  '/catalogue',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        labels: z.array(
          z.object({ key: z.string().min(1).max(120), defaultText: z.string().max(400) }),
        ),
      })
      .parse(req.body);

    await Label.bulkWrite(
      body.labels.map(({ key, defaultText }) => ({
        updateOne: {
          filter: { key },
          update: { $set: { defaultText, group: key.split('.')[0] } },
          upsert: true,
        },
      })),
    );

    /* A default that changed is a label that changed, for anyone not overriding it. */
    broadcast('labels:changed', {});
    res.json({ registered: body.labels.length });
  }),
);
