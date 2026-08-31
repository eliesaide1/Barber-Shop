# VIA Barber House

A barber shop platform in three parts, sharing one MongoDB and one realtime channel.

| Folder    | What it is                                    | Stack                                        |
| --------- | --------------------------------------------- | -------------------------------------------- |
| `server/` | REST API + Socket.IO gateway                  | Node, Express, Mongoose, Socket.IO           |
| `cms/`    | Back office for artists and the shop admin    | React (Vite), Socket.IO client               |
| `mobile/` | The app — client and artist portals in one   | React Native CLI (TypeScript), Socket.IO     |

`barber-app-v2.html` is the original single-file prototype, kept as the design reference.

---

## What it does

**Clients** ask for a chair, browse and buy the products their artist actually uses, collect a
loyalty stamp by scanning a QR at the chair, and earn a free haircut on a schedule the shop
sets — every eighth visit by default.

**Artists** run their chair from either the app or the CMS. The mobile portal is the at-the-chair
half — the request inbox, today's schedule, the client book, the rotating check-in QR, redeeming
free cuts, handing over orders by pickup code, and messaging their own clients. The desk half —
adding products, uploading photos, editing hours and rates — stays in the CMS.

**The shop admin** manages artists, approves what artists publish — products and lookbook photos
alike — works the order board, and broadcasts to everybody.

### Booking is a request, and the artist sets the length

A client picking a time does not take it. They **ask** for it, and the booking sits as `pending`
holding nothing at all. The chair is reserved at one moment only: when the artist accepts and says
how long to give the cut.

Two things follow from that, and both are the point:

1. **Nobody can take the week out of circulation.** If a request held its slot, one client could
   pick every time on the board and never turn up, and the chair would sit empty behind a wall of
   reservations. Because a request holds nothing, several clients can ask for five o'clock and the
   artist decides who gets it. Availability says how many are already in the queue for a time, so a
   client can see they are competing *before* they ask rather than after.
2. **The length is the artist's call, not the price list's.** "Hair and beard" is twenty-five
   minutes for one client and forty for another, and only the person holding the clippers knows
   which. The service duration is carried on the request as an estimate; on acceptance the artist
   replaces it with the length they actually want, and that is what goes in the book.
3. **So is the start.** The answer to "can you do five?" is so often "not five, but I can do quarter
   to six", and making that a decline the client has to come back and re-ask for loses the
   appointment. The artist can move the booking as they accept it. The time originally asked for is
   kept on the record (`requestedStartsAt`) and both sides are shown it — a client who asked for five
   and finds quarter to six should be able to see it was moved rather than mis-tapped.

### Signing in with Google or Apple

**The provider is not the identity.** Firebase is already here and Firebase Auth would do all of
this — it is still the wrong tool. Every appointment, order and loyalty card points at a `User` by
`_id`; the shop has its own JWTs and its own refresh-token versioning. Handing identity to Firebase
would mean migrating all of that, and making a third party a hard dependency of *logging in*, where
today it is an optional transport for push the app runs fine without.

So a provider is asked one question — *is this really them* — and the answer is a verified email and
a stable subject id. Google and Apple become extra doors into the same building, not a new building.

**Accounts are matched on the provider's subject, never on the email.** People change the address on
a Google account; matching on something the user can edit means their history quietly detaches. The
email is used for exactly one thing: the first-time link to an existing password account, so
somebody who signed up in March and taps *Continue with Google* in June keeps their loyalty card
rather than starting a second one beside it. The account's own email never follows the provider's —
that is what password sign-in is looked up by, and it is unique-indexed.

**A verified email is not a formality.** Linking on an unverified one would let anyone able to mint
a token claiming `elie@…` walk into Elie's account, so a provider that will not vouch for the
address is refused outright. The audience check matters just as much: without it a token minted for
*any other app* would be accepted here.

**A provider sign-in only ever creates a client.** Chairs and admin seats are made by an admin,
deliberately.

**And it leaves the client card half empty.** Sign-up asks for a mobile number, a date of birth and
how often somebody cuts; no provider knows any of them and none ever will. So a first social sign-in
returns `profileComplete: false` and the app puts a completion screen *in front of* the rest of it —
a client book that is only sometimes filled in is one no artist will trust. There is no skip, but
there is a way out: signing out.

