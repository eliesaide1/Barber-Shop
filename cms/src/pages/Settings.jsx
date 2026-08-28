import { useEffect, useState } from 'react';
import { get, patch, post } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useDialog } from '../context/DialogContext.jsx';
import Icon from '../components/Icon.jsx';

const HOURS = Array.from({ length: 24 }, (_, h) => h);

/* The same substitution the server does, so the preview is the message and not
   an impression of it. */
const fill = (text, { name, shop, reward, expires }) =>
  String(text ?? '')
    .replaceAll('{name}', name)
    .replaceAll('{shop}', shop)
    .replaceAll('{reward}', reward)
    .replaceAll('{expires}', expires);

const SAMPLE = {
  name: 'Elie',
  shop: 'FadeRoom',
  reward: 'K4M2XQ',
  expires: '12 Sep',
};

export default function Settings() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const { showError, confirm } = useDialog();

  const [form, setForm] = useState(null);
  const [contact, setContact] = useState({ enabled: true, whatsapp: '', greeting: '' });
  const [contactNumber, setContactNumber] = useState(null);
  const [marketplace, setMarketplace] = useState({ hideAllPrices: false, priceEnquiry: '' });
  const [verification, setVerification] = useState({
    required: false,
    channel: 'whatsapp',
    templateName: '',
    templateLanguage: 'en',
    ttlMinutes: 10,
    testPhone: '',
    testCode: '',
  });
  const [email, setEmail] = useState({ configured: false });
  const [loyalty, setLoyalty] = useState({ goal: 8, freeCutValue: 25 });
  const [whatsapp, setWhatsapp] = useState({ configured: false });
  const [upcoming, setUpcoming] = useState([]);
  const [fields, setFields] = useState({});
  const [busy, setBusy] = useState(false);
  const [testPhone, setTestPhone] = useState('');

  const load = async () => {
    try {
      const data = await get('/settings');
      setForm(data.birthday);
      setContact(data.contact);
      setContactNumber(data.contactNumber);
      setMarketplace(data.marketplace);
      if (data.verification) setVerification(data.verification);
      if (data.verification) setVerification(data.verification);
      setLoyalty(data.loyalty);
      setWhatsapp(data.whatsapp);
      if (data.email) setEmail(data.email);
    } catch (err) {
      showError(err.message, { title: 'Couldn’t load the settings', icon: '⚙️' });
    }
    try {
      setUpcoming(await get('/settings/birthday/upcoming'));
    } catch {
      /* The list is context, not the point of the page. */
    }
  };

  useEffect(() => { load(); }, []);

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    setBusy(true);
    setFields({});
    try {
      const data = await patch('/settings', {
        birthday: form,
        contact,
        marketplace,
        verification,
        loyalty,
      });
      setForm(data.birthday);
      setContact(data.contact);
      setContactNumber(data.contactNumber);
      setMarketplace(data.marketplace);
      if (data.verification) setVerification(data.verification);
      setLoyalty(data.loyalty);
      setWhatsapp(data.whatsapp);
      if (data.email) setEmail(data.email);
      toast('Saved ✓');
    } catch (err) {
      if (err.fields) setFields(err.fields);
      showError(err.message, { title: 'Couldn’t save the settings', icon: '⚙️' });
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    try {
      const res = await post('/settings/birthday/test', { phone: testPhone });
      toast(`Sent to ${res.to} ✓`);
    } catch (err) {
      showError(err.message, { title: 'Test message not sent', icon: '💬' });
    } finally {
      setBusy(false);
    }
  };

  const runNow = async () => {
    const ok = await confirm({
      title: 'Run the birthday sweep now?',
      message:
        'It greets anyone whose birthday is today and has not been greeted this year. Running it twice cannot send twice.',
      icon: '🎂',
      confirmLabel: 'Run it',
      cancelLabel: 'Not now',
    });
    if (!ok) return;

    setBusy(true);
    try {
      const res = await post('/settings/birthday/run');
      toast(
        res.skipped
          ? `Nothing sent — ${res.skipped}`
          : `Greeted ${res.greeted} · ${res.whatsapp} on WhatsApp · ${res.rewarded ?? 0} gifts`,
      );
      load();
    } catch (err) {
      showError(err.message, { title: 'Couldn’t run it', icon: '🎂' });
    } finally {
      setBusy(false);
    }
  };

  if (!form) return <div className="empty">Loading…</div>;

  const preview = form.variables.map((v) => fill(v, SAMPLE));

  return (
    <>
      <div className="topbar" style={{ marginTop: -8 }}>
        <div>
          <h1>Settings</h1>
          <div className="sub">Birthday greetings · what goes out, and what it comes with</div>
        </div>
      </div>

      {/* The constraint that shapes this whole page, said once and plainly
          rather than discovered when nothing arrives. */}
      <div className="card" style={{ borderColor: whatsapp.configured ? 'var(--ok)' : 'var(--line)' }}>
        <div className="row between">
          <h2>WhatsApp</h2>
          <span className={`badge ${whatsapp.configured ? 'ok' : 'dim'}`}>
            {whatsapp.configured ? 'Connected' : 'Not connected'}
          </span>
        </div>
        <div className="hint" style={{ marginTop: 8, lineHeight: 1.6 }}>
          WhatsApp does not let a business send whatever it likes to somebody who has not messaged
          first. A birthday greeting is unprompted, so it has to be a <b>template approved by Meta
          in advance</b> — you name it below, and the only parts you can change afterwards are the
          numbered blanks in it. That is Meta’s rule, not this app’s.
          {!whatsapp.configured && (
            <>
              {' '}This server has no WhatsApp credentials, so greetings go out <b>inside the app
              only</b>. That still works, and needs nobody’s approval.
            </>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h2>Loyalty card</h2>
        <div className="hint" style={{ marginTop: 6, lineHeight: 1.6 }}>
          How many visits earn a free cut. Changing this <b>lengthens or shortens the card for
          everyone part-way through one</b> — somebody on 6 of 8 is suddenly 6 of 10 — so it is a
          promise you are editing, not just a number.
        </div>
        <div className="row wrap" style={{ gap: 10, marginTop: 12 }}>
          <div className="field grow">
            <label>Visits per free cut</label>
            <input
              className={`input ${fields['loyalty.goal'] ? 'err' : ''}`}
              inputMode="numeric"
              value={loyalty.goal}
              onChange={(e) => setLoyalty((l) => ({ ...l, goal: e.target.value }))}
            />
            {fields['loyalty.goal'] && <div className="err-msg">{fields['loyalty.goal']}</div>}
            <div className="hint">
              At {loyalty.goal || '—'}, the {Number(loyalty.goal) + 1 || '—'}th cut is the free one.
            </div>
          </div>
          <div className="field grow">
            <label>A free cut is worth ($)</label>
            <input
              className="input"
              inputMode="decimal"
              value={loyalty.freeCutValue}
              onChange={(e) => setLoyalty((l) => ({ ...l, freeCutValue: e.target.value }))}
            />
            <div className="hint">Shown on the client’s card and when an artist redeems one.</div>
          </div>
        </div>
        <div className="hint" style={{ marginTop: 10, lineHeight: 1.6 }}>
          {/* The rule the whole free-cut design turns on, said where somebody
              configuring it will read it. */}
          Artists are <b>not shown</b> which bookings are free — not on the board, not in the
          request, not in the notification. They find out when the client presents the claim code at
          the end. A free cut should be the same cut.
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="row between">
          <h2>“Message us” button</h2>
          <label className="row" style={{ gap: 8 }}>
            <input
              type="checkbox"
              checked={contact.enabled}
              onChange={(e) => setContact((k) => ({ ...k, enabled: e.target.checked }))}
            />
            <span className="hint">{contact.enabled ? 'Shown' : 'Hidden'}</span>
          </label>
        </div>
        <div className="hint" style={{ marginTop: 6, lineHeight: 1.6 }}>
          A floating button in the client app. This one needs <b>no template and no approval</b> —
          the client is starting the conversation, which is the case WhatsApp leaves alone. It works
          whether or not the credentials above are set.
          <br />
          Each artist can publish their own number on their profile; this is the fallback when they
          have not, and the button disappears entirely if neither exists.
        </div>

        <div className="row wrap" style={{ gap: 10, marginTop: 12 }}>
          <div className="field grow">
            <label>Shop WhatsApp number</label>
            <input
              className={`input ${fields['contact.whatsapp'] ? 'err' : ''}`}
              placeholder="+961 1 567 890"
              value={contact.whatsapp}
              onChange={(e) => setContact((k) => ({ ...k, whatsapp: e.target.value }))}
            />
            {fields['contact.whatsapp'] && <div className="err-msg">{fields['contact.whatsapp']}</div>}
            <div className="hint">
              {contactNumber ? (
                <>Dials as <b className="mono">{contactNumber}</b></>
              ) : contact.whatsapp ? (
                <span style={{ color: 'var(--danger)' }}>Not a number WhatsApp can reach</span>
              ) : (
                'A local number is assumed to be in the shop’s own country.'
              )}
            </div>
          </div>
          <div className="field grow">
            <label>Opening message</label>
            <input
              className="input"
              value={contact.greeting}
              onChange={(e) => setContact((k) => ({ ...k, greeting: e.target.value }))}
            />
            <div className="hint">
              Prefilled for them, so nobody has to open with “hi”. <code>{'{shop}'}</code> is filled in.
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="row between">
          <h2>Verify new sign-ups</h2>
          <label className="row" style={{ gap: 8 }}>
            <input
              type="checkbox"
              checked={verification.required}
              disabled={
                !(verification.channel === 'email' ? email.configured : whatsapp.configured) &&
                !(verification.testPhone && verification.testCode)
              }
              onChange={(e) => setVerification((v) => ({ ...v, required: e.target.checked }))}
            />
            <span className="hint">{verification.required ? 'Code required' : 'Off'}</span>
          </label>
        </div>
        <div className="row" style={{ gap: 8, marginTop: 10 }}>
          {['whatsapp', 'email'].map((ch) => (
            <label key={ch} className="row" style={{ gap: 6 }}>
              <input
                type="radio"
                name="verifyChannel"
                checked={verification.channel === ch}
                onChange={() => setVerification((v) => ({ ...v, channel: ch }))}
              />
              <span className="hint">
                {ch === 'email' ? 'Email' : 'WhatsApp'}
                {ch === 'email'
                  ? email.configured
                    ? ' · ready'
                    : ' · no provider'
                  : whatsapp.configured
                    ? ' · ready'
                    : ' · not connected'}
              </span>
            </label>
          ))}
        </div>

        <div className="hint" style={{ marginTop: 6, lineHeight: 1.6 }}>
          Sends a six-digit code and refuses to create the account until it comes back.
          {verification.channel === 'email' && !email.configured && (
            <>
              {' '}
              <b>No email provider is configured</b> — set EMAIL_PROVIDER, EMAIL_FROM and the key
              for it in the server environment. Until then only the test address below gets through.
            </>
          )}
          {verification.channel !== 'email' && !whatsapp.configured && (
            <>
              {' '}
              <b>WhatsApp is not connected</b>, so no real code can be sent. Set a test number below
              to try the flow, or connect WhatsApp before switching this on for customers.
            </>
          )}
          {verification.required && (
            <>
              {' '}
              <b>Nobody can create an account without a working number</b> while this is on. Turn it
              off before a reviewer or a tester needs to sign up on a number you cannot message.
            </>
          )}
        </div>
        {verification.required && verification.channel !== 'email' && (
          <div className="row" style={{ gap: 10, marginTop: 10, alignItems: 'flex-start' }}>
            <div style={{ flex: 2 }}>
              <label className="hint" htmlFor="verifyTemplate">
                Approved authentication template
              </label>
              <input
                id="verifyTemplate"
                className={`input ${fields['verification.templateName'] ? 'err' : ''}`}
                value={verification.templateName}
                placeholder="e.g. signup_code"
                onChange={(e) => setVerification((v) => ({ ...v, templateName: e.target.value }))}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="hint" htmlFor="verifyLang">Language</label>
              <input
                id="verifyLang"
                className="input"
                value={verification.templateLanguage}
                onChange={(e) => setVerification((v) => ({ ...v, templateLanguage: e.target.value }))}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="hint" htmlFor="verifyTtl">Valid for (min)</label>
              <input
                id="verifyTtl"
                className="input"
                type="number"
                min="2"
                max="60"
                value={verification.ttlMinutes}
                onChange={(e) => setVerification((v) => ({ ...v, ttlMinutes: e.target.value }))}
              />
            </div>
          </div>
        )}

        <div className="row" style={{ gap: 10, marginTop: 14, alignItems: 'flex-start' }}>
          <div style={{ flex: 2 }}>
            <label className="hint" htmlFor="testPhone">
              {verification.channel === 'email' ? 'Test address (never emailed)' : 'Test number (never messaged)'}
            </label>
            <input
              id="testPhone"
              className={`input ${fields['verification.testPhone'] ? 'err' : ''}`}
              value={verification.testPhone}
              placeholder={verification.channel === 'email' ? 'tester@example.com' : '+961 …'}
              onChange={(e) => setVerification((v) => ({ ...v, testPhone: e.target.value }))}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label className="hint" htmlFor="testCode">Its code</label>
            <input
              id="testCode"
              className={`input ${fields['verification.testCode'] ? 'err' : ''}`}
              value={verification.testCode}
              placeholder="123456"
              onChange={(e) => setVerification((v) => ({ ...v, testCode: e.target.value }))}
            />
          </div>
        </div>
        <div className="hint" style={{ marginTop: 6, lineHeight: 1.6 }}>
          This one number is never sent anything and always accepts the code beside it — for
          testing before Meta approves your template, and for an App Store reviewer, who cannot
          receive a WhatsApp on a number nobody knows. <b>It is a back door.</b> Set both fields or
          neither, and clear them once you no longer need it.
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="row between">
          <h2>Marketplace prices</h2>
          <label className="row" style={{ gap: 8 }}>
            <input
              type="checkbox"
              checked={marketplace.hideAllPrices}
              onChange={(e) => setMarketplace((m) => ({ ...m, hideAllPrices: e.target.checked }))}
            />
            <span className="hint">{marketplace.hideAllPrices ? 'All hidden' : 'Shown'}</span>
          </label>
        </div>
        <div className="hint" style={{ marginTop: 6, lineHeight: 1.6 }}>
          Hides every price at once, whatever each product says — for a shop that quotes rather than
          lists. Individual products can be set to “price on request” on their own.
          {marketplace.hideAllPrices && (
            <>
              {' '}<b>Nothing can be bought in the app while this is on</b>, because checkout would
              have to name a figure. Every product becomes an enquiry.
            </>
          )}
        </div>
        <div className="field">
          <label>Price enquiry message</label>
          <input
            className="input"
            value={marketplace.priceEnquiry}
            onChange={(e) => setMarketplace((m) => ({ ...m, priceEnquiry: e.target.value }))}
          />
          <div className="hint">
            <code>{'{product}'}</code> becomes the item they tapped; <code>{'{shop}'}</code> the shop
            name. It reaches the artist whose shelf it is, or the shop number above.
          </div>
        </div>
      </div>

      <div className="grid cols2" style={{ marginTop: 14 }}>
        <div>
          <div className="card">
            <div className="row between">
              <h2>Birthday greeting</h2>
              <label className="row" style={{ gap: 8 }}>
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => set('enabled')(e.target.checked)}
                />
                <span className="hint">{form.enabled ? 'On' : 'Off'}</span>
              </label>
            </div>

            <div className="field">
              <label>Send at</label>
              <select className="input" value={form.sendHour} onChange={(e) => set('sendHour')(Number(e.target.value))}>
                {HOURS.map((h) => (
                  <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                ))}
              </select>
              <div className="hint">Shop time. Nobody wants this at three in the morning.</div>
            </div>

            <h2 style={{ marginTop: 18 }}>In the app</h2>
            <div className="hint">Always sent. No approval needed — this one is ours.</div>
            <div className="field">
              <label>Title</label>
              <input className="input" value={form.inAppTitle} onChange={(e) => set('inAppTitle')(e.target.value)} />
            </div>
            <div className="field">
              <label>Message</label>
              <textarea className="input" value={form.inAppBody} onChange={(e) => set('inAppBody')(e.target.value)} />
              <div className="hint">
                <code>{'{name}'}</code> <code>{'{shop}'}</code> <code>{'{reward}'}</code>{' '}
                <code>{'{expires}'}</code> are filled in per client.
              </div>
            </div>
          </div>

          <div className="card">
            <h2>What it comes with</h2>
            <div className="seg" style={{ marginTop: 10 }}>
              {[
                ['none', 'Good wishes'],
                ['text', 'An offer in words'],
                ['reward', 'A real gift'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={form.offer === value ? 'active' : ''}
                  onClick={() => set('offer')(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="hint" style={{ marginTop: 10, lineHeight: 1.6 }}>
              {form.offer === 'none' && 'Just the greeting. Nothing to redeem, nothing to track.'}
              {form.offer === 'text' &&
                'The message mentions an offer, but nothing is recorded. Costs nothing to run — and nothing tells you who used it.'}
              {form.offer === 'reward' && (
                <>
                  A real entry on the client’s loyalty card with a claim code the artist burns at the
                  chair. It <b>cannot be used twice</b> and it shows up in your figures — which a
                  discount promised in a message does not.
                </>
              )}
            </div>

            {form.offer === 'reward' && (
              <>
                <div className="field">
                  <label>What the gift is</label>
                  <input className="input" value={form.rewardLabel} onChange={(e) => set('rewardLabel')(e.target.value)} />
                </div>
                <div className="row" style={{ gap: 10 }}>
                  <div className="field grow">
                    <label>Worth ($)</label>
                    <input
                      className="input"
                      inputMode="numeric"
                      placeholder="Standard free cut"
                      value={form.rewardValue ?? ''}
                      onChange={(e) => set('rewardValue')(e.target.value === '' ? null : Number(e.target.value))}
                    />
                  </div>
                  <div className="field grow">
                    <label>Valid for (days)</label>
                    <input
                      className="input"
                      inputMode="numeric"
                      value={form.rewardExpiryDays}
                      onChange={(e) => set('rewardExpiryDays')(Number(e.target.value))}
                    />
                  </div>
                </div>
                <div className="hint">
                  A gift was not earned in visits, so it ends. One with no end date is a liability
                  you carry for ever and cannot plan around.
                </div>
              </>
            )}
          </div>
        </div>

        <div>
          <div className="card">
            <h2>On WhatsApp</h2>
            <div className="field">
              <label>Approved template name</label>
              <input
                className={`input mono ${fields['birthday.templateName'] ? 'err' : ''}`}
                placeholder="birthday_greeting"
                value={form.templateName}
                onChange={(e) => set('templateName')(e.target.value)}
              />
              {fields['birthday.templateName'] && (
                <div className="err-msg">{fields['birthday.templateName']}</div>
              )}
              <div className="hint">Exactly as it appears in Meta Business Manager.</div>
            </div>
            <div className="field">
              <label>Language code</label>
              <input className="input mono" style={{ width: 100 }} value={form.templateLanguage} onChange={(e) => set('templateLanguage')(e.target.value)} />
            </div>

            <div className="field">
              <label>What goes in the blanks</label>
              <div className="hint" style={{ marginBottom: 8 }}>
                In order: the first box is <code>{'{{1}}'}</code>, the second <code>{'{{2}}'}</code>,
                and so on. This is where your own wording lives — change it whenever you like,
                without going back to Meta.
              </div>
              {form.variables.map((v, i) => (
                <div className="row" key={i} style={{ gap: 8, marginBottom: 8 }}>
                  <span className="mono hint" style={{ width: 40 }}>{`{{${i + 1}}}`}</span>
                  <input
                    className="input grow"
                    value={v}
                    onChange={(e) => {
                      const next = [...form.variables];
                      next[i] = e.target.value;
                      set('variables')(next);
                    }}
                  />
                  <button
                    className="btn ghost sm"
                    type="button"
                    onClick={() => set('variables')(form.variables.filter((_, j) => j !== i))}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                className="btn ghost sm"
                type="button"
                onClick={() => set('variables')([...form.variables, ''])}
              >
                + Add a blank
              </button>
            </div>

            <div className="card" style={{ background: 'var(--surface-2)', marginTop: 12 }}>
              <div className="hint" style={{ marginBottom: 8 }}>What Elie would actually receive</div>
              {preview.map((p, i) => (
                <div key={i} className="row" style={{ gap: 8, alignItems: 'flex-start', marginBottom: 4 }}>
                  <span className="mono hint" style={{ width: 40 }}>{`{{${i + 1}}}`}</span>
                  <b style={{ fontSize: 13 }}>{p || <span className="hint">empty</span>}</b>
                </div>
              ))}
              {form.offer !== 'reward' && preview.some((p) => p.includes('K4M2XQ')) && (
                <div className="hint" style={{ marginTop: 8, color: 'var(--warn)' }}>
                  This mentions a claim code, but the greeting is not set to give a real gift — it
                  will come out blank.
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <h2>Try it</h2>
            <div className="hint">
              Sends the real template to one number now, using the wording above.
            </div>
            <div className="row" style={{ marginTop: 10, gap: 8 }}>
              <input
                className="input grow"
                placeholder="+961 70 123 456"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
              />
              <button
                className="btn"
                type="button"
                disabled={busy || !testPhone.trim() || !whatsapp.configured}
                onClick={sendTest}
              >
                Send
              </button>
            </div>
            {!whatsapp.configured && (
              <div className="hint" style={{ marginTop: 8 }}>
                Needs WhatsApp credentials on the server.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="row wrap" style={{ marginTop: 16, gap: 10 }}>
        <button className="btn" type="button" disabled={busy || !isAdmin} onClick={save}>
          {busy ? 'Saving…' : 'Save settings'}
        </button>
        <button className="btn ghost" type="button" disabled={busy || !isAdmin} onClick={runNow}>
          Run the sweep now
        </button>
        {!isAdmin && <span className="hint">Only the shop admin can change these.</span>}
      </div>

      <div className="card tablecard" style={{ marginTop: 16 }}>
        <div className="row between" style={{ marginBottom: 6 }}>
          <h2>Birthdays this month</h2>
          <span className="badge dim">{upcoming.length}</span>
        </div>
        {upcoming.length === 0 ? (
          <div className="empty">
            <div className="ico"><Icon name="users" size={32} /></div>
            Nobody in the next month
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Client</th><th>Birthday</th><th>When</th><th>WhatsApp</th></tr>
            </thead>
            <tbody>
              {upcoming.map((c) => (
                <tr key={c.id}>
                  <td data-label="Client">{c.name}</td>
                  <td data-label="Birthday" className="mono">{c.dateOfBirth}</td>
                  <td data-label="When">
                    {c.daysAway === 0 ? <b className="accent">Today</b> : `in ${c.daysAway} days`}
                  </td>
                  <td data-label="WhatsApp">
                    {/* Both have to be true, and they fail for different reasons —
                        one is a consent problem, the other a data problem. */}
                    {!c.reachable ? (
                      <span className="badge dim">No usable number</span>
                    ) : c.whatsappOptIn ? (
                      <span className="badge ok">Opted in</span>
                    ) : (
                      <span className="badge warn">Not opted in</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
