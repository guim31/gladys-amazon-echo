// -----------------------------------------------------------------------------
// Sign-in to Amazon, without a proxy and without ever seeing the password.
//
// The flow is the "paste the return address" enrollment of alexapy
// (secureauth.py, Apache-2.0) and the device registration of alexa-cookie2
// (MIT): the same calls the Alexa iOS app makes.
//   1. startSignIn: a fresh device serial and PKCE verifier, and the URL of
//      Amazon's own sign-in page for an "Amazon Alexa" app on that device. The
//      user signs in in their own browser (password, two-step verification,
//      captcha: all on amazon.xx), and lands on /ap/maplanding?…code=…;
//   2. codeFromReturnAddress: the authorization code of that address, pasted
//      back by the user;
//   3. registerDevice: code + verifier -> a refresh token (`Atnr|…`), the one
//      durable secret, stored in /data;
//   4. exchangeCookies + fetchCsrf, at every start and whenever Amazon refuses
//      the session: refresh token -> website cookies of the marketplace ->
//      the `csrf` the Alexa web API wants in a header.
// -----------------------------------------------------------------------------

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AmazonError, CookieJar, errorOf, parseJson, send } from './http.js';
import { isRegion, signInLanguage } from '../regions.js';

const APP_NAME = 'Amazon Alexa';
const APP_VERSION = '2.2.556530.0';
// Hex suffix the iOS app appends to the hex serial to form its client id.
const DEVICE_ID_SUFFIX = '23413249564c5635564d32573831';
// What the web API pages need before they hand out a csrf cookie.
const CSRF_PROBES = [
  '/api/language',
  '/spa/index.html',
  '/api/devices-v2/device?cached=false',
  '/templates/oobe/d-device-pick.handlebars',
  '/api/strings',
];

// Common form fields of the token endpoints, as the iOS app sends them.
const TOKEN_FORM = {
  app_name: APP_NAME,
  app_version: APP_VERSION,
  'di.sdk.version': '6.12.4',
  package_name: 'com.amazon.echo',
  'di.hw.version': 'iPhone',
  platform: 'iOS',
  'di.os.name': 'iOS',
  'di.os.version': '16.6',
  current_version: '6.12.4',
  previous_version: '6.12.4',
};

const base64url = (buffer) => buffer.toString('base64url');

function checkRegion(domain) {
  if (!isRegion(domain)) {
    throw new AmazonError('invalid', `Unsupported Amazon marketplace "${domain}"`);
  }
}

/** The client id of the app "device" registered at sign-in. */
export function deviceId(serial) {
  return Buffer.from(serial, 'utf8').toString('hex') + DEVICE_ID_SUFFIX;
}

/** A new sign-in: what to keep until the return address comes back, and the URL to open. */
export function startSignIn(domain, { now = Date.now() } = {}) {
  checkRegion(domain);
  const flow = {
    domain,
    serial: randomUUID().replaceAll('-', '').toUpperCase(),
    code_verifier: base64url(randomBytes(32)),
    started_at: now,
  };
  return { flow, url: signInUrl(flow) };
}

export function signInUrl({ domain, serial, code_verifier: verifier }) {
  checkRegion(domain);
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  const query = new URLSearchParams({
    'openid.return_to': `https://www.${domain}/ap/maplanding`,
    'openid.assoc_handle': 'amzn_dp_project_dee_ios',
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    pageId: 'amzn_dp_project_dee_ios',
    accountStatusPolicy: 'P1',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.mode': 'checkid_setup',
    'openid.ns.oa2': 'http://www.amazon.com/ap/ext/oauth/2',
    'openid.oa2.client_id': `device:${deviceId(serial)}`,
    'openid.ns.pape': 'http://specs.openid.net/extensions/pape/1.0',
    'openid.oa2.response_type': 'code',
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.pape.max_auth_age': '0',
    'openid.oa2.scope': 'device_auth_access offline_access',
    'openid.oa2.code_challenge_method': 'S256',
    'openid.oa2.code_challenge': challenge,
    language: signInLanguage(domain),
  });
  return `https://www.${domain}/ap/register?${query}`;
}

/**
 * The authorization code of the address the browser landed on. Only an https
 * maplanding address of the marketplace of the sign-in is accepted.
 * Resolves `{ code }`, or `{ error }` with the reason (a key of the messages).
 */
export function codeFromReturnAddress(address, domain) {
  let url;
  try {
    url = new URL(String(address ?? '').trim());
  } catch {
    return { error: 'not_an_address' };
  }
  if (url.protocol !== 'https:' || url.pathname !== '/ap/maplanding') {
    return { error: 'not_a_return_address' };
  }
  if (url.hostname !== `www.${domain}`) return { error: 'other_marketplace' };
  const code = url.searchParams.get('openid.oa2.authorization_code');
  return code ? { code } : { error: 'no_code' };
}

