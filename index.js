// -----------------------------------------------------------------------------
// Entry point of the Amazon Echo integration for Gladys Assistant.
//
// The SDK reads GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN and
// GLADYS_INTEGRATION_SELECTOR from the environment the supervisor injects.
// Everything else lives in src/ (src/app.js registers the handlers).
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { registerHandlers } from './src/app.js';
import { EchoService } from './src/service.js';
import { createStore } from './src/store.js';

const gladys = new GladysIntegration();
const service = new EchoService({ gladys, store: createStore() });

registerHandlers(gladys, service);

gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  service.stop();
});

logger.info('Starting the Amazon Echo integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
