# FadeRoom

A barber shop platform in three parts, sharing one MongoDB and one realtime channel.

| Folder    | What it is                                    | Stack                                        |
| --------- | --------------------------------------------- | -------------------------------------------- |
| `server/` | REST API + Socket.IO gateway                  | Node, Express, Mongoose, Socket.IO           |
| `cms/`    | Back office for artists and the shop admin    | React (Vite), Socket.IO client               |
| `mobile/` | The app — client and artist portals in one   | React Native CLI (TypeScript), Socket.IO     |

`barber-app-v2.html` is the original single-file prototype, kept as the design reference.

---

## What it does

**Clients** book a chair, browse and buy the products their artist actually uses, collect a
loyalty stamp by scanning a QR at the chair, and earn a free haircut every five visits.

**Artists** run their chair from either the app or the CMS. The mobile portal is the at-the-chair
half — today's schedule, the client book, the rotating check-in QR, redeeming free cuts, handing
over orders by pickup code, and messaging their own clients. The desk half — adding products,
uploading photos, editing hours and rates — stays in the CMS.

**The shop admin** manages artists, approves what artists publish — products and lookbook photos
alike — works the order board, and broadcasts to everybody.

### The loyalty programme, and why it is hard to cheat

1. The check-in QR lives on the **artist's** screen, never on a poster, and **rotates every 60
   seconds**. A photograph of it is worthless a minute later, so a successful scan is evidence
   the client was standing at the chair.
2. The payload is signed with **HMAC-SHA256** over a server-side shop secret. The secret never
   reaches any client, so a code cannot be forged.
3. **One stamp per visit**, enforced by a cooldown (4 hours by default).
4. The fifth stamp mints a **free haircut** with a claim code and resets the card to zero.
5. Only an **artist** can burn a reward. There is no route a client can call to mark their own
   free cut used — the client app can display a claim code and nothing more.
6. Cancelling a booking that held a free cut **returns it to the card**. A reward is never lost.

---

## Running it

### Prerequisites

- **Node 22.13+** (React Native 0.86 wants `^20.19.4 || ^22.13.0 || ^24.3.0`; older
  22.x installs and runs, but npm warns on every install)
- MongoDB running locally (`mongodb://127.0.0.1:27017`)
- For the app: Android SDK + JDK 17, and a device or emulator

### First run

```bash
git clone https://github.com/eliesaide1/Barber-Shop.git
cd Barber-Shop
npm run setup
```

`setup` creates `server/.env`, installs all three packages, and **restores the
database that ships in `server/db/`** — so a clone comes up with the same four
artists, twelve products, eight looks and demo clients, not an empty shop.

It is safe to re-run: it never overwrites an `.env` you have edited, and never
replaces a database that already holds data — it tells you to pass `--force` if
that is what you want.

Then, in separate terminals:

```bash
npm run server          # API on :4000
npm run cms             # back office on :5173
npm run android         # adb reverse + build and install the app
```

### The database in the repo

`server/db/` holds the database as Extended JSON, one file per collection —
that is where it lives in the repo, and `npm run setup` restores it on a fresh
clone.

```bash
npm run db:dump                    # database  → server/db/*.json
npm run db:restore                 # server/db → database
npm run db:restore -- --force      # …over a database that already has data
```

After changing data you want other people to have, run `npm run db:dump` and
commit `server/db/`.

This is not a replacement for `npm run seed`. The seed builds a fresh shop from
code; the dump reproduces a **captured state exactly** — same ObjectIds, same
timestamps, same loyalty progress — which is what makes a bug someone else hit
reproducible on your machine.

It is Extended JSON rather than `mongodump`'s BSON on purpose. BSON is the right
format for a backup and the wrong one for a repository: binary, so a reviewer
cannot see what changed, and any edit rewrites the whole file. These are text,
sorted by `_id` and pretty-printed, so `git diff` shows the individual document
that moved and re-dumping unchanged data produces **no diff at all**.

Two things to know:

- The dump contains **bcrypt password hashes and email addresses**. That is
  harmless for the seeded demo accounts, but do not dump a database holding real
  client records into a repository.
