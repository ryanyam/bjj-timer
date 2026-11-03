# Desktop / offline deployment

The browser development workflow is unchanged: `npm run dev`.

## Commands

```sh
npm install
npm run dev                  # browser development (Vite)
npm run desktop:dev          # Vite + Electron, windowed, on port 5173
npm run desktop:preview      # build and run the bundled app in a window
npm run desktop:build        # build and create the Linux x86-64 AppImage
```

`npm run desktop:build` produces:

```text
release/BJJ-Timer-<version>-x86_64.AppImage
```

The Electron main process is `electron/main.cjs`. Production loads the bundled
`dist/` through a local `app://bjj-timer` protocol; it needs no Vite server,
Nginx, internet connection, or separate browser.

## Linux host prerequisites

- x86-64 Linux.
- AppImage execution; on distributions that do not include FUSE, install the
  distribution's FUSE 2 compatibility package (for example `libfuse2` on
  Ubuntu 22.04+).
- No Electron or Node.js installation is required to run the AppImage.

Copy the AppImage to the Chromebox by USB, then:

```sh
chmod +x BJJ-Timer-<version>-x86_64.AppImage
./BJJ-Timer-<version>-x86_64.AppImage
```

The packaged app launches fullscreen in kiosk mode by default.

## Kiosk and maintenance

- Maintenance exit: **Ctrl+Shift+Q** (Cmd+Shift+Q on macOS).
- Windowed preview: `npm run desktop:preview` or
  `BJJ_TIMER_WINDOWED=1 ./BJJ-Timer-<version>-x86_64.AppImage`.
- Windowed Electron development: `npm run desktop:dev`.
- The normal Electron window is 1920×1080 when windowed. The kiosk window uses
  the full display; the responsive interface supports the gym display's
  1920×1080 layout.

The app never opens external windows, and production blocks HTTP/HTTPS
requests. The renderer runs with `contextIsolation: true`,
`nodeIntegration: false`, and `sandbox: true`; no preload API is exposed.

## Local assets and settings

All fonts, images, icons, and timer sounds are bundled in `dist/` and `build/`:
Inter, the Alliance logo, the favicon/icons, and the seven WAV cues in
`public/sounds/`. There are no remote runtime dependencies.

Electron stores its profile under:

```text
~/.config/bjj-timer/
```

The timer's local settings (Get Ready durations and audio master volume/mute)
use `localStorage`, which lives inside that profile and survives replacing the
AppImage as long as the profile is kept. The Get Ready controls are available in
the app's non-public `#settings` view. Audio settings are stored in
`bjj-timer.audio-settings`; the non-public settings module is the entry point.

**Browser migration:** a browser's `localStorage` is a different origin from the
Electron `app://bjj-timer` profile and is not imported automatically. Re-enter
the Get Ready and audio settings in the desktop app after the first migration.
Keeping the profile directory preserves them for later AppImage replacements.

## Manual acceptance checks

1. Disconnect networking and launch the AppImage; confirm the timer opens with
   no server or browser.
2. At 1920×1080, confirm the Ready screen, all controls, and the GET READY
   countdown fit without scrolling or clipping.
3. Check START/PAUSE/RESUME, reset hold, preset short press, mode hold, and
   B0/B1 arcade-button mappings.
4. Confirm all seven sounds play at their mapped events and Get Ready is silent
   except the round-start cue at zero.
5. Kill and relaunch the AppImage; confirm Get Ready and audio settings persist.
6. Press Ctrl+Shift+Q to leave kiosk mode, then relaunch.

## Build limitation

The current development host is macOS arm64. A Linux x86-64 AppImage cannot be
fully built or launched here without a Linux x86-64 environment or Linux Docker.
Run `npm run desktop:build` on the target Linux x86-64 machine (or a Linux
container) to produce and test the AppImage. The exact command is above; no
Linux package or Chromebox run is claimed as tested here.

## Versioning and releases

The authoritative version is the `version` field in `package.json`. The Vite
build injects it as `__APP_VERSION__`; `src/version.ts` exposes it and the
non-public `#settings` panel shows `BJJ Timer · v<version>`. There is no second
hard-coded version string.

### SemVer stages

- `alpha`: functionality is still being implemented or changed.
- `beta`: intended features work and are being tested in actual gym use.
- `rc`: release candidate under final verification.
- `stable`: approved for normal gym operation.

Examples (guidance only; promotion is intentional, never automatic):

```text
0.1.0-alpha.1 -> 0.1.0-alpha.2 -> 0.1.0-beta.1 -> 1.0.0-rc.1 -> 1.0.0
```

After `1.0.0`: PATCH for backward-compatible fixes, MINOR for
backward-compatible features, and MAJOR for incompatible changes to supported
settings, data formats or integrations.

### Intentionally changing the version

These commands update local package metadata and the lockfile only. They do not
commit, tag, publish or deploy:

```sh
npm pkg get version
npm version 0.1.0-alpha.2 --no-git-tag-version
npm version 0.1.0-beta.1 --no-git-tag-version
npm version 1.0.0-rc.1 --no-git-tag-version
npm version 1.0.0 --no-git-tag-version
```

`npm version` updates both `package.json` and `package-lock.json`. Update
`CHANGELOG.md` manually; record only changes verified in the repository and never
invent release dates or prior releases. Do not bump on every edit, build or
startup.

Separate actions that create repository/deployment state are not performed by
the commands above: `git commit`, `git tag`, publishing and deployment all
remain explicit, deliberate operations.

### Build and verify

```sh
npm test
npm run lint
npm run build
npm run desktop:build   # optional Linux AppImage
```

Open the app with `#settings` (for example `http://localhost:5173/#settings`)
and confirm the `BJJ Timer · v...` line, or check `npm pkg get version`. The
Electron AppImage artifact name also includes the package version. No Git
command or optional commit identifier is required for a build.
