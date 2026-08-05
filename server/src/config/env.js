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

  deliveryFee: num(process.env.DELIVERY_FEE, 4),
  freeDeliveryOver: num(process.env.FREE_DELIVERY_OVER, 50),

  corsOrigins: list(process.env.CORS_ORIGINS, ['http://localhost:5173', 'http://localhost:4173']),
  publicUrl: (process.env.PUBLIC_URL || 'http://localhost:4000').replace(/\/$/, ''),
};

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