- `server/uploads/` stays gitignored, so a restore elsewhere will show uploaded
  product and portfolio photos as missing. `db:dump` tells you how many
  documents reference one.

### Seeded logins

| Role   | Email                | Password    |
| ------ | -------------------- | ----------- |
| Admin  | `admin@faderoom.app` | `password1` |
| Artist | `karim@faderoom.app` | `password1` |
| Client | `elie@faderoom.app`  | `password1` |

Also `rami@`, `jad@`, `tony@` (artists) and `marc@`, `hadi@`, `nour@` (clients).

### Seeing the whole loop

1. Sign into the CMS as **karim@faderoom.app** and open **Check-in & QR**.
2. Sign into the app as **elie@faderoom.app**, go to the **Scan** tab, point it at the screen.
3. The stamp lands in the CMS activity feed **live**, and the app's card ticks up.
4. Repeat to five and the app mints a free haircut with a claim code.
   *(`CHECKIN_COOLDOWN_MS` ships at 20s so a card can be filled in one sitting. The
   one-stamp-per-visit rule is real — set it to `14400000` for production.)*
5. Type that code into **Redeem a free cut** in the CMS to burn it.
6. Or do the whole loop on two phones: sign into the app as **karim@faderoom.app** and its
   **Check-in** tab shows the same rotating QR, the stamp lands in its activity feed live, and the
   claim code can be redeemed right there.
7. Buy something in the app's **Shop**; the order appears on the CMS **Orders** board instantly.
   Advance it there and the app updates without a refresh.
8. Send a message from CMS **Notifications** and watch it arrive on the phone.
9. As the artist, **More → My portfolio** → photograph a cut and submit it. It appears in the CMS
   **Lookbook** queue; publish it there and it shows up under **Trending styles** in the client app.

---

## Networking note

`localhost` on a phone means the phone. The app defaults to `http://localhost:4000`, which works
because `npm run android` runs `adb reverse` first, tunnelling the device's port 4000 to your
machine. If you run the app another way:

- **Android emulator** — use `http://10.0.2.2:4000` in `mobile/src/config.ts`
- **Physical device without adb reverse** — use your machine's LAN IP

Uploaded images are served as **relative** paths (`/uploads/x.jpg`) precisely because the same API
is reached at three different hostnames; each client resolves them against the base URL it
already uses.

---

### Troubleshooting

**Metro port 8081 already in use** — another React Native project is running its bundler. Run ours
on a spare port and point the device's 8081 at it, which leaves the other project alone:

```bash
adb reverse tcp:8081 tcp:8082
npm --prefix mobile run start -- --port 8082
```

**`Project with path ':react-native-nitro-modules' could not be found`** — React Native's
autolinking only scans *direct* dependencies, and `react-native-vision-camera` pulls the nitro
packages in as peers. They are listed explicitly in `mobile/package.json` for exactly this reason;
don't remove them.

**Gradle wrapper download times out** — `services.gradle.org` can be slow. Fetch the distribution
yourself with a resumable download and drop it in the wrapper cache, then rebuild:

```bash
curl -L --retry 8 -C - -o "$HOME/.gradle/wrapper/dists/gradle-9.3.1-bin/<hash>/gradle-9.3.1-bin.zip" \
  https://services.gradle.org/distributions/gradle-9.3.1-bin.zip
```

---

## Tests

```bash
npm test                      # 34 API integration tests against a real MongoDB
npm --prefix mobile test      # 8 QR encoder tests
npm run typecheck:mobile
npm run build:cms
```

The API tests use their own database (`faderoom_test`) and drop it on the way in, so they never
touch seeded development data. They cover the real journeys: server-side pricing (a client
sending `total: 0` is ignored), overselling the last unit, forged and expired check-in codes, the
one-stamp-per-visit cooldown, a client being unable to redeem their own reward, double-booking a
slot, a cancelled booking returning its free cut, and Socket.IO delivery.

---

## Architecture notes

**Money and stock are never taken on trust.** `POST /api/orders` accepts product ids and
quantities only; it prices the order from the database and decrements stock with the guard inside
the query (`{ stock: { $gte: qty } }`), so two people racing for the last unit cannot both win it.

