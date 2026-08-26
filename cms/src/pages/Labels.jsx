import { useEffect, useMemo, useState } from 'react';
import { get, patch } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useDialog } from '../context/DialogContext.jsx';

/**
 * The app's own wording, editable.
 *
 * Every row is a label the app asks for by name, carrying the words it ships
 * with. Typing over one publishes the change to every phone at once; emptying
 * the box puts it back — which is why "reset" is a clear rather than a button
 * that has to remember what the old text was.
 *
 * The list itself is not editable here on purpose. It is generated from the
 * app's source by `scripts/extract-labels.mjs`, because which labels exist is a
 * fact about the code: a row typed in by hand would be one nothing ever reads.
 */
export default function Labels() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const { showError } = useDialog();

  const [rows, setRows] = useState([]);
  const [edits, setEdits] = useState({});
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setRows(await get('/labels/catalogue'));
      setEdits({});
    } catch (err) {
      showError(err.message ?? 'Could not load the labels');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  const groups = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const matched = needle
      ? rows.filter(
          (r) =>
            r.key.toLowerCase().includes(needle) ||
            String(r.defaultText).toLowerCase().includes(needle) ||
            String(r.value).toLowerCase().includes(needle),
        )
      : rows;

    const byGroup = new Map();
    for (const row of matched) {
      const list = byGroup.get(row.group) ?? [];
      list.push(row);
      byGroup.set(row.group, list);
    }
    return [...byGroup.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [rows, filter]);

  /* What is in the box right now — the edit if there is one, the saved value
     otherwise. Held separately so an untouched field and a field deliberately
     emptied are not the same thing. */
  const shown = (row) => (row.key in edits ? edits[row.key] : row.value);
  const dirty = Object.keys(edits).filter((k) => {
    const row = rows.find((r) => r.key === k);
    return row && edits[k] !== row.value;
  });

  const save = async () => {
    if (!dirty.length) return;
    setSaving(true);
    try {
      await patch('/labels', { values: Object.fromEntries(dirty.map((k) => [k, edits[k]])) });
      toast(`${dirty.length} label${dirty.length === 1 ? '' : 's'} published`);
      await load();
    } catch (err) {
      showError(err.message ?? 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) return <div className="card">Only the shop admin can edit the app's wording.</div>;

  const overridden = rows.filter((r) => r.value).length;

  return (
    <div>
      <div className="row between" style={{ marginBottom: 14 }}>
        <div>
          <h1>App wording</h1>
          <div className="hint">
            {rows.length} labels · {overridden} changed from the default. Changes reach every phone
            immediately.
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <input
            className="input"
            placeholder="Search wording or key…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ minWidth: 220 }}
          />
          <button className="btn" onClick={save} disabled={!dirty.length || saving}>
            {saving ? 'Publishing…' : dirty.length ? `Publish ${dirty.length}` : 'Publish'}
          </button>
        </div>
      </div>

      {loading && <div className="card">Loading…</div>}

      {!loading && !rows.length && (
        <div className="card">
          <b>No labels registered yet.</b>
          <div className="hint" style={{ marginTop: 6, lineHeight: 1.6 }}>
            The list is generated from the app's source. Run{' '}
            <code>node scripts/extract-labels.mjs</code> in <code>mobile/</code> and upload the
            resulting <code>labels.json</code> to <code>PUT /api/labels/catalogue</code>.
          </div>
        </div>
      )}

      {groups.map(([group, list]) => (
        <div className="card" key={group} style={{ marginBottom: 14 }}>
          <div className="row between">
            <h2>{group}</h2>
            <span className="hint">{list.length}</span>
          </div>

          {list.map((row) => {
            const value = shown(row);
            const changed = Boolean(row.value);
            return (
              <div key={row.key} style={{ marginTop: 12 }}>
                <div className="row between">
                  <label className="hint" htmlFor={row.key}>
                    {row.key}
                  </label>
                  {changed && (
                    <button
                      className="btn ghost"
                      onClick={() => setEdits((e) => ({ ...e, [row.key]: '' }))}
                      title="Clear it to go back to the app's own wording"
                    >
                      Reset
                    </button>
                  )}
                </div>
                <input
                  id={row.key}
                  className="input"
                  value={value}
                  placeholder={row.defaultText}
                  onChange={(e) => setEdits((prev) => ({ ...prev, [row.key]: e.target.value }))}
                />
                {/* Shown only once it differs, so the common case is one line
                    rather than every row repeating itself. */}
                {value && value !== row.defaultText && (
                  <div className="hint" style={{ marginTop: 4 }}>
                    was “{row.defaultText}”
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
