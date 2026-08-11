/**
 * The deployed API. Release builds talk to this and nothing else.
 *
 * It must be https. Android blocks cleartext HTTP in release builds by default
 * (`usesCleartextTraffic` is false), so a plain http:// address here produces an
 * app that installs, launches, and fails every request with no visible reason.
 */
const PRODUCTION_API = 'https://faderoom-api.onrender.com';

/**
 * The API during development, as seen from the device.
 *
 * `localhost` on a phone means the phone itself, not your laptop. This works
 * because `npm run android` runs `adb reverse tcp:4000 tcp:4000` first,
 * tunnelling the device's port 4000 back to the machine running the API.
 *
 * If you launch the app another way, change this to:
 *   - `http://10.0.2.2:4000`   on the Android emulator (its alias for the host)
 *   - `http://<your-lan-ip>:4000`  on a physical device without adb reverse
 *
 * The iOS simulator needs no change: it shares the host's network, so localhost
 * already is your machine. A physical iPhone does — use the LAN IP. Either way
 * `NSAllowsLocalNetworking` in Info.plist is what lets plain http reach it,
 * while the production URL above still has to be https.
 */
const DEVELOPMENT_API = 'http://localhost:4000';

/**
 * Where the API lives.
 *
 * `__DEV__` is substituted at build time — true for `npm run android`, false for
 * `assembleRelease` — so the release APK cannot accidentally ship pointing at a
 * laptop, and development does not need a running deployment. The unused branch
 * is dropped by the minifier.
 */
export const API_URL = __DEV__ ? DEVELOPMENT_API : PRODUCTION_API;

/** Uploaded images come back as `/uploads/x.jpg` — resolve against the API. */
export const absoluteUrl = (path?: string | null): string | undefined => {
  if (!path) return undefined;
  if (path.startsWith('http')) return path;
  return `${API_URL}${path.startsWith('/') ? '' : '/'}${path}`;
};

export const SHOP = {
  name: 'FadeRoom',
  area: 'Mar Mikhael, Beirut',
  hours: 'Tue–Sun · 10:00–20:00',
  phone: '+961 1 567 890',
};
