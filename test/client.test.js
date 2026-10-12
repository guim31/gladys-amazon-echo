import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AlexaClient } from '../src/amazon/client.js';
import { CookieJar, createQueue, errorOf } from '../src/amazon/http.js';
import { CSRF, createFakeAmazon } from './helpers/fakeAmazon.js';
import { CREDENTIALS } from './helpers/setup.js';

const DOT = { serialNumber: 'G0EXAMPLEDOT0001', deviceType: 'A32DOYMUN6DTXA', locale: 'fr-FR' };

function client(amazon, options = {}) {
  return new AlexaClient(CREDENTIALS, {
    fetchImpl: amazon.fetch,
    queue: createQueue(0),
    ...options,
  });
}

test('the first call mints a session, then every call carries its cookies and csrf', async () => {
  const amazon = createFakeAmazon();
  const alexa = client(amazon);
  const devices = await alexa.getDevices();
  assert.equal(devices.length, 8);
  assert.equal(alexa.customerId, 'A1EXAMPLECUSTOMER');
  await alexa.getVolumes();
  assert.equal(amazon.calls('POST', '/ap/exchangetoken/cookies').length, 1, 'one session');
  for (const request of amazon.requests.filter(
    (r) => r.host === 'alexa.amazon.fr' && r.path.startsWith('/api/') && r.path !== '/api/language',
  )) {
    assert.equal(request.headers.csrf, CSRF, request.path);
    assert.match(request.headers.Cookie, /at-acbfr=/);
    assert.equal(request.headers.Referer, 'https://alexa.amazon.fr/spa/index.html');
  }
});

test('a session refused by the web API is re-minted once, and the call replayed', async () => {
  const amazon = createFakeAmazon();
  const alexa = client(amazon);
  await alexa.getDevices();
  let refusals = 1;
  amazon.override('GET /api/dnd/device-status-list', () =>
    refusals-- > 0 ? { status: 401, body: {} } : { body: { doNotDisturbDeviceStatusList: [] } },
  );
  assert.deepEqual(await alexa.getDoNotDisturb(), new Map());
  assert.equal(amazon.calls('POST', '/ap/exchangetoken/cookies').length, 2);
  // Refused twice: the error goes up.
  amazon.override('GET /api/dnd/device-status-list', () => ({ status: 401, body: {} }));
  await assert.rejects(alexa.getDoNotDisturb(), { kind: 'session' });
});

test('the session is renewed after a day', async () => {
  let now = 0;
  const amazon = createFakeAmazon();
  const alexa = client(amazon, { now: () => now });
  await alexa.getDevices();
  now = 25 * 60 * 60 * 1000;
  await alexa.getDevices();
  assert.equal(amazon.calls('POST', '/ap/exchangetoken/cookies').length, 2);
});

test('the readings are parsed defensively', async () => {
  const amazon = createFakeAmazon();
  const alexa = client(amazon);
  const volumes = await alexa.getVolumes();
  assert.deepEqual(volumes.get('G0EXAMPLEDOT0001'), { volume: 40, muted: false });
  const dnd = await alexa.getDoNotDisturb();
  assert.equal(dnd.get('G0EXAMPLESHOW001'), true);
  const locales = await alexa.getLocales();
  assert.equal(locales.get('G0EXAMPLESTUDIO1'), 'en-GB');
  const player = await alexa.getPlayer(DOT);
  assert.equal(player.state, 'PLAYING');
  assert.equal(amazon.calls('GET', '/api/np/player')[0].query.deviceType, 'A32DOYMUN6DTXA');
  const routines = await alexa.getRoutines();
  assert.equal(routines.length, 3);
  // Odd answers give empty readings, never a crash.
  amazon.override('GET /api/devices/deviceType/dsn/audio/v1/allDeviceVolumes', () => ({
    body: { volumes: [null, { dsn: 'X' }] },
  }));
  assert.equal((await alexa.getVolumes()).size, 0);
  amazon.override('GET /api/behaviors/v2/automations', () => ({ body: {} }));
  assert.deepEqual(await alexa.getRoutines(), []);
});

test('commands go to the right endpoints', async () => {
  const amazon = createFakeAmazon();
  const alexa = client(amazon);
  await alexa.mediaCommand(DOT, 'Pause');
  const [command] = amazon.calls('POST', '/api/np/command');
  assert.deepEqual(command.body, { contentFocusClientId: null, type: 'PauseCommand' });
  assert.equal(command.query.deviceSerialNumber, DOT.serialNumber);
  await alexa.setDoNotDisturb(DOT, true);
  assert.deepEqual(amazon.calls('PUT', '/api/dnd/status')[0].body, {
    deviceSerialNumber: DOT.serialNumber,
    deviceType: DOT.deviceType,
    enabled: true,
  });
});

test('throttling is recognized, whatever the status Amazon uses', () => {
  assert.equal(errorOf({ status: 429, text: '' }, 'x').kind, 'throttled');
  assert.equal(
    errorOf({ status: 400, text: '{"message":"Rate exceeded"}' }, 'x').kind,
    'throttled',
  );
  assert.equal(errorOf({ status: 503, text: 'ThrottlingException' }, 'x').kind, 'throttled');
  assert.equal(errorOf({ status: 400, text: 'bad' }, 'x').kind, 'http');
  assert.equal(errorOf({ status: 302, text: '' }, 'x').kind, 'session');
  assert.equal(errorOf({ status: 403, text: '' }, 'x').kind, 'session');
});

test('the cookie jar follows Set-Cookie, deletions included', () => {
  const jar = new CookieJar({ a: '1' });
  const headers = new Headers();
  headers.append('Set-Cookie', 'b="2"; Path=/');
  headers.append('Set-Cookie', 'a=; Max-Age=0');
  jar.store(headers);
  assert.equal(jar.header(), 'b=2');
});

test('the queue runs one call at a time, in order, and survives a failure', async () => {
  const enqueue = createQueue(0);
  const order = [];
  let running = 0;
  const task = (name, fail) => async () => {
    running += 1;
    assert.equal(running, 1);
    await new Promise((resolve) => setImmediate(resolve));
    order.push(name);
    running -= 1;
    if (fail) throw new Error(name);
  };
  const results = await Promise.allSettled([
    enqueue(task('a')),
    enqueue(task('b', true)),
    enqueue(task('c')),
  ]);
  assert.deepEqual(order, ['a', 'b', 'c']);
  assert.equal(results[1].status, 'rejected');
});
