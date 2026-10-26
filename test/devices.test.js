import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FEATURES,
  NAMES,
  buildDevice,
  echosOf,
  featureKeysOf,
  speakersOf,
} from '../src/devices/echo.js';
import { fixture } from './helpers/fakeAmazon.js';
import { createFakeGladys } from './helpers/fakeGladys.js';
import { SERIALS } from './helpers/setup.js';
import { LANGUAGES } from '../src/i18n.js';

const raw = fixture('devices-v2').devices;
const locales = new Map(
  fixture('device-preferences').devicePreferences.map((p) => [p.deviceSerialNumber, p.locale]),
);
const echos = echosOf(raw, locales, 'fr-FR');
const bySerial = (serial) => echos.find((e) => e.serialNumber === serial);

test('Echos, groups and Alexa speakers are kept; accessories and the phone app are not', () => {
  assert.deepEqual(echos.map((e) => e.serialNumber).sort(), Object.values(SERIALS).sort());
});

test('a group knows its members and has no volume nor Do Not Disturb', () => {
  const group = bySerial(SERIALS.GROUP);
  assert.equal(group.isGroup, true);
  assert.deepEqual(group.memberSerials, [SERIALS.DOT, SERIALS.SHOW]);
  assert.deepEqual(
    speakersOf(group, echos).map((e) => e.serialNumber),
    [SERIALS.DOT, SERIALS.SHOW],
  );
  assert.deepEqual(speakersOf(bySerial(SERIALS.DOT), echos), [bySerial(SERIALS.DOT)]);
  const keys = featureKeysOf(group);
  assert.ok(!keys.includes(FEATURES.VOLUME));
  assert.ok(!keys.includes(FEATURES.DO_NOT_DISTURB));
  assert.ok(keys.includes(FEATURES.NOTIFICATION));
  assert.ok(keys.includes(FEATURES.PLAY));
  // Its locale is its first member's.
  assert.equal(group.locale, 'fr-FR');
});

test('an Echo without music player gets no transport controls', () => {
  const spot = bySerial(SERIALS.SPOT);
  assert.equal(spot.hasPlayer, false);
  assert.deepEqual(featureKeysOf(spot), [
    FEATURES.VOLUME,
    FEATURES.NOTIFICATION,
    FEATURES.DO_NOT_DISTURB,
  ]);
  assert.equal(featureKeysOf(bySerial(SERIALS.DOT)).length, 15);
});

test('the locale comes from the device preferences, else from the marketplace', () => {
  assert.equal(bySerial(SERIALS.STUDIO).locale, 'en-GB');
  assert.equal(bySerial(SERIALS.SPOT).locale, 'fr-FR');
  assert.equal(bySerial(SERIALS.STUDIO).online, false);
});

test('the discovery payload uses the serial number and stable feature keys', () => {
  const gladys = createFakeGladys();
  const device = buildDevice(gladys, bySerial(SERIALS.DOT), 'fr');
  assert.equal(device.external_id, `ext:ext-test-amazon-echo:echo:${SERIALS.DOT}`);
  assert.equal(device.name, 'Kitchen Echo Dot');
  assert.equal(device.should_poll, false);
  assert.equal(device.poll_frequency, undefined);
  const notification = device.features.find((f) => f.type === 'play_notification');
  assert.equal(notification.category, 'music');
  assert.equal(notification.external_id, `${device.external_id}:notification`);
  assert.equal(notification.read_only, false);
  const volume = device.features.find((f) => f.type === 'volume');
  assert.deepEqual([volume.min, volume.max, volume.name], [0, 100, 'Volume']);
  const nowPlaying = device.features.find((f) => f.category === 'text');
  assert.deepEqual([nowPlaying.min, nowPlaying.max, nowPlaying.read_only], [0, 0, true]);
  const dnd = device.features.find((f) => f.category === 'switch');
  assert.equal(dnd.name, 'Ne pas déranger');
});

test('the feature keys never change (they are part of the external ids)', () => {
  assert.deepEqual(Object.values(FEATURES), [
    'volume',
    'play',
    'pause',
    'previous',
    'next',
    'playback_state',
    'now_playing',
    // Gladys 5.3 music player (1.1.0): key = type, the SDK's default id.
    'title',
    'artist',
    'album',
    'artwork',
    'duration',
    'position',
    'notification',
    'do_not_disturb',
  ]);
});

test('every feature has a name in every language', () => {
  assert.deepEqual(Object.keys(NAMES).sort(), [...LANGUAGES].sort());
  for (const lang of LANGUAGES) {
    assert.deepEqual(Object.keys(NAMES[lang]).sort(), Object.values(FEATURES).sort());
    assert.equal(new Set(Object.values(NAMES[lang])).size, Object.values(FEATURES).length, lang);
  }
});

test('broken entries of the device list are skipped', () => {
  assert.deepEqual(echosOf([null, {}, { serialNumber: 'X' }, { deviceType: 'Y' }]), []);
  const [unnamed] = echosOf([
    { serialNumber: 'S', deviceType: 'T', capabilities: ['VOLUME_SETTING'] },
  ]);
  assert.equal(unnamed.name, 'S');
  assert.equal(unnamed.family, 'UNKNOWN');
});
