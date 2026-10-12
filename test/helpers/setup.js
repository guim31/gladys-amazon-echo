// -----------------------------------------------------------------------------
// A service wired like index.js does, on a fake Gladys and a fake Amazon, with
// its credentials in a temporary /data, timers held by the test and every log
// line captured (to check that no secret reaches the logs).
// -----------------------------------------------------------------------------

import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EchoService } from '../../src/service.js';
import { registerHandlers } from '../../src/app.js';
import { createStore } from '../../src/store.js';
import { createQueue } from '../../src/amazon/http.js';
import { createFakeGladys } from './fakeGladys.js';
import { createFakeAmazon } from './fakeAmazon.js';

export const SERIALS = {
  DOT: 'G0EXAMPLEDOT0001',
  SHOW: 'G0EXAMPLESHOW001',
  STUDIO: 'G0EXAMPLESTUDIO1',
  SPOT: 'G0EXAMPLESPOT001',
  GROUP: 'G0EXAMPLEGROUP01',
  SOUNDBAR: 'EXAMPLESOUNDBAR1',
};

export const CREDENTIALS = {
  domain: 'amazon.fr',
  serial: 'EXAMPLEREGISTEREDSERIAL',
  refresh_token: 'Atnr|EXAMPLE-REFRESH-TOKEN',
  // What versions up to 1.0.3 stored: the account id, not the customer id.
  customer_id: 'amzn1.account.EXAMPLEUSERID',
  registered_at: '2026-10-12T00:00:00.000Z',
};

/** Timers the test fires by hand. */
export function fakeTimers() {
  const pending = new Map();
  let next = 1;
  return {
    pending,
    set(callback, delay) {
      const id = next++;
      pending.set(id, { callback, delay });
      return id;
    },
    clear(id) {
      pending.delete(id);
    },
    /** Delays of the pending timers. */
    delays() {
      return [...pending.values()].map((t) => t.delay);
    },
    /** Fire every pending timer once (and wait for what they started). */
    async fire() {
      const due = [...pending.entries()];
      for (const [id, { callback }] of due) {
        pending.delete(id);
        callback();
      }
      for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve));
    },
  };
}

export function memoryLogger(lines = []) {
  const log =
    (level) =>
    (...args) =>
      lines.push(
        `${level} ${args.map((a) => (a instanceof Error ? a.stack : String(a))).join(' ')}`,
      );
  return { lines, debug: log('debug'), info: log('info'), warn: log('warn'), error: log('error') };
}

export async function setup({ signedIn = true, added = [], config = {}, players } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'amazon-echo-'));
  const store = createStore(dir);
  const amazon = createFakeAmazon({ players });
  const gladys = createFakeGladys({ config: { region: 'amazon.fr', ...config } });
  gladys.devices = added.map((serial) => ({
    external_id: gladys.externalIds('echo', serial).device,
  }));
  const timers = fakeTimers();
  const logger = memoryLogger();
  const service = new EchoService({
    gladys,
    store,
    fetchImpl: amazon.fetch,
    logger,
    timers,
    queue: createQueue(0),
  });
  registerHandlers(gladys, service);
  if (signedIn) await store.writeCredentials(CREDENTIALS);
  return { dir, store, amazon, gladys, timers, logger, service };
}

/** The external ids of an Echo of the fixtures. */
export function idsOf(gladys, serial) {
  return gladys.externalIds('echo', serial);
}
