import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig, refreshIntervalMs } from '../src/config.js';

test('defaults fill what is missing or invalid', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
  assert.deepEqual(normalizeConfig(null), DEFAULT_CONFIG);
  const config = normalizeConfig({ region: 'evil.example', language: 'it', refresh_interval: '5' });
  assert.equal(config.region, 'amazon.fr');
  assert.equal(config.language, 'en');
  assert.equal(config.refresh_interval, '120');
});

test('valid values are kept; the interval is never under a minute', () => {
  const config = normalizeConfig({ region: 'amazon.de', language: 'de', refresh_interval: 600 });
  assert.equal(config.region, 'amazon.de');
  assert.equal(config.language, 'de');
  assert.equal(refreshIntervalMs(config), 600000);
  assert.equal(refreshIntervalMs(normalizeConfig({ refresh_interval: '30' })), 120000);
});
