// -----------------------------------------------------------------------------
// Builders of the "sequences" the Alexa web API runs: the payload of
// POST /api/behaviors/preview, i.e. a routine made on the fly. Pure functions,
// no I/O: what the Echos receive is fixed by the tests.
//
// Shapes from alexa-remote2 (MIT) and alexapy (Apache-2.0):
//   - Alexa.Speak: the Echo says the text, in its own voice, no chime. Amazon
//     refuses more than 250 characters per node: a longer text is split into
//     several nodes, at sentence then word boundaries;
//   - AlexaAnnouncement: a chime, then the text, on every targeted device at
//     once (one node, a `target.devices` list). Groups are expanded to their
//     members by the caller;
//   - Alexa.DeviceControls.Volume: works whether or not something plays.
// -----------------------------------------------------------------------------

const SEQUENCE = 'com.amazon.alexa.behaviors.model.Sequence';
const SERIAL = 'com.amazon.alexa.behaviors.model.SerialNode';
const PARALLEL = 'com.amazon.alexa.behaviors.model.ParallelNode';
const OPERATION = 'com.amazon.alexa.behaviors.model.OpaquePayloadOperationNode';

export const SPEAK_CHUNK_LENGTH = 250;
// Beyond, the text is cut: a scene that reads a whole page is a mistake, and
// four speech nodes already make a minute of speech.
export const MAX_TEXT_LENGTH = 1000;
const ANNOUNCEMENT_TITLE = 'Gladys';

/** Collapse the spaces, then cut at MAX_TEXT_LENGTH on a word boundary. */
export function cleanText(text) {
  const clean = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length <= MAX_TEXT_LENGTH) return clean;
  const cut = clean.slice(0, MAX_TEXT_LENGTH);
  const space = cut.lastIndexOf(' ');
  return (space > MAX_TEXT_LENGTH / 2 ? cut.slice(0, space) : cut).trim();
}

/** Split a cleaned text into pieces of at most `size` characters. */
export function chunkText(text, size = SPEAK_CHUNK_LENGTH) {
  const chunks = [];
  let rest = text;
  while (rest.length > size) {
    const window = rest.slice(0, size + 1);
    // Prefer the end of a sentence, then a comma, then a space, in the
    // second half of the window; a word longer than the window is cut.
    let at = -1;
    for (const pattern of [/[.!?…](?=\s)/g, /[,;:](?=\s)/g, /\s/g]) {
      for (const match of window.matchAll(pattern)) {
        if (match.index >= size / 2) at = match.index + (pattern.source === '\\s' ? 0 : 1);
      }
      if (at > 0) break;
    }
    if (at <= 0) at = size;
    chunks.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function operation(type, skillId, payload) {
  return { '@type': OPERATION, type, skillId, operationPayload: payload };
}

function deviceFields(device, customerId) {
  return {
    deviceType: device.deviceType,
    deviceSerialNumber: device.serialNumber,
    locale: device.locale,
    customerId,
  };
}

/** Speech nodes for one device (one per chunk of the text). */
export function speakNodes(device, text, customerId) {
  return chunkText(text).map((chunk) =>
    operation('Alexa.Speak', 'amzn1.ask.1p.saysomething', {
      ...deviceFields(device, customerId),
      textToSpeak: chunk,
    }),
  );
}

/**
 * One announcement for every device of `devices` (groups already expanded).
 * `speak` is `{ type: 'text' | 'ssml', value }`.
 */
export function announcementNode(devices, speak, customerId, display = speak.value) {
  return operation('AlexaAnnouncement', 'amzn1.ask.1p.routines.messaging', {
    expireAfter: 'PT5S',
    customerId,
    content: [
      {
        locale: devices[0].locale,
        display: { title: ANNOUNCEMENT_TITLE, body: display },
        speak,
      },
    ],
    target: {
      customerId,
      devices: devices.map((device) => ({
        deviceSerialNumber: device.serialNumber,
        deviceTypeId: device.deviceType,
      })),
    },
  });
}

export function volumeNode(device, volume, customerId) {
  return operation('Alexa.DeviceControls.Volume', 'amzn1.ask.1p.alexadevicecontrols', {
    ...deviceFields(device, customerId),
    value: Math.round(Math.min(100, Math.max(0, volume))),
  });
}

const escapeXml = (text) =>
  text.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char],
  );

/** SSML playing an audio file (the MP3 of the core's notification). */
export function audioSsml(url) {
  return `<speak><audio src="${escapeXml(url)}"/></speak>`;
}

/** A node running `nodes` one after the other (or the node itself, alone). */
export function serial(nodes) {
  return nodes.length === 1 ? nodes[0] : { '@type': SERIAL, name: null, nodesToExecute: nodes };
}

/** A node running `nodes` together (or the node itself, alone). */
export function parallel(nodes) {
  return nodes.length === 1 ? nodes[0] : { '@type': PARALLEL, name: null, nodesToExecute: nodes };
}

/** The body of POST /api/behaviors/preview for a start node. */
export function previewBody(startNode, behaviorId = 'PREVIEW') {
  return {
    behaviorId,
    sequenceJson: JSON.stringify({ '@type': SEQUENCE, startNode }),
    status: 'ENABLED',
  };
}

/**
 * Make an Echo talk: volume first if asked, the speech or the announcement,
 * then the previous volume back when it is known.
 * @param {object[]} devices targets (groups already expanded for an announcement)
 * @param {{ text: string, mode: 'speak' | 'announce', volume?: number }} request
 * @param {Map<string, number>} previousVolumes serial -> volume before speaking
 */
export function talkSequence(devices, { text, mode, volume }, customerId, previousVolumes) {
  const steps = [];
  const withVolume = Number.isFinite(volume);
  if (withVolume) {
    steps.push(parallel(devices.map((device) => volumeNode(device, volume, customerId))));
  }
  if (mode === 'announce') {
    steps.push(announcementNode(devices, { type: 'text', value: text }, customerId));
  } else {
    // One serial branch per device, all devices together.
    steps.push(parallel(devices.map((device) => serial(speakNodes(device, text, customerId)))));
  }
  if (withVolume) {
    const restore = devices
      .filter((device) => Number.isFinite(previousVolumes.get(device.serialNumber)))
      .filter((device) => previousVolumes.get(device.serialNumber) !== Math.round(volume))
      .map((device) => volumeNode(device, previousVolumes.get(device.serialNumber), customerId));
    if (restore.length > 0) steps.push(parallel(restore));
  }
  return serial(steps);
}

const PLACEHOLDERS = {
  ALEXA_CURRENT_DEVICE_TYPE: (device) => device.deviceType,
  ALEXA_CURRENT_DSN: (device) => device.serialNumber,
  ALEXA_CURRENT_LOCALE: (device) => device.locale,
  ALEXA_CUSTOMER_ID: (_device, customerId) => customerId,
};

/** A copy of a routine sequence whose "this device" placeholders target `device`. */
export function bindRoutine(sequence, device, customerId) {
  const walk = (value) => {
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, walk(child)]));
    }
    if (typeof value === 'string' && Object.hasOwn(PLACEHOLDERS, value) && device) {
      return PLACEHOLDERS[value](device, customerId);
    }
    return value;
  };
  return walk(sequence);
}
