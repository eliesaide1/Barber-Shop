#!/usr/bin/env node
/**
 * Collects every `t('key', 'default')` in the app into a catalogue.
 *
 * The list of labels is a fact about the source, so it is read from the source
 * rather than maintained beside it. Anything else drifts: a label added in a
 * screen and forgotten in the list is one the shop cannot edit, and a label
 * deleted from a screen but left in the list is a row in the back office that
 * changes nothing and can never be explained.
 *
 *   node scripts/extract-labels.mjs            → writes labels.json, prints a summary
 *   node scripts/extract-labels.mjs --check    → exits non-zero on duplicates or bad keys
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');
const OUT = join(ROOT, 'labels.json');

/* `t('some.key', 'Some words')` — single or double quoted, across a line break,
   because Prettier wraps long calls. Template literals are deliberately not
   matched: a default that interpolates is not a fixed string the shop can edit. */
const CALL = /\bt\(\s*(['"])([\w.]+)\1\s*,\s*(['"])((?:\\.|(?!\3)[^\\])*)\3/gs;

/* Comments are stripped first. The provider's own documentation shows the call
   shape — `t('auth.signIn', 'Sign in')` — and an extractor that reads comments
   would register that example as a real label the shop could edit to no effect.
   Line comments are only cut when they begin a line, so a `https://` inside a
   string survives. */
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });

const found = new Map();
const duplicates = [];

for (const file of walk(SRC)) {
  const source = stripComments(readFileSync(file, 'utf8'));
  for (const [, , key, , raw] of source.matchAll(CALL)) {
    const defaultText = raw.replace(/\\(['"\\])/g, '$1');
    const where = relative(ROOT, file);

    const existing = found.get(key);
    if (existing && existing.defaultText !== defaultText) {
      duplicates.push({ key, a: existing, b: { defaultText, where } });
      continue;
    }
    if (!existing) found.set(key, { key, defaultText, where });
  }
}

const labels = [...found.values()].sort((a, b) => a.key.localeCompare(b.key));
const groups = [...new Set(labels.map((l) => l.key.split('.')[0]))].sort();

if (duplicates.length) {
  console.error(`\n${duplicates.length} key(s) used with two different defaults:\n`);
  for (const d of duplicates) {
    console.error(`  ${d.key}`);
    console.error(`    "${d.a.defaultText}"  ${d.a.where}`);
    console.error(`    "${d.b.defaultText}"  ${d.b.where}`);
  }
  console.error('\nOne key, one default — the shop edits one row and both call sites move.\n');
  process.exit(1);
}

if (process.argv.includes('--check')) {
  console.log(`${labels.length} labels, ${groups.length} groups — no conflicts.`);
  process.exit(0);
}

writeFileSync(OUT, `${JSON.stringify({ labels }, null, 2)}\n`);
console.log(`${labels.length} labels across ${groups.length} groups → ${relative(ROOT, OUT)}`);
for (const g of groups) {
  console.log(`  ${g.padEnd(14)} ${labels.filter((l) => l.key.startsWith(`${g}.`)).length}`);
}
console.log('\nRegister them with:');
console.log('  curl -X PUT $API/api/labels/catalogue -H "Authorization: Bearer $ADMIN_TOKEN" \\');
console.log('       -H "Content-Type: application/json" --data @labels.json');
