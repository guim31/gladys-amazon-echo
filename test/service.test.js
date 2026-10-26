// -----------------------------------------------------------------------------
// The integration end to end, on a fake Gladys and a fake Amazon: sign-in,
// refresh, commands, scene actions, failures. Gladys' side is played through
// the handlers the integration registered (src/app.js).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { CREDENTIALS, SERIALS, idsOf, setup } from './helpers/setup.js';
import { CSRF, fixture } from './helpers/fakeAmazon.js';
import { MESSAGES } from '../src/messages.js';

const ADDED = [SERIALS.DOT, SERIALS.SHOW, SERIALS.GROUP, SERIALS.SPOT, SERIALS.STUDIO];
const RETURN =
  'https://www.amazon.com/ap/maplanding?openid.assoc_handle=amzn_dp_project_dee_ios&openid.oa2.authorization_code=ANEXAMPLECODE';

const sequenceOf = (request) => JSON.parse(request.body.sequenceJson).startNode;

async function started(options = {}) {
  const context = await setup({ added: ADDED, ...options });
  await context.gladys.emit('connected');
  return context;
}

test('without credentials, the integration says how to sign in and publishes nothing', async () => {
  const { gladys, amazon } = await setup({ signedIn: false, config: { language: 'fr' } });
  await gladys.emit('connected');
  assert.deepEqual(gladys.connectionStatuses, [
    { connected: false, message: MESSAGES.status.signed_out },
  ]);
  await gladys.handlers.scanRequest();
  assert.deepEqual(gladys.discovered, []);
  await assert.rejects(
    gladys.handlers.setValue({ external_id: 'x' }, { external_id: 'x:volume' }, 3),
    { message: MESSAGES.errors.not_signed_in.fr },
  );
  assert.equal(amazon.requests.length, 0);
});

test('the sign-in: Connect opens Amazon, the return address finishes it', async () => {
  const { gladys, amazon, dir, timers } = await setup({ signedIn: false });
  await gladys.emit('connected');

  const url = await gladys.handlers.oauthAuthorizeUrl('amazon_account', undefined);
  assert.match(url, /^https:\/\/www\.amazon\.com\/ap\/signin\?/);
  const flowFile = await stat(join(dir, 'sign-in.json'));
  assert.equal(flowFile.mode & 0o777, 0o600);

  // A wrong address is explained, and keeps the sign-in open.
  await assert.rejects(
    gladys.actions.finish_sign_in({ return_address: 'https://www.amazon.fr/' }),
    {
      message: MESSAGES.sign_in.not_a_return_address.en,
    },
  );

  const message = await gladys.actions.finish_sign_in({ return_address: RETURN });
  assert.deepEqual(message, MESSAGES.sign_in.done(6));
  const [register] = amazon.calls('POST', '/auth/register');
  assert.equal(register.body.auth_data.authorization_code, 'ANEXAMPLECODE');
  assert.equal(
    new URL(url).searchParams.get('openid.oa2.client_id'),
    `device:${register.body.auth_data.client_id}`,
  );

  const credentialsFile = await stat(join(dir, 'credentials.json'));
  assert.equal(credentialsFile.mode & 0o777, 0o600);
  await assert.rejects(stat(join(dir, 'sign-in.json')), { code: 'ENOENT' });
  assert.equal(gladys.discovered.length, 6);
  assert.deepEqual(gladys.connectionStatuses.at(-1), { connected: true, message: undefined });
  assert.deepEqual(timers.delays(), [120000]);

  // The same address cannot be used twice.
  await assert.rejects(gladys.actions.finish_sign_in({ return_address: RETURN }), {
    message: MESSAGES.sign_in.no_flow.en,
  });
});

