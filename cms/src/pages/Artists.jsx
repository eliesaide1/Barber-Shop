import { useEffect, useState } from 'react';
import { del, get, patch, post } from '../lib/api.js';
import { useToast } from '../context/ToastContext.jsx';
import { useDialog } from '../context/DialogContext.jsx';
import { useSocketEvent } from '../hooks/useRealtime.js';
import Modal from '../components/Modal.jsx';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const EMPTY = {
  displayName: '', email: '', password: '', phone: '', specialty: '', chair: '',
  bio: '', priceFrom: '20', gapMin: 5, whatsapp: '', daysOff: [], workingHours: { start: '10:00', end: '20:00' },
};

export default function Artists() {
  const { toast } = useToast();
  const { showError, confirm } = useDialog();
  const [artists, setArtists] = useState([]);
  const [editing, setEditing] = useState(null);

  const load = () =>
    get('/artists?all=true')
      .then(setArtists)
      .catch((e) => showError(e.message, { title: 'Couldn’t load the artists', icon: '◍' }));
  useEffect(() => { load(); }, []);

  useSocketEvent('artist:changed', () => load());

  const deactivate = async (artist) => {
    const ok = await confirm({
      title: `Deactivate ${artist.displayName}?`,
      message: 'Their chair stops taking bookings and they can no longer sign in here. Existing bookings and their shelf are kept.',
      icon: '◍',
      tone: 'danger',
      confirmLabel: 'Deactivate',
      cancelLabel: 'Keep them active',
    });
    if (!ok) return;

    try {
      await del(`/artists/${artist.id}`);
      toast(`${artist.displayName} deactivated`);
      load();
    } catch (err) {
      showError(err.message, { title: 'Couldn’t deactivate', icon: '◍' });
    }
  };

  return (
    <>
      <div className="topbar" style={{ marginTop: -8 }}>
        <div>
          <h1>Artists</h1>
          <div className="sub">Chairs, hours and back-office logins</div>
        </div>
        <div className="spacer" />
        <button className="btn" onClick={() => setEditing(EMPTY)} type="button">+ Add artist</button>
      </div>

      <div className="grid cols2">
        {artists.map((a) => (
          <div className="card" key={a.id}>
            <div className="row">
              <div className="avatar" style={{ width: 44, height: 44, fontSize: 14 }}>
                {a.displayName.split(' ').map((p) => p[0]).join('').slice(0, 2)}
              </div>
              <div className="grow">
                <div className="row" style={{ gap: 8 }}>
                  <b>{a.displayName}</b>
                  {!a.active && <span className="badge red">INACTIVE</span>}
                </div>
                <div className="hint" style={{ marginTop: 3 }}>{a.specialty || 'No specialty set'}</div>
                <div className="hint" style={{ marginTop: 3 }}>
                  {a.chair || 'No chair'} · ★ {a.rating} · from ${a.priceFrom}
                </div>
              </div>
            </div>

            <div className="row" style={{ gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
              {DAYS.map((d, i) => (
                <span key={d} className={`badge ${a.daysOff.includes(i) ? 'dim' : 'ok'}`}>{d}</span>
              ))}
            </div>
            <div className="hint" style={{ marginTop: 8 }}>
              {a.workingHours.start}–{a.workingHours.end} · {a.user?.email}
            </div>

            <div className="row" style={{ gap: 8, marginTop: 14 }}>
              <button className="btn ghost sm grow" onClick={() => setEditing(a)} type="button">Edit</button>
              {a.active && (
                <button className="btn danger sm" onClick={() => deactivate(a)} type="button">Deactivate</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <ArtistEditor
          artist={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </>
  );
}

function ArtistEditor({ artist, onClose, onSaved }) {
  const { toast } = useToast();
  const { showError } = useDialog();
  const isNew = !artist.id;
  const [form, setForm] = useState({
    ...EMPTY,
    ...artist,
    priceFrom: String(artist.priceFrom ?? 20),
    gapMin: artist.gapMin ?? 5,
    whatsapp: artist.whatsapp ?? '',
    workingHours: artist.workingHours || EMPTY.workingHours,
    daysOff: artist.daysOff || [],
    email: artist.user?.email || '',
    password: '',
  });
  const [fields, setFields] = useState({});
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const toggleDay = (i) =>
    setForm((f) => ({
      ...f,
      daysOff: f.daysOff.includes(i) ? f.daysOff.filter((d) => d !== i) : [...f.daysOff, i],
    }));

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setFields({});
    try {
      const payload = {
        displayName: form.displayName,
        specialty: form.specialty,
        bio: form.bio,
        chair: form.chair,
        priceFrom: Number(form.priceFrom) || 0,
        gapMin: Number(form.gapMin) || 0,
        whatsapp: form.whatsapp,
        daysOff: form.daysOff,
        workingHours: form.workingHours,
      };
      if (isNew) {
        await post('/artists', { ...payload, email: form.email, password: form.password, phone: form.phone });
        toast(`${form.displayName} added — they can sign in now`);
      } else {
        await patch(`/artists/${artist.id}`, payload);
        toast('Artist updated');
      }
      onSaved();
    } catch (err) {
      if (err.fields) setFields(err.fields);
      showError(err.message, { title: isNew ? 'Artist not added' : 'Changes not saved', icon: '◍' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={isNew ? 'Add an artist' : form.displayName}
      subtitle={isNew ? 'Creates their chair and their back-office login' : 'Chair, hours and rates'}
      onClose={onClose}
    >
      <form onSubmit={save}>
        <div className="field" style={{ marginTop: 0 }}>
          <label>Name</label>
          <input className={`input ${fields.displayName ? 'err' : ''}`} value={form.displayName} onChange={set('displayName')} />
          {fields.displayName && <div className="err-msg">{fields.displayName}</div>}
        </div>

        {isNew && (
          <>
            <div className="field">
              <label>Login email</label>
              <input className={`input ${fields.email ? 'err' : ''}`} value={form.email} onChange={set('email')} />
              {fields.email && <div className="err-msg">{fields.email}</div>}
            </div>
            <div className="field">
              <label>Temporary password</label>
              <input className={`input ${fields.password ? 'err' : ''}`} value={form.password} onChange={set('password')} />
              {fields.password && <div className="err-msg">{fields.password}</div>}
              <div className="hint" style={{ marginTop: 5 }}>They can change it from their account.</div>
            </div>
          </>
        )}

        <div className="row" style={{ gap: 10 }}>
          <div className="field grow">
            <label>Chair</label>
            <input className="input" value={form.chair} onChange={set('chair')} placeholder="Chair 1" />
          </div>
          <div className="field grow">
            <label>From ($)</label>
            <input className="input" inputMode="numeric" value={form.priceFrom} onChange={set('priceFrom')} />
          </div>
          <div className="field grow">
            <label>Gap between clients</label>
            <select className="input" value={form.gapMin} onChange={set('gapMin')}>
              {[0, 5, 10, 15, 20, 30].map((m) => (
                <option key={m} value={m}>{m === 0 ? 'None' : `${m} min`}</option>
              ))}
            </select>
            {/* Artists change this from their own phone; it is here so an admin
                setting up a new chair does not have to leave it at the default. */}
            <div className="hint">Turnaround before the next booking can start.</div>
          </div>
        </div>

        <div className="field">
          <label>WhatsApp number</label>
          <input
            className={`input ${fields.whatsapp ? 'err' : ''}`}
            placeholder="Leave empty to use the shop’s number"
            value={form.whatsapp}
            onChange={set('whatsapp')}
          />
          {fields.whatsapp && <div className="err-msg">{fields.whatsapp}</div>}
          {/* Published to every client in the app, so it takes typing rather
              than being inferred from their login phone. */}
          <div className="hint">
            Shown on the client app’s message button. Clients with a booking on this chair reach
            this number; everyone else reaches the shop.
          </div>
        </div>

        <div className="field">
          <label>Specialty</label>
          <input className="input" value={form.specialty} onChange={set('specialty')} placeholder="Skin fades · beard sculpt" />
        </div>

        <div className="field">
          <label>Bio</label>
          <textarea className="input" style={{ minHeight: 64 }} value={form.bio} onChange={set('bio')} />
        </div>

        <div className="field">
          <label>Days off</label>
          <div className="row wrap" style={{ gap: 7 }}>
            {DAYS.map((d, i) => (
              <button
                key={d}
                type="button"
                className={`btn sm ${form.daysOff.includes(i) ? '' : 'ghost'}`}
                onClick={() => toggleDay(i)}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="row" style={{ gap: 10 }}>
          <div className="field grow">
            <label>Opens</label>
            <input
              className="input" type="time" value={form.workingHours.start}
              onChange={(e) => setForm((f) => ({ ...f, workingHours: { ...f.workingHours, start: e.target.value } }))}
            />
          </div>
          <div className="field grow">
            <label>Closes</label>
            <input
              className="input" type="time" value={form.workingHours.end}
              onChange={(e) => setForm((f) => ({ ...f, workingHours: { ...f.workingHours, end: e.target.value } }))}
            />
          </div>
        </div>

        <div className="row wrap" style={{ marginTop: 20, gap: 10 }}>
          <button className="btn grow" disabled={busy} type="submit">
            {busy ? 'Saving…' : isNew ? 'Add artist' : 'Save changes'}
          </button>
          <button className="btn ghost" onClick={onClose} type="button">Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
