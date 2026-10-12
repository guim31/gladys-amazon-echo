// -----------------------------------------------------------------------------
// Dashboard widget "Echo player" (manifest `widgets`, SDK 0.14+, Gladys 5.1+).
//
// One Echo per widget, picked in its settings: what plays, the live volume
// tile and three buttons (previous, play/pause, next). The core's own Music
// widget offers a volume slider: this one shows the title and the state.
// Budget of the core: 8 components, 2 texts, 1 status, 4 buttons.
//
// The buttons go through widget actions, not `device_feature`: a widget button
// bound to a push feature stays tinted "active" forever (the core keeps the
// last value sent). The current choice shows by the icon, never by the
// `primary` style (invisible in dark mode, Gladys#3153).
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { FEATURES, externalIdsOf } from './devices/echo.js';
import { PLAYER_WIDGET } from './service.js';
import { playbackOf } from './states.js';
import { MESSAGES } from './messages.js';
import { UserError } from './i18n.js';

export { PLAYER_WIDGET };

export const TEXTS = {
  volume: { en: 'Volume', fr: 'Volume', de: 'Lautstärke', es: 'Volumen' },
  title: { en: 'Title', fr: 'Titre', de: 'Titel', es: 'Título' },
  artist: { en: 'Artist', fr: 'Artiste', de: 'Künstler', es: 'Artista' },
  state: { en: 'State', fr: 'État', de: 'Status', es: 'Estado' },
  playing: { en: 'Playing', fr: 'En lecture', de: 'Läuft', es: 'Reproduciendo' },
  paused: { en: 'Paused', fr: 'En pause', de: 'Pausiert', es: 'En pausa' },
  idle: { en: 'Idle', fr: 'Inactif', de: 'Inaktiv', es: 'Inactivo' },
  offline: { en: 'Offline', fr: 'Hors ligne', de: 'Offline', es: 'Sin conexión' },
  dnd: { en: 'Do not disturb', fr: 'Ne pas déranger', de: 'Nicht stören', es: 'No molestar' },
  on: { en: 'On', fr: 'Activé', de: 'An', es: 'Activado' },
  off: { en: 'Off', fr: 'Désactivé', de: 'Aus', es: 'Desactivado' },
  previous: { en: 'Previous', fr: 'Précédent', de: 'Zurück', es: 'Anterior' },
  play: { en: 'Play', fr: 'Lecture', de: 'Wiedergabe', es: 'Reproducir' },
  pause: { en: 'Pause', fr: 'Pause', de: 'Pause', es: 'Pausa' },
  next: { en: 'Next', fr: 'Suivant', de: 'Weiter', es: 'Siguiente' },
  no_device: {
    en: 'Choose an Echo in the settings of this widget.',
    fr: 'Choisissez un Echo dans les réglages de ce widget.',
    de: 'Wähle einen Echo in den Einstellungen dieses Widgets.',
    es: 'Elija un Echo en los ajustes de este widget.',
  },
  signed_out: MESSAGES.errors.not_signed_in,
  unknown: MESSAGES.errors.unknown_device,
};

// Keys of the button actions (unique in a content: the core drops a button
// whose key is taken).
export const WIDGET_ACTIONS = { PREVIOUS: 'previous', PLAY_PAUSE: 'play_pause', NEXT: 'next' };

const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** A content showing only a message. */
function messageContent(text) {
  return { ttl_seconds: 60, components: [{ type: 'text', variant: 'body', text }] };
}

/**
 * The content for one Echo.
 * @param {object | null} view `{ echo, volumeFeature, reading }`, null when unknown
 */
