import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';

import { env } from './config/env.js';
import { UPLOAD_DIR } from './lib/upload.js';
import { errorHandler, notFound } from './middleware/error.js';

import { authRouter } from './routes/auth.routes.js';
import { artistsRouter } from './routes/artists.routes.js';
import { servicesRouter } from './routes/services.routes.js';
import { productsRouter } from './routes/products.routes.js';
import { ordersRouter } from './routes/orders.routes.js';
import { appointmentsRouter } from './routes/appointments.routes.js';
import { loyaltyRouter } from './routes/loyalty.routes.js';
import { notificationsRouter } from './routes/notifications.routes.js';
import { stylesRouter } from './routes/styles.routes.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  /* crossOriginResourcePolicy off so the CMS on :5173 and the phone can both
     load uploaded images from this origin. */
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(
    cors({
      origin(origin, cb) {
        /* No Origin header = a native app or curl, which CORS does not govern. */
        if (!origin || env.corsOrigins.includes(origin)) return cb(null, true);
        return cb(new Error(`Origin ${origin} is not allowed`));
      },
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  if (env.nodeEnv !== 'test') app.use(morgan('dev'));

  app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', immutable: true }));

  app.get('/api/health', (_req, res) =>
    res.json({
      ok: true,
      env: env.nodeEnv,
      loyaltyGoal: env.loyaltyGoal,
      checkinWindowMs: env.checkinWindowMs,
      time: Date.now(),
    }),
  );

  /* Everything the client needs to render prices and rules without hardcoding. */
  app.get('/api/config', (_req, res) =>
    res.json({
      loyaltyGoal: env.loyaltyGoal,
      freeCutValue: env.freeCutValue,
      deliveryFee: env.deliveryFee,
      freeDeliveryOver: env.freeDeliveryOver,
      checkinWindowMs: env.checkinWindowMs,
      shop: {
        name: 'FadeRoom',
        area: 'Mar Mikhael, Beirut',
        phone: '+961 1 567 890',
        hours: 'Tue–Sun · 10:00–20:00',
      },
    }),
  );

  app.use('/api/auth', authRouter);
  app.use('/api/artists', artistsRouter);
  app.use('/api/services', servicesRouter);
  app.use('/api/products', productsRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/appointments', appointmentsRouter);
  app.use('/api/loyalty', loyaltyRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/styles', stylesRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
