// -----------------------------------------------------------------------------
// Amazon marketplaces.
//
// The account lives on one marketplace (amazon.fr, amazon.de…): the sign-in
// page, the token endpoints and the Alexa web API are all on that domain. The
// list is closed on purpose: the domain is interpolated into every URL that
// carries the authorization code and the refresh token, so a typo must never
// send them to another host.
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
