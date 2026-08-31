import Icon from '../components/Icon.jsx';

/**
 * The public account-deletion page.
 *
 * Google Play requires a URL where somebody can start deleting their account
 * *without* the app — reachable by a reviewer, and by a person who uninstalled
 * months ago and has nothing left to tap. The in-app button
 * (Profile → Delete account → `DELETE /api/auth/me`) covers everyone who still
 * has the app; this covers everyone who does not.
 *
 * It is deliberately not a form. `DELETE /api/auth/me` needs the account
 * holder's own token, and the way to offer it here would be to put an
 * unauthenticated email-and-password box on the public internet in front of an
 * irreversible endpoint that has no rate limiting behind it — a credential
 * stuffing target whose prize is destroying somebody's data. A request channel
 * satisfies the policy and adds no such surface.
 *
 * It carries no auth of its own either, and is routed in `App.jsx` ahead of
 * both the loading state and the sign-in gate: a page you have to log into is
 * not a public page, and the people who need this one most are precisely those
 * who cannot log in.
 *
 * What it says has to agree with what the code does — the deleted list below is
 * the cascade in `server/src/routes/auth.routes.js` — and with section 12 of
 * the published privacy policy. Three statements of one promise; if one moves,
 * the others move with it.
 */

const SHOP = 'VIA Barber House';
const EMAIL = 'admin@apexlb.tech';
const PHONE = '+961 81 427 439';
const POLICY_URL = 'https://eliesaide1.github.io/barber-shop-privacyandpolicy/';

/* Everything `DELETE /api/auth/me` takes, in the order a person would miss it. */
const DELETED = [
  'Your account and profile — name, email address, phone number, date of birth and preferences',
  'Every booking and booking request, past and upcoming',
  'Your loyalty card: stamps, visit history, and any reward not yet redeemed',
  'Your order history',
  'Your check-in history',
  'Your haircut records, including the photographs themselves',
  'Notifications addressed to you',
  'Any device registered for push notifications',
];

const KEPT = [
  'Shop-wide announcements stay in the shop’s records — they were sent to everybody, not to you. Your name comes off them.',
  'Records the shop is required to keep by law, or needs for security and fraud prevention, may be retained. Section 12 of the privacy policy sets this out.',
];

export default function DeleteAccount() {
  return (
    <div className="doc-wrap">
      <main className="doc">
        <div className="brand" style={{ padding: 0 }}>
          <div className="mark"><Icon name="scissors" size={20} strokeWidth={2} /></div>
          <div>
            <b style={{ fontSize: 17 }}>FadeRoom</b>
            <span>{SHOP}</span>
          </div>
        </div>

        <h1>Delete your account</h1>
        <p className="lede">
          You can delete your FadeRoom account and the personal information held with it. There are
          two ways to do it — the first is immediate, the second is for anyone who no longer has the
          app installed.
        </p>

        <div className="card">
          <h2>1 · In the app</h2>
          <div className="hint">Immediate, and done by you.</div>
          <ol className="steps">
            <li>Open FadeRoom and sign in.</li>
            <li>Go to the <b>Profile</b> tab.</li>
            <li>Tap <b>Delete account</b>, at the bottom.</li>
            <li>Confirm. The account is gone as soon as you do — there is nothing to undo it with.</li>
          </ol>
        </div>

        <div className="card">
          <h2>2 · By request</h2>
          <div className="hint">If you have uninstalled the app or cannot sign in.</div>
          <p>
            Email <a href={`mailto:${EMAIL}?subject=Delete%20my%20FadeRoom%20account`}>{EMAIL}</a>{' '}
            from the address on the account, with <b>Delete my account</b> as the subject. Say the
            name and mobile number the account was made with, so we can be sure it is yours.
          </p>
          <p>
            You can also call or message <a href={`tel:${PHONE.replace(/\s/g, '')}`}>{PHONE}</a>.
          </p>
          <p className="muted">
            Requests are completed within 30 days of being verified, and usually the same week. You
            will be told when it is done.
          </p>
        </div>

        <div className="card">
          <h2>What gets deleted</h2>
          <div className="hint">All of it, permanently. None of this is recoverable afterwards.</div>
          <ul className="bullets">
            {DELETED.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h2>What is kept</h2>
          <ul className="bullets">
            {KEPT.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h2>Artists and shop staff</h2>
          <p className="muted">
            A chair holds bookings other people are relying on, and products on the shelf, so a staff
            account cannot be closed from the app or from this page. Contact the shop at{' '}
            <a href={`mailto:${EMAIL}`}>{EMAIL}</a> and we will arrange it.
          </p>
        </div>

        <footer className="doc-foot">
          <a href={POLICY_URL} target="_blank" rel="noreferrer">Privacy policy</a>
          <span>·</span>
          <span>{SHOP} · Beirut, Lebanon</span>
        </footer>
      </main>
    </div>
  );
}
