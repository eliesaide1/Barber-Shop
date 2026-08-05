/**
 * Minimal QR encoder — byte mode, ECC level L, versions 1–5.
 *
 * Ported from the FadeRoom prototype. Versions 1–5 at level L are all
 * single-block, which removes the interleaving step and keeps this short.
 * That caps a payload at 106 bytes, which comfortably covers a check-in
 * token (~46 chars) and any claim or pickup code.
 */
const EXP: number[] = new Array(512);
const LOG: number[] = new Array(256);
for (let i = 0, x = 1; i < 255; i += 1) {
  EXP[i] = x;
  LOG[x] = i;
  x <<= 1;
  if (x & 0x100) x ^= 0x11d;
}
for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];

const mul = (a: number, b: number): number => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
const DATA_CW = [19, 34, 55, 80, 108];
const ECC_CW = [7, 10, 15, 20, 26];

function generator(n: number): number[] {
  let g: number[] = [1];
  for (let i = 0; i < n; i += 1) {
    const next = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j += 1) {
      next[j] ^= g[j];
      next[j + 1] ^= mul(g[j], EXP[i]);
    }
    g = next;
  }
  return g;
}

function ecc(data: number[], n: number): number[] {
  const g = generator(n);
  const r = new Array(n).fill(0);
  for (const d of data) {
    const factor = d ^ r[0];
    r.shift();
    r.push(0);
    for (let i = 0; i < n; i += 1) r[i] ^= mul(g[i + 1], factor);
  }
  return r;
}

function utf8(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0) as number;
    if (c < 128) out.push(c);
    else if (c < 2048) out.push(192 | (c >> 6), 128 | (c & 63));
    else if (c < 65536) out.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63));
    else out.push(240 | (c >> 18), 128 | ((c >> 12) & 63), 128 | ((c >> 6) & 63), 128 | (c & 63));
  }
  return out;
}

/* 15-bit BCH format information, ECC level L. */
const G15 = 0x537;
const G15_MASK = 0x5412;
function bch(d: number): number {
  let x = d << 10;
  for (let i = 14; i >= 10; i -= 1) if ((x >> i) & 1) x ^= G15 << (i - 10);
  return ((d << 10) | x) ^ G15_MASK;
}

const MASKS: ((r: number, c: number) => boolean)[] = [
  (r: number, c: number) => (r + c) % 2 === 0,
  (r: number) => r % 2 === 0,
  (_r: number, c: number) => c % 3 === 0,
  (r: number, c: number) => (r + c) % 3 === 0,
  (r: number, c: number) => ((Math.floor(r / 2) + Math.floor(c / 3)) % 2) === 0,
  (r: number, c: number) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r: number, c: number) => ((((r * c) % 2) + ((r * c) % 3)) % 2) === 0,
  (r: number, c: number) => ((((r + c) % 2) + ((r * c) % 3)) % 2) === 0,
];

/* The four standard penalty rules — every mask is rendered and the calmest wins. */
function penalty(m: number[][]): number {
  const n = m.length;
  let p = 0;

  for (let k = 0; k < 2; k += 1) {
    for (let i = 0; i < n; i += 1) {
      let run = 0;
      let prev = -1;
      for (let j = 0; j < n; j += 1) {
        const v = k ? m[j][i] : m[i][j];
        run = v === prev ? run + 1 : 1;
        prev = v;
        if (run === 5) p += 3;
        else if (run > 5) p += 1;
      }
    }
  }

  for (let r = 0; r < n - 1; r += 1) {
    for (let c = 0; c < n - 1; c += 1) {
      const v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) p += 3;
    }
  }

  const pattern = [1, 0, 1, 1, 1, 0, 1];
  for (let k = 0; k < 2; k += 1) {
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j + 7 <= n; j += 1) {
        let hit = true;
        for (let t = 0; t < 7; t += 1) {
          if ((k ? m[j + t][i] : m[i][j + t]) !== pattern[t]) { hit = false; break; }
        }
        if (!hit) continue;
        let clearBefore = true;
        let clearAfter = true;
        for (let t = 1; t <= 4; t += 1) {
          const q = j - t;
          if (q < 0) break;
          if (k ? m[q][i] : m[i][q]) { clearBefore = false; break; }
        }
        for (let t = 0; t < 4; t += 1) {
          const q = j + 7 + t;
          if (q >= n) break;
          if (k ? m[q][i] : m[i][q]) { clearAfter = false; break; }
        }
        if (clearBefore || clearAfter) p += 40;
      }
    }
  }

  let dark = 0;
  for (let r = 0; r < n; r += 1) for (let c = 0; c < n; c += 1) dark += m[r][c];
  p += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
  return p;
}