test('an expired or refused sign-in asks to click Connect again', async () => {
  let now = 1_000_000;
  const { gladys, service, amazon } = await setup({ signedIn: false });
  service.now = () => now;
  await gladys.handlers.oauthAuthorizeUrl('amazon_account');
  amazon.override('POST /auth/register', () => ({
    status: 400,
    body: { response: { error: { code: 'InvalidValue' } } },
  }));
  await assert.rejects(gladys.actions.finish_sign_in({ return_address: RETURN }), {
    message: MESSAGES.sign_in.refused.en,
  });
  now += 2 * 60 * 60 * 1000;
  await assert.rejects(gladys.actions.finish_sign_in({ return_address: RETURN }), {
    message: MESSAGES.sign_in.expired.en,
  });
});

test('a refresh reads only the added Echos and publishes their states', async () => {
  const { gladys, amazon } = await started();
  const dot = idsOf(gladys, SERIALS.DOT);
  const show = idsOf(gladys, SERIALS.SHOW);
  const group = idsOf(gladys, SERIALS.GROUP);
  assert.equal(gladys.lastState(dot.feature('volume')), 40);
  assert.equal(gladys.lastState(dot.feature('do_not_disturb')), 0);
  assert.equal(gladys.lastState(dot.feature('playback_state')), 1);
  assert.equal(gladys.lastState(dot.feature('now_playing')), 'Example Song — Example Artist');
  assert.equal(gladys.lastState(show.feature('volume')), 25);
  assert.equal(gladys.lastState(show.feature('do_not_disturb')), 1);
  // Nothing loaded: IDLE (2) since 1.1.0, texts cleared explicitly.
  assert.equal(gladys.lastState(show.feature('playback_state')), 2);
  assert.equal(gladys.lastState(show.feature('now_playing')), 'Nothing playing');
  assert.equal(gladys.lastState(show.feature('title')), '');
  assert.equal(gladys.lastState(group.feature('playback_state')), 2);
  assert.equal(gladys.lastState(group.feature('volume')), undefined);
  // The Spot has no player; the Studio is offline; the soundbar is not added.
  const players = amazon.calls('GET', '/api/np/player').map((r) => r.query.deviceSerialNumber);
  assert.deepEqual(players.sort(), [SERIALS.DOT, SERIALS.GROUP, SERIALS.SHOW].sort());
  // A text/text state is never empty (the core drops it), every state has a
  // value; the music strings are cleared with an empty text.
  for (const state of gladys.published) {
    if (state.device_feature_external_id.endsWith(':now_playing')) {
      assert.ok(state.text.length > 0);
    } else if (state.text === undefined) assert.ok(Number.isFinite(state.state));
  }
  assert.ok(gladys.widgetRefreshes.includes('player'));
});

test('a refresh publishes only what changed', async () => {
  const { gladys, amazon, timers } = await started();
  const before = gladys.published.length;
  await timers.fire();
  assert.equal(gladys.published.length, before, 'nothing changed, nothing sent');
  amazon.state.players[SERIALS.DOT] = fixture('np-player-idle');
  await timers.fire();
  const dot = idsOf(gladys, SERIALS.DOT);
  assert.deepEqual(
    gladys.published
      .slice(before)
      .map((s) => s.device_feature_external_id)
      .sort(),
    ['now_playing', 'playback_state', 'title', 'artist', 'album', 'artwork', 'duration', 'position']
      .map((key) => dot.feature(key))
      .sort(),
  );
  // The device list is not fetched again before 30 minutes.
  assert.equal(amazon.calls('GET', '/api/devices-v2/device').length, 1);
});

test('nothing is read while no Echo is added in Gladys', async () => {
  const { gladys, amazon } = await setup();
  await gladys.emit('connected');
  assert.equal(gladys.discovered.length, 6);
  assert.equal(amazon.calls('GET', '/api/np/player').length, 0);
  assert.equal(amazon.calls('GET', '/api/dnd/device-status-list').length, 0);
});

