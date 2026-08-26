import React from 'react';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';
import { useColors } from '../store/ThemeContext';

/**
 * The walkthrough's four pictures.
 *
 * Drawn rather than shipped as PNGs, for the same reason the icon set is: one
 * description renders sharp on every density instead of three files per slide,
 * and — the part that actually matters here — they are painted from the theme
 * tokens, so the walkthrough follows the phone into dark mode. Bitmaps would
 * have meant a second set of artwork or a light card marooned on a dark screen.
 *
 * Each is drawn on the same 300×220 canvas so the pager never shifts as it
 * moves from one to the next.
 */

const W = 300;
const H = 220;

/** The wash every slide sits on — the hero gradient used elsewhere in the app. */
function Backdrop({ id }: { id: string }) {
  const c = useColors();
  return (
    <>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={c.heroFrom} />
          <Stop offset="1" stopColor={c.heroTo} />
        </LinearGradient>
      </Defs>
      <Rect
        x="6"
        y="6"
        width={W - 12}
        height={H - 12}
        rx="28"
        fill={`url(#${id})`}
        stroke={c.heroLine}
        strokeWidth="1.5"
      />
    </>
  );
}

/* ---------------- 1 · asking for a chair ---------------- */

function AskArt() {
  const c = useColors();
  const slot = { rx: 7, fill: c.surface2, stroke: c.line, strokeWidth: 1 };

  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
      <Backdrop id="ob1" />

      {/* the binder rings, drawn behind so the card overlaps them */}
      <Rect x="106" y="28" width="9" height="20" rx="4.5" fill={c.accent2} />
      <Rect x="185" y="28" width="9" height="20" rx="4.5" fill={c.accent2} />

      <Rect x="70" y="38" width="160" height="152" rx="18" fill={c.surface} stroke={c.line} strokeWidth="1.5" />

      {/* month strip — squared off at the bottom by a second rect */}
      <Rect x="70" y="38" width="160" height="34" rx="18" fill={c.accentSoft} />
      <Rect x="70" y="56" width="160" height="16" fill={c.accentSoft} />
      <Path d={`M70 72 h160`} stroke={c.line} strokeWidth="1.5" />
      <Rect x="86" y="50" width="46" height="9" rx="4.5" fill={c.accent} opacity="0.65" />

      {/* the times on offer, and the one being asked for */}
      <G>
        <Rect x="86" y="88" width="40" height="21" {...slot} />
        <Rect x="130" y="88" width="40" height="21" {...slot} />
        <Rect x="174" y="88" width="40" height="21" {...slot} />

        <Rect x="86" y="119" width="40" height="21" {...slot} />
        <Rect x="130" y="119" width="40" height="21" rx="7" fill={c.accent} />
        <Rect x="174" y="119" width="40" height="21" {...slot} />

        <Rect x="86" y="150" width="40" height="21" {...slot} />
        <Rect x="130" y="150" width="40" height="21" {...slot} />
        <Rect x="174" y="150" width="40" height="21" {...slot} />
      </G>

      {/* the tap itself */}
      <Circle cx="150" cy="129.5" r="26" fill="none" stroke={c.accent} strokeWidth="2" opacity="0.35" />
      <Circle cx="150" cy="129.5" r="34" fill="none" stroke={c.accent} strokeWidth="1.5" opacity="0.16" />
    </Svg>
  );
}

/* ---------------- 2 · scanning at the chair ---------------- */

