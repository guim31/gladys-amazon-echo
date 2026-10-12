# Amazon Echo for Gladys Assistant

Make your **Amazon Echo** speakers talk from [Gladys Assistant](https://gladysassistant.com)
scenes, run your **Alexa routines**, and control music, volume and Do Not Disturb.

This is the opposite of the official Alexa integration of Gladys (which lets you control Gladys by
voice): here, Gladys drives the Echos.

> **Unofficial.** Amazon offers no public API for this. The integration uses the web API of the
> Alexa app, the one [alexa-remote2](https://github.com/Apollon77/alexa-remote) (ioBroker, Node-RED)
> and [Alexa Media Player](https://github.com/alandtse/alexa_media_player) (Home Assistant) use. It
> may stop working when Amazon changes it. **This project is not affiliated with, endorsed by or
> sponsored by Amazon.** Amazon, Alexa and Echo are trademarks of Amazon.com, Inc. or its
> affiliates.
>
> **Developed without the hardware: feedback welcome.** The code is tested against answers
> reconstructed from the libraries above, not against a real account. Please report what works and
> what does not in the issues or on the Gladys forum.

## What it does

- **One Gladys device per Echo** (Echo, Echo Dot, Echo Show, Echo Studio, Echo Spot, Alexa-enabled
  third-party speakers) and **per multi-room group**, with:
  - **volume** (0–100) and **Do Not Disturb** (not on groups: Amazon keeps them per speaker);
  - **play, pause, previous, next**, **playback state** and the **title playing** (devices with a
    music player, groups included);
  - **notification**: the core's "Play a notification" scene action targets it.
- **Scene actions**
  - **Make an Echo speak**: a text (scene variables allowed), on one or several Echos, as plain
    **speech** or as an **announcement** with a chime, at an optional volume (the previous volume
    comes back afterwards).
  - **Run an Alexa routine**, by its name or by its spoken phrase, optionally on a chosen Echo (for
    the "device you speak to" steps).
  - **Do Not Disturb** on or off, on one or several Echos.
- **Dashboard widget "Echo player"**: title, artist, state, Do Not Disturb, live volume and
  previous / play-pause / next buttons.
- **Configuration buttons**: finish the sign-in, list the Alexa routines, make an Echo speak (test),
  sign out.

No scene trigger: nothing the web API reports (last voice command, etc.) is reliable enough to start
a scene on.

## Requirements

- Gladys Assistant **5.1.0** or later (scene actions and widgets).
- An Amazon account with at least one Echo, on one of these marketplaces: amazon.fr, .de, .co.uk,
  .com, .es, .it, .ca, .com.au, .in, .com.mx, .com.br, .co.jp.
- A computer with a web browser for the one-time sign-in.
- For the core's "Play a notification" action only: Gladys Plus (the core turns the text into an
  MP3 through it). The integration's own "Make an Echo speak" action does not need it.

## Installation

1. In Gladys, **Integrations → Store**, install **Amazon Echo**.
2. In its **Configuration** tab, choose your **Amazon marketplace** and **save**.
3. Click **Connect**: Amazon's own sign-in page opens in a new tab. Sign in there (password,
   verification code, captcha are all handled by Amazon; Gladys never sees your password).
4. Amazon then shows a page that looks empty or broken: that is expected. Copy its **whole
   address** (it contains `/ap/maplanding`).
5. Within a few minutes, paste it in the **Finish the sign-in** action of the Configuration tab and
   run it. The answer lists how many Echos were found.
6. Add the Echos from the **Discover** tab.

The full step-by-step guide, with troubleshooting, is in [`docs/en.md`](docs/en.md)
([`docs/fr.md`](docs/fr.md) in French).

## How it works

- **Sign-in without a proxy.** The integration registers itself on your account as an "Amazon
  Alexa" app, the way the Alexa iOS app does (OAuth with PKCE, the "paste the return address" flow
  of alexapy). The main container of a Gladys integration cannot publish a port, so serving the
  usual login proxy of alexa-cookie2 would need a sub-container, a published port and a matching
  host name; pasting one address is simpler and never exposes anything on the LAN.
