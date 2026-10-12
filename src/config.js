// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user from the manifest `config_schema`; fetched with
// `gladys.getConfig()` and pushed again through `gladys.onConfigUpdated()`.
// This module only provides the defaults and normalizes what arrives. The
// Amazon credentials are NOT configuration: they live in /data (src/store.js).
// -----------------------------------------------------------------------------

import { LANGUAGES } from './i18n.js';
import { DEFAULT_REGION, isRegion } from './regions.js';

// How often the states of the Echos are read, in seconds. Amazon blocks
// accounts that call its web API too often: one minute is the floor.
export const REFRESH_INTERVALS = [60, 120, 300, 600];

// MUST stay consistent with the `default` values of the manifest config_schema.
export const DEFAULT_CONFIG = {
  region: DEFAULT_REGION,
  // Language of the feature names published at discovery and of the errors
  // thrown to the core: an integration of type "device" never learns the
  // user's language.
  language: 'en',
  refresh_interval: '120',
};

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const config = raw ?? {};
  const interval = Number(config.refresh_interval);
  return {
    ...DEFAULT_CONFIG,
    ...config,
    region: isRegion(config.region) ? config.region : DEFAULT_CONFIG.region,
    language: LANGUAGES.includes(config.language) ? config.language : DEFAULT_CONFIG.language,
    refresh_interval: REFRESH_INTERVALS.includes(interval)
      ? String(interval)
      : DEFAULT_CONFIG.refresh_interval,
  };
}

/** The refresh interval of a normalized config, in milliseconds. */
export function refreshIntervalMs(config) {
  return Number(config.refresh_interval) * 1000;
}
