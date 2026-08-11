import http from 'node:http';
import { createApp } from './app.js';
import { createSocketServer } from './socket/index.js';
import { connectDb } from './config/db.js';
import { transactionsSupported } from './lib/tx.js';
import { initPush, pushEnabled } from './lib/push.js';
import { startReminders, stopReminders } from './lib/reminders.js';
import { startBirthdays, stopBirthdays } from './lib/birthdays.js';
import { whatsappConfigured } from './lib/whatsapp.js';
import { env, safeUri } from './config/env.js';

async function main() {
  await connectDb();
  await transactionsSupported(); /* logs a warning on a standalone mongod */
  await initPush(); /* no-ops, loudly, when Firebase isn't configured */

  const app = createApp();
  const server = http.createServer(app);
  createSocketServer(server);

  /* Started here rather than in createApp(), so the test suite builds an app
     without a background timer firing notifications underneath it. */
  startReminders();
  startBirthdays();

  server.listen(env.port, () => {
    console.log(`\n  FadeRoom API  http://localhost:${env.port}`);
    console.log(`  Socket.IO     ws://localhost:${env.port}`);
    console.log(`  Mongo         ${safeUri()}`);
    console.log(`  Images        ${env.publicUrl}/uploads`);
    console.log(`  Push          ${pushEnabled() ? 'Firebase' : 'socket only'}`);
    console.log(`  Reminders     ${env.reminderLeads.join(', ')} min before`);
    console.log(`  WhatsApp      ${whatsappConfigured() ? 'connected' : 'not connected'}\n`);
  });

  const shutdown = async (signal) => {
    console.log(`\n${signal} — shutting down`);
    stopReminders();
    stopBirthdays();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 8000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
