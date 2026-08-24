import { AppState } from 'react-native';
import { api } from './client';
import { deviceFacts } from '../lib/device';

/**
 * Keeps the server's picture of this install current.
 *
 * Reported on sign-in and again whenever the app returns to the foreground,
 * because the interesting change — a new app version — happens while the app is
 * *not* running: the update lands, the user opens it, and the shop should know
 * immediately rather than at the next sign-in weeks later.
 *
 * Cheap enough to attach to every foreground because it sends nothing when
 * nothing has changed. The facts only move when the OS or the app is updated,
 * so after the first call this is a string comparison and no network at all.
 */
let lastSent: string | null = null;
let pushToken: string | null = null;

/** Called by the push layer once a token exists, so the two are reported together. */
export function notePushToken(token: string) {
  pushToken = token;
  /* The token is new information, so the next report must actually go out. */
  lastSent = null;
}

export async function reportDevice(): Promise<boolean> {
  try {
    const facts = await deviceFacts();
    const payload = { ...facts, ...(pushToken ? { token: pushToken } : {}) };

    const fingerprint = JSON.stringify(payload);
    if (fingerprint === lastSent) return true;

    await api.post('/auth/devices', payload);
    lastSent = fingerprint;
    return true;
  } catch {
    /* Nothing the user asked for has failed, so nothing is shown. The next
       foreground tries again, and `lastSent` is untouched so it will. */
    return false;
  }
}

/** Forgotten on sign-out — the next person on this phone is a different record. */
export function resetDeviceReport() {
  lastSent = null;
}

/** Returns an unsubscribe function. */
export function watchForeground(): () => void {
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') reportDevice();
  });
  return () => sub.remove();
}
