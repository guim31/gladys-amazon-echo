// -----------------------------------------------------------------------------
// Amazon marketplaces.
//
// The account lives on one marketplace (amazon.fr, amazon.de…): the cookie
// exchange and the Alexa web API are on that domain. The sign-in page and the
// token endpoints are not: as in alexa-cookie2 (`baseAmazonPage`), they live on
// amazon.com for every marketplace but Japan, which has its own. amazon.fr's
// own /ap/signin answers "page not found" to the Alexa app. The list is closed
// on purpose: the domain is interpolated into every URL that carries the
// authorization code and the refresh token, so a typo must never send them to
// another host.
// -----------------------------------------------------------------------------

// domain -> locale of the speech when the Echo does not report its own.
export const REGIONS = {
  'amazon.fr': 'fr-FR',
  'amazon.de': 'de-DE',
  'amazon.co.uk': 'en-GB',
  'amazon.com': 'en-US',
  'amazon.es': 'es-ES',
  'amazon.it': 'it-IT',
  'amazon.ca': 'en-CA',
  'amazon.com.au': 'en-AU',
  'amazon.in': 'en-IN',
  'amazon.com.mx': 'es-MX',
  'amazon.com.br': 'pt-BR',
  'amazon.co.jp': 'ja-JP',
};

export const DEFAULT_REGION = 'amazon.fr';

export function isRegion(domain) {
  return Object.hasOwn(REGIONS, domain);
}

/** Locale of the sign-in page (`fr_FR`), from the marketplace. */
export function signInLanguage(domain) {
  return (REGIONS[domain] ?? 'en-US').replace('-', '_');
}

/** Domain of the sign-in page and the token endpoints (alexa-cookie2's `baseAmazonPage`). */
export function signInBase(domain) {
  return domain === 'amazon.co.jp' ? 'amazon.co.jp' : 'amazon.com';
}
