# Changelog

All notable changes are recorded here. Versions follow Semantic Versioning.
The authoritative version is the `version` field in `package.json`.

## [Unreleased]

No unreleased changes recorded.

## [0.1.0-beta.3]

### Changed

- Added pressed and hold-progress feedback for the physical white MODE button.
- Added visible locked-state feedback for physical MODE attempts without changing
  mode or preset selection behavior.
- Clarified green reset guidance across Ready, Get Ready, Running, and Paused.
- Added compact controller connection status.
- Applied the green pointer gesture's state-change guard to match the physical
  button.

## [0.1.0-beta.2]

### Added

- NOGI mode with four presets and a 3:00 / 0:10 entry preset.
- ADV mode with three presets and a 5:00 / 0:15 entry preset.

### Changed

- Renamed the visible Drills mode to GI while retaining the existing internal
  `drills` identifier and its 2:00 / 0:30 default behavior.

## [0.1.0-beta.1]

### Changed

- Promoted the application version to beta for the upcoming gym beta-testing
  release.

## [0.1.0-alpha.1]

### Added

- Rolls and Drills training modes with configurable work/rest presets and an
  indefinite alternating cycle.
- Two-button arcade input with short-press and hold mappings.
- Get Ready countdown before the first work round; it is configurable in the
  non-public `#settings` panel.
- Seven bundled audio cues for round start/end, pause, resume, preset change,
  mode change and reset.
- Responsive TV display with the approved Alliance Manila logo, local clock,
  phase band, countdown, progress bar and equal-width controls.
- Electron desktop wrapper with a Linux x86-64 AppImage packaging command.
- Package-version display in the non-public settings panel.

### Changed

- Initialized project versioning at `0.1.0-alpha.1` from the previously
  unversioned `0.0.0` package metadata.
