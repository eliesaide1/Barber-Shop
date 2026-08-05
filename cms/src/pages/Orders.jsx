import { useEffect, useMemo, useState } from 'react';
import { get, post } from '../lib/api.js';
import { useToast } from '../context/ToastContext.jsx';
import { useDialog } from '../context/DialogContext.jsx';
import { useSocketEvent } from '../hooks/useRealtime.js';
import Modal from '../components/Modal.jsx';

const FLOW = {
  pickup: [['ready', 'Ready at the shop'], ['collected', 'Collected']],
  delivery: [['packing', 'Packing'], ['out', 'Out for delivery'], ['delivered', 'Delivered']],
};

const nextStep = (order) => {
  const flow = FLOW[order.fulfilment];
  const at = flow.findIndex(([s]) => s === order.status);
  return at >= 0 && at < flow.length - 1 ? flow[at + 1] : null;
};

const isOpen = (o) => o.status !== 'cancelled' && Boolean(nextStep(o));

export default function Orders() {
  const { toast } = useToast();
  const { showError } = useDialog();
  const [orders, setOrders] = useState([]);
  const [tab, setTab] = useState('open');
  const [detail, setDetail] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    get('/orders/manage/list')
      .then(setOrders)
      .catch((e) => showError(e.message, { title: 'Couldn’t load orders', icon: '🛍️' }));
  }, [showError]);

  useSocketEvent('order:created', (o) => {
    setOrders((list) => (list.some((x) => x.id === o.id) ? list : [o, ...list]));
    toast(`New order · $${o.total}`);
  });
  useSocketEvent('order:status', (o) =>
    setOrders((list) => list.map((x) => (x.id === o.id ? { ...x, ...o } : x))));

  const shown = useMemo(
    () => orders.filter((o) => (tab === 'open' ? isOpen(o) : !isOpen(o))),
    [orders, tab],
  );

  const openCount = useMemo(() => orders.filter(isOpen).length, [orders]);

  const advance = async (order) => {
    const step = nextStep(order);
    if (!step) return;
    setBusy(true);
    try {
      const updated = await post(`/orders/${order.id}/status`, { status: step[0] });
      setOrders((list) => list.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
      setDetail((d) => (d && d.id === updated.id ? { ...d, ...updated } : d));
      toast(step[1]);
    } catch (err) {
      showError(err.message, { title: 'Couldn’t move that order on', icon: '🛍️' });
    } finally {
      setBusy(false);
    }
  };

  const lookup = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    try {
      setDetail(await get(`/orders/manage/by-code/${encodeURIComponent(code.trim().toUpperCase())}`));
      setCode('');
    } catch (err) {
      showError(err.message, { title: 'No order for that code', icon: '🛍️' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="topbar" style={{ marginTop: -8 }}>
        <div>
          <h1>Orders</h1>
          <div className="sub">{openCount} waiting to be handed over</div>
        </div>
        <div className="spacer" />
        <form className="row" onSubmit={lookup}>
          <input
            className="input mono"
            style={{ width: 170, textAlign: 'center', textTransform: 'uppercase' }}
            placeholder="PICKUP CODE"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button className="btn" type="submit" disabled={busy || !code.trim()}>Find</button>
        </form>
      </div>

      <div className="seg" style={{ marginBottom: 16 }}>
        <button type="button" className={tab === 'open' ? 'active' : ''} onClick={() => setTab('open')}>
          Open ({openCount})
        </button>
        <button type="button" className={tab === 'done' ? 'active' : ''} onClick={() => setTab('done')}>
          Closed
        </button>
      </div>

      <div className="card" style={{ padding: '16px 4px' }}>
        {shown.length === 0 ? (
          <div className="empty">
            <div className="ico">🛍</div>
            {tab === 'open' ? 'Nothing waiting' : 'No closed orders yet'}
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Code</th><th>Client</th><th>Items</th><th>Total</th>
                <th>Type</th><th>Status</th><th />
              </tr>
            </thead>
            <tbody>
              {shown.map((o) => {
                const step = nextStep(o);
                return (
                  <tr key={o.id} className="clickable" onClick={() => setDetail(o)}>
                    <td className="mono accent">{o.code}</td>
                    <td>{o.user?.name || '—'}</td>
                    <td className="muted">
                      {o.items.reduce((t, i) => t + i.qty, 0)} item
                      {o.items.reduce((t, i) => t + i.qty, 0) === 1 ? '' : 's'}
                    </td>
                    <td><b>${o.total}</b></td>
                    <td>{o.fulfilment === 'pickup' ? '💈 Pickup' : '🛵 Delivery'}</td>
                    <td>
                      <span className={`badge ${isOpen(o) ? 'gold' : 'dim'}`}>
                        {(FLOW[o.fulfilment].find(([s]) => s === o.status) || [, o.status])[1]}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {step && (
                        <button
                          className="btn sm"
                          type="button"
                          disabled={busy}
                          onClick={(e) => { e.stopPropagation(); advance(o); }}
                        >
                          {step[1]}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {detail && (
        <Modal
          title={`Order ${detail.code}`}
          subtitle={`${detail.fulfilment} · ${new Date(detail.createdAt).toLocaleString()}`}
          onClose={() => setDetail(null)}
        >
          <div className="card" style={{ background: 'var(--surface-2)' }}>
            <div className="row between"><span className="muted">Client</span><b>{detail.user?.name || '—'}</b></div>
            {detail.user?.phone && (
              <div className="row between" style={{ marginTop: 8 }}>
                <span className="muted">Phone</span><span>{detail.user.phone}</span>
              </div>
            )}
            {detail.address && (
              <div className="row between" style={{ marginTop: 8, alignItems: 'flex-start' }}>
                <span className="muted">Deliver to</span>
                <span style={{ textAlign: 'right', maxWidth: '62%' }}>{detail.address.line}</span>
              </div>
            )}
            {detail.withAppointment && (
              <div className="row between" style={{ marginTop: 8 }}>
                <span className="muted">Hand over</span>
                <span className="accent">At their next cut</span>
              </div>
            )}
          </div>

          <div className="card" style={{ marginTop: 12 }}>
            {detail.items.map((i) => (
              <div className="row between" key={i.product} style={{ padding: '7px 0' }}>
                <span>{i.icon} {i.qty} × {i.name}</span>
                <b>${i.price * i.qty}</b>
              </div>
            ))}
            <div className="row between" style={{ borderTop: '1px solid var(--line)', marginTop: 8, paddingTop: 10 }}>
              <b>Total</b><b className="accent" style={{ fontSize: 17 }}>${detail.total}</b>
            </div>
          </div>

          {nextStep(detail) && (
            <button
              className="btn block"
              style={{ marginTop: 16 }}
              disabled={busy}
              onClick={() => advance(detail)}
              type="button"
            >
              Mark as {nextStep(detail)[1].toLowerCase()}
            </button>
          )}
        </Modal>
      )}
    </>
  );
}
