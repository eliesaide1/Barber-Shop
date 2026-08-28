import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';

import { env } from './config/env.js';
import { UPLOAD_DIR } from './lib/upload.js';
import { errorHandler, notFound, asyncHandler } from './middleware/error.js';
import { getSettings, fillTokens } from './models/ShopSettings.js';
import { toWhatsAppNumber } from './lib/whatsapp.js';

import { authRouter } from './routes/auth.routes.js';
import { artistsRouter } from './routes/artists.routes.js';
import { servicesRouter } from './routes/services.routes.js';
import { productsRouter } from './routes/products.routes.js';
import { ordersRouter } from './routes/orders.routes.js';
import { appointmentsRouter } from './routes/appointments.routes.js';
import { loyaltyRouter } from './routes/loyalty.routes.js';
import { notificationsRouter } from './routes/notifications.routes.js';
import { stylesRouter } from './routes/styles.routes.js';
import { settingsRouter } from './routes/settings.routes.js';
import { haircutsRouter } from './routes/haircuts.routes.js';
import { labelsRouter } from './routes/labels.routes.js';
import { verificationRouter, verificationRequired } from './routes/verification.routes.js';

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
        /* Deny by withholding the header, not by raising. An unknown origin is
           an ordinary event on a public API -- every crawler produces one -- and
           passing an Error here turns each into a 500 and a logged stack trace.
           With no Access-Control-Allow-Origin the browser blocks the response
           itself, which is the actual enforcement either way. */
        return cb(null, false);
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
      /* Health stays a liveness probe: no database read, so it still answers
         when Mongo is the thing that is down. The loyalty goal moved to shop
         settings and belongs in /api/config with the rest of the shop's rules. */
      checkinWindowMs: env.checkinWindowMs,
      time: Date.now(),
    }),
  );

  /* Everything the client needs to render prices and rules without hardcoding. */
  app.get(
    '/api/config',
    asyncHandler(async (_req, res) => {
      const settings = await getSettings();
      const shop = {
        name: 'VIA Barber House',
        area: 'Mar Mikhael, Beirut',
        phone: '+961 1 567 890',
        hours: 'Tue–Sun · 10:00–20:00',
      };

      res.json({
        loyaltyGoal: settings.loyalty.goal,
        freeCutValue: settings.loyalty.freeCutValue,
        deliveryFee: env.deliveryFee,
        freeDeliveryOver: env.freeDeliveryOver,
        checkinWindowMs: env.checkinWindowMs,
        maxOpenRequests: env.maxOpenRequests,
        shop,
        /* The "message us" button. Sent dialled and ready, with the greeting
           already filled in, so the app has no formatting rules of its own to
           get subtly wrong. Null number means the button does not appear. */
        contact: {
          whatsapp: settings.contact.enabled
            ? toWhatsAppNumber(settings.contact.whatsapp)
            : null,
          greeting: fillTokens(settings.contact.greeting, { shop: shop.name }),
          /* `{product}` is passed through as itself: only the app knows which
             product was tapped, so it fills that one in. `fillTokens` blanks a
             token it has no value for — which is right for a birthday with no
             reward and wrong here — hence handing it back its own placeholder. */
          priceEnquiry: fillTokens(settings.marketplace.priceEnquiry, {
            shop: shop.name,
            product: '{product}',
          }),
        },
        /* Whether sign-up will ask for a code. Public, because the app needs to
           know before it has an account — and it is not a secret: anybody can
           discover it by trying to register once.
           
           Asked of the same function `/auth/register` enforces with, rather
           than worked out again here. Two copies of this rule disagreed the
           moment a test number became a way through: the app was told no code
           was needed and registration then refused it for not having one. */
        verification: { required: await verificationRequired() },
      });
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
  app.use('/api/labels', labelsRouter);
  /* Under /auth because it is part of getting an account, and because the app
     reaches for it before it has any credentials at all. */
  app.use('/api/auth/verify', verificationRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/haircuts', haircutsRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