test('adding an Echo in Gladys publishes its states again at once', async () => {
  const { gladys } = await started();
  const dot = idsOf(gladys, SERIALS.DOT);
  const before = gladys.published.length;
  await gladys.handlers.deviceCreated({ external_id: dot.device });
  const again = gladys.published.slice(before).map((s) => s.device_feature_external_id);
  assert.ok(again.includes(dot.feature('volume')));
  assert.ok(again.includes(dot.feature('now_playing')));
  assert.ok(again.every((id) => id.startsWith(dot.device)));
});

test('volume, transport and Do Not Disturb commands', async () => {
  const { gladys, amazon, timers } = await started();
  const dot = idsOf(gladys, SERIALS.DOT);
  const device = { external_id: dot.device };

  await gladys.handlers.setValue(device, { external_id: dot.feature('volume') }, 55);
  const [preview] = amazon.calls('POST', '/api/behaviors/preview');
  const node = sequenceOf(preview);
  assert.equal(node.type, 'Alexa.DeviceControls.Volume');
  assert.equal(node.operationPayload.value, 55);
  assert.equal(node.operationPayload.customerId, 'A1EXAMPLECUSTOMER');
  assert.equal(node.operationPayload.locale, 'fr-FR');
  assert.equal(gladys.lastState(dot.feature('volume')), 55);

  timers.pending.clear();
  await gladys.handlers.setValue(device, { external_id: dot.feature('pause') }, 1);
  assert.equal(amazon.calls('POST', '/api/np/command')[0].body.type, 'PauseCommand');
  assert.deepEqual(timers.delays(), [3000], 'the player is read again soon');

  await gladys.handlers.setValue(device, { external_id: dot.feature('do_not_disturb') }, 1);
  assert.equal(amazon.calls('PUT', '/api/dnd/status')[0].body.enabled, true);
  assert.equal(gladys.lastState(dot.feature('do_not_disturb')), 1);

  const spot = idsOf(gladys, SERIALS.SPOT);
  await assert.rejects(
    gladys.handlers.setValue(
      { external_id: spot.device },
      { external_id: spot.feature('play') },
      1,
    ),
    { message: MESSAGES.errors.no_player.en },
  );
  await assert.rejects(
    gladys.handlers.setValue({ external_id: 'ext:x:echo:GONE' }, { external_id: 'x:volume' }, 1),
    { message: MESSAGES.errors.unknown_device.en },
  );
});

test("the core's notification plays the Gladys Plus MP3 as an announcement", async () => {
  const { gladys, amazon } = await started();
  const group = idsOf(gladys, SERIALS.GROUP);
  const url = 'https://plus.example/tts/00000000-0000-0000-0000-000000000000/generate.mp3';
  await gladys.handlers.setValue(
    { external_id: group.device },
    { external_id: group.feature('notification') },
    url,
  );
  const node = sequenceOf(amazon.calls('POST', '/api/behaviors/preview')[0]);
  assert.equal(node.type, 'AlexaAnnouncement');
  assert.deepEqual(node.operationPayload.content[0].speak, {
    type: 'ssml',
    value: `<speak><audio src="${url}"/></speak>`,
  });
  // A group is announced on its speakers.
  assert.deepEqual(
    node.operationPayload.target.devices.map((d) => d.deviceSerialNumber),
    [SERIALS.DOT, SERIALS.SHOW],
  );
  // A plain text is announced as text; anything else is refused.
  const dot = idsOf(gladys, SERIALS.DOT);
  await gladys.handlers.setValue(
    { external_id: dot.device },
    { external_id: dot.feature('notification') },
    'Hello',
  );
  const text = sequenceOf(amazon.calls('POST', '/api/behaviors/preview')[1]);
  assert.deepEqual(text.operationPayload.content[0].speak, { type: 'text', value: 'Hello' });
  await assert.rejects(
    gladys.handlers.setValue(
      { external_id: dot.device },
      { external_id: dot.feature('notification') },
      'ftp://x/y.mp3',
    ),
    { message: MESSAGES.errors.not_a_notification.en },
  );
});

