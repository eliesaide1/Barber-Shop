#!/usr/bin/env node
/**
 * Registers the extracted catalogue against a running API.
 *
 * Signs in rather than asking for a token, because fishing one out of a
 * browser's dev tools is the step that stops this being done at all — and a
 * catalogue that is never registered is a back office with nothing in it.
 *
 * Credentials are read from the environment or typed at the prompt, and are
 * never written anywhere:
 *
 *   npm run labels && npm run labels:publish
 *
 *   API=https://faderoom-api.onrender.com ADMIN_EMAIL=… ADMIN_PASSWORD=… \
 *     node scripts/publish-labels.mjs
 */
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const API = (process.env.API || 'https://faderoom-api.onrender.com').replace(/\/$/, '');

async function ask(question, hidden = false) {
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  const pending = rl.question(question);
  /* Muted after the prompt is written, so the question shows and the answer
     does not — a password echoed here ends up in a scrollback somebody later
     pastes into a chat. */
  if (hidden) rl._writeToOutput = () => {};
  const answer = await pending;
  if (hidden) stdout.write('\n');
  rl.close();
  return answer.trim();
}

async function main() {
  let labels;
  try {
    const raw = readFileSync(new URL('../labels.json', import.meta.url), 'utf8');
    labels = JSON.parse(raw).labels;
  } catch {
    console.error('No labels.json — run `npm run labels` first.');
    process.exit(1);
  }

  const email = process.env.ADMIN_EMAIL || (await ask('Admin email: '));
  const password = process.env.ADMIN_PASSWORD || (await ask('Password: ', true));

  const login = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!login.ok) {
    console.error(`Sign-in failed (${login.status}): ${(await login.text()).slice(0, 200)}`);
    process.exit(1);
  }

  const { accessToken, user } = await login.json();
  /* Checked here rather than left to the API's 403, so the message names the
     actual problem: the right password on the wrong account. */
  if (user?.role !== 'admin') {
    console.error(`${email} is a ${user?.role ?? 'user'} — only the shop admin can register labels.`);
    process.exit(1);
  }

  const res = await fetch(`${API}/api/labels/catalogue`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ labels: labels.map(({ key, defaultText }) => ({ key, defaultText })) }),
  });
  if (!res.ok) {
    console.error(`Registration failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    process.exit(1);
  }

  const { registered } = await res.json();
  console.log(`${registered} labels registered on ${API}`);
  console.log('Open the CMS → App wording. Any wording you had already changed is untouched.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