A social-only account can also set a first password without proving an old one, which is how
somebody stops depending on a provider they might lose access to. And a password login against such
an account is told which door it uses rather than being left guessing at a password that was never
set.

**Set-up, per provider.** Both are off until their client ids are configured; `GET /api/auth/providers`
is what the app asks before drawing the buttons, so one build serves a shop that has set them up and
one that has not.

- **Google** needs an OAuth web client id (the audience Google puts in every id token, including on
  Android) and an Android client id whose **SHA-1 fingerprint** is registered — the step that was
  deliberately skipped when setting up push, because FCM does not need it.
- **Apple** needs a paid Apple Developer account, Sign in with Apple enabled on the App ID, and an
  iOS build. Sign in with Apple on Android is a web redirect flow and is not offered here.

### The client record

Sign-up asks for the whole card and takes none of it as optional: **full name, date of birth,
email, mobile number, and how often they usually get cut**. An optional field on an intake form is
a field nobody fills in, and a half-filled client book is not one an artist will trust.

Two of those are less obvious than they look:

**A birthday is not an instant.** `dateOfBirth` is a `YYYY-MM-DD` string, not a `Date`. Stored as a
Date it becomes UTC midnight, and anybody reading it west of Greenwich sees the day before —
somebody born on the 1st shows up as the 31st. A string has no zone to get wrong. It is validated
for being a *real* day as well as a well-formed one, because `2025-02-30` matches the pattern and
JavaScript quietly rolls it into 2 March rather than refusing it.

**Frequency is stored as weeks, not a label.** A number is the thing you can compute with; a label
is only ever a rendering of it. That is what makes the payoff possible: the artist's client book
marks anyone past their own stated interval as **Due**. A regular who normally comes every three
weeks and has not been seen in seven has not changed their habit — they have gone somewhere else,
and that is worth seeing while it is still recoverable. Never guessed: a client who has not checked
in yet is unknown rather than overdue, or every new sign-up would land on the chase list.

Accounts that predate these fields keep working — the schema allows them empty, and the profile
says once, plainly, what is missing rather than nagging. The day-first `DD/MM/YYYY` entry is masked
as you type, so the format is shown rather than asked for.

> The database dump in `server/db/` now carries dates of birth alongside the email addresses and
> bcrypt hashes it already held. Harmless for the seeded demo accounts; one more reason not to dump
> a database of real client records into a repository.

### Turnaround, set by the artist from their phone

A cut does not end when the clippers stop. The chair has to be swept, the guards cleaned, the last
client has to pay and find their coat. Booking back-to-back looks efficient on a screen and runs
late by eleven, because the debt compounds all morning.

So each artist sets their own gap (`gapMin`, default 5). A 15-minute cut at 10:00 with a 5-minute
gap frees the chair at **10:20**, and that is where the next booking starts.

It is the one scheduling setting that lives on the **phone** rather than the back office, because
it is the thing you change *because of how this morning actually went* — standing at the chair, not
planning a week out. Artist portal → **More** → *Time between clients*. It is in the CMS artist
editor too, so an admin setting up a new chair need not leave it at the default.

The gap is booked time everywhere it matters: it widens every overlap check on **both** sides (the
five minutes to clear down after a cut and the five before the next are the same five minutes), so
a request landing the instant the clippers stop is refused, and a pending request that would leave
no room is closed out when a neighbouring booking is accepted.

**Availability walks the day rather than stamping a grid on it.** Times run one cut plus one
turnaround apart — 15 + 5 gives 10:00, 10:20, 10:40 — so what is offered is what the chair can
actually work. When a time is blocked the walk resumes from the end of whatever blocked it rather
than carrying on the old rhythm; otherwise a single booking that does not sit on the grid throws
off the whole rest of the day and times that are genuinely free never get offered.

### The rest of the booking rules

These keep the request model honest:

- Accepting **closes out everybody else** who asked for that time. Leaving them pending would be a
  promise nobody can keep — the client waits on an answer that can never come, and the artist keeps
  looking at requests they cannot fulfil. Each is told, and told why. It closes out the window
  actually *taken*, so moving a booking off five o'clock puts the requests still sitting there back
  in play rather than taking them down with it.
