import { useCallback, useEffect, useRef, useState } from 'react';
import { get, post } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useDialog } from '../context/DialogContext.jsx';
import { useSocketEvent } from '../hooks/useRealtime.js';
import QRCode from '../components/QRCode.jsx';
import Modal from '../components/Modal.jsx';
import Icon from '../components/Icon.jsx';

const ago = (iso) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

const KIND = {
  stamp: { badge: 'ok', label: 'CHECKED IN' },
  earned: { badge: 'gold', label: 'EARNED A FREE CUT' },
  redeemed: { badge: 'gold', label: 'FREE CUT USED' },
};

export default function CheckIns() {
  const { toast } = useToast();
  const { showError } = useDialog();
  const { isAdmin } = useAuth();
  const [qr, setQr] = useState(null);
  const [remaining, setRemaining] = useState(0);
  const [feed, setFeed] = useState([]);
  const [claim, setClaim] = useState('');
  const [lookup, setLookup] = useState(null);
  const [busy, setBusy] = useState(false);
  /* An admin has no chair of their own, so they choose whose QR to show. */
  const [artists, setArtists] = useState([]);
  const [chair, setChair] = useState('');
  const timer = useRef(null);

  useEffect(() => {
    if (!isAdmin) return;
    get('/artists')
      .then((list) => {
        setArtists(list);
        setChair((current) => current || list[0]?.id || '');
      })
      .catch(() => {});
  }, [isAdmin]);

  const pullToken = useCallback(async () => {
    if (isAdmin && !chair) return;
    try {
      const data = await get(`/loyalty/check-in-token${isAdmin ? `?artist=${chair}` : ''}`);
      setQr(data);
      setRemaining(data.expiresInMs);
    } catch (err) {
      showError(err.message, { title: 'Couldn’t get a check-in code', icon: '💈' });
    }
  }, [showError, isAdmin, chair]);

  useEffect(() => {
    pullToken();
    get('/loyalty/check-ins').then(setFeed).catch(() => {});
  }, [pullToken]);

  /* Count the current token down, and pull a fresh one the moment it lapses.
     The rotation is what makes a photographed QR worthless. */
  useEffect(() => {
    clearInterval(timer.current);
    timer.current = setInterval(() => {
      setRemaining((ms) => {
        if (ms <= 1000) {
          pullToken();
          return 0;
        }
        return ms - 1000;
      });
    }, 1000);
    return () => clearInterval(timer.current);
  }, [pullToken]);

  useSocketEvent('checkin:new', (event) => {
    setFeed((list) => [event, ...list].slice(0, 60));
    const who = event.userName?.split(' ')[0] || 'A client';
    toast(event.kind === 'earned' ? `${who} just earned a free cut 🎁` : `${who} checked in`);
  });

  const findReward = async (e) => {
    e.preventDefault();
    if (!claim.trim()) return;
    setBusy(true);
    try {
      setLookup(await get(`/loyalty/rewards/${encodeURIComponent(claim.trim().toUpperCase())}`));
    } catch (err) {
      showError(err.message, { title: 'No free cut for that code', icon: '🎁' });
    } finally {
      setBusy(false);
    }
  };

  const redeem = async () => {
    setBusy(true);
    try {
      const res = await post(`/loyalty/rewards/${lookup.reward.code}/redeem`);
      toast(`Free cut redeemed for ${res.client} ✓`);
      setLookup(null);
      setClaim('');
    } catch (err) {
      showError(err.message, { title: 'Couldn’t redeem that free cut', icon: '🎁' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="topbar" style={{ marginTop: -8 }}>
        <div>
          <h1>Check-in &amp; QR</h1>
          <div className="sub">Show the code once the cut is done · it rotates every minute</div>
        </div>
        <div className="spacer" />
        {isAdmin && (
          <select
            className="input"
            style={{ width: 200 }}
            value={chair}
            onChange={(e) => setChair(e.target.value)}
          >
            {artists.map((a) => (
              <option key={a.id} value={a.id}>{a.displayName} · {a.chair}</option>
            ))}
          </select>
        )}
      </div>

      <div className="grid cols2">
        <div className="card" style={{ textAlign: 'center' }}>
          <span className="badge gold">SHOW THIS TO YOUR CLIENT</span>
          <div style={{ display: 'grid', placeItems: 'center', margin: '16px 0' }}>
            <QRCode value={qr?.token} size={230} />
          </div>
          <div className="row between" style={{ alignItems: 'flex-end' }}>
            <div style={{ textAlign: 'left' }}>
              <div className="hint">Or read out this code</div>
              <div className="mono" style={{ fontSize: 24 }}>{qr?.code || '——————'}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="hint">Refreshes in</div>
              <div className="ttl accent">{Math.ceil(remaining / 1000)}s</div>
            </div>
          </div>
          <div className="hint" style={{ marginTop: 14, lineHeight: 1.5 }}>
            Never print this or leave it on display. A photo of it stops working
            within the minute, which is what proves the client was at the chair.
          </div>
        </div>

        <div>
          <div className="card">
            <h2>Redeem a free cut</h2>
            <div className="hint">Ask for the client’s 6-character claim code, or scan it from their phone.</div>
            <form className="row" style={{ marginTop: 12 }} onSubmit={findReward}>
              <input
                className="input grow mono"
                style={{ textAlign: 'center', textTransform: 'uppercase' }}
                placeholder="CLAIM CODE"
                maxLength={20}
                value={claim}
                onChange={(e) => setClaim(e.target.value)}
              />
              <button className="btn" disabled={busy || !claim.trim()} type="submit">Check</button>
            </form>
          </div>

          <div className="card">
            <div className="row between" style={{ marginBottom: 6 }}>
              <h2>Today’s activity</h2>
              <span className="badge dim">{feed.length} events</span>
            </div>
            {feed.length === 0 ? (
              <div className="empty">
                <div className="ico"><Icon name="qr" size={32} /></div>
                No check-ins yet
              </div>
            ) : (
              feed.map((c) => {
                const meta = KIND[c.kind] || KIND.stamp;
                return (
                  <div className="feed-item" key={c._id || c.id}>
                    <div className="avatar">
                      {(c.userName || '?').split(' ').map((p) => p[0]).join('').slice(0, 2)}
                    </div>
                    <div className="grow">
                      <div className="t">{c.userName}</div>
                      <div className="s">
                        {c.kind === 'stamp' ? `Stamp ${c.stampNumber}` : `Claim ${c.code}`} · {ago(c.at)}
                      </div>
                    </div>
                    <span className={`badge ${meta.badge}`}>{meta.label}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {lookup && (
        <Modal title="Valid free cut" subtitle={`Claim ${lookup.reward.code}`} onClose={() => setLookup(null)}>
          <div className="card" style={{ background: 'var(--surface-2)' }}>
            <div className="row between"><span className="muted">Client</span><b>{lookup.client.name}</b></div>
            <div className="row between" style={{ marginTop: 9 }}><span className="muted">Reward</span><span>1 standard haircut</span></div>
            <div className="row between" style={{ marginTop: 9 }}><span className="muted">Value</span><b className="accent">${lookup.value}</b></div>
            <div className="row between" style={{ marginTop: 9 }}>
              <span className="muted">Status</span>
              <span>{lookup.reward.status === 'reserved' ? 'Attached to a booking' : 'Ready to use'}</span>
            </div>
          </div>
          <div className="hint" style={{ margin: '14px 0' }}>
            Redeeming burns the code — it cannot be used a second time.
          </div>
          <button className="btn block" disabled={busy} onClick={redeem} type="button">
            Redeem — this cut is free
          </button>
          <button className="btn ghost block" style={{ marginTop: 10 }} onClick={() => setLookup(null)} type="button">
            Not now
          </button>
        </Modal>
      )}
    </>
  );
}
