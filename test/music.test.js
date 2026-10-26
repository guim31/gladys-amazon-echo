// -----------------------------------------------------------------------------
// The Gladys 5.3 music player (1.1.0), on the SDK's own fake Gladys, which
// checks the discovered devices and the states like the core: the features
// published by publishNowPlaying from real answers of /api/np/player (public
// issues, see test/helpers/fakeAmazon.js), the playback state commands, the
// artwork handler, and the "Update" of an Echo created by 1.0.
// No Amazon account behind any of this: what the real API does is taken from
// alexa-remote2 and Alexa Media Player.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MUSIC_PLAYBACK_STATE } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { EchoService, MAX_ARTWORK_BYTES } from '../src/service.js';
import { registerHandlers } from '../src/app.js';
import { createStore } from '../src/store.js';
import { createQueue } from '../src/amazon/http.js';
import { artworkUrlOf } from '../src/states.js';
import { createFakeAmazon, fixture } from './helpers/fakeAmazon.js';
import { CREDENTIALS, SERIALS, fakeTimers, memoryLogger } from './helpers/setup.js';

const MUSIC_TYPES = ['title', 'artist', 'album', 'artwork', 'duration', 'position'];
// A synthetic 99 × 75 JPEG (from gladys-mopidy), valid for the SDK's dev mode.
const COVER = await readFile(new URL('./fixtures/cover.jpg', import.meta.url));

async function started({
  players = {},
  created = [SERIALS.DOT, SERIALS.SHOW, SERIALS.GROUP],
} = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'amazon-echo-'));
  const store = createStore(dir);
  await store.writeCredentials(CREDENTIALS);
  const amazon = createFakeAmazon({ players });
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
  const service = new EchoService({
    gladys,
    store,
    fetchImpl: amazon.fetch,
    logger: memoryLogger(),
    timers,
    queue: createQueue(0),
  });
  registerHandlers(gladys, service);
  await gladys.connect();
  const ids = (serial) => gladys.externalIds('echo', serial);
  const last = (serial, key) => gladys.fake.lastState(ids(serial).feature(key));
  const feature = (serial, key) => ({ external_id: ids(serial).feature(key) });
  const device = (serial) => ({ external_id: ids(serial).device, features: [] });
  return { gladys, amazon, timers, service, ids, last, feature, device };
}

test('a player Echo carries the music features of Gladys 5.3, the others do not', async () => {
  const { gladys, ids } = await started();
  const discovered = (serial) =>
    gladys.fake.discoveredDevices.find((d) => d.external_id === ids(serial).device);
  const dot = discovered(SERIALS.DOT);
  const byType = (type) => dot.features.find((f) => f.type === type && f.category === 'music');
  for (const type of MUSIC_TYPES) {
    // The SDK convention of publishNowPlaying: `${device}:${type}`.
    assert.equal(byType(type).external_id, `${dot.external_id}:${type}`);
    assert.equal(byType(type).read_only, true, type);
  }
  assert.equal(byType('duration').unit, 'seconds');
  assert.equal(byType('position').unit, 'seconds');
  // The 1.0 id is kept; writable 0/1/2, confirmed by the next reading.
  const playback = byType('playback_state');
  assert.equal(playback.external_id, ids(SERIALS.DOT).feature('playback_state'));
  assert.deepEqual(
    [playback.read_only, playback.has_feedback, playback.min, playback.max],
    [false, true, 0, MUSIC_PLAYBACK_STATE.IDLE],
  );
  assert.equal(byType('volume').has_feedback, true);
  // Nothing the web API cannot do: no seek, shuffle, repeat or mute.
  for (const type of ['shuffle', 'repeat', 'mute']) assert.equal(byType(type), undefined);
  // The 1.0 features stay (scenes, dashboards).
  for (const type of ['play', 'pause', 'previous', 'next', 'play_notification']) {
    assert.ok(byType(type), type);
  }
  assert.ok(dot.features.some((f) => f.external_id === ids(SERIALS.DOT).feature('now_playing')));
  // The Spot has no music player: volume only.
  const spot = discovered(SERIALS.SPOT);
  assert.ok(!spot.features.some((f) => MUSIC_TYPES.includes(f.type)));
  assert.ok(!spot.features.some((f) => f.type === 'playback_state'));
});

