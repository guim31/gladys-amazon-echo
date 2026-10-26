// -----------------------------------------------------------------------------
// The integration's state and behaviour, independent of the SDK wiring
// (index.js) so the tests drive it with a fake Gladys and a fake Amazon.
//
//   - sign-in: "Connect" (account_link) opens Amazon's page, the "Finish the
//     sign-in" action takes the return address; credentials in /data;
//   - refresh: a timer of the integration (the core's scheduler stops at one
//     minute, and Amazon blocks chatty accounts): the device list every
//     30 minutes, then per refresh one call for every volume, one for every
//     Do Not Disturb, and one per added Echo with a music player. Only the
//     Echos added in Gladys are read, and only the changed states published;
//   - failures: a throttled or unreachable Amazon doubles the interval (up to
//     15 minutes); a refused refresh token stops everything until a sign-in;
//   - logs: nothing at info per refresh; a failure that repeats is written
//     once when it starts and once when it ends (see `problem`), never with a
//     cookie, a token or an account id (AmazonError messages carry none).
// -----------------------------------------------------------------------------

import { MUSIC_PLAYBACK_STATE, createLogger } from '@gladysassistant/integration-sdk';
import { AlexaClient } from './amazon/client.js';
import { AmazonError, createQueue } from './amazon/http.js';
import {
  codeFromReturnAddress,
  deregisterDevice,
  registerDevice,
  startSignIn,
} from './amazon/auth.js';
import {
  announcementNode,
  audioSsml,
  bindRoutine,
  cleanText,
  stopNode,
  talkSequence,
  volumeNode,
} from './amazon/sequences.js';
import { normalizeConfig, refreshIntervalMs } from './config.js';
import {
  FEATURES,
  buildDevice,
  echosOf,
  externalIdsOf,
  featureKeyOf,
  speakersOf,
} from './devices/echo.js';
import { MESSAGES } from './messages.js';
import { REGIONS } from './regions.js';
import { StateTracker, nowPlayingOf, statesOf } from './states.js';
import { UserError } from './i18n.js';

const DEVICE_LIST_MAX_AGE_MS = 30 * 60 * 1000;
const ROUTINES_MAX_AGE_MS = 5 * 60 * 1000;
const SIGN_IN_MAX_AGE_MS = 60 * 60 * 1000;
const MAX_DELAY_MS = 15 * 60 * 1000;
// After a media command, the player is read again once it had time to move,
// and once more later when Amazon is slow (Gladys 5.3 waits 15 s for the
// confirmation of a playback state write).
const PLAYER_SETTLE_MS = 3000;
const PLAYER_LATE_MS = 10_000;
const MAX_STATES_PER_REQUEST = 100;
// Gladys waits 15 s for an artwork; the core refuses one above 300 KB.
const ARTWORK_TIMEOUT_MS = 10_000;
export const MAX_ARTWORK_BYTES = 300 * 1024;
export const PLAYER_WIDGET = 'player';

const MEDIA_COMMANDS = {
  [FEATURES.PLAY]: 'Play',
  [FEATURES.PAUSE]: 'Pause',
  [FEATURES.NEXT]: 'Next',
  [FEATURES.PREVIOUS]: 'Previous',
};

// Writable playback state of Gladys 5.3: 0 pauses, 1 plays (/api/np/command),
// 2 stops (a sequence: the command endpoint has no stop).
const PLAYBACK_COMMANDS = {
  [MUSIC_PLAYBACK_STATE.PAUSED]: 'Pause',
  [MUSIC_PLAYBACK_STATE.PLAYING]: 'Play',
};

export class EchoService {
  constructor({
    gladys,
    store,
    fetchImpl = fetch,
    logger = createLogger({ name: 'amazon-echo' }),
    now = Date.now,
    timers = { set: setTimeout, clear: clearTimeout },
    queue = createQueue(),
  }) {
    this.gladys = gladys;
    this.store = store;
    this.fetchImpl = fetchImpl;
    this.logger = logger;
    this.now = now;
    this.timers = timers;
    this.queue = queue;
    this.config = normalizeConfig();
    this.client = null;
    this.echos = [];
    this.devicesLoadedAt = 0;
    this.readings = new Map();
    this.tracker = new StateTracker();
    this.routines = null;
    this.timer = null;
    this.backoff = 1;
    this.status = null;
    this.refreshing = null;
    // What is failing now, by key (refresh, volumes, player of an Echo…):
    // the kind of the error, so a repeated failure is logged once.
    this.problems = new Map();
  }