/** Exchange the code for a refresh token: the device is now registered on the account. */
export async function registerDevice(fetchImpl, flow, code) {
  checkRegion(flow.domain);
  const frc = randomBytes(313).toString('base64').replace(/=+$/, '');
  const mapMd = Buffer.from(
    JSON.stringify({
      device_user_dictionary: [],
      device_registration_data: { software_version: '1' },
      app_identifier: { app_version: APP_VERSION, bundle_id: 'com.amazon.echo' },
    }),
  )
    .toString('base64')
    .replace(/=+$/, '');
  const body = {
    requested_extensions: ['device_info', 'customer_info'],
    cookies: { website_cookies: [], domain: `.${flow.domain}` },
    registration_data: {
      domain: 'Device',
      app_version: APP_VERSION,
      device_type: 'A2IVLV5VM2W81',
      device_name: `%FIRST_NAME%'s%DUPE_STRATEGY_1ST%${APP_NAME}`,
      os_version: '16.6',
      device_serial: flow.serial,
      device_model: 'iPhone',
      app_name: APP_NAME,
      software_version: '1',
    },
    auth_data: {
      client_id: deviceId(flow.serial),
      authorization_code: code,
      code_verifier: flow.code_verifier,
      code_algorithm: 'SHA-256',
      client_domain: 'DeviceLegacy',
    },
    user_context_map: { frc },
    requested_token_type: ['bearer', 'mac_dms', 'website_cookies'],
  };
  const response = await send(fetchImpl, `https://api.${flow.domain}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    jar: new CookieJar({ frc, 'map-md': mapMd }),
  });
  const parsed = parseJson(response.text, 'Device registration');
  const success = parsed?.response?.success;
  const refreshToken = success?.tokens?.bearer?.refresh_token;
  if (response.status !== 200 || !refreshToken) {
    // Amazon's error code only (e.g. InvalidValue): no token in it.
    const reason = parsed?.response?.error?.code ?? `HTTP ${response.status}`;
    throw new AmazonError('signed_out', `Device registration refused: ${reason}`, response.status);
  }
  return {
    domain: flow.domain,
    serial: flow.serial,
    refresh_token: refreshToken,
    customer_id: success?.extensions?.customer_info?.user_id ?? null,
    registered_at: new Date().toISOString(),
  };
}

function tokenForm(fields) {
  return new URLSearchParams({ ...TOKEN_FORM, ...fields }).toString();
}

/** Website cookies of the marketplace, minted from the refresh token. */
export async function exchangeCookies(fetchImpl, credentials) {
  checkRegion(credentials.domain);
  const response = await send(
    fetchImpl,
    `https://www.${credentials.domain}/ap/exchangetoken/cookies`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenForm({
        domain: `.${credentials.domain}`,
        source_token: credentials.refresh_token,
        requested_token_type: 'auth_cookies',
        source_token_type: 'refresh_token',
      }),
    },
  );
  const parsed = response.status === 200 ? parseJson(response.text, 'Cookie exchange') : null;
  if (response.status !== 200) {
    // 400/401 on this endpoint: the refresh token is dead (the device was
    // removed from the account, the password changed…). 429/5xx: transient.
    if (response.status === 400 || response.status === 401) {
      throw new AmazonError('signed_out', 'Amazon refused the stored sign-in', response.status);
    }
    throw errorOf(response, 'Cookie exchange');
  }
  const jar = new CookieJar();
  for (const item of parsed?.response?.tokens?.cookies?.[`.${credentials.domain}`] ?? []) {
    if (typeof item?.Name !== 'string' || typeof item?.Value !== 'string') continue;
    jar.set(item.Name, item.Value.replace(/^"(.*)"$/, '$1'));
  }
  if (jar.size === 0) {
    throw new AmazonError('http', `Cookie exchange gave no cookie for .${credentials.domain}`);
  }
  return jar;
}

/** Probe the web API pages until Amazon sets the `csrf` cookie in the jar. */
export async function fetchCsrf(fetchImpl, domain, jar) {
  for (const path of CSRF_PROBES) {
    const response = await send(fetchImpl, `https://alexa.${domain}${path}`, {
      headers: { Accept: 'application/json, text/html' },
      jar,
    });
    if (response.status === 429) throw errorOf(response, 'csrf');
    const csrf = jar.get('csrf');
    if (csrf) return csrf;
  }
  throw new AmazonError('session', 'Amazon gave no csrf token: the session is not accepted');
}

/** A short-lived bearer token, only needed to deregister the device. */
export async function accessToken(fetchImpl, credentials) {
  const response = await send(fetchImpl, `https://api.${credentials.domain}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenForm({
      source_token: credentials.refresh_token,
      requested_token_type: 'access_token',
      source_token_type: 'refresh_token',
    }),
  });
  const token = response.status === 200 ? parseJson(response.text, 'Token')?.access_token : null;
  if (!token) throw errorOf(response, 'Token');
  return token;
}

/** Remove the app device from the Amazon account (best effort, at sign-out). */
export async function deregisterDevice(fetchImpl, credentials) {
  try {
    const token = await accessToken(fetchImpl, credentials);
    const response = await send(fetchImpl, `https://api.${credentials.domain}/auth/deregister`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ requested_deregister_type: 'deregister_device' }),
    });
    return response.status === 200;
  } catch {
    return false;
  }
}
