import { useEffect, useMemo, useRef, useState } from 'react';
import { del, get, patchForm, post, postForm } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useDialog } from '../context/DialogContext.jsx';
import { useSocketEvent } from '../hooks/useRealtime.js';
import Modal from '../components/Modal.jsx';

const CATEGORIES = ['Hair', 'Beard', 'Shave', 'Tools', 'Aftercare'];
const STATUS_TONE = { published: 'ok', pending: 'warn', draft: 'dim', archived: 'red' };

const EMPTY = {
  name: '', brand: 'FadeRoom Label', category: 'Hair', price: '', compareAtPrice: '',
  size: '', description: '', howToUse: '', icon: '🧴', stock: '0', tag: '', owner: '',
};

export default function Products() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const { showError } = useDialog();
  const [items, setItems] = useState([]);
  const [artists, setArtists] = useState([]);
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setItems(await get('/products/manage/list'));
    } catch (err) {
      showError(err.message, { title: 'Couldn’t load your products', icon: '▦' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    if (isAdmin) get('/artists?all=true').then(setArtists).catch(() => {});
  }, [isAdmin]);

  /* Another seat edits a product — the board updates without a refresh. */
  useSocketEvent('product:updated', (p) =>
    setItems((list) => list.map((x) => (x.id === p.id ? p : x))));
  useSocketEvent('product:created', (p) =>
    setItems((list) => (list.some((x) => x.id === p.id) ? list : [p, ...list])));

  const shown = useMemo(
    () => (filter === 'all' ? items : items.filter((p) => p.status === filter)),
    [items, filter],
  );

  const counts = useMemo(
    () => items.reduce((acc, p) => ({ ...acc, [p.status]: (acc[p.status] || 0) + 1 }), {}),
    [items],
  );

  const setStatus = async (product, status) => {
    try {
      const updated = await post(`/products/${product.id}/status`, { status });
      setItems((list) => list.map((x) => (x.id === updated.id ? updated : x)));
      toast(status === 'published' ? 'Published to the app' : `Marked ${status}`);
    } catch (err) {
      showError(err.message, { title: 'Couldn’t change the status', icon: '▦' });
    }
  };

  return (
    <>
      <div className="topbar" style={{ marginTop: -8 }}>
        <div>
          <h1>Products</h1>
          <div className="sub">
            {isAdmin ? 'Every shelf in the shop' : 'Your shelf · edits go back through approval'}
          </div>
        </div>
        <div className="spacer" />
        <button className="btn" onClick={() => setEditing(EMPTY)} type="button">+ New product</button>
      </div>

      <div className="seg" style={{ marginBottom: 16 }}>
        {['all', 'published', 'pending', 'draft', 'archived'].map((s) => (
          <button
            key={s}
            type="button"
            className={filter === s ? 'active' : ''}
            onClick={() => setFilter(s)}
          >
            {s[0].toUpperCase() + s.slice(1)}
            {s !== 'all' && counts[s] ? ` (${counts[s]})` : ''}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="empty">Loading…</div>
      ) : shown.length === 0 ? (
        <div className="card empty">
          <div className="ico">▦</div>
          <div style={{ fontWeight: 700, color: 'var(--text)' }}>Nothing here yet</div>
          <div style={{ marginTop: 6 }}>Add a product and upload a photo of it.</div>
        </div>
      ) : (
        <div className="grid products">
          {shown.map((p) => (
            <div className="ptile" key={p.id} onClick={() => setEditing(p)}>
              <div className="thumb">
                {p.images?.[0] ? <img src={p.images[0]} alt={p.name} /> : <span>{p.icon}</span>}
                <span className={`badge ${STATUS_TONE[p.status]} st`}>{p.status}</span>
              </div>
              <div className="body">
                <div className="nm">{p.name}</div>
                <div className="mt">
                  {p.category} · ${p.price} · {p.stock} in stock
                </div>
                {isAdmin && p.status === 'pending' && (
                  <div className="row" style={{ marginTop: 10, gap: 7 }}>
                    <button
                      className="btn sm grow"
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setStatus(p, 'published'); }}
                    >
                      Approve
                    </button>
                    <button
                      className="btn ghost sm"
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setStatus(p, 'draft'); }}
                    >
                      Hold
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <Editor
          product={editing}
          artists={artists}
          isAdmin={isAdmin}
          onClose={() => setEditing(null)}
          onSaved={(saved, isNew) => {
            /* The socket echo can beat the HTTP response back, so a blind
               unshift here would render the same product twice. */
            setItems((list) =>
              list.some((x) => x.id === saved.id)
                ? list.map((x) => (x.id === saved.id ? saved : x))
                : isNew
                  ? [saved, ...list]
                  : list);
            setEditing(null);
            toast(isNew ? 'Product created' : 'Changes saved');
          }}
          onArchived={(id) => {
            setItems((list) => list.map((x) => (x.id === id ? { ...x, status: 'archived' } : x)));
            setEditing(null);
            toast('Product archived');
          }}
        />
      )}
    </>
  );
}

function Editor({ product, artists, isAdmin, onClose, onSaved, onArchived }) {
  const { showError, confirm } = useDialog();
  const isNew = !product.id;
  const [form, setForm] = useState({
    ...EMPTY,
    ...product,
    price: String(product.price ?? ''),
    compareAtPrice: product.compareAtPrice == null ? '' : String(product.compareAtPrice),
    stock: String(product.stock ?? 0),
    owner: product.owner?.id || product.owner || '',
  });
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [fields, setFields] = useState({});
  const [busy, setBusy] = useState(false);
  const fileInput = useRef(null);

  /* Object URLs are a leak if you don't revoke them. */
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach(URL.revokeObjectURL);
  }, [files]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setFields({});
    try {
      const body = new FormData();
      const scalars = {
        name: form.name, brand: form.brand, category: form.category,
        price: form.price, size: form.size, description: form.description,
        howToUse: form.howToUse, icon: form.icon, stock: form.stock, tag: form.tag,
      };
      Object.entries(scalars).forEach(([k, v]) => body.append(k, v ?? ''));
      if (form.compareAtPrice !== '') body.append('compareAtPrice', form.compareAtPrice);
      if (isAdmin && form.owner) body.append('owner', form.owner);
      files.forEach((f) => body.append('images', f));

      const saved = isNew
        ? await postForm('/products', body)
        : await patchForm(`/products/${product.id}`, body);
      onSaved(saved, isNew);
    } catch (err) {
      if (err.fields) setFields(err.fields);
      showError(err.message, { title: isNew ? 'Product not created' : 'Changes not saved', icon: '▦' });
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    const ok = await confirm({
      title: `Archive ${form.name || 'this product'}?`,
      message: 'Clients stop seeing it immediately. Past orders keep their record of it, and you can publish it again later.',
      icon: '▦',
      tone: 'danger',
      confirmLabel: 'Archive it',
      cancelLabel: 'Keep it listed',
    });
    if (!ok) return;

    setBusy(true);
    try {
      await del(`/products/${product.id}`);
      onArchived(product.id);
    } catch (err) {
      showError(err.message, { title: 'Couldn’t archive it', icon: '▦' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={isNew ? 'New product' : form.name}
      subtitle={isNew ? 'It goes to the shop for approval before clients see it' : `Status: ${product.status}`}
      onClose={onClose}
      wide
    >
      <form onSubmit={save}>
        <div className="grid cols2">
          <div>
            <div className="field" style={{ marginTop: 0 }}>
              <label>Name</label>
              <input className={`input ${fields.name ? 'err' : ''}`} value={form.name} onChange={set('name')} />
              {fields.name && <div className="err-msg">{fields.name}</div>}
            </div>
            <div className="field">
              <label>Brand / shelf</label>
              <input className="input" value={form.brand} onChange={set('brand')} />
            </div>
            <div className="field">
              <label>Category</label>
              <select className="input" value={form.category} onChange={set('category')}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {isAdmin && (
              <div className="field">
                <label>Sold by</label>
                <select className="input" value={form.owner} onChange={set('owner')}>
                  <option value="">FadeRoom house label</option>
                  {artists.map((a) => <option key={a.id} value={a.id}>{a.displayName}</option>)}
                </select>
              </div>
            )}
            <div className="row" style={{ gap: 10 }}>
              <div className="field grow">
                <label>Price ($)</label>
                <input className={`input ${fields.price ? 'err' : ''}`} inputMode="decimal" value={form.price} onChange={set('price')} />
              </div>
              <div className="field grow">
                <label>Was ($)</label>
                <input className="input" inputMode="decimal" value={form.compareAtPrice} onChange={set('compareAtPrice')} />
              </div>
            </div>
            <div className="row" style={{ gap: 10 }}>
              <div className="field grow">
                <label>Stock</label>
                <input className="input" inputMode="numeric" value={form.stock} onChange={set('stock')} />
              </div>
              <div className="field grow">
                <label>Size</label>
                <input className="input" value={form.size} onChange={set('size')} placeholder="100 ml" />
              </div>
            </div>
            <div className="row" style={{ gap: 10 }}>
              <div className="field grow">
                <label>Badge</label>
                <input className="input" value={form.tag} onChange={set('tag')} placeholder="BESTSELLER" />
              </div>
              <div className="field" style={{ width: 90 }}>
                <label>Glyph</label>
                <input className="input" style={{ textAlign: 'center', fontSize: 20 }} value={form.icon} onChange={set('icon')} />
              </div>
            </div>
          </div>

          <div>
            <div className="field" style={{ marginTop: 0 }}>
              <label>Photos</label>
              <div
                className="card"
                style={{ borderStyle: 'dashed', textAlign: 'center', cursor: 'pointer', padding: 22 }}
                onClick={() => fileInput.current?.click()}
              >
                <div style={{ fontSize: 26 }}>📸</div>
                <div style={{ fontWeight: 700, marginTop: 6, fontSize: 13 }}>Upload product photos</div>
                <div className="hint" style={{ marginTop: 4 }}>JPEG, PNG or WebP · up to 5 MB each</div>
              </div>
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                hidden
                onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 6))}
              />
            </div>

            {(previews.length > 0 || product.images?.length > 0) && (
              <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
                {product.images?.map((src) => (
                  <img key={src} src={src} alt="" style={{ width: 68, height: 68, objectFit: 'cover', borderRadius: 9, border: '1px solid var(--line)' }} />
                ))}
                {previews.map((src) => (
                  <img key={src} src={src} alt="" style={{ width: 68, height: 68, objectFit: 'cover', borderRadius: 9, border: '1px solid var(--accent)' }} />
                ))}
              </div>
            )}

            <div className="field">
              <label>Description</label>
              <textarea className="input" value={form.description} onChange={set('description')} />
            </div>
            <div className="field">
              <label>How to use it</label>
              <textarea className="input" style={{ minHeight: 66 }} value={form.howToUse} onChange={set('howToUse')} />
            </div>
          </div>
        </div>

        <div className="row" style={{ marginTop: 20, gap: 10 }}>
          <button className="btn grow" disabled={busy} type="submit">
            {busy ? 'Saving…' : isNew ? 'Create product' : 'Save changes'}
          </button>
          <button className="btn ghost" onClick={onClose} type="button">Cancel</button>
          {!isNew && product.status !== 'archived' && (
            <button className="btn danger" onClick={archive} disabled={busy} type="button">Archive</button>
          )}
        </div>
      </form>
    </Modal>
  );
}
