import { notePushToken, reportDevice } from './deviceRegistry';
import type { AppNotification } from '../types';

/**
 * Push transport seam.
 *
 * Messages reach an open app over Socket.IO. Firebase Cloud Messaging wakes a
 * closed one, and this file is the only place that knows there are two
 * transports at all — everything downstream is handed an `AppNotification` and
 * never learns which way it arrived.
 *
 * The Firebase implementation lives in `pushFirebase.ts` and is installed in
 * `index.js` when the native packages and credentials are present. Until then
 * the no-op adapter below stays in place and the app is unchanged: fully
 * functional, socket-delivered, nothing broken by the absence.
 *
 * ── The invariant that makes two transports safe ─────────────────────────────
 *
 * Both carry the id of the same `Notification` document, and `deliver()` in
 * NotificationsContext drops a message whose id it has already seen. So a client
 * with the app open receives both and shows one. Anything that sends a push
 * built separately from the stored record breaks that silently, and only for
 * users who happen to be online.
 */

export interface PushAdapter {
  requestPermission: () => Promise<boolean>;
  getToken: () => Promise<string | null>;
  /** Returns an unsubscribe function. */
  onMessage: (handler: (notification: AppNotification) => void) => () => void;
  /**
   * FCM rotates tokens — on restore to a new device, after a long silence, when
   * app data is cleared. A rotated token that is never re-registered means the
   * server keeps pushing into a dead address and nothing appears to be wrong
   * from either end. Optional so an adapter without the concept can omit it.
   */
  onTokenRefresh?: (handler: (token: string) => void) => () => void;
}

/**
 * The no-op adapter in use until Firebase is configured. It is deliberately
 * silent rather than throwing: the app is fully functional without push while
 * it is open, and a missing transport should not surface as an error.
 */
const noopAdapter: PushAdapter = {
  requestPermission: async () => false,
  getToken: async () => null,
  onMessage: () => () => {},
};

let adapter: PushAdapter = noopAdapter;

/** Swap in the Firebase adapter once it exists. */
export function setPushAdapter(next: PushAdapter) {
  adapter = next;
}

export const pushAvailable = () => adapter !== noopAdapter;

/**
 * Registers this device against the signed-in user so the server can push to
 * it. Safe to call on every sign-in — the server keeps the five most recent
 * devices per user and matches this one by its install id.
 *
 * The token is handed to the device registry rather than posted from here, so
 * the push address and what the phone is running arrive as one record instead
 * of two writes racing each other over the same row.
 */
const sendToken = async (token: string) => {
  notePushToken(token);
  return reportDevice();
};

export async function registerDevice(): Promise<boolean> {
  const granted = await adapter.requestPermission();
  if (!granted) return false;

  const token = await adapter.getToken();
  if (!token) return false;

  return sendToken(token);
}

/** Keeps the server's copy current when FCM rotates the token mid-session. */
export function watchTokenRefresh() {
  return adapter.onTokenRefresh?.((token) => {
    sendToken(token);
  });
}

export function subscribeToPushMessages(handler: (notification: AppNotification) => void) {
  return adapter.onMessage(handler);
}