export function playerContent(view) {
  if (!view) return messageContent(TEXTS.unknown);
  const { echo, volumeFeature, reading } = view;
  const playback = playbackOf(reading?.player);
  const components = [{ type: 'text', variant: 'heading', text: clip(echo.name, 40) }];
  if (volumeFeature) {
    components.push({
      type: 'value',
      label: TEXTS.volume,
      icon: 'volume-2',
      device_feature: volumeFeature,
    });
  }
  let state = TEXTS.idle;
  if (!echo.online) state = TEXTS.offline;
  else if (playback.playing) state = TEXTS.playing;
  else if (playback.paused) state = TEXTS.paused;
  const items = [];
  if (echo.hasPlayer) {
    const active = playback.playing || playback.paused;
    items.push({
      label: TEXTS.title,
      icon: 'music',
      value: active && playback.title ? clip(playback.title, 40) : MESSAGES.nothing_playing,
    });
    if (active && playback.artist) {
      items.push({ label: TEXTS.artist, icon: 'user', value: clip(playback.artist, 40) });
    }
  }
  items.push({
    label: TEXTS.state,
    icon: playback.playing ? 'play' : 'pause',
    value: state,
    color: !echo.online
      ? WIDGET_COLORS.DANGER
      : playback.playing
        ? WIDGET_COLORS.SUCCESS
        : WIDGET_COLORS.NEUTRAL,
  });
  if (typeof reading?.doNotDisturb === 'boolean') {
    items.push({
      label: TEXTS.dnd,
      icon: reading.doNotDisturb ? 'bell-off' : 'bell',
      value: reading.doNotDisturb ? TEXTS.on : TEXTS.off,
      color: reading.doNotDisturb ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
    });
  }
  components.push({ type: 'status', items });
  if (echo.hasPlayer && echo.online) {
    components.push(
      {
        type: 'button',
        label: TEXTS.previous,
        icon: 'skip-back',
        style: 'secondary',
        action: { key: WIDGET_ACTIONS.PREVIOUS },
      },
      {
        type: 'button',
        label: playback.playing ? TEXTS.pause : TEXTS.play,
        icon: playback.playing ? 'pause' : 'play',
        style: 'secondary',
        action: { key: WIDGET_ACTIONS.PLAY_PAUSE },
      },
      {
        type: 'button',
        label: TEXTS.next,
        icon: 'skip-forward',
        style: 'secondary',
        action: { key: WIDGET_ACTIONS.NEXT },
      },
    );
  }
  // The live tile follows the states; the rest is nudged by the service on
  // every change (requestWidgetRefresh), the TTL is a safety net.
  return { ttl_seconds: 60, components };
}

/** What the widget of `deviceExternalId` shows, from the service. */
export function viewOf(service, deviceExternalId) {
  const echo = service.echoByExternalId(deviceExternalId);
  if (!echo) return null;
  const ids = externalIdsOf(service.gladys, echo);
  return {
    echo,
    volumeFeature: echo.isGroup ? null : ids.feature(FEATURES.VOLUME),
    reading: service.readings.get(echo.serialNumber) ?? {},
  };
}

export const WIDGETS = {
  [PLAYER_WIDGET]: {
    async get(service, { settings }) {
      if (!settings?.device) return messageContent(TEXTS.no_device);
      if (!service.client) return messageContent(TEXTS.signed_out);
      return playerContent(viewOf(service, settings.device));
    },

    async action(service, { actionKey, settings }) {
      const view = viewOf(service, settings?.device);
      if (!view) throw new UserError(MESSAGES.errors.unknown_device, service.language);
      const playing = playbackOf(view.reading.player).playing;
      const feature = {
        [WIDGET_ACTIONS.PREVIOUS]: FEATURES.PREVIOUS,
        [WIDGET_ACTIONS.NEXT]: FEATURES.NEXT,
        [WIDGET_ACTIONS.PLAY_PAUSE]: playing ? FEATURES.PAUSE : FEATURES.PLAY,
      }[actionKey];
      if (!feature) throw new Error(`Unknown widget action: ${actionKey}`);
      const ids = externalIdsOf(service.gladys, view.echo);
      await service.setValue({ external_id: ids.device }, { external_id: ids.feature(feature) }, 1);
      if (feature === FEATURES.PLAY || feature === FEATURES.PAUSE) {
        // Show the new state at once; the read that follows confirms it.
        const player = {
          ...view.reading.player,
          state: feature === FEATURES.PLAY ? 'PLAYING' : 'PAUSED',
        };
        await service.remember(view.echo, { player });
      }
    },
  },
};
