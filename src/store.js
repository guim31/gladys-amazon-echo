// -----------------------------------------------------------------------------
// Persistence of the Amazon credentials in /data, the only writable volume.
//
// Two files, both written with mode 600 then renamed into place (a crash never
// leaves half a file):
//   - credentials.json: the refresh token of the device registered at sign-in,
//     with its marketplace, serial and customer id. It is the durable secret:
//     the session cookies are re-minted from it and kept in memory only;
//   - sign-in.json: the PKCE verifier of a sign-in in progress, between the
//     "Connect" button and the pasted return address. Deleted once used.
// Nothing here is ever logged.
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const CREDENTIALS_FILE = 'credentials.json';
const SIGN_IN_FILE = 'sign-in.json';

export function createStore(dir = process.env.DATA_DIR || '/data') {
  async function read(name) {
    try {
      return JSON.parse(await readFile(join(dir, name), 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT' || err instanceof SyntaxError) return null;
      throw err;
    }
  }

  async function write(name, value) {
    await mkdir(dir, { recursive: true });
    const target = join(dir, name);
    const temporary = `${target}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, target);
  }

  return {
    readCredentials: () => read(CREDENTIALS_FILE),
    writeCredentials: (credentials) => write(CREDENTIALS_FILE, credentials),
    deleteCredentials: () => rm(join(dir, CREDENTIALS_FILE), { force: true }),
    readSignIn: () => read(SIGN_IN_FILE),
    writeSignIn: (flow) => write(SIGN_IN_FILE, flow),
    deleteSignIn: () => rm(join(dir, SIGN_IN_FILE), { force: true }),
  };
}
