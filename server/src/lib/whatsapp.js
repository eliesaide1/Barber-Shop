import { env } from '../config/env.js';

/**
 * WhatsApp, through Meta's Cloud API.
 *
 * ── What WhatsApp will and will not carry ────────────────────────────────────
 *
 * A business may reply freely for 24 hours after a customer messages it. Outside
 * that window — which a birthday greeting is, by definition, since nobody
 * messages a barber to announce their own birthday — every message must be a
 * **template approved by Meta in advance**. The wording is fixed at approval
 * time; only the numbered placeholders vary.
 *
 * So the shop's settings do not hold a message. They hold the name of an
 * approved template and the values to drop into it. That is not a shortcut: it
 * is the only thing the platform permits, and pretending otherwise would build
 * a CMS field that silently never sends.
 *
 * ── Consent ──────────────────────────────────────────────────────────────────
 *
 * Meta requires opt-in, and enforces it with the blunt instrument of quality
 * ratings: enough people blocking or reporting the number and the shop's
 * ability to send anything at all is throttled or withdrawn. The opt-in here is
 * a real per-client flag, not a checkbox in a policy document.
 */

const GRAPH = 'https://graph.facebook.com/v21.0';

export const whatsappConfigured = () =>
  Boolean(env.whatsappToken && env.whatsappPhoneId);

/**
 * A stored phone number as WhatsApp wants it: digits only, country code first.
 *
 * Numbers are typed by people — `+961 70 123 456`, `03 887 445`, `00961…` — and
 * the API silently does nothing useful with anything but E.164. A local number
 * is assumed to be in the shop's own country, which is the only assumption that
 * can be made and is why it is configurable.
 *
 * @returns {string|null} null when there is nothing plausible to send to.
 */
export function toWhatsAppNumber(raw, dialCode = env.shopDialCode) {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return null;

  /* International prefix written the old way. */
  if (digits.startsWith('00')) digits = digits.slice(2);
  /* A national trunk zero, which never appears in an international number. */
  else if (digits.startsWith('0')) digits = dialCode + digits.slice(1);

  if (!digits.startsWith(dialCode) && digits.length <= 9) digits = dialCode + digits;

  /* E.164 allows 15 digits; anything under 8 is not a mobile number. */
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

/**
 * Sends one approved template message.
 *
 * Never throws. A greeting that does not go out is a missed nicety, not a
 * failure worth taking a sweep down over — and the in-app notification has
 * already been delivered by the time this runs.
 *
 * @returns {{ok: boolean, skipped?: string, error?: string, id?: string}}
 */
export async function sendTemplate(to, { name, language, variables = [] }) {
  if (!whatsappConfigured()) return { ok: false, skipped: 'not configured' };
  if (!name) return { ok: false, skipped: 'no template chosen' };

  const number = toWhatsAppNumber(to);
  if (!number) return { ok: false, skipped: 'no usable phone number' };

  const body = {
    messaging_product: 'whatsapp',
    to: number,
    type: 'template',
    template: {
      name,
      language: { code: language || 'en' },
      /* Only include the parameter block when there is something to fill:
         sending an empty component against a template with no placeholders is
         rejected outright. */
      ...(variables.length
        ? {
            components: [
              {
                type: 'body',
                parameters: variables.map((text) => ({ type: 'text', text: String(text) })),
              },
            ],
          }
        : {}),
    },
  };

  try {
    const res = await fetch(`${GRAPH}/${env.whatsappPhoneId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.whatsappToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      /* Meta's own message is far more use than a status code — "template name
         does not exist", "recipient not opted in", "template paused for quality"
         are all things somebody can act on. */
      const detail = data?.error?.message ?? `HTTP ${res.status}`;
      return { ok: false, error: detail };
    }

    return { ok: true, id: data?.messages?.[0]?.id };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
