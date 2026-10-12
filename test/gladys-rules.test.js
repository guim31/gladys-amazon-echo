// -----------------------------------------------------------------------------
// Conformity with the Gladys core, for EVERY device discovered from realistic
// fixtures (devices-v2 answers reconstructed from alexa-remote2 / alexapy and
// anonymised: Echo Dot, Show, Studio, Spot, a multi-room group, a third-party
// speaker), in every feature language. The table comes from the core code
// (test/fixtures/gladys-feature-table.json). Do not loosen this test: fix the
// integration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setup } from './helpers/setup.js';
import { LANGUAGES } from '../src/i18n.js';

const table = JSON.parse(
  await readFile(new URL('./fixtures/gladys-feature-table.json', import.meta.url), 'utf8'),
);

for (const language of LANGUAGES) {
  const { gladys, service } = await setup({ config: { language } });
  await service.start({ region: 'amazon.fr', language });
  const devices = gladys.discovered;

  test(`the fixtures give Echos, a group and a third-party speaker (${language})`, () => {
    assert.ok(devices.length >= 6, `${devices.length} devices`);
    assert.ok(devices.some((d) => d.params.some((p) => p.value === 'WHA')));
    assert.ok(devices.some((d) => d.params.some((p) => p.value.startsWith('THIRD_PARTY'))));
  });

  for (const device of devices) {
    test(`${device.name} follows the core rules (${language})`, () => {
      assert.equal(typeof device.name, 'string');
      assert.ok(device.name.length > 0);

      // should_poll true if and only if a poll_frequency is given, in ms.
      assert.equal(typeof device.should_poll, 'boolean');
      assert.equal(device.should_poll, device.poll_frequency !== undefined);
      if (device.poll_frequency !== undefined) {
        assert.ok(table.poll_frequencies_ms.includes(device.poll_frequency));
      }

      for (const param of device.params ?? []) {
        assert.equal(typeof param.value, 'string', `param ${param.name}`);
        assert.ok(!param.name.toUpperCase().startsWith('GLADYS_'), 'GLADYS_* params are reserved');
      }

      assert.ok(device.features.length > 0);
      const ids = new Set();
      const names = new Set();
      for (const feature of device.features) {
        const pair = `${feature.category}/${feature.type}`;
        const entry = table.pairs[pair];
        assert.ok(entry, `${pair} is not a couple the core knows`);
        assert.ok(entry.label_en && entry.label_fr && entry.icon, `${pair} has labels and an icon`);

        assert.equal(typeof feature.min, 'number', `${feature.external_id}: min`);
        assert.equal(typeof feature.max, 'number', `${feature.external_id}: max`);
        assert.ok(feature.min <= feature.max, `${feature.external_id}: min <= max`);
        assert.equal(typeof feature.read_only, 'boolean', `${feature.external_id}: read_only`);
        assert.equal(
          typeof feature.has_feedback,
          'boolean',
          `${feature.external_id}: has_feedback`,
        );
        assert.equal(
          typeof feature.keep_history,
          'boolean',
          `${feature.external_id}: keep_history`,
        );
        if (feature.unit !== undefined && feature.unit !== null) {
          assert.ok(table.units.includes(feature.unit), `${feature.external_id}: unit`);
        }

        assert.ok(feature.external_id.startsWith(`${device.external_id}:`));
        assert.ok(!ids.has(feature.external_id), `duplicate ${feature.external_id}`);
        ids.add(feature.external_id);
        assert.ok(feature.name.trim().length > 0, `${feature.external_id}: name`);
        assert.ok(!names.has(feature.name), `duplicate name "${feature.name}"`);
        names.add(feature.name);
      }
    });
  }

  test(`device external ids are unique on the account (${language})`, () => {
    const ids = devices.map((device) => device.external_id);
    assert.equal(new Set(ids).size, ids.length);
  });
}
