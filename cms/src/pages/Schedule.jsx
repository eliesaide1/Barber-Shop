import { useCallback, useEffect, useState } from 'react';
import { get, post } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useDialog } from '../context/DialogContext.jsx';
import { useSocketEvent } from '../hooks/useRealtime.js';
import Icon from '../components/Icon.jsx';

const time = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

const day = (iso) =>
  new Date(iso).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });

const STATUS = {
  confirmed: { tone: 'ok', label: 'Upcoming' },
  pending: { tone: 'warn', label: 'Requested' },
  completed: { tone: 'dim', label: 'Done' },
  declined: { tone: 'dim', label: 'Declined' },
  noshow: { tone: 'red', label: 'No-show' },
};

/* The lengths an artist actually reaches for. The request's own estimate is
   folded in below, so whatever the service says is always on the list. */
const LENGTHS = [10, 15, 20, 25, 30, 40, 45, 60, 75, 90];

/**
 * A Date as `<input type="datetime-local">` wants it — local wall-clock, no
 * zone. `toISOString()` is UTC and would show the artist the wrong hour.
 */
const localInput = (iso) => {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * One waiting request, with the decision attached to it.
 *
 * The length lives here rather than in a modal because accepting is the common
 * case and it should cost one glance and two taps: read who and when, pick how
 * long, accept.
 */
function Request({ request, isAdmin, busy, onAccept, onDecline }) {
  const [length, setLength] = useState(request.durationMin);
  const [start, setStart] = useState(() => localInput(request.startsAt));
  const options = [...new Set([...LENGTHS, request.durationMin])].sort((a, b) => a - b);

  /* Only send a start when it is not the one they asked for, so the common
     "yes, as asked" case cannot drift the time through a rounding of its own. */
  const moved = start !== localInput(request.startsAt);

  return (
    <div className="feed-item">
      <div className="avatar">
        {(request.user?.name || '?').split(' ').map((p) => p[0]).join('').slice(0, 2)}
      </div>
      <div className="grow">
        <div className="t">
          {request.user?.name || 'Walk-in'}
        </div>
        <div className="s">
          Asked for {day(request.startsAt)} · {time(request.startsAt)} · {request.serviceName}
          {isAdmin && request.artist?.displayName ? ` · ${request.artist.displayName}` : ''}
        </div>
        {!!request.notes && <div className="s">“{request.notes}”</div>}
        {!!request.user?.preferences?.clipperGuard && (
          <div className="s">✂ {request.user.preferences.clipperGuard}</div>
        )}
      </div>

      <div className="row wrap" style={{ gap: 7, justifyContent: 'flex-end' }}>
        <label className="hint" htmlFor={`at-${request.id}`}>Start</label>
        <input
          id={`at-${request.id}`}
          className="input"
          type="datetime-local"
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
        <label className="hint" htmlFor={`len-${request.id}`}>for</label>
        <select
          id={`len-${request.id}`}
          className="input"
          style={{ width: 92 }}
          value={length}
          onChange={(e) => setLength(Number(e.target.value))}
        >
          {options.map((m) => (
            <option key={m} value={m}>{m} min</option>
          ))}
        </select>
        {moved && (
          <button
            className="btn ghost sm"
            type="button"
            onClick={() => setStart(localInput(request.startsAt))}
            title="Back to the time they asked for"
          >
            Reset
          </button>
        )}
        <button
          className="btn sm"
          type="button"
          disabled={busy || !start}
          onClick={() => onAccept(request, length, moved ? start : null)}
        >
          {moved ? 'Accept & move' : 'Accept'}
        </button>
        <button
          className="btn ghost sm"
          type="button"
          disabled={busy}
          onClick={() => onDecline(request)}
        >
          Decline
        </button>
      </div>
    </div>
  );
}

export default function Schedule() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const { confirm, showError } = useDialog();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [artists, setArtists] = useState([]);
  const [artist, setArtist] = useState('');
  const [agenda, setAgenda] = useState([]);
  const [requests, setRequests] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const query = new URLSearchParams({ date });
    if (isAdmin && artist) query.set('artist', artist);
    try {
      setAgenda(await get(`/appointments/agenda?${query}`));
    } catch (err) {
      showError(err.message, { title: 'Couldn’t load the schedule', icon: '🗓️' });
    }
    /* Requests are not tied to the day being viewed — a decision waiting on you
       is waiting on you whichever date the picker happens to show. */
    const scope = new URLSearchParams();
    if (isAdmin && artist) scope.set('artist', artist);
    try {
      setRequests(await get(`/appointments/requests?${scope}`));
    } catch {
      /* The board is still usable without the inbox. */
    }
  }, [date, artist, isAdmin, showError]);

  useEffect(() => {
    if (isAdmin) get('/artists').then(setArtists).catch(() => {});
  }, [isAdmin]);

  useEffect(() => { load(); }, [load]);

  useSocketEvent('appointment:created', load);
  useSocketEvent('appointment:status', load);

  /**
   * Accepting is the moment the chair is actually reserved — nothing was held
   * while the request sat here, which is what stops one client taking out the
   * whole week.
   */
  const accept = async (request, durationMin, movedTo) => {
    setBusy(true);
    try {
      const res = await post(`/appointments/${request.id}/confirm`, {
        durationMin,
        /* A datetime-local value is local wall-clock with no zone; the Date
           constructor reads it as local, which is what the artist meant. */
        ...(movedTo ? { startsAt: new Date(movedTo).toISOString() } : {}),
      });
      const who = request.user?.name?.split(' ')[0] || 'the client';
      const when = movedTo
        ? `moved to ${time(res.appointment.startsAt)}, ${durationMin} min`
        : `in for ${durationMin} min`;
      toast(
        res.declined
          ? `${who} ${when} · ${res.declined} other request${res.declined === 1 ? '' : 's'} declined`
          : `${who} ${when} ✓`,
      );
      load();
    } catch (err) {
      showError(err.message, { title: 'Couldn’t accept that request', icon: '🗓️' });
    } finally {
      setBusy(false);
    }
  };

  const decline = async (request) => {
    const who = request.user?.name?.split(' ')[0] || 'this client';
    const ok = await confirm({
      title: `Turn down ${who}’s request?`,
      /* One message either way — anything owed goes back on the client's card
         regardless, and saying so here would tell the board what it is
         deliberately not shown. */
      message: 'They are told, and the time stays open for someone else.',
      icon: '🗓️',
      tone: 'danger',
      confirmLabel: 'Decline it',
      cancelLabel: 'Keep it waiting',
    });
    if (!ok) return;

    setBusy(true);
    try {
      await post(`/appointments/${request.id}/decline`);
      toast(`Declined · ${who} has been told`);
      load();
    } catch (err) {
      showError(err.message, { title: 'Couldn’t decline that request', icon: '🗓️' });
    } finally {
      setBusy(false);
    }
  };

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
    .filter((a) => a.status === 'completed')
    .reduce((sum, a) => sum + a.price, 0);

  return (
    <>
      <div className="topbar" style={{ marginTop: -8 }}>
        <div>
          <h1>Schedule</h1>
          <div className="sub">Accept a request to reserve the chair · nothing is held before that</div>
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
        <div className="card stat">
          <div className={`n ${requests.length ? 'accent' : ''}`}>{requests.length}</div>
          <div className="l">Requests waiting</div>
        </div>
        <div className="card stat"><div className="n">{agenda.length}</div><div className="l">Booked today</div></div>
        <div className="card stat"><div className="n">${revenue}</div><div className="l">Earned so far</div></div>
        {/* "Free cuts booked" used to sit here. It is not shown any more —
            which cuts are free is not on this board by design. Redemptions are
            in the check-in feed, after the work is done. */}
        <div className="card stat">
          <div className="n">{agenda.filter((a) => a.status === 'completed').length}</div>
          <div className="l">Done today</div>
        </div>
      </div>

      {requests.length > 0 && (
        <div className="card" style={{ marginBottom: 16, borderColor: 'var(--accent)' }}>
          <div className="row between" style={{ marginBottom: 6 }}>
            <h2>Waiting on you</h2>
            <span className="badge gold">{requests.length} to answer</span>
          </div>
          <div className="hint" style={{ marginBottom: 8 }}>
            Set how long you want to give each one — the price list is only an estimate, and two
            people can ask for the same time. Whoever you accept gets the slot.
          </div>
          {requests.map((r) => (
            <Request
              key={r.id}
              request={r}
              isAdmin={isAdmin}
              busy={busy}
              onAccept={accept}
              onDecline={decline}
            />
          ))}
        </div>
      )}

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
                    <td data-label="Time">
                      <b>{time(a.startsAt)}</b>
                      <div className="hint">{a.durationMin} min</div>
                      {/* Say when this isn't the time they asked for — the client
                          was told, and you should see the same thing they did. */}
                      {a.requestedStartsAt && time(a.requestedStartsAt) !== time(a.startsAt) && (
                        <div className="hint">moved from {time(a.requestedStartsAt)}</div>
                      )}
                    </td>
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
                      {/* Always the price. A cut somebody earned and one they
                          are paying for look the same on the board. */}
                      <b>${a.price}</b>
                    </td>
                    <td data-label="Status"><span className={`badge ${meta.tone}`}>{meta.label}</span></td>
                    <td className="right actions">
                      {a.status === 'pending' ? (
                        <span className="hint">Answer it above</span>
                      ) : a.status === 'confirmed' ? (
                        <div className="row" style={{ gap: 7, justifyContent: 'flex-end' }}>
                          <button className="btn sm" disabled={busy} onClick={() => setStatus(a, 'completed')} type="button">
                            Complete
                          </button>
                          <button className="btn ghost sm" disabled={busy} onClick={() => setStatus(a, 'noshow')} type="button">
                            No-show
                          </button>
                        </div>
                      ) : null}
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
