import { useEffect, useRef } from 'react';

/**
 * The back office's dialog — the counterpart to the client app's.
 *
 * Replaces error toasts and bare `window.confirm`. A toast is the wrong shape
 * for a failure: it leaves on a timer, so the one message that mattered is the
 * one most likely to be missed. And `window.confirm` blocks the page with the
 * browser's own chrome, which ignores the theme entirely.
 */
export default function Dialog({
  title,
  message,
  icon,
  tone = 'default',
  confirmLabel = 'OK',
  cancelLabel,
  dismissible = true,
  onConfirm,
  onCancel,
}) {
  const confirmRef = useRef(null);

  useEffect(() => {
    /* Focus the affirmative action so Enter works and a screen reader lands
       somewhere useful, and trap Escape as a cancel. */
    confirmRef.current?.focus();

    const onKey = (e) => {
      if (e.key === 'Escape' && dismissible) onCancel();
    };
    window.addEventListener('keydown', onKey);

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [dismissible, onCancel]);

  return (
    <div
      className="dlg-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && dismissible) onCancel();
      }}
    >
      <div className={`dlg ${tone}`} role="alertdialog" aria-modal="true" aria-label={title}>
        {!!icon && <div className="ico" aria-hidden>{icon}</div>}
        <h2>{title}</h2>
        {!!message && <p>{message}</p>}

        <div className="actions">
          <button
            ref={confirmRef}
            type="button"
            className={`btn ${tone === 'danger' ? 'danger' : ''}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
          {!!cancelLabel && (
            <button type="button" className="btn ghost" onClick={onCancel}>
              {cancelLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
