import { useEffect, useState } from 'react';
import { get, postForm } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useDialog } from '../context/DialogContext.jsx';
import { useSocketEvent } from '../hooks/useRealtime.js';

/* `artistOnly` exists because an admin has no chair of their own — "my
   clients" is meaningless for them, and the API would resolve it to nobody. */
const AUDIENCES = [
  { value: 'clients', label: 'All clients', hint: 'Everyone with a client account', adminOnly: true },
  { value: 'artist-clients', label: 'My clients', hint: 'Everyone who has booked your chair', artistOnly: true },
  { value: 'artists', label: 'Artists', hint: 'The other chairs in the shop', adminOnly: true },
  { value: 'all', label: 'Everyone', hint: 'Clients and artists', adminOnly: true },
  { value: 'user', label: 'One client', hint: 'A single person' },
];

export default function Notifications() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const { showError } = useDialog();
  const [form, setForm] = useState({ title: '', body: '', audience: isAdmin ? 'clients' : 'artist-clients', targetUser: '' });
  const [image, setImage] = useState(null);
  const [clients, setClients] = useState([]);
  const [sent, setSent] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    get('/notifications/sent').then(setSent).catch(() => {});
    get('/loyalty/clients').then((rows) => setClients(rows.map((r) => r.user))).catch(() => {});
  }, []);

  useSocketEvent('notification:sent', (n) =>
    setSent((list) => (list.some((x) => x.id === n.id) ? list : [n, ...list])));

  const options = AUDIENCES.filter((a) =>
    isAdmin ? !a.artistOnly : !a.adminOnly,
  );
  const chosen = options.find((a) => a.value === form.audience) || options[0];

  const send = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.body.trim()) {
      showError('A title and a message are both required.', { title: 'Nothing to send', icon: '✦' });
      return;
    }
    if (form.audience === 'user' && !form.targetUser) {
      showError('Choose which client this goes to.', { title: 'No recipient', icon: '✦' });
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.append('title', form.title);
      body.append('body', form.body);
      body.append('audience', form.audience);
      if (form.audience === 'user') body.append('targetUser', form.targetUser);
      if (image) body.append('image', image);

      const created = await postForm('/notifications', body);
      setSent((list) => [created, ...list]);
      setForm((f) => ({ ...f, title: '', body: '' }));
      setImage(null);
      toast(
        created.deliveredCount
          ? `Sent · ${created.deliveredCount} device${created.deliveredCount === 1 ? '' : 's'} live right now`
          : 'Sent · it will be waiting when they next open the app',
      );
    } catch (err) {
      showError(err.message, { title: 'Message not sent', icon: '✦' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="topbar" style={{ marginTop: -8 }}>
        <div>
          <h1>Notifications</h1>
          <div className="sub">Pushed live to anyone with the app open, and stored for everyone else</div>
        </div>
      </div>

      <div className="grid cols2">
        <form className="card" onSubmit={send}>
          <h2>Compose</h2>
          <div className="hint">Keep it short — this lands on a lock screen.</div>

          <div className="field">
            <label>Send to</label>
            <select
              className="input"
              value={form.audience}
              onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))}
            >
              {options.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
            <div className="hint" style={{ marginTop: 5 }}>{chosen.hint}</div>
          </div>

          {form.audience === 'user' && (
            <div className="field">
              <label>Client</label>
              <select
                className="input"
                value={form.targetUser}
                onChange={(e) => setForm((f) => ({ ...f, targetUser: e.target.value }))}
              >
                <option value="">Pick a client…</option>
                {clients.map((c) => <option key={c._id || c.id} value={c._id || c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          <div className="field">
            <label>Title</label>
            <input
              className="input"
              maxLength={60}
              placeholder="Saturday slots just opened"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>

          <div className="field">
            <label>Message</label>
            <textarea
              className="input"
              maxLength={220}
              placeholder="Two chairs free after 4pm. Book from the app."
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            />
            <div className="hint" style={{ textAlign: 'right', marginTop: 4 }}>{form.body.length}/220</div>
          </div>

          <div className="field">
            <label>Image (optional)</label>
            <input
              className="input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setImage(e.target.files?.[0] || null)}
            />
          </div>

          <button className="btn block" style={{ marginTop: 18 }} disabled={busy} type="submit">
            {busy ? 'Sending…' : 'Send now'}
          </button>
        </form>

        <div>
          <div className="card">
            <h2>Preview</h2>
            <div
              className="card"
              style={{ background: 'var(--surface-2)', marginTop: 10, borderRadius: 16 }}
            >
              <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                <div className="avatar" style={{ borderRadius: 10 }}>✂</div>
                <div className="grow">
                  <div className="row between">
                    <b style={{ fontSize: 12.5 }}>FadeRoom</b>
                    <span className="hint">now</span>
                  </div>
                  <div style={{ fontWeight: 700, marginTop: 3, fontSize: 13.5 }}>
                    {form.title || 'Your title appears here'}
                  </div>
                  <div className="hint" style={{ marginTop: 3, lineHeight: 1.45 }}>
                    {form.body || 'And the message body, exactly as your clients will read it.'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <h2>Sent</h2>
            {sent.length === 0 ? (
              <div className="empty" style={{ padding: 26 }}>Nothing sent yet</div>
            ) : (
              sent.map((n) => (
                <div className="feed-item" key={n.id}>
                  <div className="grow">
                    <div className="t">{n.title}</div>
                    <div className="s">
                      {n.body.slice(0, 70)}{n.body.length > 70 ? '…' : ''}
                    </div>
                    <div className="s" style={{ marginTop: 3 }}>
                      {new Date(n.sentAt).toLocaleString()} · by {n.createdByName || 'staff'}
                    </div>
                  </div>
                  <span className="badge dim">{n.audience}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
