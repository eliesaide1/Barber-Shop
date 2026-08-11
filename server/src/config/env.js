import 'dotenv/config';

const num = (v, fallback) => (v === undefined || v === '' ? fallback : Number(v));
const list = (v, fallback) =>
  (v === undefined || v === '' ? fallback : v.split(',').map((s) => s.trim()).filter(Boolean));

export const env = {
  port: num(process.env.PORT, 4000),
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/faderoom',
  nodeEnv: process.env.NODE_ENV || 'development',

  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me-access',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-only-change-me-refresh',
  accessTtl: process.env.ACCESS_TTL || '30m',
  refreshTtl: process.env.REFRESH_TTL || '30d',

  shopSecret: process.env.SHOP_SECRET || 'dev-only-change-me-shop',

  loyaltyGoal: num(process.env.LOYALTY_GOAL, 5),
  checkinWindowMs: num(process.env.CHECKIN_WINDOW_MS, 60_000),
  checkinCooldownMs: num(process.env.CHECKIN_COOLDOWN_MS, 4 * 60 * 60 * 1000),
  freeCutValue: num(process.env.FREE_CUT_VALUE, 25),

  /* How many booking requests one client may have waiting on an answer.
     A request holds no slot, so the old "first to click wins the week" problem
     is gone — but an unbounded queue just moves it into the artist's inbox. */
  maxOpenRequests: num(process.env.MAX_OPEN_REQUESTS, 3),

  /* WhatsApp, through Meta's Cloud API. Credentials live here rather than in
     the settings document: a token that can message every client should not be
     editable from a browser session, nor sit in a database that gets dumped
     into a repository. Absent means the greeting is in-app only. */
  whatsappToken: process.env.WHATSAPP_TOKEN || '',
  whatsappPhoneId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  /* Country code for a number typed without one. Lebanon by default, because
     that is where the chairs are. */
  shopDialCode: (process.env.SHOP_DIAL_CODE || '961').replace(/\D/g, ''),

  /* The shop has one clock, and it is not the server's. A deployment runs in
     UTC while the chairs are in Beirut, so any time the API writes into a
     sentence — "your cut is at 17:45" — has to be formatted here, not left to
     whatever the host happens to be set to. Times sent as ISO timestamps are
     unaffected: the phone and the browser render those in the reader's own
     zone, which is what they should do. */
  shopTimezone: process.env.SHOP_TIMEZONE || 'Asia/Beirut',

  /* How far ahead of a booking to remind the client, in minutes. A day ahead
     to let them move it, and two hours ahead to get them out of the door. */
  reminderLeads: list(process.env.REMINDER_LEAD_MINUTES, ['1440', '120'])
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => b - a),
  reminderSweepMs: num(process.env.REMINDER_SWEEP_MS, 5 * 60_000),
  /* Hourly: the sweep only has to notice that the shop's chosen hour has come
     round, and the once-a-year mark makes a late or repeated run harmless. */
  birthdaySweepMs: num(process.env.BIRTHDAY_SWEEP_MS, 60 * 60_000),

  deliveryFee: num(process.env.DELIVERY_FEE, 4),
  freeDeliveryOver: num(process.env.FREE_DELIVERY_OVER, 50),

  /* Every OAuth client id we ship, per provider — web, Android, iOS. Used as
     the accepted audience when verifying a sign-in token: without that check a
     token minted for somebody else's app would be accepted here. Empty means
     that provider is simply not offered.

     The web client id is folded in automatically, because it is *always* the
     audience Google puts in an id token — even for a sign-in on Android — and
     setting one without the other is the mistake that makes a sign-in work on
     the phone and fail at the server. */
  googleWebClientId: process.env.GOOGLE_WEB_CLIENT_ID || '',
  googleClientIds: [
    ...new Set(
      [...list(process.env.GOOGLE_CLIENT_IDS, []), process.env.GOOGLE_WEB_CLIENT_ID].filter(Boolean),
    ),
  ],
  appleClientIds: list(process.env.APPLE_CLIENT_IDS, []),

  corsOrigins: list(process.env.CORS_ORIGINS, ['http://localhost:5173', 'http://localhost:4173']),
  publicUrl: (process.env.PUBLIC_URL || 'http://localhost:4000').replace(/\/$/, ''),
};

/**
 * A connection string with the credentials stripped, for printing.
 *
 * `mongodb+srv://user:pa55w0rd@host/db` -> `mongodb+srv://user:***@host/db`
 *
 * Anything that logs a URI ends up in shell history, CI output and screen
 * shares, so the password must never be the thing that gets echoed back.
 */
export const safeUri = (uri = env.mongoUri) =>
  String(uri).replace(/(\/\/[^:/?#]+:)[^@]*@/, '$1***@');

/* Refuse to boot with development placeholders once NODE_ENV says production —
   these secrets sign auth tokens and the loyalty QR. */
if (env.nodeEnv === 'production') {
  const weak = Object.entries({
    JWT_SECRET: env.jwtSecret,
    JWT_REFRESH_SECRET: env.jwtRefreshSecret,
    SHOP_SECRET: env.shopSecret,
  }).filter(([, v]) => v.startsWith('dev-only-change-me'));
  if (weak.length) {
    throw new Error(
      `Refusing to start in production with default secrets: ${weak.map(([k]) => k).join(', ')}`,
    );
  }
}
