// -----------------------------------------------------------------------------
// From what Amazon answered to the states Gladys stores. Pure functions.
//
// A reading is what one refresh learned about one Echo:
//   { volume?: number, doNotDisturb?: boolean, player?: playerInfo | null }
// An unknown value (the call failed, the Echo is a group) is left out, and so
// is its state: Gladys keeps the previous one.
// -----------------------------------------------------------------------------

import { FEATURES, externalIdsOf, featureKeysOf } from './devices/echo.js';
import { MESSAGES } from './messages.js';
import { localize } from './i18n.js';

// What Gladys can show of a title: the text features stay short.
const MAX_TITLE_LENGTH = 200;

/** What plays, from `playerInfo` of /api/np/player. */
export function playbackOf(player) {
  const state = typeof player?.state === 'string' ? player.state : 'IDLE';
  const info = player?.infoText ?? {};
  const clean = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');
  return {
    playing: state === 'PLAYING',
    paused: state === 'PAUSED',
    title: clean(info.title),
    artist: clean(info.subText1),
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
 * States of one Echo, in the `publishStates` format.
 * @returns {{ device_feature_external_id: string, state?: number, text?: string }[]}
 */
export function statesOf(gladys, echo, reading, language) {
  const ids = externalIdsOf(gladys, echo);
  const keys = new Set(featureKeysOf(echo));
  const states = [];
  const push = (key, value) => {
    if (keys.has(key)) states.push({ device_feature_external_id: ids.feature(key), ...value });
  };
  const playback = reading.player === undefined ? null : playbackOf(reading.player);
  const volume = reading.volume ?? playback?.volume;
  if (Number.isFinite(volume)) push(FEATURES.VOLUME, { state: volume });
  if (typeof reading.doNotDisturb === 'boolean') {
    push(FEATURES.DO_NOT_DISTURB, { state: reading.doNotDisturb ? 1 : 0 });
  }
  if (playback) {
    push(FEATURES.PLAYBACK_STATE, { state: playback.playing ? 1 : 0 });
    push(FEATURES.NOW_PLAYING, { text: nowPlayingText(playback, language) });
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
