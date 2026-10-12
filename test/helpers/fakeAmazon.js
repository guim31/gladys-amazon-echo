// -----------------------------------------------------------------------------
// A fake Amazon behind a `fetch` function: the sign-in endpoints and the Alexa
// web API, answering with the fixtures of test/fixtures/amazon. Tests never
// touch the network.
//
//   const amazon = createFakeAmazon();
//   amazon.override('POST /api/behaviors/preview', () => ({ status: 429, body: 'Rate exceeded' }));
//   amazon.requests  -> every request: { method, host, path, query, headers, body }
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { signInBase } from '../../src/regions.js';

export function fixture(name) {
  return JSON.parse(
    readFileSync(new URL(`../fixtures/amazon/${name}.json`, import.meta.url), 'utf8'),
  );
}

export const CSRF = '-123456789';

export function createFakeAmazon({ domain = 'amazon.fr', players = {} } = {}) {
  const requests = [];
  const overrides = new Map();
  const state = {
    devices: fixture('devices-v2'),
    players: {
      G0EXAMPLEDOT0001: fixture('np-player-playing'),
      ...players,
    },
  };

  // The token endpoints are on amazon.com (amazon.co.jp for Japan), the rest
  // on the marketplace.
  const base = signInBase(domain);
  const routes = {
    [`POST api.${base} /auth/register`]: () => ({ body: fixture('auth-register') }),
    [`POST api.${base} /auth/token`]: () => ({
      body: { access_token: 'Atna|EXAMPLE-ACCESS-TOKEN', expires_in: 3600 },
    }),
    [`POST api.${base} /auth/deregister`]: () => ({ body: { response: { success: {} } } }),
    [`POST www.${domain} /ap/exchangetoken/cookies`]: () => ({
      body: fixture('exchange-cookies'),
    }),
    [`GET alexa.${domain} /api/language`]: () => ({
      body: { language: 'fr-FR' },
      cookies: [`csrf=${CSRF}; Domain=.${domain}; Path=/; Secure`],
    }),
    [`GET alexa.${domain} /api/users/me`]: () => ({
      body: { id: 'A1EXAMPLECUSTOMER', marketPlaceDomainName: domain },
    }),
    [`GET alexa.${domain} /api/devices-v2/device`]: () => ({ body: state.devices }),
    [`GET alexa.${domain} /api/device-preferences`]: () => ({
      body: fixture('device-preferences'),
    }),
    [`GET alexa.${domain} /api/devices/deviceType/dsn/audio/v1/allDeviceVolumes`]: () => ({
      body: fixture('all-device-volumes'),
    }),
    [`GET alexa.${domain} /api/dnd/device-status-list`]: () => ({
      body: fixture('dnd-device-status-list'),
    }),
    [`GET alexa.${domain} /api/np/player`]: (request) => ({
      body: state.players[request.query.deviceSerialNumber] ?? fixture('np-player-idle'),
    }),
    [`POST alexa.${domain} /api/np/command`]: () => ({ status: 200, text: '' }),
    // As Amazon: a sequence naming another customer than the devices' owner
    // (e.g. the amzn1.account… id) is refused.
    [`POST alexa.${domain} /api/behaviors/preview`]: (request) => {
      const named = [...String(request.body?.sequenceJson).matchAll(/"customerId":"([^"]*)"/g)];
      if (named.some(([, id]) => id !== 'A1EXAMPLECUSTOMER')) {
        return { status: 400, body: { message: 'Bad Request' } };
      }
      return { status: 200, text: '' };
    },
    [`PUT alexa.${domain} /api/dnd/status`]: (request) => ({ body: request.body }),
    [`GET alexa.${domain} /api/behaviors/v2/automations`]: () => ({
      body: fixture('automations'),
    }),
  };

  async function fakeFetch(url, options = {}) {
    const parsed = new URL(url);
    const method = options.method ?? 'GET';
    let body = options.body;
    if (typeof body === 'string' && body.startsWith('{')) body = JSON.parse(body);
    else if (typeof body === 'string') body = Object.fromEntries(new URLSearchParams(body));
    const request = {
      method,
      host: parsed.hostname,
      path: parsed.pathname,
      query: Object.fromEntries(parsed.searchParams),
      headers: options.headers ?? {},
      body,
    };
    requests.push(request);
    const key = `${method} ${parsed.hostname} ${parsed.pathname}`;
    const shortKey = `${method} ${parsed.pathname}`;
    const route = overrides.get(key) ?? overrides.get(shortKey) ?? routes[key];
    if (!route) return new Response('Not found', { status: 404 });
    const answer = await route(request);
    if (answer instanceof Error) throw answer;
    const headers = new Headers({ 'Content-Type': 'application/json' });
    for (const cookie of answer.cookies ?? []) headers.append('Set-Cookie', cookie);
    const text =
      answer.text ?? (typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body));
    return new Response(text, { status: answer.status ?? 200, headers });
  }

  return {
    fetch: fakeFetch,
    requests,
    state,
    /** Replace the answer of `METHOD path` (or `METHOD host path`). */
    override(key, route) {
      overrides.set(key, route);
    },
    reset(key) {
      overrides.delete(key);
    },
    /** The requests of `METHOD path`. */
    calls(method, path) {
      return requests.filter((r) => r.method === method && r.path === path);
    },
  };
}
