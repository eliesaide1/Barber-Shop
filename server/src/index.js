import http from 'node:http';
import { createApp } from './app.js';
import { createSocketServer } from './socket/index.js';
import { connectDb } from './config/db.js';
import { transactionsSupported } from './lib/tx.js';
import { env } from './config/env.js';

async function main() {
  await connectDb();
  await transactionsSupported(); /* logs a warning on a standalone mongod */

  const app = createApp();
  const server = http.createServer(app);
  createSocketServer(server);

  server.listen(env.port, () => {
    console.log(`\n  FadeRoom API  http://localhost:${env.port}`);
    console.log(`  Socket.IO     ws://localhost:${env.port}`);
    console.log(`  Mongo         ${env.mongoUri}`);
    console.log(`  Images        ${env.publicUrl}/uploads\n`);
  });

  const shutdown = async (signal) => {
    console.log(`\n${signal} — shutting down`);
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
