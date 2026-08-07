import { useCallback, useEffect, useState } from 'react';
import { get, post } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useDialog } from '../context/DialogContext.jsx';
import { useSocketEvent } from '../hooks/useRealtime.js';
import Icon from '../components/Icon.jsx';

const time = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

const STATUS = {
  confirmed: { tone: 'ok', label: 'Upcoming' },
  pending: { tone: 'warn', label: 'Awaiting' },
  completed: { tone: 'dim', label: 'Done' },
  noshow: { tone: 'red', label: 'No-show' },
};

export default function Schedule() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const { showError } = useDialog();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [artists, setArtists] = useState([]);
  const [artist, setArtist] = useState('');
  const [agenda, setAgenda] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const query = new URLSearchParams({ date });
      if (isAdmin && artist) query.set('artist', artist);
      setAgenda(await get(`/appointments/agenda?${query}`));
    } catch (err) {
      showError(err.message, { title: 'Couldn’t load the schedule', icon: '🗓️' });
    }
  }, [date, artist, isAdmin, showError]);

  useEffect(() => {
    if (isAdmin) get('/artists').then(setArtists).catch(() => {});
  }, [isAdmin]);

  useEffect(() => { load(); }, [load]);

  useSocketEvent('appointment:created', load);
  useSocketEvent('appointment:status', load);

  const setStatus = async (appointment, status) => {
    setBusy(true);
    try {
      await post(`/appointments/${appointment.id}/status`, { status });
      toast(status === 'completed' ? 'Marked completed — show your check-in QR' : `Marked ${status}`);
      load();
    } catch (err) {
      showError(err.message, { title: 'Couldn’t update that booking', icon: '🗓️' });
    } finally {
      setBusy(false);
    }
  };

  const revenue = agenda
    .filter((a) => a.status === 'completed' && !a.free)
    .reduce((sum, a) => sum + a.price, 0);

  return (
    <>
      <div className="topbar" style={{ marginTop: -8 }}>
        <div>
          <h1>Schedule</h1>
          <div className="sub">Today’s chair · marking a cut done is the cue to show the QR</div>
        </div>
        <div className="spacer" />
        {isAdmin && (
          <select className="input" value={artist} onChange={(e) => setArtist(e.target.value)}>
            <option value="">All chairs</option>
            {artists.map((a) => <option key={a.id} value={a.id}>{a.displayName}</option>)}
          </select>
        )}
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <div className="grid stats" style={{ marginBottom: 16 }}>
        <div className="card stat"><div className="n accent">{agenda.length}</div><div className="l">Bookings</div></div>
        <div className="card stat"><div className="n">${revenue}</div><div className="l">Earned so far</div></div>
        <div className="card stat">
          <div className="n">{agenda.filter((a) => a.status === 'confirmed').length}</div>
          <div className="l">Still to come</div>
        </div>
        <div className="card stat">
          <div className="n">{agenda.filter((a) => a.free).length}</div>
          <div className="l">Free cuts booked</div>
        </div>
      </div>

      <div className="card tablecard">
        {agenda.length === 0 ? (
          <div className="empty">
            <div className="ico"><Icon name="calendar" size={32} /></div>
            Nothing booked for this day
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Time</th><th>Client</th><th>Service</th><th>Price</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {agenda.map((a) => {
                const meta = STATUS[a.status] || STATUS.confirmed;
                return (
                  <tr key={a.id}>
                    {/* data-label is what the column heading becomes once the
                        table folds into cards on a narrow screen. */}
                    <td data-label="Time"><b>{time(a.startsAt)}</b><div className="hint">{a.durationMin} min</div></td>
                    <td data-label="Client">
                      <div className="row" style={{ gap: 9 }}>
                        <div className="avatar" style={{ width: 30, height: 30, fontSize: 11 }}>
                          {(a.user?.name || '?').split(' ').map((p) => p[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600 }}>{a.user?.name || 'Walk-in'}</div>
                          {a.user?.preferences?.clipperGuard && (
                            <div className="hint">{a.user.preferences.clipperGuard}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td data-label="Service">
                      {a.serviceName}
                      {isAdmin && a.artist?.displayName && (
                        <div className="hint">{a.artist.displayName}</div>
                      )}
                    </td>
                    <td data-label="Price">
                      {a.free
                        ? <span className="badge gold">🎁 FREE CUT</span>
                        : <b>${a.price}</b>}
                    </td>
                    <td data-label="Status"><span className={`badge ${meta.tone}`}>{meta.label}</span></td>
                    <td className="right actions">
                      {['confirmed', 'pending'].includes(a.status) && (
                        <div className="row" style={{ gap: 7, justifyContent: 'flex-end' }}>
                          <button className="btn sm" disabled={busy} onClick={() => setStatus(a, 'completed')} type="button">
                            Complete
                          </button>
                          <button className="btn ghost sm" disabled={busy} onClick={() => setStatus(a, 'noshow')} type="button">
                            No-show
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