test('scene action "Make an Echo speak": several Echos, groups expanded, volume restored', async () => {
  const { gladys, amazon } = await started();
  const ids = [idsOf(gladys, SERIALS.DOT).device, idsOf(gladys, SERIALS.GROUP).device];
  await gladys.sceneActions.speak({
    devices: ids,
    text: 'Dinner is ready',
    mode: 'speak',
    volume: 70,
  });
  const [volume, speech, restore] = sequenceOf(
    amazon.calls('POST', '/api/behaviors/preview')[0],
  ).nodesToExecute;
  const serials = (node) => node.nodesToExecute.map((n) => n.operationPayload.deviceSerialNumber);
  assert.deepEqual(serials(volume), [SERIALS.DOT, SERIALS.SHOW]);
  assert.deepEqual(serials(speech), [SERIALS.DOT, SERIALS.SHOW]);
  assert.equal(speech.nodesToExecute[0].operationPayload.textToSpeak, 'Dinner is ready');
  assert.deepEqual(
    restore.nodesToExecute.map((n) => [
      n.operationPayload.deviceSerialNumber,
      n.operationPayload.value,
    ]),
    [
      [SERIALS.DOT, 40],
      [SERIALS.SHOW, 25],
    ],
  );

  await gladys.sceneActions.speak({ devices: [ids[0]], text: 'Ding', mode: 'announce' });
  const announce = sequenceOf(amazon.calls('POST', '/api/behaviors/preview')[1]);
  assert.equal(announce.type, 'AlexaAnnouncement');

  await assert.rejects(gladys.sceneActions.speak({ devices: ids, text: '   ' }), {
    message: MESSAGES.errors.empty_text.en,
  });
  await assert.rejects(gladys.sceneActions.speak({ devices: [], text: 'x' }), {
    message: MESSAGES.errors.no_device.en,
  });
  // A single device id (not a list) is accepted too.
  await gladys.sceneActions.speak({ devices: ids[0], text: 'Solo' });
});

test('scene action "Run an Alexa routine": by name or phrase, bound to the chosen Echo', async () => {
  const { gladys, amazon } = await started();
  const spot = idsOf(gladys, SERIALS.SPOT).device;
  await gladys.sceneActions.run_routine({ routine: '  GOOD   night ', device: spot });
  const [run] = amazon.calls('POST', '/api/behaviors/preview');
  assert.equal(run.body.behaviorId, 'amzn1.alexa.automation.example-0001');
  const [speak] = sequenceOf(run).nodesToExecute;
  assert.equal(speak.operationPayload.deviceSerialNumber, SERIALS.SPOT);
  assert.equal(speak.operationPayload.customerId, 'A1EXAMPLECUSTOMER');

  await gladys.sceneActions.run_routine({ routine: 'Cinema' });
  assert.equal(
    amazon.calls('POST', '/api/behaviors/preview')[1].body.behaviorId,
    'amzn1.alexa.automation.example-0002',
  );
  // The list is cached for a few minutes.
  assert.equal(amazon.calls('GET', '/api/behaviors/v2/automations').length, 1);

  await assert.rejects(gladys.sceneActions.run_routine({ routine: 'Nope' }), {
    message: MESSAGES.errors.routine_not_found('Nope').en,
  });
  await assert.rejects(gladys.sceneActions.run_routine({ routine: '' }), {
    message: MESSAGES.errors.no_routine_name.en,
  });
});

test('scene action "Do Not Disturb", and the routines list of the configuration', async () => {
  const { gladys, amazon } = await started();
  await gladys.sceneActions.do_not_disturb({
    devices: [idsOf(gladys, SERIALS.GROUP).device],
    state: 'off',
  });
  assert.deepEqual(
    amazon.calls('PUT', '/api/dnd/status').map((r) => [r.body.deviceSerialNumber, r.body.enabled]),
    [
      [SERIALS.DOT, false],
      [SERIALS.SHOW, false],
    ],
  );
  assert.equal(gladys.lastState(idsOf(gladys, SERIALS.SHOW).feature('do_not_disturb')), 0);
  const message = await gladys.actions.list_routines({});
  assert.deepEqual(message, MESSAGES.routines.list('• Good night\n• Morning\n• movie time'));
});

