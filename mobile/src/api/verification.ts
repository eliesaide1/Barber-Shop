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
export type Channel = 'whatsapp' | 'email';

export interface StartResult {
  required: boolean;
  channel: Channel;
  expiresInSeconds?: number;
}

export interface CheckResult {
  required: boolean;
  channel: Channel;
  verificationToken?: string;
  target?: string;
}

/* The server decides which field it wants; the app just sends the one that
   matches the channel it was told about. */
const payload = (channel: Channel, value: string) =>
  channel === 'email' ? { email: value } : { phone: value };

export const startVerification = (channel: Channel, value: string) =>
  api.post<StartResult>('/auth/verify/start', payload(channel, value));

export const checkVerification = (channel: Channel, value: string, code: string) =>
  api.post<CheckResult>('/auth/verify/check', { ...payload(channel, value), code });