**Transactions degrade gracefully.** Multi-document transactions need a replica set. A default
`mongod` is standalone, so `server/src/lib/tx.js` detects support once and falls back to
compensation — undoing the stock it already took — when transactions aren't available. Start
`mongod --replSet rs0` and `rs.initiate()` to get real transactions.

**Socket.IO is authenticated and room-addressed.** Every connection carries the same JWT the REST
API uses; an anonymous socket is rejected. On connect a socket joins `user:<id>`, `role:<role>`,
`artist:<id>` where relevant, and `staff` for anyone with a CMS seat — so fan-out is one emit to a
room rather than bookkeeping over socket ids.

**Failures are dialogs, never toasts — in both clients.** `mobile/src/store/DialogContext.tsx`
and `cms/src/context/DialogContext.jsx` expose the same three calls, so the two codebases read
the same way:

```js
const { confirm, alert, showError } = useDialog();

showError(err.message, { title: 'Order not placed', icon: '🛍️' });
if (await confirm({ title: 'Deactivate Karim?', tone: 'danger' })) { … }
```

Neither toast provider has an `error` method any more, so an error toast cannot creep back in.
A toast is the wrong shape for a failure: it leaves on a timer, so the one message the user most
needed to read is the one most likely to be missed, and there is nothing to acknowledge. Toasts
are kept for confirmations only. Every call site passes a `title` naming the action that failed —
the API's own message ("Only 3 left of Matte Clay Pomade") is already written for a person, so it
makes the body.

Form validation stays inline under the field it belongs to, and the app's background refetches
stay silent — `useApi` refetches on every screen focus, so routing those into dialogs would fire
one on each tab switch over a flaky connection.

**Ownership scopes the CMS.** A product's `owner` is an artist or null for the house label. An
artist sees and edits only their own shelf and their edits return to `pending`; an admin approves.
Artists can message their own clients or one named client, never the whole shop.

### Realtime events

| Event                  | Sent to                     | Fires when                          |
| ---------------------- | --------------------------- | ----------------------------------- |
| `notification:new`     | targeted users              | staff send a message                |
| `order:created`        | staff, buyer                | a client checks out                 |
| `order:status`         | buyer, staff                | an order moves along its flow       |
| `checkin:new`          | that artist, staff          | a stamp, a reward earned or burned  |
| `loyalty:updated`      | the client                  | their card changes                  |
| `appointment:created`  | that artist, staff          | a booking is made                   |
| `appointment:status`   | client, artist, staff       | a booking is completed or cancelled |
| `product:created/updated`, `catalogue:changed` | staff / everyone | the catalogue changes |

---

## Known gaps

- **QR *scanning* does not work on Android yet — typing the code does.**
  `react-native-vision-camera@5` has not implemented its code-scanning output on Android;
  `createObjectOutput()` throws `CameraObjectOutput is not available on Android!` there. The Scan
  screen detects this, says so plainly, and falls back to the 6-character code the artist's
  portal prints under the QR — which is exactly why that code exists. The scanning path itself is
  written and will light up on iOS, or on Android when the library ships it. If you need Android
  scanning sooner, the options are to downgrade to `vision-camera@4` (which has a working
  `useCodeScanner`, but predates React Native 0.86's architecture) or swap in a dedicated
  scanner such as `@react-native-ml-kit/barcode-scanning`.
- **Push notifications are in-app only.** A message composed in the CMS reaches the app over
  Socket.IO within a second — an app-wide heads-up banner, an unread badge on the bell, and the
  inbox — but only while the app is open. Waking a closed app needs Firebase, and
  `mobile/src/api/push.ts` is the single seam it plugs into: both transports hand messages to the
  same `deliver()`, which de-duplicates by id. Device tokens are already collected
  (`POST /api/auth/devices`) and `resolveTargets()` already resolves audiences; what's missing is
  the FCM credentials and the sending call.
- **No payment provider.** Orders are cash or card *on collection*; nothing is charged in-app.
- **Product reviews are placeholder copy** shared across every product.
- **iOS is unbuilt.** The code is cross-platform and the Podfile is in place, but it has only been
  built and run on Android.
