import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  codeFromReturnAddress,
  deregisterDevice,
  deviceId,
  exchangeCookies,
  fetchCsrf,
  registerDevice,
  signInUrl,
  startSignIn,
} from '../src/amazon/auth.js';
import { AmazonError } from '../src/amazon/http.js';
import { REGIONS } from '../src/regions.js';
import { CSRF, createFakeAmazon } from './helpers/fakeAmazon.js';
import { CREDENTIALS } from './helpers/setup.js';

test('a sign-in opens the Alexa sign-in page of amazon.com, with a PKCE challenge', () => {
  const { flow, url } = startSignIn('amazon.fr', { now: 42 });
  assert.equal(flow.domain, 'amazon.fr');
  assert.equal(flow.started_at, 42);
  assert.match(flow.serial, /^[0-9A-F]{32}$/);
  assert.ok(flow.code_verifier.length >= 43);
  const parsed = new URL(url);
  // amazon.fr's own /ap/register and /ap/signin answer "page not found".
  assert.equal(parsed.origin, 'https://www.amazon.com');
  assert.equal(parsed.pathname, '/ap/signin');
  const query = parsed.searchParams;
  assert.equal(query.get('openid.return_to'), 'https://www.amazon.com/ap/maplanding');
  assert.equal(query.get('openid.assoc_handle'), 'amzn_dp_project_dee_ios');
  assert.equal(query.get('pageId'), 'amzn_dp_project_dee_ios');
  assert.equal(query.get('openid.ns.oa2'), 'http://www.amazon.com/ap/ext/oauth/2');
  assert.equal(query.get('openid.mode'), 'checkid_setup');
  assert.equal(query.get('openid.oa2.client_id'), `device:${deviceId(flow.serial)}`);
  assert.equal(query.get('openid.oa2.scope'), 'device_auth_access');
  assert.equal(query.get('openid.oa2.response_type'), 'code');
  assert.equal(query.get('openid.oa2.code_challenge_method'), 'S256');
  const challenge = createHash('sha256').update(flow.code_verifier).digest('base64url');
  assert.equal(query.get('openid.oa2.code_challenge'), challenge);
  assert.equal(query.get('language'), 'fr_FR');
  // Two sign-ins never share their secrets.
  assert.notEqual(startSignIn('amazon.fr').flow.code_verifier, flow.code_verifier);
});

test('every marketplace signs in on amazon.com in its own language, Japan on amazon.co.jp', () => {
  const expected = {
    'amazon.fr': ['amazon.com', 'fr_FR'],
    'amazon.de': ['amazon.com', 'de_DE'],
    'amazon.co.uk': ['amazon.com', 'en_GB'],
    'amazon.com': ['amazon.com', 'en_US'],
    'amazon.es': ['amazon.com', 'es_ES'],
    'amazon.it': ['amazon.com', 'it_IT'],
    'amazon.ca': ['amazon.com', 'en_CA'],
    'amazon.com.au': ['amazon.com', 'en_AU'],
    'amazon.in': ['amazon.com', 'en_IN'],
    'amazon.com.mx': ['amazon.com', 'es_MX'],
    'amazon.com.br': ['amazon.com', 'pt_BR'],
    'amazon.co.jp': ['amazon.co.jp', 'ja_JP'],
  };
  assert.deepEqual(Object.keys(expected).sort(), Object.keys(REGIONS).sort());
  for (const [domain, [base, language]] of Object.entries(expected)) {
    const parsed = new URL(signInUrl({ domain, serial: 'ABC', code_verifier: 'V' }));
    assert.equal(parsed.origin, `https://www.${base}`, domain);
    assert.equal(parsed.pathname, '/ap/signin', domain);
    assert.equal(
      parsed.searchParams.get('openid.return_to'),
      `https://www.${base}/ap/maplanding`,
      domain,
    );
    assert.equal(parsed.searchParams.get('language'), language, domain);
  }
  // alexa-cookie2's handle of a non-.com base: the top-level domain appended.
  const japan = new URL(signInUrl({ domain: 'amazon.co.jp', serial: 'A', code_verifier: 'V' }));
  assert.equal(japan.searchParams.get('openid.assoc_handle'), 'amzn_dp_project_dee_ios_jp');
  assert.equal(japan.searchParams.get('pageId'), 'amzn_dp_project_dee_ios_jp');
  assert.equal(japan.searchParams.get('openid.ns.oa2'), 'http://www.amazon.co.jp/ap/ext/oauth/2');
});

