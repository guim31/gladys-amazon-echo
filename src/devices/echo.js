// -----------------------------------------------------------------------------
// One Gladys device per Echo, and per multi-room group.
//
// The features follow the `music` category of the core, the one its Music
// widget reads and its "Play a notification" scene action targets:
//   - volume, Do Not Disturb: every Echo (a group has neither: Amazon keeps
//     them per speaker);
//   - play / pause / previous / next, playback state, now playing: devices
//     with a music player (`MUSIC_SKILL`), groups included; since 1.1.0 the
//     Gladys 5.3 player too: title, artist, album, artwork, duration and
//     position, read from /api/np/player, and a writable playback state
//     (pause / play / stop);
//   - notification: every device; the core sends the URL of a spoken MP3.
// Not published, the web API cannot do it: a mute (Echos have none, only a
// volume), a seek (no such command), shuffle and repeat (the commands exist
// but /api/np/player does not report the mode: only the push channel of the
// Alexa app does, which this integration does not use).
//
// Feature keys are FOREVER (they are part of the external ids): never rename
// one. The names are frozen by Gladys when the device is added, in the
// `language` of the configuration at that time.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
  MUSIC_PLAYBACK_STATE,
} from '@gladysassistant/integration-sdk';

// Type of the external ids: ext:<selector>:echo:<serial number>.
export const DEVICE_TYPE = 'echo';

export const FEATURES = {
  VOLUME: 'volume',
  PLAY: 'play',
  PAUSE: 'pause',
  PREVIOUS: 'previous',
  NEXT: 'next',
  PLAYBACK_STATE: 'playback_state',
  NOW_PLAYING: 'now_playing',
  // Gladys 5.3 music player (1.1.0): key = type, the SDK's default
  // external id `${device}:${type}` of publishNowPlaying.
  TITLE: 'title',
  ARTIST: 'artist',
  ALBUM: 'album',
  ARTWORK: 'artwork',
  DURATION: 'duration',
  POSITION: 'position',
  NOTIFICATION: 'notification',
  DO_NOT_DISTURB: 'do_not_disturb',
};

export const NAMES = {
  en: {
    [FEATURES.VOLUME]: 'Volume',
    [FEATURES.PLAY]: 'Play',
    [FEATURES.PAUSE]: 'Pause',
    [FEATURES.PREVIOUS]: 'Previous',
    [FEATURES.NEXT]: 'Next',
    [FEATURES.PLAYBACK_STATE]: 'Playback state',
    [FEATURES.NOW_PLAYING]: 'Now playing',
    [FEATURES.TITLE]: 'Title',
    [FEATURES.ARTIST]: 'Artist',
    [FEATURES.ALBUM]: 'Album',
    [FEATURES.ARTWORK]: 'Artwork',
    [FEATURES.DURATION]: 'Duration',
    [FEATURES.POSITION]: 'Position',
    [FEATURES.NOTIFICATION]: 'Notification',
    [FEATURES.DO_NOT_DISTURB]: 'Do not disturb',
  },
  fr: {
    [FEATURES.VOLUME]: 'Volume',
    [FEATURES.PLAY]: 'Lecture',
    [FEATURES.PAUSE]: 'Pause',
    [FEATURES.PREVIOUS]: 'Précédent',
    [FEATURES.NEXT]: 'Suivant',
    [FEATURES.PLAYBACK_STATE]: 'État de lecture',
    [FEATURES.NOW_PLAYING]: 'En cours de lecture',
    [FEATURES.TITLE]: 'Titre',
    [FEATURES.ARTIST]: 'Artiste',
    [FEATURES.ALBUM]: 'Album',
    [FEATURES.ARTWORK]: 'Pochette',
    [FEATURES.DURATION]: 'Durée',
    [FEATURES.POSITION]: 'Position',
    [FEATURES.NOTIFICATION]: 'Notification',
    [FEATURES.DO_NOT_DISTURB]: 'Ne pas déranger',
  },
  de: {
    [FEATURES.VOLUME]: 'Lautstärke',
    [FEATURES.PLAY]: 'Wiedergabe',
    [FEATURES.PAUSE]: 'Pause',
    [FEATURES.PREVIOUS]: 'Zurück',
    [FEATURES.NEXT]: 'Weiter',
    [FEATURES.PLAYBACK_STATE]: 'Wiedergabestatus',
    [FEATURES.NOW_PLAYING]: 'Läuft gerade',
    [FEATURES.TITLE]: 'Titel',
    [FEATURES.ARTIST]: 'Interpret',
    [FEATURES.ALBUM]: 'Album',
    [FEATURES.ARTWORK]: 'Cover',
    [FEATURES.DURATION]: 'Dauer',
    [FEATURES.POSITION]: 'Position',
    [FEATURES.NOTIFICATION]: 'Benachrichtigung',
    [FEATURES.DO_NOT_DISTURB]: 'Nicht stören',
  },
  es: {
    [FEATURES.VOLUME]: 'Volumen',
    [FEATURES.PLAY]: 'Reproducir',
    [FEATURES.PAUSE]: 'Pausa',
    [FEATURES.PREVIOUS]: 'Anterior',
    [FEATURES.NEXT]: 'Siguiente',
    [FEATURES.PLAYBACK_STATE]: 'Estado de reproducción',
    [FEATURES.NOW_PLAYING]: 'Reproduciendo ahora',
    [FEATURES.TITLE]: 'Título',
    [FEATURES.ARTIST]: 'Artista',
    [FEATURES.ALBUM]: 'Álbum',
    [FEATURES.ARTWORK]: 'Carátula',
    [FEATURES.DURATION]: 'Duración',
    [FEATURES.POSITION]: 'Posición',
    [FEATURES.NOTIFICATION]: 'Notificación',
    [FEATURES.DO_NOT_DISTURB]: 'No molestar',
  },
};