- Nothing was held while a request waited, so the chair is checked **at acceptance**, against the
  start and length the artist just chose. Ninety minutes that runs into the next booking is refused
  with the booking it collides with named.
- `MAX_OPEN_REQUESTS` (3) caps how many requests one client may have waiting. A request costs
  nothing to make, so without a cap the problem a holding reservation used to cause just moves into
  the artist's inbox.
- A held free cut survives either answer — the client withdrawing, or the artist declining.
- Only a `confirmed` booking can be marked completed or a no-show. A request is not a booking.

### Previous haircut records

What a client actually left with, kept so the next cut can match the last one — and so they can
say "this again" instead of describing it.

**Not the lookbook.** A `Style` is the artist's portfolio: public, reviewed by the shop, chosen to
advertise the chair. A `HaircutRecord` is private, on one client's profile, and only they can
approve it. Different audience, different consent, different lifecycle.

**Consent is the shape of the model, not a field on it.** An artist does not *add* a record — they
*propose* one, and it does nothing until the client says yes. Until then it is not on the profile,
not in the artist's reference, and not attachable to a booking.

**And no means the photograph goes.** There is no `declined` state, deliberately: a row marked
declined with the image still on disk would be the shop keeping exactly what was refused. Declining
deletes the record and unlinks the files, and a test asserts both — the database row *and* the file.

**The note matters as much as the picture.** A photograph shows the result; guard numbers and where
the fade started are how somebody repeats it. Both go up together, and both come back on the
reference.

**The reference rides along with the notification.** When a client attaches one, the artist's
request notification carries the photograph itself — not a line telling them something was attached
and to go and look. The body says so too, for the lock screen and anywhere an image cannot be drawn.
FCM fetches images itself, so `PUBLIC_URL` is what makes that half work; without it the picture is
simply left off rather than sent as a relative path Google cannot resolve.

**Reproducing a cut works two ways, and the second is the one that matters most.** A client can pick
a past cut when requesting a time (`Appointment.reference`), and it appears on the artist's request
card and in their day. But most people do not think to — so the artist can also open any client from
the book, or from the booking in front of them, and see their history. "Reproduce the same haircut
during a future visit" cannot depend on the client having planned ahead.

A reference must be the client's own and approved, otherwise the booking route would be a way to put
somebody else's photograph — or one still pending its owner's answer — in front of an artist. The
same rule holds when browsing: a colleague sees only what that client agreed to share, and an
artist's own pending proposals, so they know they have asked and are waiting.

> Uploads are served from `/uploads` without authentication, as they always have been. Filenames are
> random hex so a URL is unguessable, but a private haircut photo is a stronger reason than a product
> shot to want real access control there one day.

### The digital loyalty card

Every client has one from the moment they sign up — through the form, through Google or Apple, or
seeded — and `cardFor()` creates one on demand for any account that somehow lacks one, so the card
is never the thing that is missing.

It holds progress toward the next free cut, the rewards on it, and the visit history, and it updates
live: an artist burning a code in their portal changes the client's screen while they are looking at
it. `PunchStrip` draws the stamps, and each reward carries a claim code the client can show as a QR.

**Rewards are not all the same thing**, and the card says so. One earned over a full card is a free
cut with no deadline. One given as a birthday gift may be a beard trim or a discount, may be worth
something different, and **expires** — so it shows its own name, its own value, and the days it has
left, in red under a week. A lapsed one moves to *Ran out* rather than sitting among the usable ones
offering a code the chair would refuse.

### A free cut is the same cut

Every eighth visit earns the ninth free — **and the artist is not told which booking that is.** Not
on the board, not in the request, not in the notification, not in the reply to accepting it. The
booking shows its ordinary price and looks like any other.

An artist who knows before they start that this one earns nothing has been handed a reason, however
small and however unintended, to give it less than the last. The shop's promise is that a free cut
is the same cut, and the cheapest way to keep a promise is to remove the temptation rather than rely
on it being resisted.

They find out at the end, when the client presents the claim code and the artist redeems it — by
which point the work is done. Nothing is hidden from the *client*, who chose it, nor from the
redemption record afterwards, which is where the shop reconciles.