test('the client id is the hex serial plus the suffix of the iOS app', () => {
  assert.equal(deviceId('AB'), '414223413249564c5635564d32573831');
});

test('only the marketplaces of the list are accepted', () => {
  assert.throws(() => startSignIn('evil.example'), AmazonError);
  assert.throws(
    () => signInUrl({ domain: 'amazon.example', serial: 'X', code_verifier: 'Y' }),
    AmazonError,
  );
});

test('the code is read from the return address, and only from it', () => {
  const good =
    'https://www.amazon.com/ap/maplanding?openid.assoc_handle=amzn_dp_project_dee_ios&openid.oa2.authorization_code=ANEXAMPLECODE&openid.mode=id_res';
  // The return address is on amazon.com, whatever the marketplace.
  assert.deepEqual(codeFromReturnAddress(`  ${good}\n`, 'amazon.fr'), { code: 'ANEXAMPLECODE' });
  assert.deepEqual(codeFromReturnAddress(good, 'amazon.de'), { code: 'ANEXAMPLECODE' });
  assert.deepEqual(codeFromReturnAddress('not a url', 'amazon.fr'), { error: 'not_an_address' });
  assert.deepEqual(codeFromReturnAddress('', 'amazon.fr'), { error: 'not_an_address' });
  assert.deepEqual(codeFromReturnAddress('https://www.amazon.com/', 'amazon.fr'), {
    error: 'not_a_return_address',
  });
  assert.deepEqual(codeFromReturnAddress(good.replace('https:', 'http:'), 'amazon.fr'), {
    error: 'not_a_return_address',
  });
  // Another host is refused: the marketplace itself, another site, Japan's base.
  for (const host of ['www.amazon.fr', 'www.amazon.co.jp', 'www.amazon.com.evil.example']) {
    assert.deepEqual(codeFromReturnAddress(good.replace('www.amazon.com', host), 'amazon.fr'), {
      error: 'other_marketplace',
    });
  }
  // Japan comes back on amazon.co.jp, and only there.
  const japan = good.replace('www.amazon.com', 'www.amazon.co.jp');
  assert.deepEqual(codeFromReturnAddress(japan, 'amazon.co.jp'), { code: 'ANEXAMPLECODE' });
  assert.deepEqual(codeFromReturnAddress(good, 'amazon.co.jp'), { error: 'other_marketplace' });
  assert.deepEqual(
    codeFromReturnAddress('https://www.amazon.com/ap/maplanding?openid.mode=id_res', 'amazon.fr'),
    { error: 'no_code' },
  );
});

test('registering the device gives the refresh token and the customer', async () => {
  const amazon = createFakeAmazon();
  const flow = { domain: 'amazon.fr', serial: 'ABC', code_verifier: 'VERIFIER', started_at: 0 };
  const credentials = await registerDevice(amazon.fetch, flow, 'THECODE');
  assert.equal(credentials.refresh_token, 'Atnr|EXAMPLE-REFRESH-TOKEN');
  assert.equal(credentials.customer_id, 'amzn1.account.EXAMPLEUSERID');
  assert.equal(credentials.domain, 'amazon.fr');
  assert.equal(credentials.serial, 'ABC');
  // Only what is needed is kept: no access token, no private key.
  assert.deepEqual(Object.keys(credentials).sort(), [
    'customer_id',
    'domain',
    'refresh_token',
    'registered_at',
    'serial',
  ]);
  const [request] = amazon.calls('POST', '/auth/register');
  // Registered where the sign-in happened (alexa-cookie2's baseAmazonPage).
  assert.equal(request.host, 'api.amazon.com');
  assert.equal(request.headers['x-amzn-identity-auth-domain'], 'api.amazon.com');
  assert.equal(request.body.cookies.domain, '.amazon.com');
  assert.deepEqual(request.body.auth_data, {
    client_id: deviceId('ABC'),
    authorization_code: 'THECODE',
    code_verifier: 'VERIFIER',
    code_algorithm: 'SHA-256',
    client_domain: 'DeviceLegacy',
  });
  assert.equal(request.body.registration_data.device_serial, 'ABC');
  assert.deepEqual(request.body.requested_token_type, ['bearer', 'mac_dms', 'website_cookies']);
  assert.match(request.headers.Cookie, /^frc=[^;]+; map-md=/);
});

