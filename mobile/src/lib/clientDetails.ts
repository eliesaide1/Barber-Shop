/**
 * The client record's two awkward fields, in one place.
 *
 * Both the sign-up form and the details editor need the same masking, the same
 * validation and the same labels; duplicating them is how the two screens end up
 * disagreeing about what a valid birthday is.
 */

/** Weeks between visits, matching VISIT_FREQUENCIES on the server. */
export const VISIT_FREQUENCIES = [2, 3, 4, 6, 8, 12] as const;

export const frequencyLabel = (weeks?: number | null): string => {
  if (!weeks) return 'Not said';
  if (weeks === 4) return 'Monthly';
  if (weeks % 4 === 0) return `Every ${weeks / 4} months`;
  return `Every ${weeks} weeks`;
};

/**
 * Typed as `DD/MM/YYYY`, stored as `YYYY-MM-DD`.
 *
 * Day-first because that is how the shop's clients write a date, and the
 * separators go in as they type so nobody has to guess the format. What crosses
 * the wire is unambiguous either way.
 */
export function maskDate(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join('/');
}

/** `21/03/1994` → `1994-03-21`, or null when it is not a complete date. */
export function toIsoDate(typed: string): string | null {
  const m = typed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** `1994-03-21` → `21/03/1994`, for putting a stored value back in the field. */
export function fromIsoDate(iso?: string | null): string {
  const m = (iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/**
 * Why a typed birthday is not acceptable, or null when it is.
 *
 * Mirrors the server's rules so the answer arrives before the round trip — the
 * server still checks, because a client is never the authority on its own input.
 */
export function dateOfBirthError(typed: string): string | null {
  if (!typed.trim()) return 'Please enter your date of birth';

  const iso = toIsoDate(typed);
  if (!iso) return 'Use DD/MM/YYYY';

  /* Parsed as UTC and compared back: JS rolls 30 February into 2 March rather
     than rejecting it, so only the round trip catches an impossible day. */
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) {
    return 'That is not a real date';
  }
  if (date.getTime() > Date.now()) return 'A birthday cannot be in the future';
  if (date.getTime() < Date.now() - 120 * 365.25 * 86_400_000) return 'Please check the year';

  return null;
}

/** Whole years, in the shop's terms — nobody is 30.4. */
export function ageFrom(iso?: string | null): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  /* Not had this year's birthday yet if the month is later, or the same month
     and the day is later. */
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}
