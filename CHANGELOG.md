# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.6] - 2026-10-22

### Changed

- Docs: announcements stay silent on devices with Alexa built in that are not
  Echo (Devialet player of the Freebox Delta); use "Speak" on them (forum
  t/11056/17).

## [1.0.5] - 2026-10-13

### Changed

- Quieter logs: a refresh writes nothing any more at the info level, and a failure that repeats (Amazon unreachable or limiting the requests, a volume, Do Not Disturb or player reading that fails) is logged once when it starts and once when it ends, instead of at every refresh. Set `LOG_LEVEL=debug` to see every refresh.
- Integration SDK 0.15 and up-to-date development tools.
- Checked against Gladys 5.2.0, which only polls the devices created with `should_poll: true` (Gladys#3198): nothing to do on your side, the Echos already refresh through the integration's own timer, including those added with an older version, and a test now guards it.

## [1.0.4] - 2026-10-12

### Fixed

- Every command sent to an Echo (speech, announcement, volume, routine) was refused by Amazon with `HTTP 400`: the sign-in kept the account id (`amzn1.account…`) where the Alexa web API expects the customer id. Each command now names the owner of its Echo, as Alexa Media Player does. Already signed in? Nothing to redo: the right id is read again from Amazon after the update.
- Amazon's reason for a refusal, when it gives one, now appears in the log next to the HTTP code.

## [1.0.3] - 2026-10-12

### Fixed

- **Connect** opened a "page not found" on amazon.fr and the other marketplaces: the sign-in now happens on the Amazon Alexa page of amazon.com (amazon.co.jp for Japan), in the language of your marketplace, as the Alexa app does. The address to paste back now starts with `https://www.amazon.com/ap/maplanding?`. The device registration and sign-out use amazon.com too; the Alexa web API stays on your marketplace.

## [1.0.2] - 2026-10-12

### Changed

- Renamed to **Echo Media Player**, with a new cover (Gladys → Echo → sound) and descriptions that say the direction, so it is not mistaken for the Gladys "Amazon Alexa" integration (voice control of Gladys).

## [1.0.1] - 2026-10-12

### Added

- Amazon Echo integration: one Gladys device per Echo and per multi-room
  group, with volume, Do Not Disturb, play / pause / previous / next, playback
  state, the title playing, and the notification feature of the core's "Play a
  notification" scene action.
- Sign-in to Amazon on Amazon's own page, without a proxy: "Connect", then
  paste the return address in "Finish the sign-in". Twelve marketplaces.
- Scene actions "Make an Echo speak" (speech or announcement, several Echos,
  optional volume restored afterwards), "Run an Alexa routine" and "Echo: Do
  Not Disturb".
- Dashboard widget "Echo player".
- Configuration buttons: list the Alexa routines, test the speech, sign out.
- English, French, German and Spanish texts.

[Unreleased]: https://github.com/guim31/gladys-amazon-echo/compare/v1.0.6...HEAD
[1.0.6]: https://github.com/guim31/gladys-amazon-echo/compare/v1.0.5...v1.0.6
[1.0.5]: https://github.com/guim31/gladys-amazon-echo/compare/v1.0.4...v1.0.5
[1.0.4]: https://github.com/guim31/gladys-amazon-echo/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/guim31/gladys-amazon-echo/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/guim31/gladys-amazon-echo/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/guim31/gladys-amazon-echo/releases/tag/v1.0.1
