import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { SERIALS, idsOf, setup } from './helpers/setup.js';
import { TEXTS, WIDGET_ACTIONS, playerContent } from '../src/widgets.js';
import { MESSAGES } from '../src/messages.js';
import { buildDevice } from '../src/devices/echo.js';

const ADDED = [SERIALS.DOT, SERIALS.SHOW, SERIALS.GROUP, SERIALS.SPOT, SERIALS.STUDIO];

async function started() {
  const context = await setup({ added: ADDED });
  await context.gladys.emit('connected');
  return context;
}

const get = (gladys, settings) =>
  gladys.widgetGets.player({ settings, language: 'en', units: 'metric' });

test('the player shows what plays, the live volume and the three buttons', async () => {
  const { gladys, service } = await started();
  const dot = idsOf(gladys, SERIALS.DOT);
  const content = await get(gladys, { device: dot.device });
  assert.deepEqual(validateWidgetContent(content), []);
  const tile = content.components.find((c) => c.type === 'value');
  // The live tile is bound to a feature the device really publishes.
  const device = buildDevice(gladys, service.echoByExternalId(dot.device));
  assert.ok(device.features.some((f) => f.external_id === tile.device_feature));
  const status = content.components.find((c) => c.type === 'status');
  assert.deepEqual(status.items[0].value, 'Example Song');
  assert.deepEqual(status.items[1].value, 'Example Artist');
  assert.deepEqual(status.items[2].value, TEXTS.playing);
  assert.deepEqual(status.items[3].value, TEXTS.off);
  const buttons = content.components.filter((c) => c.type === 'button');
  assert.deepEqual(
    buttons.map((b) => b.action.key),
    [WIDGET_ACTIONS.PREVIOUS, WIDGET_ACTIONS.PLAY_PAUSE, WIDGET_ACTIONS.NEXT],
  );
  assert.deepEqual(buttons[1].label, TEXTS.pause);
  assert.ok(buttons.every((b) => b.style !== 'primary'));
});

test('a group, an Echo without player, an offline Echo, an unknown one', async () => {
  const { gladys } = await started();
  const group = await get(gladys, { device: idsOf(gladys, SERIALS.GROUP).device });
  assert.ok(!group.components.some((c) => c.type === 'value'), 'a group has no volume');
  const spot = await get(gladys, { device: idsOf(gladys, SERIALS.SPOT).device });
  assert.ok(!spot.components.some((c) => c.type === 'button'));
  const studio = await get(gladys, { device: idsOf(gladys, SERIALS.STUDIO).device });
  assert.deepEqual(
    studio.components.find((c) => c.type === 'status').items.at(-1).value,
    TEXTS.offline,
  );
  assert.ok(!studio.components.some((c) => c.type === 'button'));
  const unknown = await get(gladys, { device: 'ext:x:echo:GONE' });
  assert.deepEqual(unknown.components[0].text, TEXTS.unknown);
  const none = await get(gladys, {});
  assert.deepEqual(none.components[0].text, TEXTS.no_device);
  for (const content of [group, spot, studio, unknown, none]) {
    assert.deepEqual(validateWidgetContent(content), []);
  }
});

test('signed out, the widget says so', async () => {
  const { gladys } = await setup({ signedIn: false });
  const content = await get(gladys, { device: 'ext:x:echo:A' });
  assert.deepEqual(content.components[0].text, MESSAGES.errors.not_signed_in);
});

test('the buttons drive the player of the Echo', async () => {
  const { gladys, amazon } = await started();
  const settings = { device: idsOf(gladys, SERIALS.DOT).device };
  await gladys.widgetActions.player(WIDGET_ACTIONS.PLAY_PAUSE, {}, { settings });
  await gladys.widgetActions.player(WIDGET_ACTIONS.PLAY_PAUSE, {}, { settings });
  await gladys.widgetActions.player(WIDGET_ACTIONS.NEXT, {}, { settings });
  assert.deepEqual(
    amazon.calls('POST', '/api/np/command').map((r) => r.body.type),
    ['PauseCommand', 'PlayCommand', 'NextCommand'],
  );
  await assert.rejects(gladys.widgetActions.player('nope', {}, { settings }));
  await assert.rejects(gladys.widgetActions.player(WIDGET_ACTIONS.NEXT, {}, { settings: {} }), {
    message: MESSAGES.errors.unknown_device.en,
  });
});

test('long titles are cut to what a status row holds', () => {
  const echo = { name: 'N'.repeat(60), online: true, hasPlayer: true, isGroup: false };
  const reading = {
    player: { state: 'PAUSED', infoText: { title: 'T'.repeat(80), subText1: 'A'.repeat(80) } },
    doNotDisturb: true,
  };
  const content = playerContent({ echo, volumeFeature: 'ext:x:echo:A:volume', reading });
  assert.deepEqual(validateWidgetContent(content), []);
});
