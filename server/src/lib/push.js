import fs from 'node:fs';
import { User } from '../models/User.js';
import { env } from '../config/env.js';

/**
 * Firebase Cloud Messaging — the transport that reaches a phone whose app is
 * shut.
 *
 * Socket.IO already delivers everything within a second to an app that is open,
 * and it does it better than FCM would: no third party, no per-message quota.
 * This exists for the other case, which for a barber shop is most of them — a
 * client is not sitting with the app open waiting to hear whether five o'clock
 * was accepted.
 *
 * ── The one rule ─────────────────────────────────────────────────────────────
 *
 * A push carries the **id of the Notification document the socket sent**. The
 * app de-duplicates by that id in `deliver()`, so a client who happens to be
 * online when both arrive sees one message rather than two. Building a parallel
 * payload here that merely reads the same would show everything twice, and the
 * bug would only appear for users with the app open — the ones least likely to
 * report it.
 *
 * ── When it is off ───────────────────────────────────────────────────────────
 *
 * Absent credentials this is a no-op that says so once at boot. That is the
 * default for development and for anyone who clones the repo: the app is fully
 * functional over the socket without it, and a missing optional transport must
 * never be an error.
 */

let messaging = null;
let ready = false;

/** FCM refuses more than 500 tokens in one multicast. */
const BATCH = 500;

/**
 * The service account, from whichever shape the host provides.
 *
 * A dashboard (Render, Fly, Heroku) can only give you a string, so the whole
 * JSON goes in one variable. A server you own is better served by a file that
 * never enters the environment at all.
 */
function credentials() {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (inline) {
    try {
      return JSON.parse(inline);
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT is set but is not valid JSON');
    }
  }

  const file = process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
  if (file) {
    if (!fs.existsSync(file)) {
      throw new Error(`FIREBASE_SERVICE_ACCOUNT_FILE points at ${file}, which does not exist`);
    }
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  return null;
}

/**
 * Called once at boot.
 *
 * Never throws. Broken push credentials are worth shouting about — somebody
 * meant them to work — but not worth refusing to serve over: taking the whole
 * shop offline because an optional notification transport is half-configured is
 * wildly out of proportion, and half-configured is exactly the state a setup is
 * in while somebody is still fetching the key.
 */
export async function initPush() {
  if (ready) return Boolean(messaging);
  ready = true;

  let creds;
  try {
    creds = credentials();
  } catch (err) {
    console.error(
      `[push] Firebase is configured but unusable: ${err.message}\n` +
        '       Carrying on without it — notifications are socket-only until this is fixed.',
    );
    return false;
  }

  if (!creds) {
    console.warn(
      '[push] no Firebase credentials — notifications are socket-only.\n' +
        '       Messages still reach any app that is open, and are stored for the rest.\n' +
        '       Set FIREBASE_SERVICE_ACCOUNT to wake a closed app.',
    );
    return false;
  }

  /* Imported here rather than at the top of the file: firebase-admin is tens of
     megabytes and pulls in gRPC, and a development server with push switched
     off should not pay for a transport it never uses. */
  try {
    const { initializeApp, cert, getApps } = await import('firebase-admin/app');
    const { getMessaging } = await import('firebase-admin/messaging');

    const app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(creds) });
    messaging = getMessaging(app);
    console.log(`[push] Firebase ready — project ${creds.project_id}`);
    return true;
  } catch (err) {
    /* A key that parses but Firebase rejects — wrong shape, revoked, truncated
       on the way into an environment variable. Same reasoning as above. */
    console.error(
      `[push] Firebase rejected those credentials: ${err.message}\n` +
        '       Carrying on without it — notifications are socket-only.',
    );
    messaging = null;
    return false;
  }
}

export const pushEnabled = () => Boolean(messaging);

/**
 * FCM data values must be strings — a number or a nested object is rejected for
 * the whole message, so everything is flattened and stringified here rather
 * than trusted to be well shaped at the call site.
 */
function dataPayload(notification) {
  const data = {
    /* The de-duplication key. Everything else is decoration; this is load-bearing. */
    id: String(notification._id ?? notification.id),
    kind: String(notification.kind ?? 'message'),
  };
  const link = notification.data ?? {};
  if (link.screen) data.screen = String(link.screen);
  if (link.id) data.targetId = String(link.id);
  return data;
}

