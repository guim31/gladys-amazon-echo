// -----------------------------------------------------------------------------
// In-memory stand-in for the Gladys SDK object (the published SDK 0.14.0 has
// no `/testing` export). It records what the integration sends to Gladys and
// the handlers it registers, so a test can play Gladys' side:
//   gladys.handlers.setValue(...), gladys.actions.finish_sign_in(...)…
// External ids have the real format: ext:<selector>:<type>:<platform id>.
// -----------------------------------------------------------------------------

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
  gladys.onDeviceCreated = register('deviceCreated');
  gladys.onDeviceUpdated = register('deviceUpdated');
  gladys.onDeviceDeleted = register('deviceDeleted');
  gladys.onConfigUpdated = register('configUpdated');
  gladys.onOAuthAuthorizeUrl = register('oauthAuthorizeUrl');
  gladys.onAction = (key, callback) => (gladys.actions[key] = callback);
  gladys.onSceneAction = (key, callback) => (gladys.sceneActions[key] = callback);
  gladys.onWidgetGet = (key, callback) => (gladys.widgetGets[key] = callback);
  gladys.onWidgetAction = (key, callback) => (gladys.widgetActions[key] = callback);
  return gladys;
}