test('Amazon Music, paused (real answer): the track, its artwork and its position', async () => {
  const { gladys, last } = await started({
    players: { [SERIALS.DOT]: fixture('np-player-amazon-music-paused') },
  });
  const dot = SERIALS.DOT;
  assert.equal(last(dot, 'playback_state'), MUSIC_PLAYBACK_STATE.PAUSED);
  assert.equal(last(dot, 'title'), 'Lola Montez');
  assert.equal(last(dot, 'artist'), 'Volbeat');
  assert.equal(last(dot, 'album'), 'Outlaw Gentlemen & Shady Ladies (Deluxe Version)');
  assert.equal(last(dot, 'duration'), 268);
  assert.equal(last(dot, 'position'), 61);
  assert.equal(last(dot, 'now_playing'), 'Lola Montez — Volbeat');
  // Already a 600 px variant (~50 KB): asked as it is.
  const key = last(dot, 'artwork');
  assert.match(key, /^art-[0-9a-f]{12}$/);
  assert.equal(
    gladys.artworkUrls.get(key),
    'https://m.media-amazon.com/images/I/51nnhqB34JL._UL600_.jpg',
  );
  // The volume comes from allDeviceVolumes, through publishNowPlaying.
  assert.equal(last(dot, 'volume'), 40);
});

test('Spotify, playing (real answer), then nothing loaded (real answer)', async () => {
  const { gladys, amazon, timers, last } = await started({
    players: { [SERIALS.DOT]: fixture('np-player-spotify-playing') },
  });
  const dot = SERIALS.DOT;
  assert.equal(last(dot, 'playback_state'), MUSIC_PLAYBACK_STATE.PLAYING);
  assert.deepEqual(
    [last(dot, 'title'), last(dot, 'artist'), last(dot, 'album')],
    ['Bro Hymn', 'Pennywise', 'Sonst'],
  );
  assert.deepEqual([last(dot, 'duration'), last(dot, 'position')], [180, 16]);
  assert.equal(
    gladys.artworkUrls.get(last(dot, 'artwork')),
    'https://i.scdn.co/image/ab67616d0000b273a9435f8b2d7bf5ea2ff8a9ab',
  );

  // Same answer at the next tick: nothing sent again (the position is
  // extrapolated by Gladys, republished only on a jump of more than 3 s).
  const before = gladys.fake.states.length;
  await timers.fire();
  assert.equal(gladys.fake.states.length, before);

  // Nothing loaded: IDLE and every text cleared, in one batch.
  amazon.state.players[dot] = fixture('np-player-empty');
  await timers.fire();
  assert.equal(last(dot, 'playback_state'), MUSIC_PLAYBACK_STATE.IDLE);
  for (const type of ['title', 'artist', 'album', 'artwork']) assert.equal(last(dot, type), '');
  assert.deepEqual([last(dot, 'duration'), last(dot, 'position')], [0, 0]);
  assert.equal(last(dot, 'now_playing'), 'Nothing playing');
  assert.equal(last(dot, 'volume'), 40, 'a player without volume keeps the last one');
});

test('a live stream has a duration of 0 and no position', async () => {
  const radio = fixture('np-player-spotify-playing');
  radio.playerInfo.progress = null;
  const { last } = await started({ players: { [SERIALS.DOT]: radio } });
  assert.equal(last(SERIALS.DOT, 'duration'), 0);
  assert.equal(last(SERIALS.DOT, 'position'), undefined);
  assert.equal(last(SERIALS.DOT, 'title'), 'Bro Hymn');
});

test('the artwork URL: Amazon originals are asked at 400 px, https only', () => {
  // The bare original is up to 2560 px and ~400 KB (measured on the CDN).
  assert.equal(
    artworkUrlOf({ url: 'https://m.media-amazon.com/images/I/81GQMA3vGLL.jpg' }),
    'https://m.media-amazon.com/images/I/81GQMA3vGLL._SL400_.jpg',
  );
  assert.equal(
    artworkUrlOf({ url: 'https://m.media-amazon.com/images/I/71t2+9tvunL._UL600_.jpg' }),
    'https://m.media-amazon.com/images/I/71t2+9tvunL._UL600_.jpg',
  );
  // The push messages give sizes, no `url`.
  assert.equal(
    artworkUrlOf({ mediumUrl: 'https://i.scdn.co/image/x', fullUrl: 'https://i.scdn.co/image/y' }),
    'https://i.scdn.co/image/x',
  );
  assert.equal(artworkUrlOf({ url: 'http://192.168.1.10/cover.jpg' }), null);
  assert.equal(artworkUrlOf(null), null);
});

