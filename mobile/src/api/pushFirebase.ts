import { PermissionsAndroid, Platform } from 'react-native';
import type { PushAdapter } from './push';
import type { AppNotification, NotificationKind } from '../types';

/**
 * The Firebase half of the push seam.
 *
 * ── Why this loads Firebase by hand ──────────────────────────────────────────
 *
 * `@react-native-firebase/*` are native modules, and importing them statically
 * would make the whole bundle fail on a machine that has not installed them or
 * has no `google-services.json`. That would be a strange trade: the app works
 * completely over Socket.IO without push, so an absent optional transport must
 * cost nothing at all.
 *
 * So the modules are looked up at runtime and every branch of the lookup ends in
 * "carry on without push". `getApp()` is what actually proves the credentials
 * are there — without `google-services.json` there is no default Firebase app
 * and it throws, which is caught here rather than taking the app down.
 *
 * ── Modular, not namespaced ──────────────────────────────────────────────────
 *
 * React Native Firebase v22 deprecated `messaging().getToken()` and v26 removed
 * it: there is no callable default export any more, only free functions that
 * take the messaging instance first — `getToken(messaging)`. Most guides still
 * show the old form, so this is worth knowing before "fixing" anything here.
 */

/* Only the surface actually used, so this file needs no types from packages
   that may not be installed. */
interface FirebaseMessage {
  messageId?: string;
  notification?: { title?: string; body?: string };
  data?: Record<string, string>;
  sentTime?: number;
}

type Unsubscribe = () => void;

interface MessagingApi {
  getToken(messaging: unknown): Promise<string>;
  requestPermission(messaging: unknown): Promise<number>;
  onMessage(messaging: unknown, listener: (m: FirebaseMessage) => void): Unsubscribe;
  onNotificationOpenedApp(
    messaging: unknown,
    listener: (m: FirebaseMessage) => void,
  ): Unsubscribe;
  onTokenRefresh(messaging: unknown, listener: (token: string) => void): Unsubscribe;
  getInitialNotification(messaging: unknown): Promise<FirebaseMessage | null>;
  setBackgroundMessageHandler(
    messaging: unknown,
    handler: (m: FirebaseMessage) => Promise<void>,
  ): void;
  AuthorizationStatus: { AUTHORIZED: number; PROVISIONAL: number };
}

interface Loaded {
  messaging: unknown;
  api: MessagingApi;
}

let cached: Loaded | null | undefined;

function firebase(): Loaded | null {
  if (cached !== undefined) return cached;
  try {
    /* Required rather than imported so a missing package is a caught error at
       this line instead of a bundler failure at startup. */
    /* eslint-disable @typescript-eslint/no-var-requires, global-require */
    const appModule = require('@react-native-firebase/app');
    const api = require('@react-native-firebase/messaging') as MessagingApi & {
      getMessaging(app: unknown): unknown;
    };
    /* eslint-enable @typescript-eslint/no-var-requires, global-require */

    /* Throws when there is no google-services.json, which is the case this
       whole file is written to survive. */
    const app = appModule.getApp();
    cached = { messaging: api.getMessaging(app), api };
  } catch {
    cached = null;
  }
  return cached;
}

/** Is Firebase actually installed and configured on this build? */
export const firebaseAvailable = () => firebase() !== null;

/**
 * A push, in the shape the rest of the app already speaks.
 *
 * `id` is the whole point: it is the id of the same Notification document the
 * socket delivers, so `deliver()` drops whichever copy arrives second. A message
 * without one would show twice for anybody who had the app open — a bug visible
 * only to the most engaged users.
 */
function toAppNotification(message: FirebaseMessage): AppNotification | null {
  const id = message.data?.id;
  if (!id) return null;

  const { screen, targetId, kind } = message.data ?? {};
  return {
    id,
    title: message.notification?.title ?? '',
    body: message.notification?.body ?? '',
    kind: (kind as NotificationKind) ?? 'message',
    sentAt: new Date(message.sentTime ?? Date.now()).toISOString(),
    read: false,
    createdByName: 'VIA Barber House',
    data: { ...(screen ? { screen } : {}), ...(targetId ? { id: targetId } : {}) },
  };
}

export const firebaseAdapter: PushAdapter = {
  async requestPermission() {
    const fb = firebase();
    if (!fb) return false;

    /* Android 13 added a runtime permission for notifications. Below it the
       grant is implicit, and asking would resolve as denied on some OEM builds
       — so the version check is doing real work, not tidiness. */
    if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) return false;
    }

    try {
      const status = await fb.api.requestPermission(fb.messaging);
      const { AUTHORIZED, PROVISIONAL } = fb.api.AuthorizationStatus;
      /* Provisional counts: iOS delivers those quietly rather than not at all. */
      return status === AUTHORIZED || status === PROVISIONAL;
    } catch {
      return false;
    }
  },

  async getToken() {
    const fb = firebase();
    if (!fb) return null;
    try {
      return await fb.api.getToken(fb.messaging);
    } catch {
      return null;
    }
  },

  onTokenRefresh(handler: (token: string) => void) {
    const fb = firebase();
    if (!fb) return () => {};
    return fb.api.onTokenRefresh(fb.messaging, handler);
  },

  onMessage(handler: (notification: AppNotification) => void) {
    const fb = firebase();
    if (!fb) return () => {};

    const forward = (message: FirebaseMessage) => {
      const notification = toAppNotification(message);
      if (notification) handler(notification);
    };

    /* Foreground. Android does not draw a system notification while the app is
       open, which is exactly right — the in-app banner is better placed and can
       be tapped through to the thing it is about. */
    const stopForeground = fb.api.onMessage(fb.messaging, forward);

    /* Tapped from the tray with the app in the background. Handing it to the
       same handler means the inbox and the banner agree about what has arrived,
       whichever way in it came. */
    const stopOpened = fb.api.onNotificationOpenedApp(fb.messaging, forward);

    /* Tapped from the tray with the app shut: the message is waiting at launch
       rather than arriving through a listener. */
    fb.api
      .getInitialNotification(fb.messaging)
      .then((message) => {
        if (message) forward(message);
      })
      .catch(() => {});

    return () => {
      stopForeground();
      stopOpened();
    };
  },
};

/**
 * Registers the background handler.
 *
 * Must run at module scope before React mounts — the OS may start the app
 * headless purely to hand over a message, and a handler registered inside a
 * component would not exist yet. It is only registered, never used to draw
 * anything: FCM already shows the tray notification, and the app catches up
 * from the server the moment it is next opened.
 */
export function installFirebaseBackgroundHandler() {
  const fb = firebase();
  if (!fb) return;
  fb.api.setBackgroundMessageHandler(fb.messaging, async () => {
    /* Nothing to do. The system draws it; the inbox reloads on foreground. */
  });
}
