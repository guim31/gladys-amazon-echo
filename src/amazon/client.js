// -----------------------------------------------------------------------------
// Client of the Alexa web API (alexa.amazon.xx), the one the Alexa app and
// the former alexa.amazon.xx website use. Not an official API: Amazon may
// change it without notice. Endpoints and payloads from alexa-remote2 (MIT)
// and alexapy / Alexa Media Player (Apache-2.0).
//
// The session (cookies + csrf) is minted from the stored refresh token and
// kept in memory; it is re-minted once when Amazon refuses it, then the call
// is replayed. A refused refresh token is an AmazonError `signed_out`: the
// user has to sign in again.
// -----------------------------------------------------------------------------

import { AmazonError, createQueue, errorOf, parseJson, send } from './http.js';
import { exchangeCookies, fetchCsrf } from './auth.js';
import { previewBody } from './sequences.js';

// Amazon's own session cookies last longer; re-minting daily keeps them fresh
// without hammering the token endpoint.
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export class AlexaClient {
  /**
   * @param {object} credentials what registerDevice stored ({ domain, refresh_token, customer_id })
   * @param {{ fetchImpl?: typeof fetch, queue?: Function, now?: () => number }} options
   */
  constructor(credentials, { fetchImpl = fetch, queue = createQueue(), now = Date.now } = {}) {
    this.credentials = credentials;
    this.domain = credentials.domain;
    this.base = `https://alexa.${credentials.domain}`;
    this.fetchImpl = fetchImpl;
    this.queue = queue;
    this.now = now;
    this.session = null;
    this.customerId = credentials.customer_id ?? null;
  }

  async ensureSession() {
    if (this.session && this.now() - this.session.created < SESSION_MAX_AGE_MS) {
      return this.session;
    }
    const jar = await exchangeCookies(this.fetchImpl, this.credentials);
    const csrf = await fetchCsrf(this.fetchImpl, this.domain, jar);
    this.session = { jar, csrf, created: this.now() };
    if (!this.customerId) {
      const me = await this.rawRequest('GET', '/api/users/me?platform=ios&version=2.2.556530.0');
      this.customerId = me?.id ?? null;
    }
    return this.session;
  }

  /** One call of the web API, without the retry. */
  async rawRequest(method, path, body, what = path.split('?')[0]) {
    const { jar, csrf } = this.session;
    const response = await send(this.fetchImpl, `${this.base}${path}`, {
      method,
      jar,
      headers: {
        Accept: 'application/json; charset=utf-8',
        'Content-Type': 'application/json; charset=utf-8',
        Referer: `${this.base}/spa/index.html`,
        Origin: this.base,
        csrf,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status < 200 || response.status >= 300) throw errorOf(response, what);
    return parseJson(response.text, what);
  }

  /** A call of the web API, queued, with one replay after a refused session. */
  request(method, path, body) {
    return this.queue(async () => {
      await this.ensureSession();
      try {
        return await this.rawRequest(method, path, body);
      } catch (err) {
        if (!(err instanceof AmazonError) || err.kind !== 'session') throw err;
        this.session = null;
        await this.ensureSession();
        return this.rawRequest(method, path, body);
      }
    });
  }

  /** Every device of the account (Echos, groups, apps, third-party speakers). */
  async getDevices() {
    const answer = await this.request('GET', '/api/devices-v2/device?cached=true');
    return Array.isArray(answer?.devices) ? answer.devices : [];
  }

  /** serial -> locale of the device, as set in the Alexa app. */
  async getLocales() {
    const answer = await this.request('GET', '/api/device-preferences');
    const locales = new Map();
    for (const preference of answer?.devicePreferences ?? []) {
      if (preference?.deviceSerialNumber && typeof preference.locale === 'string') {
        locales.set(preference.deviceSerialNumber, preference.locale);
      }
    }
    return locales;
  }

  /** serial -> { volume, muted } of every device, in one call. */
  async getVolumes() {
    const answer = await this.request(
      'GET',
      '/api/devices/deviceType/dsn/audio/v1/allDeviceVolumes',
    );
    const volumes = new Map();
    for (const entry of answer?.volumes ?? []) {
      if (entry?.dsn && Number.isFinite(entry.speakerVolume)) {
        volumes.set(entry.dsn, { volume: entry.speakerVolume, muted: entry.speakerMuted === true });
      }
    }
    return volumes;
  }

  /** serial -> Do Not Disturb enabled. */
  async getDoNotDisturb() {
    const answer = await this.request('GET', '/api/dnd/device-status-list');
    const states = new Map();
    for (const entry of answer?.doNotDisturbDeviceStatusList ?? []) {
      if (entry?.deviceSerialNumber) states.set(entry.deviceSerialNumber, entry.enabled === true);
    }
    return states;
  }

  /** What the device plays: `playerInfo` of /api/np/player, `null` when idle. */
  async getPlayer(device) {
    const query = new URLSearchParams({
      deviceSerialNumber: device.serialNumber,
      deviceType: device.deviceType,
      screenWidth: '1392',
    });
    const answer = await this.request('GET', `/api/np/player?${query}`);
    return answer?.playerInfo ?? null;
  }

  /** Play, Pause, Next or Previous on the player of the device. */
  async mediaCommand(device, type) {
    const query = new URLSearchParams({
      deviceSerialNumber: device.serialNumber,
      deviceType: device.deviceType,
    });
    await this.request('POST', `/api/np/command?${query}`, {
      contentFocusClientId: null,
      type: `${type}Command`,
    });
  }

  async setDoNotDisturb(device, enabled) {
    await this.request('PUT', '/api/dnd/status', {
      deviceSerialNumber: device.serialNumber,
      deviceType: device.deviceType,
      enabled,
    });
  }

  /** Run a sequence (see sequences.js). */
  async runSequence(startNode, behaviorId) {
    await this.request('POST', '/api/behaviors/preview', previewBody(startNode, behaviorId));
  }

  /** The routines of the account, as the Alexa app lists them. */
  async getRoutines() {
    const answer = await this.request('GET', '/api/behaviors/v2/automations?limit=2000');
    return Array.isArray(answer) ? answer : [];
  }
}