test('the artwork is served from its URL, up to 300 KB', async () => {
  const { gladys, amazon, last } = await started({
    players: { [SERIALS.DOT]: fixture('np-player-amazon-music-paused') },
  });
  const key = last(SERIALS.DOT, 'artwork');
  const image = COVER;
  amazon.override('GET m.media-amazon.com /images/I/51nnhqB34JL._UL600_.jpg', () => ({
    bytes: image,
    contentType: 'image/jpeg',
  }));
  const ack = await gladys.fake.musicGetArtwork(key);
  assert.equal(ack.success, true);
  assert.equal(ack.data.image, image.toString('base64'));

  amazon.override('GET m.media-amazon.com /images/I/51nnhqB34JL._UL600_.jpg', () => ({
    bytes: Buffer.concat([COVER, Buffer.alloc(MAX_ARTWORK_BYTES)]),
    contentType: 'image/jpeg',
  }));
  const tooLarge = await gladys.fake.musicGetArtwork(key);
  assert.equal(tooLarge.success, false);
  assert.match(tooLarge.error, /larger than 300 KB/);

  amazon.override('GET m.media-amazon.com /images/I/51nnhqB34JL._UL600_.jpg', () => ({
    status: 404,
    text: 'Not found',
  }));
  assert.match((await gladys.fake.musicGetArtwork(key)).error, /HTTP 404/);
  // A key never published is not fetched.
  const unknown = await gladys.fake.musicGetArtwork('art-000000000000');
  assert.equal(unknown.success, false);
});

test('writing the playback state pauses, plays and stops the Echo', async () => {
  const { gladys, amazon, timers, device, feature, last } = await started({
    players: { [SERIALS.DOT]: fixture('np-player-spotify-playing') },
  });
  const set = (serial, value) =>
    gladys.fake.setValue(device(serial), feature(serial, 'playback_state'), value);
  const commands = () => amazon.calls('POST', '/api/np/command').map((r) => r.body.type);

  assert.equal((await set(SERIALS.DOT, 0)).success, true);
  assert.equal((await set(SERIALS.DOT, 1)).success, true);
  assert.deepEqual(commands(), ['PauseCommand', 'PlayCommand']);
  assert.equal(amazon.calls('POST', '/api/np/command')[0].query.deviceSerialNumber, SERIALS.DOT);

  // The Echo reports the new state: the next reading publishes it.
  amazon.state.players[SERIALS.DOT] = fixture('np-player-amazon-music-paused');
  await timers.fire();
  assert.equal(last(SERIALS.DOT, 'playback_state'), MUSIC_PLAYBACK_STATE.PAUSED);

  // Stop: "Alexa, stop" as a sequence, the command endpoint has none.
  assert.equal((await set(SERIALS.DOT, 2)).success, true);
  const [stop] = amazon.calls('POST', '/api/behaviors/preview');
  const node = JSON.parse(stop.body.sequenceJson).startNode;
  assert.equal(node.type, 'Alexa.DeviceControls.Stop');
  assert.deepEqual(node.operationPayload.devices, [
    { deviceSerialNumber: SERIALS.DOT, deviceType: 'A32DOYMUN6DTXA' },
  ]);
  assert.equal(node.operationPayload.customerId, 'A1EXAMPLECUSTOMER');

  // A group stops through its speakers.
  assert.equal((await set(SERIALS.GROUP, 2)).success, true);
  const group = JSON.parse(amazon.calls('POST', '/api/behaviors/preview')[1].body.sequenceJson);
  assert.deepEqual(
    group.startNode.operationPayload.devices.map((d) => d.deviceSerialNumber),
    [SERIALS.DOT, SERIALS.SHOW],
  );

  // BUFFERING is reported only.
  const refused = await set(SERIALS.DOT, 3);
  assert.equal(refused.success, false);
  assert.equal(commands().length, 2);
});

