/**
 * Exports every collection to `server/db/<collection>.json`.
 *
 *   npm run db:dump
 *
 * Why JSON and not `mongodump`
 * ────────────────────────────
 * mongodump writes BSON. That is the right format for a backup and the wrong
 * one for a repository: it is binary, so a reviewer cannot see what changed and
 * any edit rewrites the whole file. These are Extended JSON instead — plain
 * text, so `git diff` shows exactly which document moved — and EJSON round-trips
 * ObjectIds and Dates, which a naive `JSON.stringify` silently flattens into
 * strings.
 *
 * Documents are sorted by _id and pretty-printed, so dumping unchanged data
 * produces no diff at all.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { EJSON } from 'bson';
import { connectDb, disconnectDb } from '../config/db.js';
import { env, safeUri } from '../config/env.js';

const OUT_DIR = path.resolve('db');

async function dump() {
  await connectDb();
  const db = mongoose.connection.db;

  await fs.mkdir(OUT_DIR, { recursive: true });

  const collections = (await db.listCollections().toArray())
    .map((c) => c.name)
    .filter((name) => !name.startsWith('system.'))
    .sort();

  /* Deliberately no timestamp. Anything that changes on every run guarantees a
     diff even when the data is identical, which is exactly the churn this dump
     format exists to avoid — and git already records when the commit happened. */
  const manifest = { database: db.databaseName, collections: {} };
  let total = 0;
  let imageRefs = 0;

  for (const name of collections) {
    /* Sorting by _id keeps the file order stable between dumps, so a rerun
       with no data changes is a genuinely empty diff. */
    const docs = await db.collection(name).find({}).sort({ _id: 1 }).toArray();

    /* Count image references so the summary can warn about uploads/, which is
       gitignored — a restore elsewhere would otherwise show broken images. */
    for (const doc of docs) {
      if (Array.isArray(doc.images)) imageRefs += doc.images.length;
      if (typeof doc.image === 'string' && doc.image) imageRefs += 1;
    }

    const file = path.join(OUT_DIR, `${name}.json`);
    await fs.writeFile(file, `${EJSON.stringify(docs, null, 2)}\n`, 'utf8');

    manifest.collections[name] = docs.length;
    total += docs.length;
    console.log(`  ${name.padEnd(16)} ${String(docs.length).padStart(4)} documents`);
  }

  /* Written last so its counts always describe the files beside it. */
  await fs.writeFile(
    path.join(OUT_DIR, '_manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  console.log(`\n  ${collections.length} collections · ${total} documents → server/db/`);
  if (imageRefs > 0) {
    console.log(
      `\n  Note: ${imageRefs} document(s) reference an uploaded image. server/uploads/\n` +
        '  is gitignored, so a restore on another machine will show those as missing\n' +
        '  unless you track those files too.',
    );
  }
  console.log(
    `\n  Source: ${safeUri()}\n` +
      '  These documents include bcrypt password hashes and email addresses.\n' +
      '  Fine for the seeded demo data — do not dump a database holding real\n' +
      '  client records into a repository.\n',
  );

  await disconnectDb();
}

dump().catch(async (err) => {
  console.error(err);
  await disconnectDb();
  process.exit(1);
});