test("a refused registration says so without echoing Amazon's answer", async () => {
  const amazon = createFakeAmazon();
  amazon.override('POST /auth/register', () => ({
    status: 400,
    body: { response: { error: { code: 'InvalidValue', message: 'code expired' } } },
  }));
  await assert.rejects(
    registerDevice(amazon.fetch, { domain: 'amazon.fr', serial: 'A', code_verifier: 'B' }, 'C'),
    (err) => err.kind === 'signed_out' && /InvalidValue/.test(err.message),
  );
});

test('cookies are minted from the refresh token, quotes removed', async () => {
  const amazon = createFakeAmazon();
  const jar = await exchangeCookies(amazon.fetch, CREDENTIALS);
  assert.equal(jar.get('at-acbfr'), 'Atza|EXAMPLE-SESSION-COOKIE');
  assert.equal(jar.get('session-id'), '000-0000000-0000000');
  const [request] = amazon.calls('POST', '/ap/exchangetoken/cookies');
  // The cookies of the marketplace, from the marketplace.
  assert.equal(request.host, 'www.amazon.fr');
  assert.equal(request.headers['x-amzn-identity-auth-domain'], 'api.amazon.fr');
  assert.equal(request.body.source_token, CREDENTIALS.refresh_token);
  assert.equal(request.body.source_token_type, 'refresh_token');
  assert.equal(request.body.requested_token_type, 'auth_cookies');
  assert.equal(request.body.domain, '.amazon.fr');
});

test('a refused refresh token means signed out; a throttled exchange does not', async () => {
  const amazon = createFakeAmazon();
  amazon.override('POST /ap/exchangetoken/cookies', () => ({ status: 401, body: {} }));
  await assert.rejects(exchangeCookies(amazon.fetch, CREDENTIALS), { kind: 'signed_out' });
  amazon.override('POST /ap/exchangetoken/cookies', () => ({ status: 429, body: {} }));
  await assert.rejects(exchangeCookies(amazon.fetch, CREDENTIALS), { kind: 'throttled' });
  amazon.override('POST /ap/exchangetoken/cookies', () => ({ body: { response: {} } }));
  await assert.rejects(exchangeCookies(amazon.fetch, CREDENTIALS), { kind: 'http' });
  amazon.override('POST /ap/exchangetoken/cookies', () => new TypeError('fetch failed'));
  await assert.rejects(exchangeCookies(amazon.fetch, CREDENTIALS), { kind: 'network' });
});

test('the csrf comes from the cookie the web API sets, with the session cookies sent', async () => {
  const amazon = createFakeAmazon();
  const jar = await exchangeCookies(amazon.fetch, CREDENTIALS);
  assert.equal(await fetchCsrf(amazon.fetch, 'amazon.fr', jar), CSRF);
  const [probe] = amazon.calls('GET', '/api/language');
  assert.match(probe.headers.Cookie, /at-acbfr=Atza\|EXAMPLE-SESSION-COOKIE/);
  // No csrf anywhere: the session is not accepted.
  const silent = createFakeAmazon();
  silent.override('GET /api/language', () => ({ body: {} }));
  const fresh = await exchangeCookies(silent.fetch, CREDENTIALS);
  await assert.rejects(fetchCsrf(silent.fetch, 'amazon.fr', fresh), { kind: 'session' });
  assert.equal(silent.calls('GET', '/api/strings').length, 1, 'every probe tried');
});

test('signing out deregisters the app device, best effort', async () => {
  const amazon = createFakeAmazon();
  assert.equal(await deregisterDevice(amazon.fetch, CREDENTIALS), true);
  const [token] = amazon.calls('POST', '/auth/token');
  assert.equal(token.host, 'api.amazon.com');
  const [request] = amazon.calls('POST', '/auth/deregister');
  assert.equal(request.host, 'api.amazon.com');
  assert.equal(request.headers.Authorization, 'Bearer Atna|EXAMPLE-ACCESS-TOKEN');
  amazon.override('POST /auth/token', () => ({ status: 400, body: { error: 'invalid_grant' } }));
  assert.equal(await deregisterDevice(amazon.fetch, CREDENTIALS), false);
  // Japan signs out where it signed in.
  const japan = createFakeAmazon({ domain: 'amazon.co.jp' });
  assert.equal(
    await deregisterDevice(japan.fetch, { ...CREDENTIALS, domain: 'amazon.co.jp' }),
    true,
  );
  assert.deepEqual(
    japan.requests.map((r) => r.host),
    ['api.amazon.co.jp', 'api.amazon.co.jp'],
  );
});
