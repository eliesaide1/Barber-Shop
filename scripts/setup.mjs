#!/usr/bin/env node
/**
 * One command from a fresh clone to a running shop:
 *
 *     npm run setup
 *
 * Installs the three packages, creates server/.env, and restores the database
 * that ships in server/db/.
 *
 * Written in Node rather than as a shell one-liner because npm runs scripts
 * through cmd.exe on Windows, where `cp` and `&&`-chained shell built-ins do
 * not exist. Everything here is idempotent — re-running never overwrites an
 * .env you have edited, and never silently replaces a database you are using.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const step = (n, msg) => console.log(`\n[${n}/4] ${msg}`);
const ok = (msg) => console.log(`      ✓ ${msg}`);
const warn = (msg) => console.log(`      ! ${msg}`);

function run(command, args, cwd = ROOT) {
  /* shell:true so Windows resolves npm.cmd rather than looking for a binary
     literally called "npm". */
  const res = spawnSync(command, args, { cwd, stdio: 'inherit', shell: true });
  return res.status === 0;
}

/** Is anything listening on the Mongo port? Cheaper and clearer than waiting
 *  for a driver timeout to explain itself. */
function mongoReachable(host = '127.0.0.1', port = 27017, timeout = 1500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}

console.log('\nFadeRoom — setup');

/* ---- 1. environment file ---- */
step(1, 'server/.env');
const envPath = path.join(ROOT, 'server', '.env');
if (fs.existsSync(envPath)) {
  ok('already there, left alone');
} else {
  fs.copyFileSync(path.join(ROOT, 'server', '.env.example'), envPath);
  ok('created from .env.example');
  warn('the secrets in it are development placeholders — change them before deploying');
}

/* ---- 2. dependencies ---- */
step(2, 'Installing dependencies (this is the slow part)');
for (const pkg of ['server', 'cms', 'mobile']) {
  console.log(`      ── ${pkg} ──`);
  /* Not --silent. npm's output is the only clue when an install fails, and a
     package manager failing silently is the worst thing the first command a
     newcomer runs could do. */
  const installed = run('npm', ['install', '--no-audit', '--no-fund'], path.join(ROOT, pkg));
  if (!installed) {
    console.error(
      `\n      Install failed in ${pkg}/ — the reason is in the npm output above.\n` +
        '      Installs here fail intermittently on flaky connections and when a\n' +
        '      virus scanner locks files mid-extract. Re-running "npm run setup" is\n' +
        '      safe and picks up where it left off.\n',
    );
    process.exit(1);
  }
}
ok('all three packages installed');

/* ---- 3. MongoDB ---- */
step(3, 'MongoDB');
const uri = (fs.readFileSync(envPath, 'utf8').match(/^MONGO_URI=(.+)$/m)?.[1] ?? '').trim();
const host = uri.match(/\/\/([^:/]+)/)?.[1] ?? '127.0.0.1';
const port = Number(uri.match(/\/\/[^:/]+:(\d+)/)?.[1] ?? 27017);

if (await mongoReachable(host, port)) {
  ok(`reachable at ${host}:${port}`);
} else {
  warn(`nothing is listening on ${host}:${port}`);
  console.log(
    '\n      Start MongoDB, then run:  npm run db:restore\n' +
      '      Everything else is installed and ready.\n',
  );
  process.exit(0);
}

/* ---- 4. the database ---- */
step(4, 'Restoring server/db/ into MongoDB');
const restored = run('npm', ['run', 'db:restore'], path.join(ROOT, 'server'));

if (restored) {
  console.log(`
Ready. In separate terminals:

    npm run server     API on :4000
    npm run cms        back office on :5173
    npm run android    build and install the app

Sign in with admin@faderoom.app, karim@faderoom.app or elie@faderoom.app —
password1 for all of them.
`);
} else {
  /* db:restore refuses a database that already holds data, and says how to
     override. Repeat that here so the reason isn't buried in its output. */
  console.log(`
The database already holds data, so it was left untouched.

To replace it with the copy in server/db/:

    npm run db:restore -- --force

Or build a fresh shop from code instead:

    npm run seed
`);
}
