// -----------------------------------------------------------------------------
// SDK wiring: every handler is registered here, before connect(). Kept apart
// from index.js so the tests register them on a fake Gladys.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { ACTIONS } from './actions.js';
import { SCENE_ACTIONS } from './scenes.js';
import { WIDGETS } from './widgets.js';

const logger = createLogger({ name: 'amazon-echo' });

/** Register the handlers of the integration on `gladys`, driving `service`. */
export function registerHandlers(gladys, service) {
  gladys.onScanRequest(async () => {
    if (service.client) await service.refresh({ devices: true });
    else await gladys.publishDiscoveredDevices([]);
  });

  gladys.onSetValue((device, feature, value) => service.setValue(device, feature, value));
  gladys.onPoll((device) => service.poll(device));
  gladys.onDeviceCreated((device) => service.deviceCreated(device));
  gladys.onDeviceUpdated((device) => service.deviceCreated(device));
  gladys.onDeviceDeleted(async (device) => service.tracker.forget(device.external_id));
  gladys.onConfigUpdated((config) => service.configUpdated(config));

  // Gladys 5.3 music player: the artwork of what plays ("music": {} in the
  // manifest: no catalog, the web API has none worth the name).
  gladys.onMusicGetArtwork((key) => service.artwork(key));

  // The "Connect" button of the account_link field: Amazon's sign-in page.
  gladys.onOAuthAuthorizeUrl(() => service.signInUrl());

  for (const [key, handler] of Object.entries(ACTIONS)) {
    gladys.onAction(key, (fields) => handler(service, fields ?? {}));
  }
  for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
    gladys.onSceneAction(key, (fields) => handler(service, fields ?? {}));
  }
  for (const [key, widget] of Object.entries(WIDGETS)) {
    gladys.onWidgetGet(key, (request) => widget.get(service, request ?? {}));
    gladys.onWidgetAction(key, (actionKey, params, { settings } = {}) =>
      widget.action(service, { actionKey, params, settings }),
    );
  }

  gladys.on('connected', async () => {
    try {
      await service.start(await gladys.getConfig());
    } catch (err) {
      logger.error('Start failed', err);
    }
  });
  gladys.on('disconnected', () => service.stop());
}