/**
 * Drops tokens FCM has told us are dead.
 *
 * Uninstalling the app, clearing its data or simply not opening it for a couple
 * of months retires a token. Left in place they accumulate silently until every
 * send is mostly failures, so the reply is treated as the authority on which
 * devices still exist.
 */
async function pruneTokens(responses, tokens) {
  const dead = responses
    .map((r, i) => (r.success ? null : { code: r.error?.code, token: tokens[i] }))
    .filter(
      (r) =>
        r &&
        (r.code === 'messaging/registration-token-not-registered' ||
          r.code === 'messaging/invalid-registration-token' ||
          r.code === 'messaging/invalid-argument'),
    )
    .map((r) => r.token);

  if (!dead.length) return 0;
  await User.updateMany(
    { 'devices.token': { $in: dead } },
    { $pull: { devices: { token: { $in: dead } } } },
  );
  return dead.length;
}

/**
 * Sends a stored notification to a set of users as a push.
 *
 * Transactional messages ignore the broadcast opt-out on purpose: somebody who
 * silenced shop announcements has not asked to stop hearing that their booking
 * was confirmed, and treating those as one setting is how an app ends up unable
 * to reach anybody about anything.
 *
 * Failure is swallowed. A push that does not go out is a degraded delivery, not
 * a failed request — the notification is already written and already emitted,
 * and the client's booking must not 500 because Google had a bad minute.
 */
export async function pushToUsers(userIds, notification) {
  if (!messaging) return { sent: 0, skipped: 0 };

  const ids = [...new Set(userIds.map(String))];
  if (!ids.length) return { sent: 0, skipped: 0 };

  try {
    const isBroadcast = (notification.kind ?? 'message') === 'message';
    const users = await User.find({ _id: { $in: ids }, active: true }).select(
      'devices notifications',
    );

    const tokens = [];
    let skipped = 0;
    for (const user of users) {
      if (isBroadcast && user.notifications?.broadcasts === false) {
        skipped += 1;
        continue;
      }
      for (const device of user.devices) tokens.push(device.token);
    }
    if (!tokens.length) return { sent: 0, skipped };

    /**
     * FCM fetches the image itself, so it needs somewhere it can reach.
     *
     * Uploads are stored as `/uploads/x.jpg` on purpose — the API answers on
     * three different hostnames and each client resolves them against the base
     * it already uses. Google is not one of those clients: it needs the shop's
     * public origin spelled out, which is what PUBLIC_URL is for. Left off
     * entirely if that has not been set, since a relative URL would simply fail
     * on their side and drop the whole notification.
     */
    const image =
      notification.image && env.publicUrl
        ? `${env.publicUrl}${notification.image.startsWith('/') ? '' : '/uploads/'}${notification.image}`
        : null;

    const message = {
      notification: { title: notification.title, body: notification.body },
      data: dataPayload(notification),
      android: {
        /* A booking answer is time-sensitive enough to be worth waking the
           device for; the shop's news is not, and normal priority lets Android
           batch it into a maintenance window instead of costing battery. */
        priority: isBroadcast ? 'normal' : 'high',
        notification: { sound: 'default', ...(image ? { imageUrl: image } : {}) },
      },
      apns: {
        payload: { aps: { sound: 'default', badge: 1, 'mutable-content': image ? 1 : 0 } },
        headers: { 'apns-priority': isBroadcast ? '5' : '10' },
        ...(image ? { fcmOptions: { imageUrl: image } } : {}),
      },
    };

    let sent = 0;
    let pruned = 0;
    for (let i = 0; i < tokens.length; i += BATCH) {
      const batch = tokens.slice(i, i + BATCH);
      const res = await messaging.sendEachForMulticast({ ...message, tokens: batch });
      sent += res.successCount;
      pruned += await pruneTokens(res.responses, batch);
    }
    if (pruned) console.log(`[push] dropped ${pruned} dead device token(s)`);

    return { sent, skipped };
  } catch (err) {
    console.error('[push] send failed:', err.message);
    return { sent: 0, skipped: 0, error: err.message };
  }
}