- **Credentials.** Only the **refresh token** of that app registration is kept, in
  `/data/credentials.json` (mode 600), with the marketplace and the customer id. The session
  cookies are minted from it at start-up and once a day, kept in memory, and never logged.
  **Sign out** deletes the file and removes the app registration from your Amazon account (also
  visible in _Manage Your Content and Devices_ on Amazon).
- **Refresh.** A timer of the integration (1, 2, 5 or 10 minutes; 2 by default) reads, for the
  Echos you added in Gladys only: all volumes in one call, all Do Not Disturb states in one call,
  then what each Echo with a music player plays. The device list is read every 30 minutes. Only
  the states that changed are sent to Gladys. When Amazon throttles or cannot be reached, the
  interval doubles (up to 15 minutes) until it answers again.
- **One request at a time.** Every call to Amazon goes through a single queue.

## Limitations

- **Unofficial API**: it can break without notice. Amazon also blocks accounts that call it too
  often: keep the refresh interval reasonable.
- **Not verified on real hardware yet.** In particular:
  - the core's **"Play a notification"** sends the integration the URL of an MP3 spoken by Gladys
    Plus, not the text (and drops the volume). The integration plays it as an announcement whose
    SSML holds an `<audio>` tag; Alexa only plays audio files meeting its format rules (HTTPS,
    MP3, 48 kbps, 22.05/24/16 kHz), and may refuse it. The integration's own **Make an Echo speak**
    action sends the text itself and is the reliable way;
  - restoring the volume after speech relies on the sequence waiting for the speech to end, as
    Alexa routines do.
- **Speech length**: Alexa refuses more than 250 characters per speech step. Longer texts are split
  at sentence boundaries (up to 1,000 characters in total; the rest is cut).
- **Groups** cannot speak by themselves: speech and announcements go to their speakers. A group has
  no volume nor Do Not Disturb feature.
- **No mute**: the web API exposes none.
- **Two quick speeches** in a row may interrupt each other: Amazon plays the latest sequence.
- **Routines** are picked by name in a text field (Gladys lists only devices dynamically): the
  **List my Alexa routines** button shows the exact names.
- **Feature names** follow the _Language_ setting at the moment an Echo is added in Gladys, which
  keeps them afterwards.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
```

The tests never touch the network: [`test/helpers/fakeAmazon.js`](test/helpers/fakeAmazon.js)
answers with the fixtures of [`test/fixtures/amazon/`](test/fixtures/amazon/), anonymised answers
reconstructed from the formats alexa-remote2 and alexapy read (no real capture).
[`test/gladys-rules.test.js`](test/gladys-rules.test.js) checks every discovered device against the
category/type table of the Gladys core, and [`test/i18n.test.js`](test/i18n.test.js) checks the four
languages (English, French, German with "du", Spanish with "usted").

Store admission check, from the repository root:

```bash
npx -y github:GladysAssistant/integration-store .
```

Releases are made by the **Release** workflow (Actions → Release). A hand-pushed `v*` tag triggers
the same multi-arch build and GitHub Release, but bumps nothing: bump `version` in `package.json`
and in `gladys-assistant-integration.json` (with the `docker_image` tag) and commit it **before**
tagging. See [`CLAUDE.md`](CLAUDE.md).

## Credits

- [alexa-remote2](https://github.com/Apollon77/alexa-remote) and
  [alexa-cookie2](https://github.com/Apollon77/alexa-cookie) by Ingo Fischer (Apollon77) and the
  ioBroker community (MIT): endpoints, sequence payloads, device registration and cookie exchange.
- [alexapy](https://gitlab.com/keatontaylor/alexapy) by Keaton Taylor and Alan Tse, and
  [Alexa Media Player](https://github.com/alandtse/alexa_media_player) by Keaton Taylor and Alan D.
  Tse (Apache-2.0): the paste-the-return-address sign-in, the device filtering, groups, routine
  placeholders and throttling behaviour.
- No code is copied verbatim; the flows and payload shapes were re-implemented in JavaScript from
  these projects.

## License

[Apache-2.0](LICENSE)
