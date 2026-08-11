import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { get } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocketEvent } from '../hooks/useRealtime.js';

const ago = (iso) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
};

export default function Dashboard() {
  const { user, artist, isAdmin } = useAuth();
  const [data, setData] = useState({
    orders: [], agenda: [], checkins: [], products: [], requests: [],
  });

  const load = async () => {
    const [orders, agenda, checkins, products, requests] = await Promise.all([
      get('/orders/manage/list').catch(() => []),
      get(`/appointments/agenda?date=${new Date().toISOString().slice(0, 10)}`).catch(() => []),
      get('/loyalty/check-ins').catch(() => []),
      get('/products/manage/list').catch(() => []),
      get('/appointments/requests').catch(() => []),
    ]);
    setData({ orders, agenda, checkins, products, requests });
  };

  useEffect(() => { load(); }, []);
  useSocketEvent('order:created', load);
  useSocketEvent('order:status', load);
  useSocketEvent('checkin:new', load);
  useSocketEvent('appointment:created', load);
  useSocketEvent('appointment:status', load);

  const openOrders = data.orders.filter((o) =>
    ['ready', 'packing', 'out'].includes(o.status));
  const takings = data.orders
    .filter((o) => ['collected', 'delivered'].includes(o.status))
    .reduce((sum, o) => sum + o.total, 0);
  const pending = data.products.filter((p) => p.status === 'pending');
  const lowStock = data.products.filter((p) => p.status === 'published' && p.stock <= 3);

  return (
    <>
      <div className="topbar" style={{ marginTop: -8 }}>
        <div>
          <h1>{user.name.split(' ')[0]}’s shop</h1>
          <div className="sub">{isAdmin ? 'Shop admin' : `Artist portal · ${artist?.chair || 'your chair'}`}</div>
        </div>
      </div>

      <div className="grid stats">
        <div className="card stat">
          <div className="n accent">{data.agenda.length}</div>
          <div className="l">Bookings today</div>
        </div>
        <div className="card stat">
          <div className="n">{openOrders.length}</div>
          <div className="l">Orders to hand over</div>
        </div>
        <div className="card stat">
          <div className="n">${takings}</div>
          <div className="l">Product takings</div>
        </div>
        <div className="card stat">
          <div className="n">{data.checkins.filter((c) => c.kind === 'stamp').length}</div>
          <div className="l">Check-ins</div>
        </div>
      </div>

      {(data.requests.length > 0 || pending.length > 0 || lowStock.length > 0) && (
        <div className="card" style={{ marginTop: 14, borderColor: 'var(--accent)' }}>
          <h2>Needs you</h2>
          {/* First, because a client is sitting on the other end of it waiting
              to hear whether they have a chair at all. */}
          {data.requests.length > 0 && (
            <div className="feed-item">
              <div className="grow">
                <div className="t">
                  {data.requests.length} booking request{data.requests.length === 1 ? '' : 's'} waiting
                </div>
                <div className="s">
                  Nothing is held until you accept one and say how long to give it.
                </div>
              </div>
              <Link className="btn sm" to="/schedule">Answer</Link>
            </div>
          )}
          {pending.length > 0 && (
            <div className="feed-item">
              <div className="grow">
                <div className="t">{pending.length} product{pending.length === 1 ? '' : 's'} awaiting approval</div>
                <div className="s">{pending.map((p) => p.name).join(', ')}</div>
              </div>
              <Link className="btn sm" to="/products">Review</Link>
            </div>
          )}
          {lowStock.length > 0 && (
            <div className="feed-item">
              <div className="grow">
                <div className="t">{lowStock.length} product{lowStock.length === 1 ? '' : 's'} low on stock</div>
                <div className="s">{lowStock.map((p) => `${p.name} (${p.stock})`).join(', ')}</div>
              </div>
              <Link className="btn ghost sm" to="/products">Restock</Link>
            </div>
          )}
        </div>
      )}

      <div className="grid cols2" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="row between" style={{ marginBottom: 8 }}>
            <h2>Next in the chair</h2>
            <Link className="hint accent" to="/schedule">Full schedule →</Link>
          </div>
          {data.agenda.length === 0 ? (
            <div className="empty" style={{ padding: 26 }}>Nothing booked today</div>
          ) : (
            data.agenda.slice(0, 6).map((a) => (
              <div className="feed-item" key={a.id}>
                <b style={{ width: 46 }}>
                  {new Date(a.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                </b>
                <div className="grow">
                  <div className="t">{a.user?.name || 'Walk-in'}</div>
                  <div className="s">{a.serviceName} · {a.durationMin} min</div>
                </div>
                {a.free
                  ? <span className="badge gold">🎁 FREE</span>
                  : <b>${a.price}</b>}
              </div>
            ))
          )}
        </div>

        <div className="card">
          <div className="row between" style={{ marginBottom: 8 }}>
            <h2>Live activity</h2>
            <Link className="hint accent" to="/check-ins">Check-in QR →</Link>
          </div>
          {data.checkins.length === 0 ? (
            <div className="empty" style={{ padding: 26 }}>Nothing yet today</div>
          ) : (
            data.checkins.slice(0, 6).map((c) => (
              <div className="feed-item" key={c._id || c.id}>
                <div className="avatar" style={{ width: 30, height: 30, fontSize: 11 }}>
                  {(c.userName || '?').split(' ').map((p) => p[0]).join('').slice(0, 2)}
                </div>
                <div className="grow">
                  <div className="t">{c.userName}</div>
                  <div className="s">
                    {c.kind === 'stamp' ? `Stamp ${c.stampNumber}` : c.kind === 'earned' ? 'Earned a free cut' : 'Used a free cut'}
                    {' · '}{ago(c.at)}
                  </div>
                </div>
                <span className={`badge ${c.kind === 'stamp' ? 'ok' : 'gold'}`}>
                  {c.kind === 'stamp' ? 'CHECKED IN' : c.kind === 'earned' ? '🎁 EARNED' : '🎁 USED'}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
