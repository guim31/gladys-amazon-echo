# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

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

[Unreleased]: https://github.com/guim31/gladys-amazon-echo/commits/main
