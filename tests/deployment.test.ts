import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();

test('Docker Compose does not require an owner login password', () => {
  const compose = readFileSync(path.join(root, 'compose.yaml'), 'utf8');
  assert.doesNotMatch(compose, /OWNER_PASSWORD|SESSION_SECRET/);
  assert.match(compose, /POSTGRES_PASSWORD/); // Database credentials remain required.
});

test('Vercel does not hardcode a localhost APP_URL', () => {
  const config = JSON.parse(readFileSync(path.join(root, 'vercel.json'), 'utf8')) as { env?: { APP_URL?: string } };
  assert.equal(config.env?.APP_URL, undefined);
});

test('legacy password endpoints and UI are gone', () => {
  assert.equal(existsSync(path.join(root, 'app/api/auth/login/route.ts')), false);
  assert.equal(existsSync(path.join(root, 'app/api/auth/logout/route.ts')), false);
  const studio = readFileSync(path.join(root, 'components/studio.tsx'), 'utf8');
  assert.doesNotMatch(studio, /login-dialog|setLogin|current-password/);
});
