/**
 * The QR encoder is the one piece of the app with real algorithmic risk — the
 * client renders reward claim codes and order pickup codes with it, and an
 * artist has to be able to scan them. These assert the structural invariants
 * of a QR symbol rather than just "it returned something".
 */
import { encode, toPath } from '../src/lib/qr';

const isFinder = (m: number[][], r0: number, c0: number) => {
  for (let r = 0; r < 7; r += 1) {
    for (let c = 0; c < 7; c += 1) {
      const expected =
        r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4) ? 1 : 0;
      if (m[r0 + r][c0 + c] !== expected) return false;
    }
  }
  return true;
};

describe('QR encoder', () => {
  test('encodes a reward claim token', () => {
    const m = encode('FR1|R|K4M2QX');
    expect(m).not.toBeNull();
    /* Versions 1-5 are 21, 25, 29, 33 and 37 modules square. */
    expect([21, 25, 29, 33, 37]).toContain(m!.length);
    expect(m![0].length).toBe(m!.length);
  });

  test('places all three finder patterns', () => {
    const m = encode('FR1|O|A1B2C3')!;
    const n = m.length;
    expect(isFinder(m, 0, 0)).toBe(true);
    expect(isFinder(m, 0, n - 7)).toBe(true);
    expect(isFinder(m, n - 7, 0)).toBe(true);
  });

  test('lays down both timing patterns', () => {
    const m = encode('FR1|R|ABCDEF')!;
    const n = m.length;
    for (let i = 8; i < n - 8; i += 1) {
      expect(m[6][i]).toBe(i % 2 ? 0 : 1);
      expect(m[i][6]).toBe(i % 2 ? 0 : 1);
    }
  });

  test('sets the always-dark module', () => {
    const m = encode('FR1|R|ABCDEF')!;
    expect(m[m.length - 8][8]).toBe(1);
  });

  test('grows the symbol as the payload grows', () => {
    const small = encode('FR1|R|ABCDEF')!.length;
    /* A full check-in token: prefix, a 24-char ObjectId, window and signature. */
    const token = `FR1|C|${'a'.repeat(24)}|29764012|BB8FKW`;
    const large = encode(token)!.length;
    expect(large).toBeGreaterThanOrEqual(small);
  });

  test('refuses a payload beyond level-L version 5', () => {
    expect(encode('x'.repeat(200))).toBeNull();
    expect(toPath('x'.repeat(200))).toBeNull();
  });

  test('toPath returns drawable geometry with a quiet zone', () => {
    const path = toPath('FR1|R|K4M2QX', 4)!;
    expect(path.d.length).toBeGreaterThan(0);
    expect(path.size).toBe(encode('FR1|R|K4M2QX')!.length + 8);
    expect(path.d.startsWith('M')).toBe(true);
  });

  test('is deterministic — the same payload always yields the same symbol', () => {
    expect(toPath('FR1|O|A1B2C3')!.d).toBe(toPath('FR1|O|A1B2C3')!.d);
  });
});