`forChair()` in the appointments route is the single place that strips it, and `announce()` sends
**two payloads** rather than one: the client's own booking says it is free because they chose that,
and the same object going to the artist's room would undo the whole thing. On the app side `free`
and `rewardCode` are absent from the `AgendaEntry` type, so the compiler — not a reviewer — is what
stops a screen putting the badge back.

**The goal is a shop setting, not a deployment.** "Every fifth cut" becoming "every eighth" was a
redeploy; it is now a field in the back office, beside a note that changing it lengthens the card
for everyone part-way through one. That is a promise being edited, not just a number.

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

- The dump contains **bcrypt password hashes, email addresses, phone numbers and
  dates of birth**. That is harmless for the seeded demo accounts, but do not
  dump a database holding real client records into a repository.
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

**The booking decision** — the seed ships two clients asking Karim for the same time, so this is
waiting for you on a fresh clone:

1. Sign into the CMS as **karim@faderoom.app**. **Schedule** shows two requests under
   *Waiting on you*, and the sidebar carries the count from any page.
2. Give one of them **25 min** and accept it — nudge the start too, if you like. The other is
   declined in the same move, since nothing was holding either slot: the decision *is* the
   reservation.
3. Sign into the app as the client you accepted. A banner drops in as it happens, and their booking
   reads *Confirmed · 25 minutes in the chair*. The one you didn't gets a banner too, saying the
   time went to someone else, and shows *Not taken* with the reason.
4. Ask for a fresh time in the app's **Book** tab. It lands in Karim's inbox live, in the CMS and in
   the artist portal alike, and any time somebody else has already asked for is marked as such.

