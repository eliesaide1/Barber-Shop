import { api } from './client';

/**
 * Proving a mobile number before an account exists on it.
 *
 * Two calls: ask for a code, then hand it back. What comes out is a short-lived
 * proof the sign-up form carries into `/auth/register` — the app never decides
 * whether verification happened, it only relays what the server issued.
 *
 * Both calls answer `{ required: false }` on a shop that has verification
 * switched off, so the screen can move straight on rather than waiting for a
 * message that is never coming.
 */
export interface StartResult {
  required: boolean;
  expiresInSeconds?: number;
}

export interface CheckResult {
  required: boolean;
  verificationToken?: string;
  phone?: string;
}

export const startVerification = (phone: string) =>
  api.post<StartResult>('/auth/verify/start', { phone });

export const checkVerification = (phone: string, code: string) =>
  api.post<CheckResult>('/auth/verify/check', { phone, code });