test('the test action speaks on the chosen Echo', async () => {
  const { gladys, amazon } = await started();
  const message = await gladys.actions.test_speak({
    device: idsOf(gladys, SERIALS.DOT).device,
    text: 'Hi',
  });
  assert.deepEqual(message, MESSAGES.test_spoken('Kitchen Echo Dot'));
  assert.equal(sequenceOf(amazon.calls('POST', '/api/behaviors/preview')[0]).type, 'Alexa.Speak');
});

test('a throttled Amazon slows the refresh down and says so', async () => {
  const { gladys, amazon, timers } = await started();
  amazon.override('GET /api/devices/deviceType/dsn/audio/v1/allDeviceVolumes', () => ({
    status: 429,
    body: {},
  }));
  await timers.fire();
  assert.deepEqual(gladys.connectionStatuses.at(-1), {
    connected: false,
    message: MESSAGES.status.throttled,
  });
  assert.deepEqual(timers.delays(), [240000]);
  await timers.fire();
  assert.deepEqual(timers.delays(), [480000]);
  amazon.override('POST /api/behaviors/preview', () => ({
    status: 400,
    body: { message: 'Rate exceeded' },
  }));
  await assert.rejects(
    gladys.sceneActions.speak({ devices: [idsOf(gladys, SERIALS.DOT).device], text: 'x' }),
    {
      message: MESSAGES.errors.throttled.en,
    },
  );
  amazon.reset('GET /api/devices/deviceType/dsn/audio/v1/allDeviceVolumes');
  await timers.fire();
  assert.deepEqual(gladys.connectionStatuses.at(-1), { connected: true, message: undefined });
  assert.deepEqual(timers.delays(), [120000]);
});

test('an unreachable Amazon is retried; a refused sign-in stops everything', async () => {
  const { gladys, amazon, timers } = await started();
  amazon.override('GET /api/dnd/device-status-list', () => new TypeError('fetch failed'));
  amazon.override('GET /api/devices/deviceType/dsn/audio/v1/allDeviceVolumes', () => ({
    status: 500,
    body: {},
  }));
  await timers.fire();
  // Optional readings failing are skipped: the players are still read.
  assert.deepEqual(gladys.connectionStatuses.at(-1), { connected: true, message: undefined });

  amazon.override('GET /api/np/player', () => new TypeError('fetch failed'));
  amazon.override('GET /api/devices-v2/device', () => new TypeError('fetch failed'));
  gladys.devices = [];
  await gladys.handlers.scanRequest();
  assert.deepEqual(gladys.connectionStatuses.at(-1), {
    connected: false,
    message: MESSAGES.status.unreachable,
  });

  // The session dies, and the refresh token is refused.
  amazon.override('POST /ap/exchangetoken/cookies', () => ({ status: 400, body: {} }));
  amazon.override('GET /api/devices-v2/device', () => ({ status: 401, body: {} }));
  await gladys.handlers.scanRequest();
  assert.deepEqual(gladys.connectionStatuses.at(-1), {
    connected: false,
    message: MESSAGES.status.refused,
  });
  timers.pending.clear();
  await timers.fire();
  assert.deepEqual(timers.delays(), [], 'no refresh scheduled any more');
  await assert.rejects(gladys.sceneActions.speak({ devices: ['x'], text: 'x' }), {
    message: MESSAGES.errors.not_signed_in.en,
  });
});

