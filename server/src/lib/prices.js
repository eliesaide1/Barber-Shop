import { getSettings } from '../models/ShopSettings.js';

/**
 * Whether this request is allowed to be told what things cost.
 *
 * A shop that quotes rather than lists hides every price from clients — and
 * hiding means *removing*, never blanking, exactly as `forViewer` does for
 * products. A price left in the response and painted over by the interface is
 * a price anybody finds in a minute with the network tab open, which makes
 * "hidden" a property of the app rather than a fact about the shop.
 *
 * Staff always see them: an artist cannot quote a cut they cannot see, and the
 * back office cannot edit a number it was never sent.
 */
export async function pricesVisibleTo(user) {
  if (user && user.role !== 'client') return true;
  const settings = await getSettings();
  return !settings.marketplace?.hideAllPrices;
}

/**
 * Strips the named fields from a document or a list of them.
 *
 * Takes plain objects — call `toJSON()` first — because a Mongoose document
 * ignores `delete` on a path it knows about, which fails silently and is the
 * kind of bug that ships.
 */
export function withoutFields(payload, fields) {
  const strip = (row) => {
    if (!row || typeof row !== 'object') return row;
    const copy = { ...row };
    for (const field of fields) delete copy[field];
    return copy;
  };
  return Array.isArray(payload) ? payload.map(strip) : strip(payload);
}

/** Convenience: hide `fields` unless this user is allowed to see prices. */
export async function priceSafe(user, payload, fields) {
  return (await pricesVisibleTo(user)) ? payload : withoutFields(payload, fields);
}