function ScanArt() {
  const c = useColors();
  const bracket = { stroke: c.accent, strokeWidth: 3, strokeLinecap: 'round' as const, fill: 'none' as const };

  /* A few modules, placed by hand rather than generated — this is a picture of
     a QR, and a real one would only encode something meaningless. */
  const modules = [
    [150, 74], [162, 74], [150, 86], [174, 86], [138, 98], [162, 98],
    [150, 110], [174, 110], [138, 122], [150, 122], [174, 122], [162, 134],
  ];

  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
      <Backdrop id="ob2" />

      <Rect x="99" y="20" width="102" height="180" rx="22" fill={c.surface} stroke={c.line} strokeWidth="2" />
      <Rect x="136" y="30" width="28" height="5" rx="2.5" fill={c.line} />

      <Rect x="115" y="58" width="70" height="92" rx="10" fill={c.bg} />

      {/* the three finder squares */}
      {[[122, 66], [166, 66], [122, 122]].map(([x, y], i) => (
        <G key={i}>
          <Rect x={x} y={y} width="18" height="18" rx="4" fill="none" stroke={c.text} strokeWidth="3" />
          <Rect x={x + 6} y={y + 6} width="6" height="6" rx="1.5" fill={c.text} />
        </G>
      ))}

      {modules.map(([x, y], i) => (
        <Rect key={i} x={x} y={y} width="8" height="8" rx="1.5" fill={c.text} opacity="0.85" />
      ))}

      {/* the viewfinder, and the line sweeping it */}
      <Path d="M104 62 v-12 a8 8 0 0 1 8-8 h12" {...bracket} />
      <Path d="M196 62 v-12 a8 8 0 0 0-8-8 h-12" {...bracket} />
      <Path d="M104 146 v12 a8 8 0 0 0 8 8 h12" {...bracket} />
      <Path d="M196 146 v12 a8 8 0 0 0-8 8 h-12" {...bracket} />
      <Path d="M112 104 h76" stroke={c.accent} strokeWidth="2.5" strokeLinecap="round" opacity="0.9" />

      <Rect x="123" y="164" width="54" height="8" rx="4" fill={c.surface2} />
      <Rect x="135" y="180" width="30" height="8" rx="4" fill={c.surface2} />
    </Svg>
  );
}

/* ---------------- 3 · the eighth cut ---------------- */

function LoyaltyArt() {
  const c = useColors();
  const stamped = [
    [82, 92], [126, 92], [170, 92], [214, 92],
    [82, 140], [126, 140], [170, 140],
  ];

  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
      <Backdrop id="ob3" />

      <Rect x="44" y="52" width="212" height="120" rx="20" fill={c.surface} stroke={c.line} strokeWidth="1.5" />

      {stamped.map(([cx, cy], i) => (
        <G key={i}>
          <Circle cx={cx} cy={cy} r="17" fill={c.accent} />
          <Path
            d={`M${cx - 7} ${cy} l5 5 9 -9.5`}
            stroke={c.onAccent}
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </G>
      ))}

      {/* the free one — still open, and drawn as the prize rather than a gap */}
      <Circle
        cx="214"
        cy="140"
        r="17"
        fill={c.accentSoft}
        stroke={c.accent}
        strokeWidth="2.4"
        strokeDasharray="5 4"
      />
      <G>
        <Circle cx="207" cy="135.5" r="2.9" fill="none" stroke={c.accentInk} strokeWidth="2" />
        <Circle cx="207" cy="145.5" r="2.9" fill="none" stroke={c.accentInk} strokeWidth="2" />
        <Path
          d="M209.6 137 L221 145 M209.6 144 L221 136"
          stroke={c.accentInk}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </G>
    </Svg>
  );
}

/* ---------------- 4 · the shelf ---------------- */

function ShopArt() {
  const c = useColors();

  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
      <Backdrop id="ob4" />

      {/* pomade */}
      <Rect x="70" y="74" width="16" height="14" rx="4" fill={c.accent2} />
      <Rect x="62" y="86" width="32" height="66" rx="9" fill={c.accent} />
      <Rect x="66" y="106" width="24" height="20" rx="4" fill={c.surface} opacity="0.9" />

      {/* clippers oil */}
      <Rect x="116" y="62" width="14" height="16" rx="4" fill={c.accent2} />
      <Rect x="107" y="76" width="32" height="76" rx="10" fill={c.surface} stroke={c.line} strokeWidth="1.5" />
      <Rect x="111" y="100" width="24" height="22" rx="4" fill={c.accentSoft} />

      {/* tonic */}
      <Rect x="160" y="70" width="16" height="14" rx="4" fill={c.accent2} />
      <Rect x="152" y="82" width="32" height="70" rx="9" fill={c.surface2} stroke={c.line} strokeWidth="1.5" />
      <Rect x="156" y="104" width="24" height="20" rx="4" fill={c.accent} opacity="0.55" />

      {/* the shelf they stand on */}
      <Rect x="50" y="152" width="200" height="7" rx="3.5" fill={c.surface3} />

      {/* and the bag they leave in */}
      <Path
        d="M204 112 a10 10 0 0 1 20 0"
        stroke={c.accentInk}
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="round"
      />
      <Path
        d="M197 112 h34 a4 4 0 0 1 4 4.4 l-4.2 33a6 6 0 0 1-6 5.4 h-21.6 a6 6 0 0 1-6-5.4 l-4.2-33 a4 4 0 0 1 4-4.4 z"
        fill={c.accentSoft}
        stroke={c.accent}
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export const ONBOARDING_ART = [AskArt, ScanArt, LoyaltyArt, ShopArt];