test('a failure that repeats is logged once, and its end once', async () => {
  const { gladys, amazon, timers, logger } = await started();
  const loud = () => logger.lines.filter((line) => !line.startsWith('debug '));
  assert.deepEqual(loud(), []);
  // An optional reading fails three times in a row, then works again.
  amazon.override('GET /api/devices/deviceType/dsn/audio/v1/allDeviceVolumes', () => ({
    status: 500,
    body: {},
  }));
  for (let i = 0; i < 3; i += 1) await timers.fire();
  amazon.reset('GET /api/devices/deviceType/dsn/audio/v1/allDeviceVolumes');
  await timers.fire();
  await timers.fire();
  // Amazon unreachable: three failed refreshes (the interval doubles), then back.
  amazon.override('GET /api/dnd/device-status-list', () => new TypeError('fetch failed'));
  amazon.override('GET /api/np/player', () => new TypeError('fetch failed'));
  amazon.override('GET /api/devices-v2/device', () => new TypeError('fetch failed'));
  gladys.devices = [];
  for (let i = 0; i < 3; i += 1) await gladys.handlers.scanRequest();
  amazon.reset('GET /api/dnd/device-status-list');
  amazon.reset('GET /api/np/player');
  amazon.reset('GET /api/devices-v2/device');
  await gladys.handlers.scanRequest();
  await gladys.handlers.scanRequest();
  assert.deepEqual(
    loud().map((line) => line.split(':')[0]),
    [
      'warn Volume reading failed',
      'info Volume reading working again',
      'warn Amazon refresh failed',
      'info Amazon refresh working again',
    ],
  );
});

test('signing out deregisters Gladys and deletes the credentials', async () => {
  const { gladys, amazon, dir, timers } = await started();
  const message = await gladys.actions.sign_out({});
  assert.deepEqual(message, MESSAGES.sign_in.signed_out);
  assert.equal(amazon.calls('POST', '/auth/deregister').length, 1);
  await assert.rejects(stat(join(dir, 'credentials.json')), { code: 'ENOENT' });
  assert.deepEqual(timers.delays(), []);
  assert.deepEqual(gladys.connectionStatuses.at(-1), {
    connected: false,
    message: MESSAGES.status.signed_out,
  });
});

test('a new language renames the features of the Echos added from now on', async () => {
  const { gladys } = await started();
  await gladys.handlers.configUpdated({
    region: 'amazon.fr',
    language: 'de',
    refresh_interval: '300',
  });
  const dot = gladys.discovered.find((d) => d.external_id === idsOf(gladys, SERIALS.DOT).device);
  assert.ok(dot.features.some((f) => f.name === 'Nicht stören'));
});

test('a longer refresh interval is applied at once', async () => {
  const { gladys, timers } = await started();
  await gladys.handlers.configUpdated({ region: 'amazon.fr', refresh_interval: '600' });
  assert.deepEqual(timers.delays(), [600000]);
});

test('no secret ever reaches the logs', async () => {
  const { gladys, amazon, logger } = await setup({ signedIn: false, added: ADDED });
  await gladys.handlers.oauthAuthorizeUrl('amazon_account');
  await gladys.actions.finish_sign_in({ return_address: RETURN });
  amazon.override('GET /api/np/player', () => ({ status: 500, body: { cookie: 'leak' } }));
  await gladys.handlers.scanRequest();
  amazon.override('POST /ap/exchangetoken/cookies', () => ({ status: 401, body: {} }));
  amazon.override('GET /api/devices-v2/device', () => ({ status: 401, body: {} }));
  await gladys.handlers.scanRequest();
  const logs = logger.lines.join('\n');
  assert.ok(logger.lines.length > 0);
  for (const secret of [
    CREDENTIALS.refresh_token,
    'EXAMPLE-SESSION-COOKIE',
    'EXAMPLE-SESS-COOKIE',
    CSRF,
    'ANEXAMPLECODE',
    'EXAMPLE-NOT-A-KEY',
  ]) {
    assert.ok(!logs.includes(secret), `"${secret}" logged`);
  }
});
