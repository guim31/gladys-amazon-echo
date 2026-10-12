# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

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

[Unreleased]: https://github.com/guim31/gladys-amazon-echo/compare/v1.0.3...HEAD
[1.0.3]: https://github.com/guim31/gladys-amazon-echo/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/guim31/gladys-amazon-echo/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/guim31/gladys-amazon-echo/releases/tag/v1.0.1
