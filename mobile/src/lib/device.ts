import { Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';

/**
 * What this install is, as the shop records it.
 *
 * Gathered in one place so the screen that shows it and the call that reports
 * it can never disagree — the support conversation is "they say 1.2, the server
 * says 1.2", and that is only true if both read the same object.
 */
export interface DeviceFacts {
  /** Stable per install. On iOS this is identifierForVendor, not the ad id. */
  deviceId: string;
  platform: 'ios' | 'android';
  /** The marketing version — 1.0, 1.1 — not the build number. */
  appVersion: string;
  buildNumber: string;
  osVersion: string;
  model: string;
}

/* getUniqueId is the one async call here and its answer never changes for the
   life of the install, so it is fetched once and kept. */
let cached: DeviceFacts | null = null;

export async function deviceFacts(): Promise<DeviceFacts> {
  if (cached) return cached;

  cached = {
    deviceId: await DeviceInfo.getUniqueId(),
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    appVersion: DeviceInfo.getVersion(),
    buildNumber: DeviceInfo.getBuildNumber(),
    /* A number on Android ("34"), a string on iOS ("18.6"). Both are shown as
       written rather than parsed into something they are not. */
    osVersion: String(Platform.Version),
    model: DeviceInfo.getModel(),
  };
  return cached;
}

/** How the platform is spelled for a person rather than a switch statement. */
export const platformLabel = (p: 'ios' | 'android') => (p === 'ios' ? 'iOS' : 'Android');
