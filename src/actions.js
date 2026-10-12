// -----------------------------------------------------------------------------
// Manifest actions: the buttons of the Configuration screen. The resolved
// multi-language message is shown under the button, in the user's language.
// -----------------------------------------------------------------------------

import { MESSAGES } from './messages.js';

export const ACTIONS = {
  // Step 2 of the sign-in: the address of the page Amazon showed after it.
  finish_sign_in: (service, fields) => service.finishSignIn(fields.return_address),

  list_routines: async (service) => {
    const names = await service.routineNames();
    if (names.length === 0) return MESSAGES.routines.none;
    return MESSAGES.routines.list(names.map((name) => `• ${name}`).join('\n'));
  },

  test_speak: async (service, fields) => {
    const speakers = await service.talk([fields.device], { text: fields.text, mode: 'speak' });
    return MESSAGES.test_spoken(speakers.map((speaker) => speaker.name).join(', '));
  },

  sign_out: (service) => service.signOut(),
};
