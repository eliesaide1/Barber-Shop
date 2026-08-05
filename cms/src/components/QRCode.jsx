import { useMemo } from 'react';
import { toPath } from '../lib/qr.js';

/** A QR always renders dark-on-white — a dark-mode inversion stops scanners reading it. */
export default function QRCode({ value, size = 220 }) {
  const path = useMemo(() => (value ? toPath(value) : null), [value]);

  if (!path) {
    return <div className="hint" style={{ textAlign: 'center', padding: 20 }}>Nothing to encode</div>;
  }

  return (
    <div className="qrbox" style={{ width: size, maxWidth: '100%' }}>
      <svg viewBox={`0 0 ${path.size} ${path.size}`} shapeRendering="crispEdges" role="img" aria-label="QR code">
        <rect width={path.size} height={path.size} fill="#fff" />
        <path d={path.d} fill="#000" />
      </svg>
    </div>
  );
}
