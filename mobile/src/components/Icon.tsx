import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type IconName =
  | 'home'
  | 'calendar'
  | 'scan'
  | 'qr'
  | 'bag'
  | 'user'
  | 'users'
  | 'more'
  | 'bell'
  | 'image'
  | 'scissors'
  | 'back';

interface Props {
  name: IconName;
  size?: number;
  color: string;
  /** Slightly heavier stroke reads better when a tab is selected. */
  active?: boolean;
}

/**
 * The app's icon set — stroked SVG on a 24×24 grid, drawn to match the line
 * weight of the rest of the UI.
 *
 * These replace the Unicode geometric characters the tab bars used to use
 * (▤ ◍ ▣ ▦ ⋯). Those render as flat filled blocks that read as missing glyphs
 * rather than icons, and they vary wildly between devices because they come
 * from whatever font happens to cover that codepoint.
 *
 * Everything is drawn with `stroke={color}` and no fill, so a single colour
 * prop drives the whole icon and the active/inactive states are just a colour
 * swap — no second asset, no tint hacks.
 */
export function Icon({ name, size = 24, color, active = false }: Props) {
  const sw = active ? 2.1 : 1.8;
  const stroke = {
    stroke: color,
    strokeWidth: sw,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none' as const,
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'back' && (
        <>
          <Path d="M19 12H5" {...stroke} />
          <Path d="m11 18-6-6 6-6" {...stroke} />
        </>
      )}

      {name === 'home' && (
        <>
          <Path d="M3 10.5 12 3l9 7.5" {...stroke} />
          <Path d="M5.5 9.4V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.4" {...stroke} />
        </>
      )}

      {name === 'calendar' && (
        <>
          <Rect x="3" y="5" width="18" height="16" rx="3" {...stroke} />
          <Path d="M8 3v4M16 3v4M3 10.5h18" {...stroke} />
          <Path d="M7.5 14.5h4" {...stroke} />
        </>
      )}

      {/* Scanning a code — the viewfinder corners with a sweep line. */}
      {name === 'scan' && (
        <>
          <Path d="M4 8.5V6a2 2 0 0 1 2-2h2.5" {...stroke} />
          <Path d="M15.5 4H18a2 2 0 0 1 2 2v2.5" {...stroke} />
          <Path d="M20 15.5V18a2 2 0 0 1-2 2h-2.5" {...stroke} />
          <Path d="M8.5 20H6a2 2 0 0 1-2-2v-2.5" {...stroke} />
          <Path d="M3.6 12h16.8" {...stroke} />
        </>
      )}

      {/* Showing a code — the finder blocks of a QR symbol. Deliberately
          different from `scan`, because the artist presents and the client reads. */}
      {name === 'qr' && (
        <>
          <Rect x="3.5" y="3.5" width="6.6" height="6.6" rx="1.6" {...stroke} />
          <Rect x="13.9" y="3.5" width="6.6" height="6.6" rx="1.6" {...stroke} />
          <Rect x="3.5" y="13.9" width="6.6" height="6.6" rx="1.6" {...stroke} />
          <Path d="M14 14.2h3.2v3.2H14z" {...stroke} />
          <Path d="M20.5 14.2v6.3h-3.3" {...stroke} />
        </>
      )}

      {name === 'bag' && (
        <>
          <Path d="M4.7 8h14.6l-1.15 11.3a1.6 1.6 0 0 1-1.6 1.45H7.45a1.6 1.6 0 0 1-1.6-1.45z" {...stroke} />
          <Path d="M8.7 8.2V6.3a3.3 3.3 0 0 1 6.6 0v1.9" {...stroke} />
        </>
      )}

      {name === 'user' && (
        <>
          <Circle cx="12" cy="8" r="3.9" {...stroke} />
          <Path d="M4.3 20.8c0-3.9 3.6-5.9 7.7-5.9s7.7 2 7.7 5.9" {...stroke} />
        </>
      )}

      {name === 'users' && (
        <>
          <Circle cx="9.2" cy="8" r="3.2" {...stroke} />
          <Path d="M3 20.5c0-3.3 2.9-5.2 6.2-5.2s6.2 1.9 6.2 5.2" {...stroke} />
          <Circle cx="17.8" cy="9.2" r="2.3" {...stroke} />
          <Path d="M17.2 14.1c2.2.2 3.8 1.6 3.8 3.9" {...stroke} />
        </>
      )}

      {/* Filled dots — a stroked circle this small turns into a smudge. */}
      {name === 'more' && (
        <>
          <Circle cx="5.2" cy="12" r="1.7" fill={color} />
          <Circle cx="12" cy="12" r="1.7" fill={color} />
          <Circle cx="18.8" cy="12" r="1.7" fill={color} />
        </>
      )}

      {name === 'bell' && (
        <>
          <Path d="M18 9a6 6 0 1 0-12 0c0 5-2 6.2-2 6.2h16S18 14 18 9" {...stroke} />
          <Path d="M13.7 19a2 2 0 0 1-3.4 0" {...stroke} />
        </>
      )}

      {name === 'image' && (
        <>
          <Rect x="3" y="5" width="18" height="14" rx="3" {...stroke} />
          <Circle cx="8.8" cy="10" r="1.8" {...stroke} />
          <Path d="m4 17.5 4.6-3.7 3.6 2.7 3-2.2 4.8 3.5" {...stroke} />
        </>
      )}

      {name === 'scissors' && (
        <>
          <Circle cx="6" cy="7" r="2.6" {...stroke} />
          <Circle cx="6" cy="17" r="2.6" {...stroke} />
          <Path d="M8.4 8.6 20 18M8.4 15.4 20 6" {...stroke} />
        </>
      )}
    </Svg>
  );
}
