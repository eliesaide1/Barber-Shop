import { Platform } from 'react-native';
import { api } from './client';
import type { AppNotification } from '../types';

/**
 * Push transport seam.
 *
 * Today every message arrives over Socket.IO, which only works while the app is
 * open. Firebase Cloud Messaging is what will wake a closed app, and this file
 * is the single place that has to change when it goes in — nothing else in the
 * app knows which transport a message came from.
 *
 * The server side is already built: `POST /api/auth/devices` stores a token per
 * user, and `resolveTargets()` in the notifications route already works out who
 * a message is for. What is missing is only the credentials and the sending
 * half.
 *
 * ── Wiring FCM in ────────────────────────────────────────────────────────────
 *
 * 1. `npm i @react-native-firebase/app @react-native-firebase/messaging`, drop
 *    `google-services.json` into `android/app/`, and add the Google Services
 *    Gradle plugin.
 *
 * 2. Fill in the three functions below. They are deliberately the whole
 *    surface:
 *
 *      requestPushPermission()  → messaging().requestPermission()
 *      getDeviceToken()         → messaging().getToken()
 *      subscribeToPushMessages()→ messaging().onMessage(...) for foreground,
 *                                 setBackgroundMessageHandler(...) for the rest
 *
 * 3. On the server, send to `user.devices[].token` inside the same loop that
 *    already emits `notification:new`, so a client who is offline gets the push
 *    and a client who is watching gets the socket event. De-duplication is
 *    already handled: `deliver()` in NotificationsContext drops a message whose
 *    id it has seen.
 */

export interface PushAdapter {
  requestPermission: () => Promise<boolean>;
  getToken: () => Promise<string | null>;
  /** Returns an unsubscribe function. */
  onMessage: (handler: (notification: AppNotification) => void) => () => void;
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
 * tokens per user and de-duplicates by token.
 */
export async function registerDevice(): Promise<boolean> {
  const granted = await adapter.requestPermission();
  if (!granted) return false;

  const token = await adapter.getToken();
  if (!token) return false;

  try {
    await api.post('/auth/devices', {
      token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    });
    return true;
  } catch {
    /* A failed registration costs the user nothing right now — they still get
       everything over the socket while the app is open. */
    return false;
  }
}

export function subscribeToPushMessages(handler: (notification: AppNotification) => void) {
  return adapter.onMessage(handler);
}
