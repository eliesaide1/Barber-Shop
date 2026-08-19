/**
 * The deployed API. Release builds talk to this and nothing else.
 *
 * It must be https. Android blocks cleartext HTTP in release builds by default
 * (`usesCleartextTraffic` is false), so a plain http:// address here produces an
 * app that installs, launches, and fails every request with no visible reason.
 */
const PRODUCTION_API = 'https://faderoom-api.onrender.com';

/**
 * The API during development — the deployed one unless told otherwise.
 *
 * Defaulting to the deployment means a checkout runs against a shop with data
 * in it without first standing up Mongo and the API locally. Pointing at a
 * machine on your desk is the deliberate act, not the accident:
 *
 *     API_URL=http://localhost:4000 npm run ios
 *
 * `process.env.API_URL` is substituted at BUILD time by the Babel plugin in
 * babel.config.js — there is no runtime environment on a phone to read. Two
 * consequences worth knowing: changing it means restarting Metro with
 * `--reset-cache`, because the old value is baked into cached modules; and it
 * is read from the shell that starts METRO, not the one that starts the app.
 *
 * Addressing a local API from a device, once you do override it:
 *   - `http://localhost:4000`     iOS simulator (it shares the host's network)
 *   - `http://10.0.2.2:4000`      Android emulator (its alias for the host)
 *   - `http://<your-lan-ip>:4000` a physical phone
 *   - Android via `npm run android` also works on `localhost`, because
 *     `adb reverse tcp:4000 tcp:4000` tunnels the device's port back to you.
 *
 * `NSAllowsLocalNetworking` in Info.plist is what lets plain http reach a local
 * address at all; the https default above is unaffected by it.
 */
const DEVELOPMENT_API = process.env.API_URL || 'https://faderoom-api.onrender.com';

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