**The loyalty loop:**

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
npm test                      # 157 API integration tests against a real MongoDB
npm --prefix mobile test      # 19 QR encoder and client-record tests
npm run typecheck:mobile
npm run build:cms
```

The API tests use their own database (`faderoom_test`) and drop it on the way in, so they never
touch seeded development data. They cover the real journeys: server-side pricing (a client
sending `total: 0` is ignored), overselling the last unit, forged and expired check-in codes, the
one-stamp-per-visit cooldown, a client being unable to redeem their own reward, and Socket.IO
delivery.

The booking rules get a suite of their own, because every one of them is a rule somebody would
otherwise have to remember: two clients can hold a request on the same time, a requested slot stays
on the board, accepting stores the artist's length rather than the catalogue's, accepting declines
the rival requests, a confirmed slot then blocks new ones, a length that overruns the next booking
is refused, a moved booking frees the time it left and keeps the time it was asked for, a move into
another booking or into the past is refused, the open-request cap holds, and a free cut comes back
whether the client withdrew or the artist declined.

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

**The back office is laid out for a desk but has to survive a phone**, because an artist works it
standing at the chair. It is fluid from 320px up, with three breakpoints in `cms/src/styles.css`:
at **1024px** the sidebar stops being a column and becomes an off-canvas drawer behind a sticky app
bar; at **760px** each table row folds into its own card — the column headings move into the rows as
labels via `data-label`, so the button you came to tap ("Collected") is full width rather than a
30px target at the end of a sideways scroll; at **560px** modals become bottom sheets and tiles go
two-up.

Two rules keep it that way. Track minimums are written `minmax(min(320px, 100%), 1fr)` — a bare
`minmax(320px, 1fr)` holds its minimum on a narrower phone and pushes the whole page sideways.
And widths that a breakpoint needs to override live in the stylesheet, never in a `style={{…}}`:
an inline style beats every selector, however specific, so a fixed inline width is a breakpoint
that cannot be written.

**Ownership scopes the CMS.** A product's `owner` is an artist or null for the house label. An
artist sees and edits only their own shelf and their edits return to `pending`; an admin approves.
Artists can message their own clients or one named client, never the whole shop.

**Notifications are split by who they are for, not by what raised them.**
`server/src/lib/notify.js` is the one way the shop raises a message itself, and there are two
classes with different rules:

|                   | What it is                                     | Delivery                                  |
| ----------------- | ---------------------------------------------- | ----------------------------------------- |
| **Transactional** | something the recipient is waiting on           | always — socket while open, push when not  |
| **Broadcast**     | something the shop wants to say (CMS composer)  | inbox always; push on opt-in only          |

Conflating them is how an app gets muted: a client who turned off notifications because of a
promotion no longer hears that their booking was confirmed. Today's transactional set is a booking
requested, accepted, declined or cancelled; an order ready, out for delivery or cancelled; and the
fifth stamp minting a free cut. Deliberately absent: the stamp itself (the client watched it land),
an order being collected (they just took it), and anything only staff care about — the CMS badges
cover those. Every avoidable notification spends credit on the ones that matter.

**Every system notification is a stored document, not a bare emit.** It would be shorter to
`emitTo(...)` and be done, and it would work for anyone with the app open. It is still wrong twice
over: a message nobody was connected to receive has to still be there next time they open the app,
and push is *the same message over a second transport*. `deliver()` in the app de-duplicates by id,
so Firebase has to send **this record** rather than a parallel payload built elsewhere that happens
to read the same. Writing the document first is what reduces the FCM half to a send call.

**A notification with nowhere to go is half a notification.** Each carries a `data.screen`, and
`openNotification()` in `mobile/src/navigation/ref.ts` turns it into a destination — so being told
an order is ready does not leave you to go and find it. It takes the portal as an argument rather
than guessing: `Orders` exists in both trees and means different things in each.

### Prices on request

A product can be listed without a price, with **Check price on WhatsApp** in place of the figure.
Either per product, or shop-wide for a shop that quotes rather than lists.

**Hidden means hidden at the API.** The price is *removed* from the response, not blanked — the
number never leaves the server. Anything less makes it a property of the interface, and the first
person to open the network tab reads what the shop chose not to publish. Staff still see it, because
the CMS has to show a price in order to edit it.

**And it cannot be bought.** Checkout would have to name the figure, which is the thing being
avoided — so `POST /orders` refuses such a product outright, whatever the cart claims. The app hides
the button too, but the app is not where this is enforced: a client can be asked to send anything,
and a hand-made cart would otherwise buy it at a price the buyer was never shown. A mixed cart is
refused whole, with nothing taken off the shelf on the way.

The enquiry reaches **the artist whose shelf it is**, falling back to the shop, and carries the
product name and size — "how much is the pomade" is a question somebody then has to ask three more
questions about.

### The “message us” button

A floating button, bottom right of the client app, that opens WhatsApp. It is the one WhatsApp
feature here that needs **no template, no approval and no credentials** — the client is starting the
conversation, which is precisely the case Meta imposes nothing on. It works on a build with no
WhatsApp set up at all.

**Which artist it reaches** is asked in the order a person would: whoever you have a booking with,
then whoever you usually go to, then the shop. An artist who has not published a number hands the
conversation to the shop rather than dead-ending, and if there is no number anywhere the button does
not appear — a contact button that does nothing is worse than none.

Numbers are normalised to E.164 **on the server** and sent to the app already dialled, so no client
has formatting rules of its own to get subtly wrong. The CMS shows what a typed number will actually
dial as, and refuses one WhatsApp could not reach.

An artist's number lives on their profile rather than being inferred from the phone on their login:
that one is a login detail, possibly a landline, and publishing somebody's personal number to every
client in the app is not a thing to do by inference.

### Birthday greetings, and what WhatsApp actually allows

The third thing no request triggers. Same shape as reminders — a sweep, a mark on the record, once
per client per year — and it runs at an hour the shop picks, in the shop's clock.

**WhatsApp does not carry arbitrary messages.** A business may reply freely for 24 hours after a
customer messages it. Outside that window — which a birthday greeting is by definition, since nobody
messages a barber to announce their own birthday — every message must be a **template approved by
Meta in advance**. The wording is fixed at approval; only the numbered placeholders vary.

So the CMS does not hold a message. It holds the name of an approved template and the values that
go into its blanks, which is where the shop's own wording genuinely lives — "a free beard trim this
month" can become "20% off" whenever the owner likes, with no return trip to Meta. Pretending
otherwise would have built a CMS field that silently never sends. The settings page says this on the
page rather than leaving it to be discovered.

**The in-app greeting always goes.** It is ours, needs nobody's approval, and works. WhatsApp goes
only when Meta's side is configured, the client has opted in, and their number resolves to E.164. A
greeting that reached the app but not WhatsApp is a success with a footnote.

**Opt-in is a real flag, not a policy document.** Meta enforces consent with quality ratings: enough
people blocking the number and the shop's ability to send anything at all is throttled. `whatsapp`
defaults to off and the client turns it on in their profile.

**A gift can be words or a real thing**, and the difference matters at the end of the month. `text`
describes an offer in the message and records nothing. `reward` mints an entry on the client's
loyalty card with a claim code the artist burns at the chair — it cannot be used twice and it shows
up in the figures. Birthday rewards carry a label (they need not be a free cut), a value, and an
**expiry**, enforced in all three places a reward can be claimed: lookup, burn, *and reservation
against a booking*. Enforcing it at the chair but not at booking would be worse than no expiry —
the client is told the cut is free and finds out otherwise once they are sitting down. Rewards
*earned* over a full card never expire: that one was paid for, and taking it back would be theft.

### Appointment reminders

The one notification nothing triggers. Every other message here is the tail of a request somebody
made; a reminder is owed because time passed, and nothing passes time except a clock. It is also
the one worth the most — a client who forgets is a chair earning nothing for forty-five minutes,
and unlike a slot nobody booked, that one was already paid for in turned-away work.

`server/src/lib/reminders.js` sweeps every five minutes for confirmed bookings a day out and two
hours out (`REMINDER_LEAD_MINUTES=1440,120`).

**A sweep, not a timer per booking.** `setTimeout` at confirmation would be simpler and would break
at the first restart: every pending timer dies with the process, silently, and nobody is watching
for reminders that never came. A sweep holds no state between runs, so a restart costs nothing.

**It can safely run twice.** What has been sent lives on the booking as `remindersSent`, and each
reminder is *claimed* with a guarded update before it goes out — two instances sweeping the same
second, an overlapping run, a manual invocation, all leave the loser matching nothing. Sending the
same reminder three times is the sort of bug that gets an app muted, and it is far easier to
prevent than to notice.

**Leads that have already passed are written off when the booking is accepted.** Otherwise a cut
confirmed an hour beforehand would find a day-ahead reminder whose moment was long gone and fire it
immediately — announcing as "tomorrow" something happening within the hour. A booking accepted
inside every lead window gets no reminder at all, which is right: the client was told it was
confirmed moments ago, and that *is* the heads-up.

**Only the most urgent fires when several fall due at once.** After downtime both marks can be
overdue; telling somebody their cut is tomorrow and then immediately that it is in two hours is two
messages that contradict each other, and only the second is any use.

Artists get none of this. Their agenda is the screen they already open every morning, and the
restraint that keeps the client's notifications worth reading applies to theirs too.

### Push notifications

The socket reaches an app that is open. Firebase reaches one that is shut, which for a barber shop
is most of them — nobody sits with the app open waiting to hear whether five o'clock was accepted.

**Both transports carry the same `Notification` document id**, and `deliver()` drops whichever copy
arrives second. This is the one invariant that matters: a push assembled separately from the stored
record would show every message twice, and only to users who happened to be online.

Everything is written and wired. What is left needs a Firebase project, which only the shop's owner
can create:

```bash
# 1. Firebase Console → add an Android app with package name `com.apex.viabarberhouse`.
#    Download google-services.json → mobile/android/app/google-services.json
#
# 2. Project settings → Service accounts → Generate new private key.
#    Put it in server/.env as FIREBASE_SERVICE_ACCOUNT (whole JSON, one line)
#    or FIREBASE_SERVICE_ACCOUNT_FILE (a path).
#
# 3. Install the two native packages and rebuild:
npm --prefix mobile install @react-native-firebase/app @react-native-firebase/messaging
npm run android
```

Both credential files are gitignored. The service account key can push to every user of the app —
treat it like `JWT_SECRET`.

**Until all three are done, nothing changes.** The Gradle plugin is applied only
`if (file('google-services.json').exists())`, on the same terms as the release keystore, because it
fails the build outright when the file is missing — and nobody should have to set up a Firebase
project to compile an app that works without one. On the app side `pushFirebase.ts` looks the module
up at runtime rather than importing it, so a missing package is a caught error rather than a bundle
that will not load. The server logs `Push  socket only` at boot and `pushToUsers()` returns without
doing anything.

**Failures are swallowed on purpose.** A push that does not go out is a degraded delivery, not a
failed request: the notification is already written and already emitted, and a client's booking must
not 500 because Google had a bad minute.

**Dead tokens are pruned from the reply.** Uninstalling, clearing app data or a long silence retires
a token; left in place they accumulate until every send is mostly failures, so FCM's response is
treated as the authority on which devices still exist.

**One switch, and it does not cover everything.** `notifications.broadcasts` silences shop news.
There is deliberately no switch for a booking answer or an order update — someone who muted an
advert has not asked to stop hearing that their chair is confirmed, and one setting for both is how
an app ends up unable to reach anybody about anything. The profile screen says as much next to the
toggle.

### Realtime events

| Event                  | Sent to                     | Fires when                          |
| ---------------------- | --------------------------- | ----------------------------------- |
| `notification:new`     | targeted users              | staff send a message, or the shop raises one |
| `order:created`        | staff, buyer                | a client checks out                 |
| `order:status`         | buyer, staff                | an order moves along its flow       |
| `checkin:new`          | that artist, staff          | a stamp, a reward earned or burned  |
| `loyalty:updated`      | the client                  | their card changes                  |
| `appointment:created`  | that artist, staff          | a client asks for a time            |
| `appointment:status`   | client, artist, staff       | a request is accepted, declined, withdrawn or closed out |
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
- **Provider sign-in is written but has never met a real Google or Apple.** The server half is
  fully tested — against a local key server, so signature, `kid` lookup, issuer and audience checks
  all run for real — and the app half is guarded so a build without the native packages behaves
  exactly as it does today. What is untried is the round trip: neither provider's console has been
  configured, and Apple additionally needs a paid developer account and an iOS build that has never
  existed.
- **Push is written but unproven on a device.** Everything is in place on both sides — see
  *Push notifications* above — but it has never been run against a real Firebase project, because
  that needs credentials only the shop's owner can create. The socket path it falls back to is
  tested and works.
- **The reminder sweep runs in-process.** One instance, one `setInterval`. The claim guard means a
  second instance cannot double-send, so scaling out is safe — but if the API is ever scaled to
  zero between requests, nothing sweeps and reminders stop. That is a property of the free hosting
  tier rather than of the code; a platform cron hitting an endpoint, or a worker process, is the
  fix when it matters.
- **No payment provider.** Orders are cash or card *on collection*; nothing is charged in-app.
- **Product reviews are placeholder copy** shared across every product.
- **iOS has never been compiled.** The code is cross-platform, the Podfile is in place, and the
  native configuration has been gone through by hand — but no Xcode has ever opened this project,
  so nothing here is proven the way the Android build is. What *was* found and fixed by reading:

  - `NSPhotoLibraryUsageDescription` was missing, and iOS does not deny a photo-library request
    without it — it **terminates the process**. Choosing an existing photo would have looked like
    the app vanishing.
  - `UIBackgroundModes: remote-notification` was missing, so a push could not have woken the app.
  - `AppDelegate` had no `FirebaseApp.configure()`, without which `getApp()` throws and the adapter
    quietly falls back to socket-only — push would have looked wired and never arrived. It is
    guarded on `canImport(FirebaseCore)` *and* on the plist being present, on the same terms as the
    conditional Google Services plugin on Android, so a checkout with neither still builds.
  - `Switch` was styled for Android only; `ios_backgroundColor` now matches, or the off state is a
    pale island in dark mode.
  - The scan fallback blamed Android by name for what is a capability check, which would have been
    a lie on an iOS device that failed it for any other reason.

  App Transport Security was already right: arbitrary loads off, local networking on, so development
  http reaches a LAN address while the production URL must still be https. The iOS simulator needs no
  config change — it shares the host's network, so `localhost` already is your machine.

  What still needs a Mac: `pod install`, a build, and — for push — `GoogleService-Info.plist`, an
  APNs key uploaded to Firebase, and the Push Notifications capability on the App ID.
