// -----------------------------------------------------------------------------
// In-memory stand-in for the Gladys SDK object, written before the SDK 0.15
// shipped `@gladysassistant/integration-sdk/testing`. Kept for the existing
// suites (synchronous handlers, simple records); new tests may use the SDK's
// createFakeGladys, as test/polling.test.js does. It records what the
// integration sends to Gladys and the handlers it registers, so a test can
// play Gladys' side:
//   gladys.handlers.setValue(...), gladys.actions.finish_sign_in(...)…
// External ids have the real format: ext:<selector>:<type>:<platform id>.
// publishNowPlaying is a plain diff (no position extrapolation, see the SDK's
// own fake in test/music.test.js for that), forgotten when a device is
// created, updated or deleted, as the SDK does.
// -----------------------------------------------------------------------------

import { artworkKey } from '@gladysassistant/integration-sdk';

const STRING_TYPES = ['title', 'artist', 'album', 'artwork'];

export const SELECTOR = 'ext-test-amazon-echo';

export function createFakeGladys({ config = {}, devices = [] } = {}) {
  const listeners = {};
  const gladys = {
    config,
    devices,
    discovered: [],
    published: [],
    connectionStatuses: [],
    widgetRefreshes: [],
    handlers: {},
    actions: {},
    sceneActions: {},
    widgetGets: {},
    widgetActions: {},
    nowPlaying: new Map(),
    artworkUrls: new Map(),

    externalId(suffix) {
      return `ext:${SELECTOR}:${suffix}`;
    },
    externalIds(type, platformId) {
      const device = gladys.externalId(`${type}:${platformId}`);
      return { device, feature: (key) => `${device}:${key}` };
    },

    async getConfig() {
      return gladys.config;
    },
    async publishDiscoveredDevices(list) {
      gladys.discovered = list;
    },
    async publishStates(states) {
      if (states.length > 100) throw new Error('more than 100 states');
      gladys.published.push(...states);
    },
    artworkKey(url) {
      const key = artworkKey(url);
      gladys.artworkUrls.set(key, url);
      return key;
    },
    async publishNowPlaying(deviceExternalId, nowPlaying) {
      const previous = gladys.nowPlaying.get(deviceExternalId) ?? {};
      const values = {};
      for (const [key, value] of Object.entries(nowPlaying)) {
        if (value === undefined) continue;
        if (key === 'artwork_url') values.artwork = value ? gladys.artworkKey(value) : '';
        else if (typeof value === 'boolean') values[key] = value ? 1 : 0;
        else values[key] = value;
      }
      const changed = Object.entries(values).filter(([type, value]) => previous[type] !== value);
      if (changed.length === 0) return { success: true, count: 0 };
      await gladys.publishStates(
        changed.map(([type, value]) => ({
          device_feature_external_id: `${deviceExternalId}:${type}`,
          ...(STRING_TYPES.includes(type) ? { text: value } : { state: value }),
        })),
      );
      gladys.nowPlaying.set(deviceExternalId, { ...previous, ...Object.fromEntries(changed) });
      return { success: true, count: changed.length };
    },
    forgetPublishedStates(externalId) {
      if (externalId === undefined) gladys.nowPlaying.clear();
      else gladys.nowPlaying.delete(externalId);
    },
    async setConnectionStatus(connected, message) {
      gladys.connectionStatuses.push({ connected, message });
    },
    requestWidgetRefresh(key) {
      gladys.widgetRefreshes.push(key);
    },

    /** The last state published for a feature (number, or text). */
    lastState(featureExternalId) {
      const states = gladys.published.filter(
        (s) => s.device_feature_external_id === featureExternalId,
      );
      const last = states.at(-1);
      return last ? (last.text ?? last.state) : undefined;
    },

    on(event, callback) {
      (listeners[event] ??= []).push(callback);
    },
    async emit(event, ...args) {
      for (const callback of listeners[event] ?? []) await callback(...args);
    },
  };
  const register = (name) => (callback) => {
    gladys.handlers[name] = callback;
  };
  gladys.onSetValue = register('setValue');
  gladys.onPoll = register('poll');
  gladys.onScanRequest = register('scanRequest');
  // The SDK forgets the now-playing snapshot before these handlers.
  const forgetting = (name) => (callback) => {
    gladys.handlers[name] = (device, ...rest) => {
      gladys.nowPlaying.delete(device?.external_id);
      return callback(device, ...rest);
    };
  };
  gladys.onDeviceCreated = forgetting('deviceCreated');
  gladys.onDeviceUpdated = forgetting('deviceUpdated');
  gladys.onDeviceDeleted = forgetting('deviceDeleted');
  gladys.onMusicGetArtwork = register('musicGetArtwork');
  gladys.onConfigUpdated = register('configUpdated');
  gladys.onOAuthAuthorizeUrl = register('oauthAuthorizeUrl');
  gladys.onAction = (key, callback) => (gladys.actions[key] = callback);
  gladys.onSceneAction = (key, callback) => (gladys.sceneActions[key] = callback);
  gladys.onWidgetGet = (key, callback) => (gladys.widgetGets[key] = callback);
  gladys.onWidgetAction = (key, callback) => (gladys.widgetActions[key] = callback);
  return gladys;
}
