import { useEffect, useMemo, useState } from 'react';
import { get, post } from '../lib/api.js';
import { assetUrl } from '../lib/config.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useDialog } from '../context/DialogContext.jsx';
import { useSocketEvent } from '../hooks/useRealtime.js';
import Icon from '../components/Icon.jsx';

const STATUS_TONE = { published: 'ok', pending: 'warn', rejected: 'red' };

/**
 * The lookbook review queue. Artists upload cuts from the app; the shop decides
 * what goes public. Same approval gate the marketplace listings use.
 */
export default function Styles() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const { showError, confirm } = useDialog();
  const [looks, setLooks] = useState([]);
  const [filter, setFilter] = useState(isAdmin ? 'pending' : 'all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setLooks(await get('/styles/mine'));
    } catch (err) {
      showError(err.message, { title: 'Couldn’t load the lookbook', icon: '🖼️' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useSocketEvent('style:changed', () => load());

  const shown = useMemo(
    () => (filter === 'all' ? looks : looks.filter((l) => l.status === filter)),
    [looks, filter],
  );

  const counts = useMemo(
    () => looks.reduce((acc, l) => ({ ...acc, [l.status]: (acc[l.status] || 0) + 1 }), {}),
    [looks],
  );

  const setStatus = async (look, status) => {
    if (status === 'rejected') {
      const ok = await confirm({
        title: `Reject “${look.title}”?`,
        message: 'It stays in the artist’s uploads marked as not used, and clients never see it.',
        icon: '🖼️',
        tone: 'danger',
        confirmLabel: 'Reject it',
        cancelLabel: 'Keep reviewing',
      });
      if (!ok) return;
    }

    setBusy(true);
    try {
      const updated = await post(`/styles/${look.id}/status`, { status });
      setLooks((list) => list.map((l) => (l.id === updated.id ? updated : l)));
      toast(status === 'published' ? 'Published to the app' : `Marked ${status}`);
    } catch (err) {
      showError(err.message, { title: 'Couldn’t change the status', icon: '🖼️' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="topbar" style={{ marginTop: -8 }}>
        <div>
          <h1>Lookbook</h1>
          <div className="sub">
            {isAdmin
              ? 'Cuts your artists uploaded · approve what clients see'
              : 'Your uploads · the shop approves them before clients see them'}
          </div>
        </div>
      </div>

      <div className="seg" style={{ marginBottom: 16 }}>
        {['all', 'pending', 'published', 'rejected'].map((s) => (
          <button key={s} type="button" className={filter === s ? 'active' : ''} onClick={() => setFilter(s)}>
            {s[0].toUpperCase() + s.slice(1)}
            {s !== 'all' && counts[s] ? ` (${counts[s]})` : ''}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="empty">Loading…</div>
      ) : shown.length === 0 ? (
        <div className="card empty">
          <div className="ico"><Icon name="image" size={32} /></div>
          <div style={{ fontWeight: 700, color: 'var(--text)' }}>
            {filter === 'pending' ? 'Nothing waiting for review' : 'Nothing here'}
          </div>
          <div style={{ marginTop: 6 }}>Artists upload cuts from the Portfolio screen in the app.</div>
        </div>
      ) : (
        <div className="grid products">
          {shown.map((look) => (
            <div className="ptile" key={look.id} style={{ cursor: 'default' }}>
              <div className="thumb">
                {look.images?.[0] ? <img src={assetUrl(look.images[0])} alt={look.title} /> : <span>✂️</span>}
                <span className={`badge ${STATUS_TONE[look.status]} st`}>{look.status}</span>
              </div>
              <div className="body">
                <div className="nm">{look.title}</div>
                <div className="mt">
                  {look.category} · {look.durationMin} min · ${look.price}
                </div>
                {look.artist?.displayName && <div className="mt">{look.artist.displayName}</div>}

                {isAdmin && look.status !== 'published' && (
                  <div className="row" style={{ marginTop: 10, gap: 7 }}>
                    <button
                      className="btn sm grow"
                      type="button"
                      disabled={busy}
                      onClick={() => setStatus(look, 'published')}
                    >
                      Publish
                    </button>
                    {look.status !== 'rejected' && (
                      <button
                        className="btn ghost sm"
                        type="button"
                        disabled={busy}
                        onClick={() => setStatus(look, 'rejected')}
                      >
                        Reject
                      </button>
                    )}
                  </div>
                )}
                {isAdmin && look.status === 'published' && (
                  <button
                    className="btn ghost sm"
                    type="button"
                    style={{ marginTop: 10, width: '100%' }}
                    disabled={busy}
                    onClick={() => setStatus(look, 'pending')}
                  >
                    Unpublish
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