const { MUSIC, TEXT, SWITCH } = DEVICE_FEATURE_CATEGORIES;

// A track longer than a day is not a track: bounds of duration / position.
export const MAX_SECONDS = 86_400;
const SECONDS = { unit: DEVICE_FEATURE_UNITS.SECONDS };
// The Echo confirms the value: the next reading publishes it (Gladys 5.3
// waits for it instead of saving the command).
const FEEDBACK = { has_feedback: true };
const M = DEVICE_FEATURE_TYPES.MUSIC;

// key -> [category, type, read_only, min, max, keep_history, extra fields]
// (the core forces keep_history to false on the whole music category, 5.3)
const SPECS = {
  [FEATURES.VOLUME]: [MUSIC, M.VOLUME, false, 0, 100, false, FEEDBACK],
  [FEATURES.PLAY]: [MUSIC, M.PLAY, false, 0, 1, false],
  [FEATURES.PAUSE]: [MUSIC, M.PAUSE, false, 0, 1, false],
  [FEATURES.PREVIOUS]: [MUSIC, M.PREVIOUS, false, 0, 1, false],
  [FEATURES.NEXT]: [MUSIC, M.NEXT, false, 0, 1, false],
  // Read-only 0/1 up to 1.0.6; writable PAUSED 0 / PLAYING 1 / IDLE 2 since
  // 1.1.0 (the new max makes Gladys offer "Update" in the Discover tab).
  [FEATURES.PLAYBACK_STATE]: [
    MUSIC,
    M.PLAYBACK_STATE,
    false,
    0,
    MUSIC_PLAYBACK_STATE.IDLE,
    false,
    FEEDBACK,
  ],
  // min/max are NOT NULL in the core, text included: 0/0.
  [FEATURES.NOW_PLAYING]: [TEXT, DEVICE_FEATURE_TYPES.TEXT.TEXT, true, 0, 0, false],
  [FEATURES.TITLE]: [MUSIC, M.TITLE, true, 0, 0, false],
  [FEATURES.ARTIST]: [MUSIC, M.ARTIST, true, 0, 0, false],
  [FEATURES.ALBUM]: [MUSIC, M.ALBUM, true, 0, 0, false],
  [FEATURES.ARTWORK]: [MUSIC, M.ARTWORK, true, 0, 0, false],
  [FEATURES.DURATION]: [MUSIC, M.DURATION, true, 0, MAX_SECONDS, false, SECONDS],
  // Read-only: the web API has no seek.
  [FEATURES.POSITION]: [MUSIC, M.POSITION, true, 0, MAX_SECONDS, false, SECONDS],
  [FEATURES.NOTIFICATION]: [MUSIC, M.PLAY_NOTIFICATION, false, 0, 0, false],
  [FEATURES.DO_NOT_DISTURB]: [SWITCH, DEVICE_FEATURE_TYPES.SWITCH.BINARY, false, 0, 1, true],
};

// deviceFamily of a multi-room group ("Whole Home Audio").
const GROUP_FAMILY = 'WHA';
// The Alexa app of a phone: listed by Amazon, but it reads no speech.
const APP_FAMILY = 'VOX';
// An Echo-like device: a speaker Alexa can talk through. Same rule as Alexa
// Media Player: a device declaring capabilities without any of these is an
// accessory (a remote, Echo Buttons, a smart plug sold by Amazon…).
const SPEAKER_CAPABILITIES = ['MUSIC_SKILL', 'TIMERS_AND_ALARMS', 'REMINDERS', 'VOLUME_SETTING'];

