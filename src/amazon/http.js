// -----------------------------------------------------------------------------
// HTTP plumbing shared by the sign-in and the Alexa web API: native fetch, a
// tiny cookie jar, a request queue and the classification of Amazon's errors.
//
// Amazon blocks accounts that call it too fast, and drops a speech sequence
// that overlaps the previous one: every call of the integration goes through
// ONE queue, one request at a time with a short gap between two.
// -----------------------------------------------------------------------------

// The Alexa iOS app: the web API answers it like the app it was built for.
export const USER_AGENT =
  'AppleWebKit PitanguiBridge/2.2.595606.0-[HARDWARE=iPhone14_7][SOFTWARE=17.4.1][DEVICE=iPhone]';

const TIMEOUT_MS = 15000;
const MIN_GAP_MS = 250;

// Bodies Amazon sends with a 400 or a 429 when it throttles an account.
const THROTTLED = /Rate exceeded|ThrottlingException|Too many requests/i;

/**
 * What went wrong, as the rest of the code needs to know it:
 *   - `session`: the cookies are no longer accepted (re-mint them, retry once);
 *   - `signed_out`: the refresh token itself is refused (sign in again);
 *   - `throttled`: Amazon limits the account (slow down);
 *   - `http`, `network`, `invalid`: anything else.
 * Never carries a cookie, a token or a request body: messages reach the logs.
 */
export class AmazonError extends Error {
  constructor(kind, message, status) {
    super(message);
    this.name = 'AmazonError';
    this.kind = kind;
    this.status = status;
  }
}

/** Cookies by name, as one marketplace domain receives them. */
export class CookieJar {
  constructor(entries = {}) {
    this.cookies = new Map(Object.entries(entries));
  }

  get(name) {
    return this.cookies.get(name);
  }

  set(name, value) {
    this.cookies.set(name, value);
  }

  /** Store the `Set-Cookie` headers of a response (a deleted cookie is dropped). */
  store(headers) {
    const lines = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
    for (const line of lines) {
      const [pair] = line.split(';');
      const index = pair.indexOf('=');
      if (index <= 0) continue;
      const name = pair.slice(0, index).trim();
      let value = pair.slice(index + 1).trim();
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (value === '' || /max-age=0\b/i.test(line)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  header() {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  get size() {
    return this.cookies.size;
  }
}

/** Run the calls one at a time, `gapMs` apart. */
export function createQueue(gapMs = MIN_GAP_MS, sleep = defaultSleep) {
  let tail = Promise.resolve();
  let last = 0;
  return function enqueue(task) {
    const run = tail.then(async () => {
      const wait = last + gapMs - Date.now();
      if (wait > 0) await sleep(wait);
      try {
        return await task();
      } finally {
        last = Date.now();
      }
    });
    // A failed call must not block the ones queued after it.
    tail = run.catch(() => {});
    return run;
  };
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * One HTTP request. Resolves `{ status, headers, text }` for any status, so
 * the caller decides what a 4xx means; rejects with an AmazonError `network`
 * on a transport failure or a timeout.
 */
export async function send(fetchImpl, url, { method = 'GET', headers = {}, body, jar } = {}) {
  const finalHeaders = { 'User-Agent': USER_AGENT, ...headers };
  if (jar && jar.size > 0) finalHeaders.Cookie = jar.header();
  let response;
  try {
    response = await fetchImpl(url, {
      method,
      headers: finalHeaders,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    // The URL is safe to log (no secret in a query string), the error too.
    throw new AmazonError('network', `${method} ${new URL(url).pathname}: ${err.message}`);
  }
  if (jar) jar.store(response.headers);
  const text = await response.text();
  return { status: response.status, headers: response.headers, text };
}

/** Parse a JSON body, `null` when there is none. */
export function parseJson(text, what) {
  if (!text || !text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new AmazonError('invalid', `${what}: the answer is not JSON`);
  }
}

/** The error matching a failed Alexa web API response. */
export function errorOf(response, what) {
  const { status, text } = response;
  if (status === 429 || ((status === 400 || status === 503) && THROTTLED.test(text))) {
    return new AmazonError('throttled', `${what}: Amazon is limiting the requests`, status);
  }
  if (status === 401 || status === 403) {
    return new AmazonError('session', `${what}: session refused (HTTP ${status})`, status);
  }
  // A redirect of the web API means a sign-in page: the session is gone.
  if (status >= 300 && status < 400) {
    return new AmazonError('session', `${what}: redirected to a sign-in page`, status);
  }
  return new AmazonError('http', `${what}: HTTP ${status}${reasonOf(text)}`, status);
}

/**
 * Amazon's short reason of a refusal (`message` of a JSON answer), for the
 * logs: a bare "HTTP 400" says nothing. Only that field, cut and on one line;
 * the rest of the answer may echo the request.
 */
function reasonOf(text) {
  let message;
  try {
    message = JSON.parse(text)?.message;
  } catch {
    return '';
  }
  if (typeof message !== 'string' || !message.trim()) return '';
  return ` (${message.replace(/\s+/g, ' ').trim().slice(0, 120)})`;
}
