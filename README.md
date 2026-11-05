# BJJ Timer

A TV-first, offline BJJ class timer for Alliance Jiu Jitsu Manila. It runs
continuous work/rest rounds for rolling, gi, advanced, no-gi, and kids
sessions, with a two-button arcade control panel and a Linux desktop build.

[Downloads](https://github.com/ryanyam/bjj-timer/releases) ·
[Changelog](CHANGELOG.md) ·
[Issues](https://github.com/ryanyam/bjj-timer/issues)

The current package version is **0.1.0-beta.3**. This is a prerelease; use the
specific prerelease asset in Releases rather than assuming `/releases/latest`
contains the current gym-testing build. If no prerelease asset is published
yet, build it from source using the command below.

## Features

- Large landscape-TV timer for a gym display.
- Five training modes with configurable work/rest presets.
- Continuous work → rest → work cycling with no session-end state.
- Green/white two-button arcade controls through the browser Gamepad API.
- Get Ready countdown before the first round; configurable in the non-public
  `#settings` view.
- Seven bundled audio cues, with no remote audio dependency.
- Electron desktop wrapper with a fullscreen kiosk mode and a Linux x86-64
  AppImage packaging command.
- Packaged desktop assets are local; production blocks HTTP/HTTPS requests.

## Training modes

| Mode  | Presets (work / rest)                              | Default on entry |
| ----- | -------------------------------------------------- | ---------------- |
| ROLLS | 5:00 / 1:00; 3:00 / 1:00                           | 5:00 / 1:00      |
| GI    | 2:00 / 0:30; 3:00 / 0:30; 5:00 / 0:30; 1:00 / 0:30 | 2:00 / 0:30      |
| ADV   | 5:00 / 0:15; 7:00 / 0:15; 3:00 / 0:15              | 5:00 / 0:15      |
| NOGI  | 1:00 / 0:10; 2:00 / 0:10; 3:00 / 0:10; 5:00 / 0:10 | 3:00 / 0:10      |
| KIDS  | 0:30 / 0:05                                        | 0:30 / 0:05      |

Modes cycle in the order **ROLLS → GI → ADV → NOGI → KIDS → ROLLS**. The
white button cycles presets, and the green hold resets the session while
preserving the selected mode and preset.

## Controls

| Button          | Short press                                                | Hold                                                     |
| --------------- | ---------------------------------------------------------- | -------------------------------------------------------- |
| Green MAIN / B0 | Start from Ready; pause while running; resume while paused | Hold **1.5 s** to reset the session to Ready and round 1 |
| White MODE / B1 | While Ready, advance to the next preset                    | Hold **0.8 s** while Ready to advance to the next mode   |

During the Get Ready countdown, a green short press cancels back to Ready.
Mode and preset changes are only available while Ready. Reset preserves the
selected mode and preset. The on-screen Start/Pause/Resume and Preset buttons
use the same actions as the arcade buttons.

## Work/rest behavior

Work and rest repeat indefinitely for the selected preset. The round starts at
ROUND 1 and increments only when the next work phase begins; REST does not
increment the round. There is no final round or finished state. Pause freezes
the current phase and remaining time; resume continues from that remainder;
reset returns the whole session to Ready at the selected preset's full work
duration.

## Intended setup

- **Display:** landscape TV, 16:9, targeting 1920×1080, 2560×1440, or
  3840×2160. The interface is TV-only.
- **Desktop:** Linux x86-64, with an AppImage for USB deployment and launch.
- **Arcade input:** a standard USB gamepad exposing two buttons; the first is
  green MAIN and the second is white MODE.
- **Audio:** the seven WAV cues are bundled locally. The first button press
  unlocks browser audio; use the host's normal audio output.
- **Kiosk:** the packaged app opens fullscreen. Use **Ctrl+Shift+Q** to exit
  kiosk mode for maintenance.

## Linux AppImage

Download the prerelease AppImage from
[Releases](https://github.com/ryanyam/bjj-timer/releases), or build it locally:

```sh
npm install
npm run desktop:build
```

The build creates:

```text
release/BJJ-Timer-<version>-x86_64.AppImage
```

To launch on Ubuntu x86-64:

```sh
chmod +x BJJ-Timer-0.1.0-beta.3-x86_64.AppImage
./BJJ-Timer-0.1.0-beta.3-x86_64.AppImage
```

If AppImage execution requires FUSE 2, install the distribution's FUSE 2
compatibility package first (for example `libfuse2` on Ubuntu 22.04+). The
packaged app does not require Node.js, Electron, a Vite server, or an internet
connection at runtime.

## Development

Use the existing npm scripts:

```sh
npm install
npm run dev          # browser development server
npm test             # automated test suite
npm run lint         # ESLint
npm run build        # type-check and production web build
npm run desktop:dev  # Vite + windowed Electron development
npm run desktop:build # Linux x86-64 AppImage
npm run desktop:dir  # unpacked Electron directory build
```

Electron settings use the persistent profile at `~/.config/bjj-timer/`.
The non-public `#settings` route configures Get Ready durations. See
[DESKTOP.md](DESKTOP.md) for kiosk, offline, and release-check details.

## Project status

Beta software for gym testing. The source version is `0.1.0-beta.3`; the
desktop target is Linux x86-64. Automated tests, lint, and builds are not a
substitute for checking the actual TV, audio output, or physical arcade
buttons on the deployment machine.