/**
 * The Echos of the account, from GET /api/devices-v2/device, in the model the
 * rest of the code uses. Groups list their members (resolved to devices).
 * @param {object[]} rawDevices `devices` of the answer
 * @param {Map<string, string>} locales serial -> locale (device preferences)
 * @param {string} defaultLocale locale of the marketplace
 */
export function echosOf(rawDevices, locales = new Map(), defaultLocale = 'en-US') {
  const echos = [];
  for (const raw of rawDevices ?? []) {
    if (!raw || typeof raw.serialNumber !== 'string' || typeof raw.deviceType !== 'string') {
      continue;
    }
    const capabilities = Array.isArray(raw.capabilities) ? raw.capabilities : [];
    const isGroup = raw.deviceFamily === GROUP_FAMILY;
    const isSpeaker =
      capabilities.length === 0 || capabilities.some((c) => SPEAKER_CAPABILITIES.includes(c));
    if (raw.deviceFamily === APP_FAMILY || (!isGroup && !isSpeaker)) continue;
    echos.push({
      serialNumber: raw.serialNumber,
      deviceType: raw.deviceType,
      family: typeof raw.deviceFamily === 'string' ? raw.deviceFamily : 'UNKNOWN',
      name: (typeof raw.accountName === 'string' && raw.accountName.trim()) || raw.serialNumber,
      online: raw.online !== false,
      isGroup,
      hasPlayer: isGroup || capabilities.includes('MUSIC_SKILL'),
      memberSerials: isGroup && Array.isArray(raw.clusterMembers) ? raw.clusterMembers : [],
      locale: locales.get(raw.serialNumber) ?? defaultLocale,
      // The customer the sequences must name for this device (alexa-remote2).
      ownerCustomerId:
        typeof raw.deviceOwnerCustomerId === 'string' && raw.deviceOwnerCustomerId
          ? raw.deviceOwnerCustomerId
          : null,
    });
  }
  // A group has no locale of its own: take the one of its first member.
  for (const echo of echos.filter((e) => e.isGroup)) {
    const first = echos.find((e) => e.serialNumber === echo.memberSerials[0]);
    if (first && !locales.has(echo.serialNumber)) echo.locale = first.locale;
  }
  return echos;
}

/** The members of a group that are known Echos, or the device itself. */
export function speakersOf(echo, echos) {
  if (!echo.isGroup) return [echo];
  return echo.memberSerials
    .map((serial) => echos.find((e) => e.serialNumber === serial && !e.isGroup))
    .filter(Boolean);
}

/** Feature keys of an Echo, in publication order. */
export function featureKeysOf(echo) {
  const keys = [];
  if (!echo.isGroup) keys.push(FEATURES.VOLUME);
  if (echo.hasPlayer) {
    keys.push(
      FEATURES.PLAY,
      FEATURES.PAUSE,
      FEATURES.PREVIOUS,
      FEATURES.NEXT,
      FEATURES.PLAYBACK_STATE,
      FEATURES.NOW_PLAYING,
      FEATURES.TITLE,
      FEATURES.ARTIST,
      FEATURES.ALBUM,
      FEATURES.ARTWORK,
      FEATURES.DURATION,
      FEATURES.POSITION,
    );
  }
  keys.push(FEATURES.NOTIFICATION);
  if (!echo.isGroup) keys.push(FEATURES.DO_NOT_DISTURB);
  return keys;
}

export function externalIdsOf(gladys, echo) {
  return gladys.externalIds(DEVICE_TYPE, echo.serialNumber);
}

/** The discovery payload of one Echo. */
export function buildDevice(gladys, echo, language = 'en') {
  const ids = externalIdsOf(gladys, echo);
  const names = NAMES[language] ?? NAMES.en;
  return {
    name: echo.name,
    external_id: ids.device,
    // The states are read by the integration's own timer (the user picks the
    // pace, one minute at least): the core's scheduler is not used.
    should_poll: false,
    params: [{ name: 'family', value: echo.family }],
    features: featureKeysOf(echo).map((key) => {
      const [category, type, readOnly, min, max, keepHistory, extra] = SPECS[key];
      return {
        name: names[key],
        external_id: ids.feature(key),
        category,
        type,
        read_only: readOnly,
        has_feedback: false,
        keep_history: keepHistory,
        min,
        max,
        ...extra,
      };
    }),
  };
}

/** The feature key of a feature external id of this integration. */
export function featureKeyOf(featureExternalId) {
  return String(featureExternalId).split(':').pop();
}