  get language() {
    return this.config.language;
  }

  // --- Lifecycle -------------------------------------------------------------

  /** (Re)start from the stored credentials: at every connection to Gladys. */
  async start(config) {
    this.config = normalizeConfig(config);
    // A new connection to Gladys: report the status again, even unchanged.
    this.status = null;
    const credentials = await this.store.readCredentials();
    if (!credentials?.refresh_token) {
      this.client = null;
      await this.setStatus('signed_out');
      return;
    }
    if (!this.client) this.useCredentials(credentials);
    await this.refresh({ devices: true });
    this.schedule();
  }

  stop() {
    if (this.timer) this.timers.clear(this.timer);
    this.timer = null;
  }

  async configUpdated(config) {
    const previous = this.config;
    this.config = normalizeConfig(config);
    // The names of the features follow the language: re-publish them.
    if (previous.language !== this.config.language) await this.publishDiscovered();
    if (previous.refresh_interval !== this.config.refresh_interval) this.schedule();
  }

  useCredentials(credentials) {
    this.client = new AlexaClient(credentials, {
      fetchImpl: this.fetchImpl,
      queue: this.queue,
      now: this.now,
    });
    this.backoff = 1;
  }

  schedule() {
    this.stop();
    if (!this.client) return;
    const delay = Math.min(refreshIntervalMs(this.config) * this.backoff, MAX_DELAY_MS);
    this.timer = this.timers.set(() => {
      this.timer = null;
      this.refresh().finally(() => this.schedule());
    }, delay);
    this.timer?.unref?.();
  }

  async setStatus(key) {
    if (this.status === key) return;
    this.status = key;
    try {
      if (key === 'connected') await this.gladys.setConnectionStatus(true);
      else await this.gladys.setConnectionStatus(false, MESSAGES.status[key]);
    } catch (err) {
      this.logger.warn(`Unable to report the connection status: ${err.message}`);
    }
  }

  // --- Logs of repeated failures -------------------------------------------

  /** Log a failure of `key` once, and again only if its kind changes. */
  problem(key, label, err) {
    const kind = err instanceof AmazonError ? err.kind : 'bug';
    if (this.problems.get(key) === kind) {
      this.logger.debug(`${label} still failing: ${err.message}`);
      return;
    }
    this.problems.set(key, kind);
    if (kind === 'bug') this.logger.error(`${label} failed`, err);
    else this.logger.warn(`${label} failed: ${err.message}`);
  }

  /** `key` works again: say so once, if it was failing. */
  recovered(key, label) {
    if (!this.problems.delete(key)) return;
    this.logger.info(`${label} working again`);
  }

  // --- Refresh ---------------------------------------------------------------