test('the "Update" of an Echo created by 1.0 publishes every music state again', async () => {
  const { gladys, ids, last } = await started({
    players: { [SERIALS.DOT]: fixture('np-player-spotify-playing') },
  });
  const dot = ids(SERIALS.DOT);
  assert.equal(last(SERIALS.DOT, 'title'), 'Bro Hymn');
  const before = gladys.fake.states.length;
  await gladys.fake.deviceUpdated({ name: 'Dot', external_id: dot.device, features: [] });
  const again = gladys.fake.states.slice(before).map((s) => s.device_feature_external_id);
  for (const type of [...MUSIC_TYPES, 'playback_state', 'volume', 'now_playing']) {
    assert.ok(again.includes(dot.feature(type)), type);
  }
});

test('the volume set from Gladys is published at once, as a music state', async () => {
  const { gladys, device, feature, last } = await started();
  const ack = await gladys.fake.setValue(device(SERIALS.DOT), feature(SERIALS.DOT, 'volume'), 65);
  assert.equal(ack.success, true);
  assert.equal(last(SERIALS.DOT, 'volume'), 65);
});

test('one failed reading of the player keeps the track (no "stopped", no cleared title)', async () => {
  const { gladys, amazon, timers, last } = await started({
    players: { [SERIALS.DOT]: fixture('np-player-spotify-playing') },
  });
  const before = gladys.fake.states.length;
  amazon.override('GET /api/np/player', () => ({ status: 500, body: { message: 'Error' } }));
  await timers.fire();
  assert.equal(gladys.fake.states.length, before, 'nothing published');
  assert.equal(last(SERIALS.DOT, 'playback_state'), MUSIC_PLAYBACK_STATE.PLAYING);
  assert.equal(last(SERIALS.DOT, 'title'), 'Bro Hymn');
});

test('a playback state write is confirmed even when Amazon has not moved yet', async () => {
  const { gladys, timers, device, feature, ids } = await started({
    players: { [SERIALS.DOT]: fixture('np-player-spotify-playing') },
  });
  const id = ids(SERIALS.DOT).feature('playback_state');
  timers.pending.clear();
  const ack = await gladys.fake.setValue(
    device(SERIALS.DOT),
    feature(SERIALS.DOT, 'playback_state'),
    0,
  );
  assert.equal(ack.success, true);
  assert.deepEqual(timers.delays(), [3000, 10000]);
  const before = gladys.fake.states.length;
  // The reading 3 s later still says PLAYING: published anyway, so Gladys
  // shows what the Echo does instead of waiting 15 s for nothing.
  await timers.fire();
  const after = gladys.fake.states.slice(before).filter((s) => s.device_feature_external_id === id);
  assert.deepEqual(
    after.map((s) => s.state),
    [MUSIC_PLAYBACK_STATE.PLAYING],
  );
});

test('a player playing without a track (Bluetooth) has no position, published once', async () => {
  const bluetooth = fixture('np-player-spotify-playing');
  bluetooth.playerInfo.infoText = null;
  bluetooth.playerInfo.mainArt = null;
  bluetooth.playerInfo.progress = null;
  const { gladys, timers, last, ids } = await started({ players: { [SERIALS.DOT]: bluetooth } });
  assert.equal(last(SERIALS.DOT, 'playback_state'), MUSIC_PLAYBACK_STATE.PLAYING);
  assert.equal(last(SERIALS.DOT, 'title'), '');
  assert.equal(last(SERIALS.DOT, 'position'), undefined);
  const before = gladys.fake.states.length;
  await timers.fire();
  await timers.fire();
  assert.equal(gladys.fake.states.length, before);
  assert.ok(
    !gladys.fake.states.some(
      (s) => s.device_feature_external_id === ids(SERIALS.DOT).feature('position'),
    ),
  );
});

test('music states go through one channel: a volume change is sent once', async () => {
  const { gladys, amazon, timers, ids } = await started();
  const volumes = fixture('all-device-volumes');
  for (const v of volumes.volumes) if (v.dsn === SERIALS.DOT) v.speakerVolume = 12;
  amazon.override('GET /api/devices/deviceType/dsn/audio/v1/allDeviceVolumes', () => ({
    body: volumes,
  }));
  const before = gladys.fake.states.length;
  await timers.fire();
  const sent = gladys.fake.states
    .slice(before)
    .filter((s) => s.device_feature_external_id === ids(SERIALS.DOT).feature('volume'));
  assert.deepEqual(
    sent.map((s) => s.state),
    [12],
  );
});
