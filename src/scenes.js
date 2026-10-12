// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`, SDK 0.14+, Gladys 5.1+).
//
// The fields arrive RESOLVED (scene variables substituted in the text, the
// defaults applied); a `source: "devices"` field holds external ids. Throwing
// fails this action only: the scene logs the message and goes on. No scene
// trigger here: nothing the web API reports is reliable enough to start a
// scene on (see the documentation).
// -----------------------------------------------------------------------------

export const SCENE_ACTIONS = {
  // "Make an Echo speak": several Echos at once, speech or announcement.
  async speak(service, fields) {
    await service.talk(fields.devices, {
      text: fields.text,
      mode: fields.mode,
      volume: fields.volume,
    });
  },

  // "Run an Alexa routine": by name (or by its spoken phrase).
  async run_routine(service, fields) {
    await service.runRoutine(fields.routine, fields.device);
  },

  // "Do Not Disturb": on or off, on several Echos.
  async do_not_disturb(service, fields) {
    await service.setDoNotDisturb(fields.devices, fields.state !== 'off');
  },
};