  /** One refresh; concurrent calls share it. Never throws. */
  refresh({ devices = false } = {}) {
    if (!this.refreshing) {
      this.refreshing = this.doRefresh(devices).finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  async doRefresh(devices) {
    if (!this.client) return;
    try {
      if (devices || this.now() - this.devicesLoadedAt > DEVICE_LIST_MAX_AGE_MS) {
        await this.loadDevices();
        await this.publishDiscovered();
      }
      const echos = this.addedEchos();
      const published = await this.readStates(echos);
      this.logger.debug(`Refresh: ${echos.length} Echo(s) read, ${published} state(s) changed`);
      this.backoff = 1;
      this.recovered('refresh', 'Amazon refresh');
      await this.setStatus('connected');
    } catch (err) {
      await this.failed(err);
    }
  }

  async failed(err) {
    this.problem('refresh', 'Amazon refresh', err);
    if (!(err instanceof AmazonError)) return;
    if (err.kind === 'signed_out') {
      this.client = null;
      this.stop();
      await this.setStatus('refused');
    } else if (err.kind === 'throttled') {
      this.backoff = Math.min(this.backoff * 2, 16);
      await this.setStatus('throttled');
    } else {
      this.backoff = Math.min(this.backoff * 2, 8);
      await this.setStatus('unreachable');
    }
  }

  async loadDevices() {
    const raw = await this.client.getDevices();
    let locales;
    try {
      locales = await this.client.getLocales();
      this.recovered('locales', 'Device preferences reading');
    } catch (err) {
      if (err.kind === 'throttled' || err.kind === 'signed_out') throw err;
      this.problem('locales', 'Device preferences reading (default locale used)', err);
      locales = new Map();
    }
    this.echos = echosOf(raw, locales, REGIONS[this.client.domain]);
    this.devicesLoadedAt = this.now();
  }

  async publishDiscovered() {
    if (!this.client) return;
    await this.gladys.publishDiscoveredDevices(
      this.echos.map((echo) => buildDevice(this.gladys, echo, this.language)),
    );
  }

  /** The Echos the user added in Gladys: the only ones worth reading. */
  addedEchos() {
    const added = new Set((this.gladys.devices ?? []).map((device) => device.external_id));
    return this.echos.filter((echo) => added.has(externalIdsOf(this.gladys, echo).device));
  }

  echoByExternalId(externalId) {
    return this.echos.find((echo) => externalIdsOf(this.gladys, echo).device === externalId);
  }

  /**
   * Read and publish the states of `echos`; resolves with the number of
   * states that changed. A failing optional read is skipped.
   */
  async readStates(echos) {
    if (!this.client || echos.length === 0) return 0;
    const speakers = echos.filter((echo) => !echo.isGroup);
    const optional = async (read, key, label) => {
      try {
        const value = await read();
        this.recovered(key, label);
        return value;
      } catch (err) {
        if (!(err instanceof AmazonError) || ['throttled', 'signed_out'].includes(err.kind)) {
          throw err;
        }
        this.problem(key, label, err);
        // Not null: a player read as null is "nothing loaded".
        return undefined;
      }
    };
    const volumes = speakers.length
      ? await optional(() => this.client.getVolumes(), 'volumes', 'Volume reading')
      : null;
    const dnd = speakers.length
      ? await optional(() => this.client.getDoNotDisturb(), 'dnd', 'Do Not Disturb reading')
      : null;
    const states = [];
    const players = [];
    for (const echo of echos) {
      const reading = { ...this.readings.get(echo.serialNumber) };
      if (volumes?.has(echo.serialNumber)) reading.volume = volumes.get(echo.serialNumber).volume;
      if (dnd?.has(echo.serialNumber)) reading.doNotDisturb = dnd.get(echo.serialNumber);
      if (echo.hasPlayer && echo.online) {
        const player = await optional(
          () => this.client.getPlayer(echo),
          `player:${echo.serialNumber}`,
          `Player reading of ${echo.name}`,
        );
        // A failed reading keeps the previous one: one Amazon error must not
        // publish "stopped" and clear the track.
        if (player !== undefined) reading.player = player;
      }
      this.readings.set(echo.serialNumber, reading);
      states.push(...statesOf(this.gladys, echo, reading, this.language));
      players.push([echo, reading]);
    }
    return this.publish(states, players);
  }

  /**
   * Publish what changed; resolves with the number of states sent. The music
   * features (volume, playback state, track) through publishNowPlaying, which
   * diffs them itself; the others (Do Not Disturb, the text "now playing")
   * through the tracker.
   * @param {object[]} states non-music states, publishStates format
   * @param {[object, object][]} players [echo, reading] pairs
   */
  async publish(states, players = []) {
    const changed = this.tracker.changed(states);
    let count = changed.length;
    for (let i = 0; i < changed.length; i += MAX_STATES_PER_REQUEST) {
      const batch = changed.slice(i, i + MAX_STATES_PER_REQUEST);
      await this.gladys.publishStates(batch);
      this.tracker.remember(batch);
    }
    for (const [echo, reading] of players) {
      const values = nowPlayingOf(echo, reading);
      if (!values) continue;
      const result = await this.gladys.publishNowPlaying(
        externalIdsOf(this.gladys, echo).device,
        values,
      );
      count += result?.count ?? 0;
    }
    if (count > 0) this.gladys.requestWidgetRefresh(PLAYER_WIDGET);
    return count;
  }

  /**
   * A device was added in Gladys, or updated (the "Update" of the Discover
   * tab adds the 1.1.0 music features): its states must be sent again, now.
   * The SDK forgot its now-playing snapshot already.
   */
  async deviceCreated(device) {
    this.tracker.forget(device.external_id);
    const echo = this.echoByExternalId(device.external_id);
    if (echo && this.client) {
      try {
        await this.readStates([echo]);
      } catch (err) {
        await this.failed(err);
      }
    }
    this.gladys.requestWidgetRefresh(PLAYER_WIDGET);
  }

  /** Fallback of the core's onPoll (not scheduled: should_poll is false). */
  async poll(device) {
    const echo = this.echoByExternalId(device.external_id);
    if (echo) await this.command(() => this.readStates([echo]));
  }

  // --- Commands --------------------------------------------------------------

  /** Run an Amazon call for the user: its failures become messages they can read. */
  async command(task) {
    if (!this.client) throw new UserError(MESSAGES.errors.not_signed_in, this.language);
    try {
      return await task();
    } catch (err) {
      if (err instanceof UserError || !(err instanceof AmazonError)) throw err;
      this.logger.warn(`Command failed: ${err.message}`);
      if (err.kind === 'signed_out') {
        await this.failed(err);
        throw new UserError(MESSAGES.errors.refused, this.language, err);
      }
      if (err.kind === 'throttled') {
        throw new UserError(MESSAGES.errors.throttled, this.language, err);
      }
      throw new UserError(MESSAGES.errors.amazon_failed, this.language, err);
    }
  }

  async customerId() {
    await this.queue(() => this.client.ensureSession());
    return this.client.customerId;
  }

  async echosOfExternalIds(externalIds) {
    if (!this.client) throw new UserError(MESSAGES.errors.not_signed_in, this.language);
    const list = (Array.isArray(externalIds) ? externalIds : [externalIds]).filter(Boolean);
    if (list.length === 0) throw new UserError(MESSAGES.errors.no_device, this.language);
    if (this.echos.length === 0) await this.command(() => this.loadDevices());
    return list.map((id) => {
      const echo = this.echoByExternalId(id);
      if (!echo) throw new UserError(MESSAGES.errors.unknown_device, this.language);
      return echo;
    });
  }

  /** The speakers behind a list of Echos and groups, each once. */
  speakersOf(echos) {
    const seen = new Map();
    for (const echo of echos) {
      for (const speaker of speakersOf(echo, this.echos)) seen.set(speaker.serialNumber, speaker);
    }
    return [...seen.values()];
  }

  async setValue(device, feature, value) {
    const [echo] = await this.echosOfExternalIds(device.external_id);
    const key = featureKeyOf(feature.external_id);
    await this.command(async () => {
      if (key === FEATURES.VOLUME) {
        const volume = Math.round(Math.min(100, Math.max(0, Number(value))));
        await this.client.runSequence(volumeNode(echo, volume, await this.customerId()));
        this.remember(echo, { volume });
      } else if (MEDIA_COMMANDS[key]) {
        if (!echo.hasPlayer) throw new UserError(MESSAGES.errors.no_player, this.language);
        await this.client.mediaCommand(echo, MEDIA_COMMANDS[key]);
        this.readSoon(echo);
      } else if (key === FEATURES.PLAYBACK_STATE) {
        await this.setPlaybackState(echo, Number(value));
      } else if (key === FEATURES.DO_NOT_DISTURB) {
        await this.client.setDoNotDisturb(echo, Number(value) === 1);
        this.remember(echo, { doNotDisturb: Number(value) === 1 });
      } else if (key === FEATURES.NOTIFICATION) {
        await this.notify(echo, value);
      } else {
        throw new UserError(MESSAGES.errors.unknown_command, this.language);
      }
    });
  }

  /** Pause (0), play (1) or stop (2): the playback state of Gladys 5.3. */
  async setPlaybackState(echo, state) {
    if (!echo.hasPlayer) throw new UserError(MESSAGES.errors.no_player, this.language);
    if (PLAYBACK_COMMANDS[state]) {
      await this.client.mediaCommand(echo, PLAYBACK_COMMANDS[state]);
    } else if (state === MUSIC_PLAYBACK_STATE.IDLE) {
      // A group stops through its speakers, like "Alexa, stop" on them.
      const speakers = this.speakersOf([echo]);
      if (speakers.length === 0) throw new UserError(MESSAGES.errors.unknown_device, this.language);
      await this.client.runSequence(stopNode(speakers, await this.customerId()));
    } else {
      throw new UserError(MESSAGES.errors.unknown_command, this.language);
    }
    // The new state is published when the Echo reports it.
    this.readSoon(echo);
  }

  /** Record a value the Echo now has, and publish it. */
  remember(echo, values) {
    const reading = { ...this.readings.get(echo.serialNumber), ...values };
    this.readings.set(echo.serialNumber, reading);
    return this.publish(statesOf(this.gladys, echo, reading, this.language), [
      [echo, reading],
    ]).catch((err) =>
      this.logger.warn(`Unable to publish the states of ${echo.name}: ${err.message}`),
    );
  }

  /**
   * onMusicGetArtwork: the bytes of an artwork whose URL artworkKey recorded
   * (a public CDN URL from /api/np/player, https only: see artworkUrlOf).
   * Read up to the 300 KB the core accepts, never more.
   */
  async artwork(key) {
    const url = this.gladys.artworkUrls?.get(key);
    if (!url || !/^https:\/\//i.test(url)) throw new Error(`Unknown artwork ${key}`);
    let response;
    try {
      response = await this.fetchImpl(url, { signal: AbortSignal.timeout(ARTWORK_TIMEOUT_MS) });
    } catch (err) {
      throw new Error(`Artwork ${key}: ${err.message}`, { cause: err });
    }
    // A redirection must not lead the container to plain http (a LAN address).
    const redirected = response.url && !/^https:\/\//i.test(response.url);
    if (!response.ok || redirected) {
      await response.body?.cancel().catch(() => {});
      throw new Error(
        `Artwork ${key}: ${redirected ? 'redirected to http' : `HTTP ${response.status}`}`,
      );
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body ?? []) {
      size += chunk.length;
      if (size > MAX_ARTWORK_BYTES) {
        throw new Error(`Artwork ${key}: larger than ${MAX_ARTWORK_BYTES / 1024} KB`);
      }
      chunks.push(chunk);
    }
    if (size === 0) throw new Error(`Artwork ${key}: empty answer`);
    return Buffer.concat(chunks, size).toString('base64');
  }

  /**
   * Read the Echo again after a command: at 3 s, publishing its whole
   * now-playing even unchanged (the snapshot is forgotten), so a playback
   * state write is confirmed or corrected; at 10 s, what changed since.
   */
  readSoon(echo) {
    const read = (forget) => () => {
      if (forget) this.gladys.forgetPublishedStates(externalIdsOf(this.gladys, echo).device);
      this.readStates([echo]).catch((err) => this.failed(err));
    };
    for (const [delay, forget] of [
      [PLAYER_SETTLE_MS, true],
      [PLAYER_LATE_MS, false],
    ]) {
      this.timers.set(read(forget), delay)?.unref?.();
    }
  }

  /**
   * The core's "Play a notification" scene action: the value is the https URL
   * of an MP3 spoken by Gladys Plus (the text itself is not sent, nor the
   * volume). Played as an announcement whose SSML holds the audio file. A
   * plain text, should another caller send one, is announced as such.
   */
  async notify(echo, value) {
    const speakers = this.speakersOf([echo]);
    const text = String(value ?? '').trim();
    let speak;
    if (/^https:\/\/\S+$/i.test(text)) {
      speak = { type: 'ssml', value: audioSsml(text) };
    } else if (text && !/^[a-z]+:\/\//i.test(text)) {
      speak = { type: 'text', value: cleanText(text) };
    } else {
      throw new UserError(MESSAGES.errors.not_a_notification, this.language);
    }
    if (speakers.length === 0) throw new UserError(MESSAGES.errors.unknown_device, this.language);
    const display = speak.type === 'ssml' ? 'Gladys' : speak.value;
    await this.client.runSequence(
      announcementNode(speakers, speak, await this.customerId(), display),
    );
  }

  /** "Make an Echo speak": speech or announcement, optional volume. */
  async talk(externalIds, { text, mode = 'speak', volume } = {}) {
    const echos = await this.echosOfExternalIds(externalIds);
    const clean = cleanText(text);
    if (!clean) throw new UserError(MESSAGES.errors.empty_text, this.language);
    const level = volume === undefined || volume === null || volume === '' ? NaN : Number(volume);
    return this.command(async () => {
      // Groups cannot speak (Alexa Media Player): their speakers do.
      const speakers = this.speakersOf(echos);
      if (speakers.length === 0) throw new UserError(MESSAGES.errors.unknown_device, this.language);
      const previous = new Map(
        speakers.map((s) => [s.serialNumber, this.readings.get(s.serialNumber)?.volume]),
      );
      const sequence = talkSequence(
        speakers,
        { text: clean, mode: mode === 'announce' ? 'announce' : 'speak', volume: level },
        await this.customerId(),
        previous,
      );
      await this.client.runSequence(sequence);
      return speakers;
    });
  }

  async setDoNotDisturb(externalIds, enabled) {
    const echos = await this.echosOfExternalIds(externalIds);
    return this.command(async () => {
      const speakers = this.speakersOf(echos);
      for (const speaker of speakers) {
        await this.client.setDoNotDisturb(speaker, enabled);
        await this.remember(speaker, { doNotDisturb: enabled });
      }
      return speakers;
    });
  }

  // --- Routines --------------------------------------------------------------

  async loadRoutines() {
    if (!this.routines || this.now() - this.routines.at > ROUTINES_MAX_AGE_MS) {
      this.routines = { at: this.now(), list: await this.client.getRoutines() };
    }
    return this.routines.list;
  }

  async routineNames() {
    return this.command(async () => {
      const routines = await this.loadRoutines();
      return [...new Set(routines.map(routineName).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b),
      );
    });
  }

  async runRoutine(name, deviceExternalId) {
    const wanted = normalizeName(name);
    if (!wanted) throw new UserError(MESSAGES.errors.no_routine_name, this.language);
    const [target] = deviceExternalId ? await this.echosOfExternalIds(deviceExternalId) : [null];
    return this.command(async () => {
      const routines = await this.loadRoutines();
      const routine =
        routines.find((r) => normalizeName(r?.name) === wanted) ??
        routines.find((r) => utterancesOf(r).some((u) => normalizeName(u) === wanted));
      if (!routine?.sequence) {
        throw new UserError(MESSAGES.errors.routine_not_found(name), this.language);
      }
      // "This device" in the routine: the chosen Echo (its first speaker for
      // a group), else the first added Echo.
      const fallback = this.addedEchos().find((e) => !e.isGroup && e.online) ?? this.echos[0];
      const device = target ? (this.speakersOf([target])[0] ?? target) : fallback;
      const bound = bindRoutine(routine.sequence, device, await this.customerId());
      await this.client.runSequence(bound.startNode, routine.automationId);
      return routineName(routine);
    });
  }

  // --- Sign-in ---------------------------------------------------------------

  /** URL of Amazon's sign-in page, for the "Connect" button. */
  async signInUrl() {
    const { flow, url } = startSignIn(this.config.region, { now: this.now() });
    await this.store.writeSignIn(flow);
    return url;
  }

  async finishSignIn(address) {
    const flow = await this.store.readSignIn();
    if (!flow?.code_verifier) throw new UserError(MESSAGES.sign_in.no_flow, this.language);
    if (this.now() - flow.started_at > SIGN_IN_MAX_AGE_MS) {
      await this.store.deleteSignIn();
      throw new UserError(MESSAGES.sign_in.expired, this.language);
    }
    const { code, error } = codeFromReturnAddress(address, flow.domain);
    if (error) throw new UserError(MESSAGES.sign_in[error], this.language);
    let credentials;
    try {
      credentials = await registerDevice(this.fetchImpl, flow, code);
    } catch (err) {
      this.logger.warn(`Sign-in failed: ${err.message}`);
      if (err.kind === 'signed_out') throw new UserError(MESSAGES.sign_in.refused, this.language);
      throw new UserError(MESSAGES.status.unreachable, this.language, err);
    }
    await this.store.writeCredentials(credentials);
    await this.store.deleteSignIn();
    this.logger.info(`Signed in to ${credentials.domain}`);
    this.stop();
    this.status = null;
    this.routines = null;
    this.problems.clear();
    this.useCredentials(credentials);
    await this.refresh({ devices: true });
    this.schedule();
    return MESSAGES.sign_in.done(this.echos.length);
  }

  async signOut() {
    const credentials = await this.store.readCredentials();
    this.stop();
    this.client = null;
    if (credentials?.refresh_token) await deregisterDevice(this.fetchImpl, credentials);
    await this.store.deleteCredentials();
    await this.store.deleteSignIn();
    this.echos = [];
    this.readings.clear();
    this.tracker.forget();
    this.routines = null;
    this.problems.clear();
    await this.setStatus('signed_out');
    return MESSAGES.sign_in.signed_out;
  }
}

function normalizeName(name) {
  return String(name ?? '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
}

function utterancesOf(routine) {
  const utterances = [];
  for (const trigger of routine?.triggers ?? []) {
    if (trigger?.type !== 'CustomUtterance') continue;
    const payload = trigger.payload ?? {};
    if (typeof payload.utterance === 'string') utterances.push(payload.utterance);
    if (Array.isArray(payload.utterances)) utterances.push(...payload.utterances);
  }
  return utterances.filter((u) => typeof u === 'string');
}

/** The name a user knows a routine by: its name, else what triggers it. */
export function routineName(routine) {
  const name = typeof routine?.name === 'string' ? routine.name.trim() : '';
  return name || utterancesOf(routine)[0]?.trim() || null;
}
