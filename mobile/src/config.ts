/**
 * Where the API lives, as seen from the device.
 *
 * `localhost` on a phone means the phone itself, not your laptop. This default
 * works because `npm run android` runs `adb reverse tcp:4000 tcp:4000` first,
 * tunnelling the device's port 4000 back to the machine running the API.
 *
 * If you launch the app another way, change this to:
 *   - `http://10.0.2.2:4000`   on the Android emulator (its alias for the host)
 *   - `http://<your-lan-ip>:4000`  on a physical device without adb reverse
 */
export const API_URL = 'http://localhost:4000';

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
