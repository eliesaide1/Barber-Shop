import { useEffect } from 'react';

export default function Modal({ title, subtitle, onClose, children, wide }) {
  /* Escape closes, and the page behind must not scroll under the sheet. */
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <div className="row" style={{ marginBottom: 14 }}>
          <div>
            <h2>{title}</h2>
            {subtitle && <div className="hint" style={{ marginTop: 3 }}>{subtitle}</div>}
          </div>
          <button type="button" className="close" onClick={onClose} aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