export function encode(text: string): number[][] | null {
  const bytes = utf8(String(text));
  let v = -1;
  for (let i = 0; i < 5; i += 1) {
    if (bytes.length + 2 <= DATA_CW[i]) { v = i; break; }
  }
  if (v < 0) return null; /* over 106 bytes — out of range for this encoder */

  const dcw = DATA_CW[v];
  const ecw = ECC_CW[v];
  const n = 21 + 4 * v;

  const bits: number[] = [];
  const put = (x: number, l: number) => { for (let i = l - 1; i >= 0; i -= 1) bits.push((x >> i) & 1); };
  put(4, 4);
  put(bytes.length, 8);
  bytes.forEach((b) => put(b, 8));
  for (let i = 0; i < 4 && bits.length < dcw * 8; i += 1) bits.push(0);
  while (bits.length % 8) bits.push(0);

  const cw: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j += 1) b = (b << 1) | bits[i + j];
    cw.push(b);
  }
  for (let i = 0; cw.length < dcw; i += 1) cw.push(i % 2 ? 0x11 : 0xec);
  const all = cw.concat(ecc(cw, ecw));

  const m = Array.from({ length: n }, () => new Array(n).fill(0));
  const fixed = Array.from({ length: n }, () => new Array(n).fill(false));
  const set = (r: number, c: number, val: number) => {
    if (r < 0 || c < 0 || r >= n || c >= n) return;
    m[r][c] = val;
    fixed[r][c] = true;
  };

  const finder = (r0: number, c0: number) => {
    for (let r = -1; r <= 7; r += 1) {
      for (let c = -1; c <= 7; c += 1) {
        const on = r >= 0 && r <= 6 && c >= 0 && c <= 6
          && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
        set(r0 + r, c0 + c, on ? 1 : 0);
      }
    }
  };
  finder(0, 0);
  finder(0, n - 7);
  finder(n - 7, 0);

  for (let i = 8; i < n - 8; i += 1) {
    set(6, i, i % 2 ? 0 : 1);
    set(i, 6, i % 2 ? 0 : 1);
  }
  if (v > 0) {
    const a = n - 7;
    for (let r = -2; r <= 2; r += 1) {
      for (let c = -2; c <= 2; c += 1) {
        set(a + r, a + c, Math.max(Math.abs(r), Math.abs(c)) === 1 ? 0 : 1);
      }
    }
  }
  for (let i = 0; i < 9; i += 1) {
    if (!fixed[8][i]) set(8, i, 0);
    if (!fixed[i][8]) set(i, 8, 0);
  }
  for (let i = 0; i < 8; i += 1) {
    set(8, n - 1 - i, 0);
    set(n - 1 - i, 8, 0);
  }
  set(n - 8, 8, 1);

  /* Zigzag placement, right to left, skipping the vertical timing column. */
  const total = all.length * 8;
  let bi = 0;
  let up = true;
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1;
    for (let i = 0; i < n; i += 1) {
      const row = up ? n - 1 - i : i;
      for (let k = 0; k < 2; k += 1) {
        const c = col - k;
        if (fixed[row][c]) continue;
        m[row][c] = bi < total ? (all[bi >> 3] >> (7 - (bi & 7))) & 1 : 0;
        bi += 1;
      }
    }
    up = !up;
  }

  let best: number[][] | null = null;
  let bestPenalty = Infinity;
  for (let k = 0; k < 8; k += 1) {
    const t = m.map((row) => row.slice());
    for (let r = 0; r < n; r += 1) {
      for (let c = 0; c < n; c += 1) if (!fixed[r][c] && MASKS[k](r, c)) t[r][c] ^= 1;
    }
    const f = bch((1 << 3) | k);
    for (let i = 0; i < 15; i += 1) {
      const b = (f >> i) & 1;
      if (i < 6) t[i][8] = b;
      else if (i < 8) t[i + 1][8] = b;
      else t[n - 15 + i][8] = b;

      if (i < 8) t[8][n - 1 - i] = b;
      else if (i === 8) t[8][7] = b;
      else t[8][14 - i] = b;
    }
    t[n - 8][8] = 1;

    const p = penalty(t);
    if (p < bestPenalty) { bestPenalty = p; best = t; }
  }
  return best;
}

/** SVG path data plus the module count, for rendering however you like. */
export function toPath(text: string, quiet = 4): { d: string; size: number } | null {
  const m = encode(text);
  if (!m) return null;
  const n = m.length;
  let d = '';
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      if (m[r][c]) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }
  }
  return { d, size: n + quiet * 2 };
}
