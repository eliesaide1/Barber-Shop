import { Notification } from '../models/Notification.js';
import { emitTo, rooms, connectedCount } from './realtime.js';
import { pushToUsers } from './push.js';
import { env } from '../config/env.js';

/**
 * Raise a notification the shop generated, rather than one a person typed in
 * the CMS.
 *
 * ── Why this writes a document ───────────────────────────────────────────────
 *
 * A bare `emitTo(...)` would be shorter and would work perfectly for a client
 * who happens to have the app open. It is the wrong shape anyway, for two
 * reasons:
 *
 *  - A notification nobody was connected to receive has to still be there when
 *    they next open the app. Told-once is not told.
 *  - Push is the same message over a second transport. `deliver()` in the app
 *    de-duplicates by id, so Firebase must send *this record* — not a parallel
 *    payload built somewhere else that happens to read the same. Writing the
 *    document first is what makes the FCM half a send call and nothing more.
 *
 * ── Restraint ────────────────────────────────────────────────────────────────
 *
 * Only raise these for something the recipient is actually waiting on. A client
 * standing at the chair does not need telling that the stamp they just watched
 * land has landed; they do need telling that the time they asked for three
 * hours ago is now theirs. Every avoidable notification spends credit on the
 * ones that matter.
 *
 * @param {*} userId Who it is for. A no-op when absent, so callers need no guard.
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.body
 * @param {'message'|'booking'|'order'|'loyalty'} [options.kind]
 * @param {object} [options.data] Deep link, e.g. `{ screen: 'Appointments' }`.
 * @param {object} [options.actor] The user who caused it, when there is one.
 */
export async function notify(userId, { title, body, kind = 'message', data = {}, actor = null }) {
  if (!userId) return null;

  const room = rooms.user(userId);
  const notification = await Notification.create({
    title,
    body,
    kind,
    audience: 'user',
    targetUser: userId,
    data,
    createdBy: actor?._id ?? null,
    /* Named for whoever caused it, so "Karim confirmed your cut" reads as being
       from Karim rather than from a system. */
    createdByName: actor?.name ?? 'FadeRoom',
    deliveredCount: connectedCount(room),
  });

  emitTo(room, 'notification:new', notification.toJSON());

  /* Both transports, always, carrying the same record. An app that is open gets
     it over the socket in a few milliseconds and drops the push as a duplicate;
     a closed one only ever sees the push. Sending only when nobody is connected
     would look like an optimisation and be a race — a phone that disconnects
     between the room count and the emit gets nothing at all. */
  await pushToUsers([userId], notification);

  return notification;
}

/**
 * Times inside a sentence, in the shop's clock.
 *
 * `getHours()` would read the *server's* zone. A deployment runs in UTC and the
 * chairs are in Beirut, so a 17:45 cut would be announced as 14:45 — and the
 * only people who could tell would be the ones being told the wrong time.
 *
 * This applies to prose only. Timestamps sent as ISO strings are still rendered
 * by the phone and the browser in the reader's own zone, which is correct: a
 * client abroad should see their booking in the time they are living in.
 */
function formatter(options) {
  try {
    return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: env.shopTimezone });
  } catch {
    console.warn(`[time] SHOP_TIMEZONE "${env.shopTimezone}" is not a zone this system knows — using UTC`);
    return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' });
  }
}

const dayPart = formatter({ weekday: 'short', day: 'numeric', month: 'short' });
const timePart = formatter({ hour: '2-digit', minute: '2-digit', hour12: false });

/** `17:45` in the shop's clock. */
export const timeLabel = (date) => timePart.format(date);

/** `Tue 12 Aug · 17:45` in the shop's clock. */
export const whenLabel = (date) => `${dayPart.format(date)} · ${timePart.format(date)}`;
