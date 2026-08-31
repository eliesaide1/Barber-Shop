# VIA Barber House — client app

React Native CLI (TypeScript). See the [root README](../README.md) for the full picture,
including how this talks to the API and the CMS.

## Running it

The API must be up first (`npm run server` from the repo root), then:

```bash
npm run reverse    # adb reverse tcp:4000 + tcp:8081 — the app talks to localhost
npm run android
```

`npm run reverse` is what makes `http://localhost:4000` mean *your machine* rather than the
phone. Without it, change `API_URL` in `src/config.ts` — see the comment there for the
emulator and LAN cases.

## Layout

```
src/
├── api/         fetch client with token refresh, and the Socket.IO connection
├── components/  the shared UI kit (ui.tsx) and the product tile
├── hooks/       useApi — GET with refetch on screen focus; useSocketEvent
├── lib/         QR encoder, used for reward claim and order pickup codes
├── navigation/  role-branched: client tabs, artist tabs, or the auth stack
├── screens/     grouped by area: auth, home, book, scan, shop, orders, profile
│   └── artist/  the artist portal — schedule, clients, check-in QR, orders, more
├── store/       Theme, Auth, Cart, Toast, Dialog and Notifications contexts
├── config.ts    where the API lives, as seen from the device
├── theme.ts     the light and dark palettes
└── types.ts     the API's shapes
```

## Tests

```bash
npm test          # QR encoder — structural invariants of the generated symbol
npx tsc --noEmit  # type-check
```

The QR encoder is the one piece here with real algorithmic risk: the app renders reward claim
codes and order pickup codes with it, and an artist has to be able to scan them from the screen.
The round-trip (render → decode → API accepts it) is verified end to end at the repo level.

## One app, two portals

`RootNavigator` branches on the signed-in user's role, so the same build serves both sides of
the shop:

| Role | What they get |
| --- | --- |
| `client` | Home · Book · **[Scan]** · Shop · Profile |
| `artist` | Today · Clients · **[Check-in]** · Orders · More |
| `admin`  | A notice pointing at the web back office |

Both bars keep the raised centre button for the thing you do standing at the chair — for a client
that's scanning the code, for an artist it's showing the code to be scanned.

The artist portal is the phone-sized version of the back office, not a copy of it: the schedule
(complete / no-show, with the client's saved clipper preference on the card), the client book with
loyalty standing, the rotating check-in QR and free-cut redemption, order hand-off by pickup code,
the portfolio (photograph a cut and submit it for approval), and a broadcast to their own clients.
Anything that needs a keyboard and a desk — adding products, editing hours and rates — stays in the
CMS, and the More tab says so.

### The portfolio

`More → My portfolio` shoots or picks a photo, tags it, and posts it as multipart to
`POST /api/styles`. Uploads land as `pending`; the shop publishes them from the CMS **Lookbook**
page, and published looks appear in the client app under **Trending styles → View all**.

`api.upload()` is the multipart path. Note that `request()` deliberately leaves `Content-Type`
unset for FormData — React Native's fetch has to add it itself so the multipart boundary is
included; setting it by hand produces a body the server cannot parse.

An admin gets neither: they have no chair and no loyalty card, so the client app would show empty
bookings and the artist portal would ask the API for a check-in code it cannot mint for them.

## Realtime notifications

Messages sent from the CMS arrive over Socket.IO while the app is open.
`store/NotificationsContext.tsx` owns the whole path — one listener for the
entire app, the unread count, the inbox, and the heads-up banner that floats
above every screen.

It is a provider rather than a screen-level hook on purpose. The listener used
to live on the Home screen, which meant nothing arrived until that screen had
been visited, and nothing ever arrived in the artist portal at all.

```tsx
const { items, unread, markAllRead } = useNotifications();
```

The banner (`components/NotificationBanner.tsx`) is what a push looks like while
the app is already open: top of the screen, tappable to open the inbox,
swipe-up to dismiss, auto-hiding after five seconds. Tapping navigates through
`navigation/ref.ts`, because the provider wraps the navigator and so cannot use
`useNavigation`.

### Adding Firebase later

`api/push.ts` is the seam, and it is the only file that has to change. Every
message — socket or push — is handed to the same `deliver()`, which drops
anything whose id it has already seen, so the two transports can overlap
safely.

```ts
setPushAdapter({ requestPermission, getToken, onMessage });  // from @react-native-firebase/messaging
```

The server half is already built: `POST /api/auth/devices` stores up to five
device tokens per user, and `resolveTargets()` in the notifications route
already works out who a message is for. What is missing is the Firebase
credentials and the sending call — see the walkthrough at the top of
`api/push.ts`.

## Dialogs

The app does not use React Native's `Alert` — it renders the platform's own box, which ignores
the theme entirely. `components/Dialog.tsx` is the app's version, and `store/DialogContext.tsx`
exposes it imperatively so a call site stays about as short as `Alert.alert` was:

```tsx
const { confirm } = useDialog();

const ok = await confirm({
  title: 'Cancel this booking?',
  message: 'You can rebook any time.',
  icon: '🗓️',
  tone: 'danger',            // makes the affirmative button destructive
  confirmLabel: 'Cancel booking',
  cancelLabel: 'Keep my chair',
});
if (ok) { /* … */ }
```

`alert({ title, message })` is the one-button variant, and resolves when dismissed.

### Errors are dialogs, never toasts

```tsx
const { showError } = useDialog();

try {
  await api.post('/orders', payload);
} catch (err) {
  showError(err instanceof ApiError ? err.message : 'Could not place the order', {
    title: 'Order not placed',
    icon: '🛍️',
  });
}
```

`useToast()` deliberately exposes **only** `toast` — there is no `error` on it, so an error toast
cannot creep back in by accident. A toast is the wrong shape for a failure: it disappears on a
timer, so the one message the user most needed to read is the one most likely to be missed, and
there is nothing to acknowledge.

Pass a `title` at every call site. The API's messages are already written for a person to read
("Only 3 left of Matte Clay Pomade"), so they make a good body; the title's job is to say *which
action failed* — "Order not placed" tells you where you stand, "Something went wrong" does not.

Two things stay off this path on purpose:

- **Form validation** (sign in, register, the delivery address) stays inline under the field it
  belongs to. A dialog would hide the field you need to fix.
- **Failed background GETs** (`useApi`) stay silent. It refetches whenever a screen regains focus,
  so routing those into dialogs would fire one every time you switched tabs on a flaky
  connection.

Awaiting the answer rather than passing callbacks into a button array keeps the follow-up logic
in the function that asked the question. Backdrop taps and the Android hardware back button both
resolve `false`, and the resolver is cleared the instant it settles so a double tap can never run
the caller's action twice.

## Notes

- `react-native-nitro-modules` and `react-native-nitro-image` are listed as direct dependencies
  on purpose. `react-native-vision-camera` needs them, but pulls them in as *peer* dependencies,
  and React Native's autolinking only scans direct ones — without them the Android build fails
  with `Project with path ':react-native-nitro-modules' could not be found`.
- `minSdkVersion` is 26 because vision-camera 5 requires it.
- Camera scanning degrades gracefully: if permission is refused or the camera is unavailable,
  the 6-character code under the artist's QR can always be typed instead.
