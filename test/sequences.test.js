import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_TEXT_LENGTH,
  SPEAK_CHUNK_LENGTH,
  announcementNode,
  audioSsml,
  bindRoutine,
  chunkText,
  cleanText,
  previewBody,
  speakNodes,
  talkSequence,
  volumeNode,
} from '../src/amazon/sequences.js';
import { fixture } from './helpers/fakeAmazon.js';

const DOT = { serialNumber: 'DOT', deviceType: 'TYPE_DOT', locale: 'fr-FR' };
const SHOW = { serialNumber: 'SHOW', deviceType: 'TYPE_SHOW', locale: 'fr-FR' };
const CUSTOMER = 'A1EXAMPLECUSTOMER';

test('a text is cleaned and capped on a word boundary', () => {
  assert.equal(cleanText('  Hello \n  world  '), 'Hello world');
  assert.equal(cleanText(undefined), '');
  const long = 'word '.repeat(400);
  const clean = cleanText(long);
  assert.ok(clean.length <= MAX_TEXT_LENGTH);
  assert.ok(clean.endsWith('word'));
});

test('a long text is split into pieces Amazon accepts, at sentence boundaries first', () => {
  const sentence = 'The washing machine has finished its cycle in the laundry room. ';
  const text = cleanText(sentence.repeat(10));
  const chunks = chunkText(text);
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    assert.ok(chunk.length <= SPEAK_CHUNK_LENGTH, `${chunk.length} characters`);
    assert.ok(chunk.endsWith('.'), `"${chunk}" ends mid-sentence`);
  }
  assert.equal(chunks.join(' '), text);
  // A word longer than a piece is cut, nothing is lost.
  const word = 'x'.repeat(600);
  assert.equal(chunkText(word).join(''), word);
  assert.deepEqual(chunkText('Short.'), ['Short.']);
});

test('speech nodes carry the device, its locale and the customer', () => {
  const [node] = speakNodes(DOT, 'Bonjour', CUSTOMER);
  assert.deepEqual(node, {
    '@type': 'com.amazon.alexa.behaviors.model.OpaquePayloadOperationNode',
    type: 'Alexa.Speak',
    skillId: 'amzn1.ask.1p.saysomething',
    operationPayload: {
      deviceType: 'TYPE_DOT',
      deviceSerialNumber: 'DOT',
      locale: 'fr-FR',
      customerId: CUSTOMER,
      textToSpeak: 'Bonjour',
    },
  });
});

test('one announcement targets every device', () => {
  const node = announcementNode([DOT, SHOW], { type: 'text', value: 'Dinner' }, CUSTOMER);
  assert.equal(node.type, 'AlexaAnnouncement');
  assert.equal(node.skillId, 'amzn1.ask.1p.routines.messaging');
  assert.equal(node.operationPayload.expireAfter, 'PT5S');
  assert.deepEqual(node.operationPayload.target, {
    customerId: CUSTOMER,
    devices: [
      { deviceSerialNumber: 'DOT', deviceTypeId: 'TYPE_DOT' },
      { deviceSerialNumber: 'SHOW', deviceTypeId: 'TYPE_SHOW' },
    ],
  });
  assert.deepEqual(node.operationPayload.content[0].speak, { type: 'text', value: 'Dinner' });
  assert.equal(node.operationPayload.content[0].locale, 'fr-FR');
});

test('the volume is clamped and rounded', () => {
  assert.equal(volumeNode(DOT, 140, CUSTOMER).operationPayload.value, 100);
  assert.equal(volumeNode(DOT, -3, CUSTOMER).operationPayload.value, 0);
  assert.equal(volumeNode(DOT, 33.6, CUSTOMER).operationPayload.value, 34);
});

test('an audio file URL is escaped in the SSML', () => {
  assert.equal(
    audioSsml('https://example.com/tts/a/generate.mp3?x=1&y="2"'),
    '<speak><audio src="https://example.com/tts/a/generate.mp3?x=1&amp;y=&quot;2&quot;"/></speak>',
  );
});

test('speaking at a volume sets it, speaks, then restores the previous one', () => {
  const sequence = talkSequence(
    [DOT, SHOW],
    { text: 'Hello', mode: 'speak', volume: 70 },
    CUSTOMER,
    new Map([
      ['DOT', 30],
      ['SHOW', 70],
    ]),
  );
  assert.equal(sequence['@type'], 'com.amazon.alexa.behaviors.model.SerialNode');
  const [volume, speech, restore] = sequence.nodesToExecute;
  assert.equal(volume['@type'], 'com.amazon.alexa.behaviors.model.ParallelNode');
  assert.deepEqual(
    volume.nodesToExecute.map((n) => n.operationPayload.value),
    [70, 70],
  );
  assert.deepEqual(
    speech.nodesToExecute.map((n) => n.operationPayload.deviceSerialNumber),
    ['DOT', 'SHOW'],
  );
  // The Show was already at 70: only the Dot gets its volume back.
  assert.equal(restore.type, 'Alexa.DeviceControls.Volume');
  assert.equal(restore.operationPayload.deviceSerialNumber, 'DOT');
  assert.equal(restore.operationPayload.value, 30);
});

test('an announcement without volume is a single node', () => {
  const node = talkSequence([DOT], { text: 'Hi', mode: 'announce' }, CUSTOMER, new Map());
  assert.equal(node.type, 'AlexaAnnouncement');
});

test('a sequence is sent as a stringified preview', () => {
  const body = previewBody(volumeNode(DOT, 10, CUSTOMER));
  assert.equal(body.behaviorId, 'PREVIEW');
  assert.equal(body.status, 'ENABLED');
  const sequence = JSON.parse(body.sequenceJson);
  assert.equal(sequence['@type'], 'com.amazon.alexa.behaviors.model.Sequence');
  assert.equal(sequence.startNode.type, 'Alexa.DeviceControls.Volume');
});

test('a routine is bound to the chosen device, other values untouched', () => {
  const [routine] = fixture('automations');
  const bound = bindRoutine(routine.sequence, DOT, CUSTOMER);
  const [speak, volume] = bound.startNode.nodesToExecute;
  assert.deepEqual(speak.operationPayload, {
    customerId: CUSTOMER,
    deviceSerialNumber: 'DOT',
    deviceType: 'TYPE_DOT',
    locale: 'fr-FR',
    textToSpeak: 'Sleep well',
  });
  assert.equal(volume.operationPayload.deviceSerialNumber, 'G0EXAMPLESTUDIO1');
  // The fixture itself is not modified.
  assert.equal(
    routine.sequence.startNode.nodesToExecute[0].operationPayload.locale,
    'ALEXA_CURRENT_LOCALE',
  );
});
