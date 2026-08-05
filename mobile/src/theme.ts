/**
 * The prototype's palette, ported. Two full themes; `--accent-ink` exists
 * because the gold that works as a fill is too light to read as text on a
 * light background.
 */
export type ThemeName = 'light' | 'dark';

export interface Theme {
  name: ThemeName;
  accent: string;
  accent2: string;
  accentInk: string;
  accentSoft: string;
  onAccent: string;
  bg: string;
  surface: string;
  surface2: string;
  surface3: string;
  text: string;
  muted: string;
  line: string;
  danger: string;
  ok: string;
  warn: string;
  heroFrom: string;
  heroTo: string;
  heroLine: string;
  overlay: string;
}

export const light: Theme = {
  name: 'light',
  accent: '#d19a2e',
  accent2: '#a97c22',
  accentInk: '#8a5a10',
  accentSoft: 'rgba(209,154,46,0.16)',
  onAccent: '#1b1713',
  bg: '#f7f3ed',
  surface: '#ffffff',
  surface2: '#f2ede5',
  surface3: '#e7e0d5',
  text: '#1b1713',
  muted: '#6b6055',
  line: '#e5ded3',
  danger: '#c0392b',
  ok: '#2f6f43',
  warn: '#8a5a00',
  heroFrom: '#fdf3e0',
  heroTo: '#fbeee7',
  heroLine: '#ecd9b0',
  overlay: 'rgba(0,0,0,0.5)',
};

export const dark: Theme = {
  name: 'dark',
  accent: '#d9a441',
  accent2: '#e9cf9a',
  accentInk: '#d9a441',
  accentSoft: 'rgba(217,164,65,0.12)',
  onAccent: '#0d0c0b',
  bg: '#0d0c0b',
  surface: '#171512',
  surface2: '#201d19',
  surface3: '#2a2621',
  text: '#f5f1ea',
  muted: '#9a8f80',
  line: '#2b2721',
  danger: '#e05c5c',
  ok: '#6cc48b',
  warn: '#ffcf4a',
  heroFrom: '#2b2113',
  heroTo: '#231617',
  heroLine: '#463a22',
  overlay: 'rgba(0,0,0,0.65)',
};

export const themes = { light, dark };

export const radius = { sm: 10, md: 14, lg: 18, xl: 24, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
