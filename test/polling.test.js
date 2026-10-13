// -----------------------------------------------------------------------------
// The refresh timer, on the SDK's own fake Gladys (createFakeGladys, SDK
// 0.15): the Echos are published with `should_poll: false`, so the core never
// calls onPoll for them, and the Gladys 5.2.0 scheduler would not either for
// the devices created by the older versions (Gladys#3198). The integration's
// own timer must therefore read every Echo added in Gladys — those created
// before it started as well as those added since — and onPoll stays a
// fallback that still works if the core ever calls it.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { EchoService } from '../src/service.js';
import { registerHandlers } from '../src/app.js';
import { createStore } from '../src/store.js';
import { createQueue } from '../src/amazon/http.js';
import { createFakeAmazon, fixture } from './helpers/fakeAmazon.js';
import { CREDENTIALS, SERIALS, fakeTimers, memoryLogger } from './helpers/setup.js';

const volumesWith = (changes) => {
  const body = fixture('all-device-volumes');
  for (const volume of body.volumes) {
    if (changes[volume.dsn] !== undefined) volume.speakerVolume = changes[volume.dsn];
  }
  return { body };
};

async function startedOnSdkFake({ created }) {
  const dir = await mkdtemp(join(tmpdir(), 'amazon-echo-'));
  const store = createStore(dir);
  await store.writeCredentials(CREDENTIALS);
  const amazon = createFakeAmazon();
  // Echos created in Gladys by an older version: no should_poll at all.
  const probe = createFakeGladys();
  const gladys = createFakeGladys({
    config: { region: 'amazon.fr' },
    devices: created.map((serial) => ({
      name: serial,
      external_id: probe.externalIds('echo', serial).device,
      features: [],
    })),
  });
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
  await gladys.connect();
  return { gladys, amazon, timers, logger, service };
}

test('the timer reads every Echo created in Gladys, before or after the start', async () => {
  const { gladys, amazon, timers } = await startedOnSdkFake({
    created: [SERIALS.DOT, SERIALS.SHOW],
  });
  const ids = (serial) => gladys.externalIds('echo', serial);

  // Published like the core requires: never scheduled by the core.
  const discovered = gladys.fake.discoveredDevices;
  assert.equal(discovered.length, 6);
  for (const device of discovered) assert.equal(device.should_poll, false);

  // The refresh is the integration's own timer, at the configured interval.
  assert.deepEqual(timers.delays(), [120000]);
  assert.equal(gladys.fake.lastState(ids(SERIALS.DOT).feature('volume')), 40);
  assert.equal(gladys.fake.lastState(ids(SERIALS.SPOT).feature('volume')), undefined);

  // Volumes change on Amazon's side: the next tick publishes them.
  amazon.override('GET /api/devices/deviceType/dsn/audio/v1/allDeviceVolumes', () =>
    volumesWith({ [SERIALS.DOT]: 55, [SERIALS.SHOW]: 10, [SERIALS.SPOT]: 70 }),
  );
  await timers.fire();
  assert.equal(gladys.fake.lastState(ids(SERIALS.DOT).feature('volume')), 55);
  assert.equal(gladys.fake.lastState(ids(SERIALS.SHOW).feature('volume')), 10);
  assert.equal(gladys.fake.lastState(ids(SERIALS.SPOT).feature('volume')), undefined);
  assert.deepEqual(timers.delays(), [120000], 'the timer is armed again');

  // An Echo added now is read at once, then by every tick of the timer.
  await gladys.fake.deviceCreated({
    name: 'Spot',
    external_id: ids(SERIALS.SPOT).device,
    features: [],
  });
  assert.equal(gladys.fake.lastState(ids(SERIALS.SPOT).feature('volume')), 70);
  amazon.override('GET /api/devices/deviceType/dsn/audio/v1/allDeviceVolumes', () =>
    volumesWith({ [SERIALS.DOT]: 55, [SERIALS.SHOW]: 10, [SERIALS.SPOT]: 20 }),
  );
  await timers.fire();
  assert.equal(gladys.fake.lastState(ids(SERIALS.SPOT).feature('volume')), 20);
});

test('onPoll stays a working fallback', async () => {
  const { gladys, amazon } = await startedOnSdkFake({ created: [SERIALS.DOT] });
  const dot = gladys.externalIds('echo', SERIALS.DOT);
  amazon.override('GET /api/devices/deviceType/dsn/audio/v1/allDeviceVolumes', () =>
    volumesWith({ [SERIALS.DOT]: 15 }),
  );
  assert.deepEqual(await gladys.fake.poll({ external_id: dot.device, features: [] }), {
    success: true,
  });
  assert.equal(gladys.fake.lastState(dot.feature('volume')), 15);
});

test('a normal refresh writes nothing at info level', async () => {
  const { timers, logger } = await startedOnSdkFake({ created: [SERIALS.DOT, SERIALS.SHOW] });
  for (let i = 0; i < 3; i += 1) await timers.fire();
  const loud = logger.lines.filter((line) => !line.startsWith('debug '));
  assert.deepEqual(loud, []);
  assert.ok(logger.lines.some((line) => line.startsWith('debug Refresh:')));
});
