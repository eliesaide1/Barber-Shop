/**
 * Restores `server/db/*.json` into MongoDB.
 *
 *   npm run db:restore            -- refuses if the target already has data
 *   npm run db:restore -- --force -- drops those collections first
 *
 * This is the counterpart to `db:dump`. It is not the same thing as
 * `npm run seed`: the seed builds a fresh shop from code, while this reproduces
 * a captured state exactly — the same ObjectIds, the same timestamps, the same
 * loyalty progress — which is what makes a bug someone else hit reproducible on
 * your machine.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { EJSON } from 'bson';
import { connectDb, disconnectDb } from '../config/db.js';
import { env, safeUri } from '../config/env.js';

/* Imported for their side effect: registering the schemas on mongoose, so the
   index rebuild at the end has something to work from. */
import '../models/User.js';
import '../models/Artist.js';
import '../models/Service.js';
import '../models/Product.js';
import '../models/Order.js';
import '../models/Appointment.js';
import '../models/Loyalty.js';
import '../models/CheckIn.js';
import '../models/Notification.js';
import '../models/Style.js';

const IN_DIR = path.resolve('db');
const force = process.argv.includes('--force');

async function restore() {
  let files;
  try {
    files = (await fs.readdir(IN_DIR)).filter((f) => f.endsWith('.json') && f !== '_manifest.json');
  } catch {
    console.error(`No dump found at ${IN_DIR}. Run "npm run db:dump" first.`);
    process.exit(1);
  }
  if (files.length === 0) {
    console.error(`No collection files in ${IN_DIR}.`);
    process.exit(1);
  }

  await connectDb();
  const db = mongoose.connection.db;

  /* Overwriting somebody's working database is not something to do by
     accident, so check before touching anything and make the user opt in. */
  if (!force) {
    const existing = await db.listCollections().toArray();
    for (const { name } of existing) {
      if (name.startsWith('system.')) continue;
      const count = await db.collection(name).countDocuments();
      if (count > 0) {
        console.error(
          `\n  ${safeUri()} already holds data (${name}: ${count} documents).\n` +
            '  Re-run with --force to drop those collections and restore over them:\n\n' +
            '      npm run db:restore -- --force\n',
        );
        await disconnectDb();
        process.exit(1);
      }
    }
  }

  let total = 0;
  for (const file of files.sort()) {
    const name = path.basename(file, '.json');
    const raw = await fs.readFile(path.join(IN_DIR, file), 'utf8');
    const docs = EJSON.parse(raw);

    await db.collection(name).deleteMany({});
    if (docs.length) {
      /* ordered:false so one bad document doesn't abort the rest. */
      await db.collection(name).insertMany(docs, { ordered: false });
    }

    total += docs.length;
    console.log(`  ${name.padEnd(16)} ${String(docs.length).padStart(4)} documents`);
  }

  /* The models declare unique indexes; a raw insert bypasses index creation,
     so build them now or the first duplicate email would slip through. */
  await Promise.all(Object.values(mongoose.models).map((m) => m.createIndexes()));

  console.log(`\n  Restored ${total} documents into ${safeUri()}`);
  console.log('  Indexes rebuilt from the Mongoose models.\n');

  await disconnectDb();
}

restore().catch(async (err) => {
  console.error(err);
  await disconnectDb();
  process.exit(1);
});
