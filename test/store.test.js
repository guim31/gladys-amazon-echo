import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../src/store.js';

test('credentials are written readable by the owner only, and deleted', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'amazon-echo-store-'));
  const store = createStore(join(dir, 'data'));
  assert.equal(await store.readCredentials(), null);
  await store.writeCredentials({ refresh_token: 'Atnr|X' });
  assert.deepEqual(await store.readCredentials(), { refresh_token: 'Atnr|X' });
  assert.equal((await stat(join(dir, 'data', 'credentials.json'))).mode & 0o777, 0o600);
  assert.deepEqual(
    await readdir(join(dir, 'data')),
    ['credentials.json'],
    'no temporary file left',
  );
  await store.deleteCredentials();
  await store.deleteCredentials();
  assert.equal(await store.readCredentials(), null);
});

test('a corrupt file reads as absent', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'amazon-echo-store-'));
  await writeFile(join(dir, 'sign-in.json'), '{not json');
  assert.equal(await createStore(dir).readSignIn(), null);
});
