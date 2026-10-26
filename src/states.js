// -----------------------------------------------------------------------------
// From what Amazon answered to the states Gladys stores. Pure functions.
//
// A reading is what one refresh learned about one Echo:
//   { volume?: number, doNotDisturb?: boolean, player?: playerInfo | null }
// An unknown value (the call failed, the Echo is a group) is left out, and so
// is its state: Gladys keeps the previous one. Music features (volume
// included) go through publishNowPlaying (`nowPlayingOf`), the others
// through publishStates (`statesOf`): one channel per feature.
// -----------------------------------------------------------------------------

import { MUSIC_PLAYBACK_STATE } from '@gladysassistant/integration-sdk';
import { FEATURES, MAX_SECONDS, externalIdsOf, featureKeysOf } from './devices/echo.js';
import { MESSAGES } from './messages.js';
import { localize } from './i18n.js';

// What Gladys can show of a title: the text features stay short.
const MAX_TITLE_LENGTH = 200;

// playerInfo.state -> MUSIC_PLAYBACK_STATE. Anything else (null when nothing
// is loaded, IDLE, STOPPED…) is IDLE.
const PLAYBACK_STATES = {
  PLAYING: MUSIC_PLAYBACK_STATE.PLAYING,
  PAUSED: MUSIC_PLAYBACK_STATE.PAUSED,
  BUFFERING: MUSIC_PLAYBACK_STATE.BUFFERING,
};

const seconds = (value) =>
  Number.isFinite(value) && value >= 0 ? Math.min(Math.round(value), MAX_SECONDS) : null;

/**
 * The URL of the artwork to ask for. Amazon Music answers with a variant
 * (`…/images/I/<id>._UL600_.jpg`, 600 px, ~50 KB), but the bare image is the
 * original, up to 2560 px and ~400 KB: above the 300 KB Gladys accepts. Its
 * CDN resizes on demand (`._SL400_`). Other sources (Spotify: 640 px, ~120 KB)
 * are kept as they are; anything but https is ignored.
 */
export function artworkUrlOf(mainArt) {
  const candidates = [
    mainArt?.url,
    mainArt?.mediumUrl,
    mainArt?.largeUrl,
    mainArt?.fullUrl,
    mainArt?.smallUrl,
  ];
  const url = candidates.find((u) => typeof u === 'string' && /^https:\/\/\S+$/i.test(u));
  if (!url) return null;
  const amazon = /^(https:\/\/m\.media-amazon\.com\/images\/I\/[^/.]+)\.(jpe?g|png)$/i.exec(url);
  return amazon ? `${amazon[1]}._SL400_.${amazon[2]}` : url;
}

/** What plays, from `playerInfo` of /api/np/player. */
export function playbackOf(player) {
  const state = typeof player?.state === 'string' ? player.state : 'IDLE';
  const info = player?.infoText ?? {};
  const clean = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');
  return {
    playing: state === 'PLAYING',
    paused: state === 'PAUSED',
    state: PLAYBACK_STATES[state] ?? MUSIC_PLAYBACK_STATE.IDLE,
    title: clean(info.title),
    artist: clean(info.subText1),
    album: clean(info.subText2),
    artworkUrl: artworkUrlOf(player?.mainArt),
    // Seconds in /api/np/player (milliseconds only in the push messages).
    duration: seconds(player?.progress?.mediaLength),
    position: seconds(player?.progress?.mediaProgress),
    source: clean(player?.provider?.providerName),
    volume: Number.isFinite(player?.volume?.volume) ? player.volume.volume : undefined,
  };
}

/** "Title — Artist", or the localized "Nothing playing" (a text state is never empty). */
export function nowPlayingText(playback, language) {
  if (!playback.title || (!playback.playing && !playback.paused)) {
    return localize(MESSAGES.nothing_playing, language);
  }
  const text = playback.artist ? `${playback.title} — ${playback.artist}` : playback.title;
  return text.length > MAX_TITLE_LENGTH ? `${text.slice(0, MAX_TITLE_LENGTH - 1)}…` : text;
}

/**
 * The Gladys 5.3 "now playing" of one Echo, for publishNowPlaying (which
 * diffs it): volume, and for a player the playback state and the track.
 * Nothing loaded clears the texts and the artwork EXPLICITLY. A live stream
 * (no length) gets duration 0 and no position, and so does a player playing
 * without a track.
 * @returns {object | null} null when there is nothing to publish
 */
export function nowPlayingOf(echo, reading) {
  const keys = new Set(featureKeysOf(echo));
  const playback = reading.player === undefined ? null : playbackOf(reading.player);
  const values = {};
  const volume = reading.volume ?? playback?.volume;
  if (keys.has(FEATURES.VOLUME) && Number.isFinite(volume)) values.volume = volume;
  if (playback && keys.has(FEATURES.PLAYBACK_STATE)) {
    const loaded = playback.state !== MUSIC_PLAYBACK_STATE.IDLE && Boolean(playback.title);
    values.playback_state = playback.state;
    values.title = loaded ? playback.title : '';
    values.artist = loaded ? playback.artist : '';
    values.album = loaded ? playback.album : '';
    values.artwork_url = loaded ? playback.artworkUrl : null;
    values.duration = loaded ? (playback.duration ?? 0) : 0;
    // A player without a track (Bluetooth: PLAYING, no title) has no
    // position: a 0 would be republished at each reading (no duration bounds
    // what Gladys extrapolates).
    if (playback.state === MUSIC_PLAYBACK_STATE.IDLE) values.position = 0;
    else if (loaded && values.duration > 0 && playback.position !== null) {
      values.position = Math.min(playback.position, values.duration);
    }
  }
  return Object.keys(values).length > 0 ? values : null;
}

/**
 * States of one Echo that are not music ones (Do Not Disturb, the text
 * "now playing" of 1.0), in the `publishStates` format.
 * @returns {{ device_feature_external_id: string, state?: number, text?: string }[]}
 */
export function statesOf(gladys, echo, reading, language) {
  const ids = externalIdsOf(gladys, echo);
  const keys = new Set(featureKeysOf(echo));
  const states = [];
  const push = (key, value) => {
    if (keys.has(key)) states.push({ device_feature_external_id: ids.feature(key), ...value });
  };
  if (typeof reading.doNotDisturb === 'boolean') {
    push(FEATURES.DO_NOT_DISTURB, { state: reading.doNotDisturb ? 1 : 0 });
  }
  if (reading.player !== undefined) {
    push(FEATURES.NOW_PLAYING, { text: nowPlayingText(playbackOf(reading.player), language) });
  }
  return states;
}

/**
 * Remembers the last value Gladys accepted for each feature, so a refresh
 * publishes only what changed: the core caps the states at 300 per minute
 * and re-evaluates the scenes on each of them. (The SDK's own
 * publishChangedStates is not in the published 0.14.0.)
 */
export class StateTracker {
  constructor() {
    this.last = new Map();
  }

  changed(states) {
    return states.filter(
      (s) => this.last.get(s.device_feature_external_id) !== (s.text ?? s.state),
    );
  }

  remember(states) {
    for (const s of states) this.last.set(s.device_feature_external_id, s.text ?? s.state);
  }

  /** Forget a device (all its `<device>:<feature>` ids), or everything. */
  forget(deviceExternalId) {
    if (deviceExternalId === undefined) {
      this.last.clear();
      return;
    }
    for (const id of [...this.last.keys()]) {
      if (id.startsWith(`${deviceExternalId}:`)) this.last.delete(id);
    }
  }
}
