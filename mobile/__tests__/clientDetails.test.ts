import {
  ageFrom,
  dateOfBirthError,
  frequencyLabel,
  fromIsoDate,
  maskDate,
  toIsoDate,
} from '../src/lib/clientDetails';

describe('date of birth', () => {
  test('separators appear as you type', () => {
    expect(maskDate('2')).toBe('2');
    expect(maskDate('21')).toBe('21');
    expect(maskDate('213')).toBe('21/3');
    expect(maskDate('21031994')).toBe('21/03/1994');
  });

  test('typing over existing separators does not double them', () => {
    expect(maskDate('21/03/1994')).toBe('21/03/1994');
    expect(maskDate('21//03')).toBe('21/03');
  });

  test('anything past a full date is ignored', () => {
    expect(maskDate('2103199499')).toBe('21/03/1994');
  });

  test('converts day-first to the stored form and back', () => {
    expect(toIsoDate('21/03/1994')).toBe('1994-03-21');
    expect(fromIsoDate('1994-03-21')).toBe('21/03/1994');
    expect(toIsoDate('21/03/19')).toBeNull();
    expect(fromIsoDate('')).toBe('');
    expect(fromIsoDate(undefined)).toBe('');
  });

  test('a real date passes', () => {
    expect(dateOfBirthError('21/03/1994')).toBeNull();
    /* A leap day that exists. */
    expect(dateOfBirthError('29/02/2024')).toBeNull();
  });

  test('a well-formed impossible date is caught', () => {
    /* The trap: JS rolls these into the next month rather than refusing them,
       so a format check alone would let them through. */
    expect(dateOfBirthError('30/02/2025')).toMatch(/not a real date/i);
    expect(dateOfBirthError('31/04/2001')).toMatch(/not a real date/i);
    expect(dateOfBirthError('29/02/2023')).toMatch(/not a real date/i);
  });

  test('empty, half-typed, future and absurd are all refused', () => {
    expect(dateOfBirthError('')).toMatch(/enter your date of birth/i);
    expect(dateOfBirthError('21/03')).toMatch(/DD\/MM\/YYYY/);

    const tomorrow = new Date(Date.now() + 86_400_000);
    const dd = String(tomorrow.getDate()).padStart(2, '0');
    const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
    expect(dateOfBirthError(`${dd}/${mm}/${tomorrow.getFullYear()}`)).toMatch(/future/i);

    expect(dateOfBirthError('01/01/1799')).toMatch(/check the year/i);
  });
});

describe('age', () => {
  test('counts whole years, and only after the birthday has come round', () => {
    const now = new Date();
    const y = now.getFullYear();
    const pad = (n: number) => String(n).padStart(2, '0');

    /* Born today, thirty years ago — thirty, not twenty-nine. */
    const todayIso = `${y - 30}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    expect(ageFrom(todayIso)).toBe(30);

    /* Born tomorrow, thirty years ago — still twenty-nine. */
    const tomorrow = new Date(now.getTime() + 86_400_000);
    const tomorrowIso = `${y - 30}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;
    /* Skips the turn of the year, where "tomorrow" is a different year and the
       comparison stops being about the birthday alone. */
    if (tomorrow.getFullYear() === y) expect(ageFrom(tomorrowIso)).toBe(29);
  });

  test('nothing sensible in, nothing out', () => {
    expect(ageFrom('')).toBeNull();
    expect(ageFrom(undefined)).toBeNull();
    expect(ageFrom('21/03/1994')).toBeNull();
  });
});

describe('visit frequency', () => {
  test('reads the way somebody would say it', () => {
    expect(frequencyLabel(2)).toBe('Every 2 weeks');
    expect(frequencyLabel(3)).toBe('Every 3 weeks');
    expect(frequencyLabel(4)).toBe('Monthly');
    expect(frequencyLabel(8)).toBe('Every 2 months');
    expect(frequencyLabel(12)).toBe('Every 3 months');
  });

  test('unset says so rather than showing a zero', () => {
    expect(frequencyLabel(null)).toBe('Not said');
    expect(frequencyLabel(undefined)).toBe('Not said');
  });
});
