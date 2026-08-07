/**
 * The back office icon set — stroked SVG on a 24×24 grid.
 *
 * These replace the Unicode geometric characters the sidebar used (◧ ▤ ▣ ▦ ✦ ◍)
 * and the two emoji mixed in with them. Those are not icons: they are whatever
 * glyph the user's system font happens to carry for that codepoint, so they
 * render as flat filled blocks, sit on inconsistent baselines, and change
 * completely between Windows, macOS and Linux. Mixing them with emoji made the
 * weight jump halfway down the list, since emoji are full-colour bitmaps.
 *
 * Everything is stroked with `currentColor` and no fill, so the existing
 * `.navlink`, `.navlink:hover` and `.navlink.active` rules keep driving the
 * colour with no extra props and no second asset for the active state.
 *
 * The counterpart in the mobile app is mobile/src/components/Icon.tsx, drawn on
 * the same grid at the same weight so the two products look related.
 */
export default function Icon({ name, size = 18, strokeWidth = 1.8 }) {
  const s = {
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    fill: 'none',
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      style={{ flex: '0 0 auto', display: 'block' }}
    >
      {/* Dashboard — bars on an axis. Deliberately not a grid of panels: the QR
          icon below is already blocks, and at 18px the two were near enough to
          identical that the sidebar read as two of the same thing. */}
      {name === 'dashboard' && (
        <>
          <path d="M4 4v14.6a1.4 1.4 0 0 0 1.4 1.4H20" {...s} />
          <path d="M8.4 16.4v-4.2M12.6 16.4V7.6M16.8 16.4v-6.6" {...s} />
        </>
      )}

      {name === 'calendar' && (
        <>
          <rect x="3" y="5" width="18" height="16" rx="3" {...s} />
          <path d="M8 3v4M16 3v4M3 10.5h18" {...s} />
          <path d="M7.5 14.5h4" {...s} />
        </>
      )}

      {/* Check-in — the finder blocks of a QR symbol. */}
      {name === 'qr' && (
        <>
          <rect x="3.5" y="3.5" width="6.6" height="6.6" rx="1.6" {...s} />
          <rect x="13.9" y="3.5" width="6.6" height="6.6" rx="1.6" {...s} />
          <rect x="3.5" y="13.9" width="6.6" height="6.6" rx="1.6" {...s} />
          <path d="M14 14.2h3.2v3.2H14z" {...s} />
          <path d="M20.5 14.2v6.3h-3.3" {...s} />
        </>
      )}

      {/* Products — a box seen in three-quarter view. */}
      {name === 'box' && (
        <>
          <path d="M20.5 7.7v8.6a1.6 1.6 0 0 1-.85 1.41l-6.9 3.62a1.6 1.6 0 0 1-1.5 0l-6.9-3.62a1.6 1.6 0 0 1-.85-1.41V7.7" {...s} />
          <path d="m3.9 7 7.35-3.6a1.6 1.6 0 0 1 1.5 0L20.1 7l-7.35 3.75a1.6 1.6 0 0 1-1.5 0z" {...s} />
          <path d="M12 10.9V21" {...s} />
        </>
      )}

      {name === 'bag' && (
        <>
          <path d="M4.7 8h14.6l-1.15 11.3a1.6 1.6 0 0 1-1.6 1.45H7.45a1.6 1.6 0 0 1-1.6-1.45z" {...s} />
          <path d="M8.7 8.2V6.3a3.3 3.3 0 0 1 6.6 0v1.9" {...s} />
        </>
      )}

      {name === 'image' && (
        <>
          <rect x="3" y="5" width="18" height="14" rx="3" {...s} />
          <circle cx="8.8" cy="10" r="1.8" {...s} />
          <path d="m4 17.5 4.6-3.7 3.6 2.7 3-2.2 4.8 3.5" {...s} />
        </>
      )}

      {name === 'bell' && (
        <>
          <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6.2-2 6.2h16S18 14 18 9" {...s} />
          <path d="M13.7 19a2 2 0 0 1-3.4 0" {...s} />
        </>
      )}

      {name === 'users' && (
        <>
          <circle cx="9.2" cy="8" r="3.2" {...s} />
          <path d="M3 20.5c0-3.3 2.9-5.2 6.2-5.2s6.2 1.9 6.2 5.2" {...s} />
          <circle cx="17.8" cy="9.2" r="2.3" {...s} />
          <path d="M17.2 14.1c2.2.2 3.8 1.6 3.8 3.9" {...s} />
        </>
      )}

      {name === 'scissors' && (
        <>
          <circle cx="6" cy="7" r="2.6" {...s} />
          <circle cx="6" cy="17" r="2.6" {...s} />
          <path d="M8.4 8.6 20 18M8.4 15.4 20 6" {...s} />
        </>
      )}

      {name === 'sun' && (
        <>
          <circle cx="12" cy="12" r="4.2" {...s} />
          <path d="M12 2.6v2.2M12 19.2v2.2M4.4 4.4l1.6 1.6M18 18l1.6 1.6M2.6 12h2.2M19.2 12h2.2M4.4 19.6 6 18M18 6l1.6-1.6" {...s} />
        </>
      )}

      {name === 'moon' && <path d="M20.2 14.4A8.4 8.4 0 0 1 9.6 3.8a8.4 8.4 0 1 0 10.6 10.6" {...s} />}

      {/* Opening and closing the mobile nav drawer. */}
      {name === 'menu' && <path d="M4 7h16M4 12h16M4 17h16" {...s} />}
      {name === 'close' && <path d="m6.6 6.6 10.8 10.8M17.4 6.6 6.6 17.4" {...s} />}
    </svg>
  );
}
