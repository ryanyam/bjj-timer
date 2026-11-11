# Desktop and Ubuntu Chromebox deployment guide

This is the authoritative guide for installing and operating BJJ Timer as an
offline appliance on the existing Acer Chromebox CXI3 running Ubuntu. This guide
was written from the repository and historical deployment notes; the coding
agent has not inspected or changed the actual Chromebox.

The development/build machine and the Chromebox are separate:

- Build the Linux **x86-64 AppImage** on the development machine.
- Copy that AppImage to the Chromebox.
- The Chromebox runs the packaged Electron app locally.
- Normal timer operation does not need Vite, a web server, or a separately
  installed browser/Node.js/Electron.
- Downloading a release or installing an Ubuntu package may need internet.
  Offline operation must be checked separately on the device.

This guide does not reflash firmware, reinstall Ubuntu, partition disks, or
change the boot loader. Those are separate recovery procedures, not part of a
normal timer installation.

The deployment flow is:

```text
power on
  -> Ubuntu automatic login
  -> graphical desktop session
  -> desktop-session startup entry
  -> $HOME/.local/bin/bjj-timer-launch
  -> systemd --user bjj-timer.service
  -> $HOME/Applications/BJJ-Timer.AppImage
```

The repository contains no Linux deployment helper scripts beyond the
development script `scripts/desktop-dev.mjs`. The launcher, user service, and
desktop entry below are reference implementations to install on the Chromebox;
they are not recovered files from the current device.

## 1. Current release and fixed installation path

The current local release prepared from this repository is:

```text
BJJ-Timer-0.1.0-beta.6-x86_64.AppImage
```

Its verified local SHA-256 is:

```text
d0d9466b0cb2671a5ef0fb621f440e8b1f13839145d7e79b3fef4471f1227744
```

Published release assets may differ; use the filename and checksum shown on the
GitHub release you actually download.

The installed AppImage must always use this stable path:

```text
$HOME/Applications/BJJ-Timer.AppImage
```

The stable filename is what the launcher and user service reference. Keeping it
stable means updates do not require recreating the startup configuration.

## 2. Inspect the device first

Run these read-only checks on the Chromebox. Use the terminal account that will
own the timer. The historical account name was `kiosk` on host `bjj-timer`; do
not hard-code `/home/kiosk`, because the current account/home may differ.

```sh
cat /etc/os-release
uname -m
id -un
printf 'HOME=%s\n' "$HOME"
printf 'DESKTOP=%s\n' "${XDG_CURRENT_DESKTOP:-unknown}"
printf 'SESSION_TYPE=%s\n' "${XDG_SESSION_TYPE:-unknown}"
printf 'DISPLAY=%s\n' "${DISPLAY:-}"
printf 'WAYLAND_DISPLAY=%s\n' "${WAYLAND_DISPLAY:-}"
```

Check the existing installation and startup configuration without changing it:

```sh
ls -l "$HOME/Applications/BJJ-Timer.AppImage" 2>/dev/null || true
file "$HOME/Applications/BJJ-Timer.AppImage" 2>/dev/null || true
ls -l "$HOME/.config/autostart/bjj-timer.desktop" 2>/dev/null || true
ls -l "$HOME/.local/bin/bjj-timer-launch" 2>/dev/null || true
ls -l "$HOME/.config/systemd/user/bjj-timer.service" 2>/dev/null || true
systemctl --user status bjj-timer.service --no-pager 2>/dev/null || true
```

Do not assume the Ubuntu release, display server, display identifier, or
desktop settings utility. Record the actual values before changing anything.

## 3. Install the AppImage for the first time

### GUI method

1. Open the repository [Releases page](https://github.com/ryanyam/bjj-timer/releases)
   on the Chromebox.
2. Download the current **Linux x86-64 AppImage**.
3. Create an `Applications` folder in your home directory if it does not exist.
4. Move the downloaded file into that folder.
5. Rename it exactly to `BJJ-Timer.AppImage`.
6. Open a terminal and apply execute permission to the final path.

Renaming before `chmod` is important. The stable filename is the one the
launcher and service execute.

### Terminal method

Replace the exact downloaded filename in the first command. Do not use a broad
wildcard, because more than one release may be present in Downloads.

```sh
DOWNLOADED_APPIMAGE="$HOME/Downloads/BJJ-Timer-0.1.0-beta.6-x86_64.AppImage"

mkdir -p "$HOME/Applications"
mv "$DOWNLOADED_APPIMAGE" "$HOME/Applications/BJJ-Timer.AppImage"
chmod +x "$HOME/Applications/BJJ-Timer.AppImage"

test -x "$HOME/Applications/BJJ-Timer.AppImage" && echo "executable: yes"
file "$HOME/Applications/BJJ-Timer.AppImage"
```

Then verify the checksum against the value for the release you downloaded:

```sh
sha256sum "$HOME/Applications/BJJ-Timer.AppImage"
```

Launch it manually for the first check:

```sh
"$HOME/Applications/BJJ-Timer.AppImage"
```

If this is an existing installation, use the update procedure in section 9.
Do not overwrite a running executable in place.

## 4. Ubuntu prerequisites and first-launch troubleshooting

### Architecture

The AppImage is for **x86-64**. Check:

```sh
uname -m
```

It should print `x86_64`. An `aarch64` machine needs a different artifact.

### FUSE / AppImage support

An AppImage may fail with a missing `libfuse.so.2`. Check the Ubuntu release
before choosing the package:

```sh
grep -E '^(NAME|VERSION_ID)=' /etc/os-release
apt-cache policy libfuse2 libfuse2t64 2>/dev/null || true
```

Typical packages:

- Ubuntu 22.04: install `libfuse2` if it is available.
- Ubuntu 24.04: install `libfuse2t64` if it is available.
- Other releases: verify the package name with `apt-cache policy` instead of
  assuming that either name is correct.

For the release that your device actually runs:

```sh
sudo apt update
sudo apt install libfuse2       # Ubuntu 22.04, only if available
# or
sudo apt install libfuse2t64    # Ubuntu 24.04, only if available
```

Do not remove or replace the desktop's FUSE packages and do not install
unrelated compatibility packages speculatively.

### Permission denied

The most common replacement error is:

```text
Permission denied
```

Run `chmod +x` again on the final stable path after every replacement:

```sh
ls -l "$HOME/Applications/BJJ-Timer.AppImage"
chmod +x "$HOME/Applications/BJJ-Timer.AppImage"
test -x "$HOME/Applications/BJJ-Timer.AppImage" && echo "executable: yes"
```

Do not use `chmod 777`, run the GUI as root, disable AppArmor globally, or
disable the Electron sandbox.

### See the real error

Launch from a terminal so the actual failure is visible:

```sh
"$HOME/Applications/BJJ-Timer.AppImage"
```

A warning such as:

```text
vaInitialize failed: unknown libva error
```

is not by itself proof that the app is broken. Judge it by whether the app
launches and remains usable. Investigate only an error that follows the warning
or prevents operation.

### Historical `--no-sandbox`

The current Electron main process sets `sandbox: true` and the repository has
no launcher that adds `--no-sandbox`. If an old desktop entry, service, or shell
alias on the device contains `--no-sandbox`, remove that flag rather than
copying it into the new configuration. Do not treat a sandbox bypass as the
installation fix. If the app only starts with the bypass, record that as a
separate security/runtime blocker and investigate it outside this guide.

## 5. First-launch functional check and operating tutorial

Launching the AppImage opens a fullscreen kiosk window. The current screen is
designed for landscape 16:9 TVs at 1920×1080, 2560×1440, and 3840×2160.

### Operating controls

| Input           | Short press                                                | Hold                                               |
| --------------- | ---------------------------------------------------------- | -------------------------------------------------- |
| Green MAIN / B0 | Start from Ready; pause while running; resume while paused | Hold **1.5 s** to reset to Ready and round 1       |
| White MODE / B1 | While Ready, cycle presets within the current mode         | Hold **0.8 s** while Ready to change the main mode |

Mode and preset changes are available only while Ready. While running or
paused, the white control is locked; use the green hold to reset before
changing the selection. A green short press during Get Ready cancels back to
Ready. Reset preserves the selected mode and preset.

The white control keeps the label `PRESET` while available and shows
`Press: preset · Hold: mode`. Its progress ring is intentionally hidden for the
first 250 ms of a press; that is visual delay only and does not change the
800 ms mode-change threshold.

### Modes and presets

| Mode  | Work / rest presets                                | Default on entry |
| ----- | -------------------------------------------------- | ---------------- |
| ROLLS | 5:00 / 1:00; 3:00 / 1:00                           | 5:00 / 1:00      |
| GI    | 2:00 / 0:30; 3:00 / 0:30; 5:00 / 0:30; 1:00 / 0:30 | 2:00 / 0:30      |
| ADV   | 5:00 / 0:15; 7:00 / 0:15; 3:00 / 0:15              | 5:00 / 0:15      |
| NOGI  | 1:00 / 0:10; 2:00 / 0:10; 3:00 / 0:10; 5:00 / 0:10 | 3:00 / 0:10      |
| KIDS  | 0:30 / 0:05                                        | 0:30 / 0:05      |

Modes cycle in the order ROLLS → GI → ADV → NOGI → KIDS → ROLLS. Work and
rest repeat indefinitely; there is no final-round or session-end state. Rest
does not increment the round.

The display shows the current phase, countdown, round, next phase, mode, and
preset. Available audio is limited to the local round-start and round-end
cues. There are no button beeps, warning beeps, rest beeps, or session-end
cue. The Get Ready countdown is silent until work starts.

### Settings and saved data

The non-public settings view is opened with `#settings`, for example:

```sh
"$HOME/Applications/BJJ-Timer.AppImage" --windowed
```

Use the `#settings` view only for configuration. It exposes Get Ready durations
per mode. Audio volume/mute values are stored locally but do not have a public
UI. Mode and preset selection is session-only and is not saved across app
restarts.

The Electron profile is:

```text
$HOME/.config/bjj-timer/
```

Preserve that directory during updates. It contains localStorage settings and
the Electron user data. Browser localStorage is a different origin and is not
migrated automatically.

### Functional checks

Keep a keyboard available until acceptance testing is complete.

- Verify both physical buttons produce one action per press.
- Verify short versus hold behavior and that a completed hold does not also
  perform the short action.
- Verify Work → Rest → Work repetition and round numbering.
- Verify sound through the intended audio output; there should be one
  round-start/end cue per valid transition only.
- Verify settings persist after closing and reopening the app.
- Verify the app works with networking disconnected.
- Exit kiosk mode with **Ctrl+Shift+Q** for maintenance.

## 6. Automatic login and appliance-style Ubuntu behavior

### Automatic login

Use Ubuntu's graphical **Settings → Users** (or the equivalent account settings
for the detected desktop) to enable automatic login for the intended standard
user. This is not the same as having no account password. Do not disable the
password for SSH, terminal, or administrator access.

### Screen blanking, locking, and suspend (GNOME example)

Check the desktop first:

```sh
printf '%s\n' "${XDG_CURRENT_DESKTOP:-unknown}"
```

The following commands are for a GNOME/Ubuntu session. Record the old values
before changing them, and use the desktop's graphical settings if the keys are
not present.

```sh
gsettings get org.gnome.desktop.session idle-delay
gsettings get org.gnome.desktop.screensaver lock-enabled
gsettings get org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type
```

Apply only if the keys exist:

```sh
gsettings set org.gnome.desktop.session idle-delay 0
gsettings set org.gnome.desktop.screensaver lock-enabled false
gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type 'nothing'
```

Also set the desktop's power settings to disable automatic suspend and screen
blanking for the intended power source. Do not assume that every desktop uses
the same keys or that a display server is X11.

### Balanced power

If the Ubuntu installation provides power profiles, use:

```sh
powerprofilesctl get
powerprofilesctl set balanced
```

If `powerprofilesctl` is unavailable, use the desktop's power settings.
Balanced mode is the intended operating choice, but verify the current device
state rather than assuming it is already set.

### Short power-button press

A short physical power-button press should request a normal shutdown, not
suspend. On an Ubuntu system using systemd-logind, this system-wide drop-in is a
reference configuration:

```sh
sudo install -d /etc/systemd/logind.conf.d
sudo tee /etc/systemd/logind.conf.d/99-bjj-timer-power.conf >/dev/null <<'EOF'
[Login]
HandlePowerKey=poweroff
EOF
sudo systemctl reload systemd-logind || true
```

Some desktop environments intercept the power key before logind receives it.
Verify the behavior after a reboot. If the desktop intercepts it, configure the
desktop power action explicitly rather than adding more logind overrides.

Record any existing file before changing it. This is a system-wide Ubuntu
change, not an application setting. Do not apply it from the development
machine. The command above was not executed during this documentation change.

Distinguish:

- Automatic login from password-less administration.
- Login startup from pre-login boot.
- A short power-button press from a forced power-button hold.
- OS shutdown from firmware-dependent power restoration.

Do not promise that power-on, shutdown, automatic login, or firmware prompts
were tested unless they were actually observed.

## 7. Automatic startup and crash recovery

The established architecture is:

```text
~/.config/autostart/bjj-timer.desktop
        -> ~/.local/bin/bjj-timer-launch
        -> systemctl --user start bjj-timer.service
        -> ~/.config/systemd/user/bjj-timer.service
        -> %h/Applications/BJJ-Timer.AppImage
```

There is one monitored launch path. Do not add a second direct-AppImage
autostart entry. If an old entry at
`$HOME/.config/autostart/bjj-timer.desktop` launches the AppImage directly,
replace it with the launcher entry below.

Create the directories:

```sh
mkdir -p "$HOME/Applications" "$HOME/.local/bin"
mkdir -p "$HOME/.config/systemd/user" "$HOME/.config/autostart"
```

### Launcher

Create `$HOME/.local/bin/bjj-timer-launch`:

```sh
cat > "$HOME/.local/bin/bjj-timer-launch" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

unit="bjj-timer.service"

# An optional reset-failed must not abort this launcher if the unit has not
# yet been loaded by the user service manager.
if ! systemctl --user cat "$unit" >/dev/null 2>&1; then
  printf 'BJJ Timer unit is not installed: %s\n' "$unit" >&2
  exit 1
fi

# Pass the graphical session environment without assuming X11 or DISPLAY=:0.
for name in DISPLAY WAYLAND_DISPLAY XAUTHORITY DBUS_SESSION_BUS_ADDRESS; do
  if [ -n "${!name:-}" ]; then
    systemctl --user import-environment "$name" >/dev/null 2>&1 || true
  fi
done

systemctl --user reset-failed "$unit" >/dev/null 2>&1 || true
systemctl --user start "$unit"
EOF
chmod 0755 "$HOME/.local/bin/bjj-timer-launch"
bash -n "$HOME/.local/bin/bjj-timer-launch"
```

### User service

Create `$HOME/.config/systemd/user/bjj-timer.service`:

```ini
[Unit]
Description=BJJ Timer
After=graphical-session.target
PartOf=graphical-session.target
StartLimitIntervalSec=60
StartLimitBurst=3

[Service]
Type=simple
ExecStart=%h/Applications/BJJ-Timer.AppImage
Restart=on-failure
RestartSec=5

# No [Install] section: this unit is started by the desktop-session launcher,
# not enabled through systemctl --user enable.
```

Install it with a literal here-document:

```sh
cat > "$HOME/.config/systemd/user/bjj-timer.service" <<'EOF'
[Unit]
Description=BJJ Timer
After=graphical-session.target
PartOf=graphical-session.target
StartLimitIntervalSec=60
StartLimitBurst=3

[Service]
Type=simple
ExecStart=%h/Applications/BJJ-Timer.AppImage
Restart=on-failure
RestartSec=5
EOF

systemctl --user daemon-reload
systemctl --user cat bjj-timer.service >/dev/null
```

`%h` is a systemd user-unit specifier for the account's home directory; it is
not a shell variable. Do not replace it with `/home/kiosk`.

The unit is **static** because it has no `[Install]` section. That is expected:
the desktop launcher starts it. Do not run `systemctl --user enable` just to
make it work.

### Desktop-session startup entry

Create `$HOME/.config/autostart/bjj-timer.desktop`:

```ini
[Desktop Entry]
Type=Application
Name=BJJ Timer
Comment=Start the monitored BJJ Timer user service
Exec=/bin/sh -c "exec \"$HOME/.local/bin/bjj-timer-launch\""
Terminal=false
X-GNOME-Autostart-enabled=true
```

The `$HOME` in the `Exec` command is expanded by `/bin/sh`, not by the desktop
entry parser. Install it with:

```sh
cat > "$HOME/.config/autostart/bjj-timer.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=BJJ Timer
Comment=Start the monitored BJJ Timer user service
Exec=/bin/sh -c "exec \"$HOME/.local/bin/bjj-timer-launch\""
Terminal=false
X-GNOME-Autostart-enabled=true
EOF
chmod 0644 "$HOME/.config/autostart/bjj-timer.desktop"
```

If a second old autostart file launches the AppImage directly, inspect it and
remove/rename only that obsolete direct entry. Do not leave two startup paths
active.

Start the service manually for the first test:

```sh
"$HOME/.local/bin/bjj-timer-launch"
systemctl --user status bjj-timer.service --no-pager
```

### Service commands

Do not use `sudo` for this user service.

```sh
systemctl --user start bjj-timer.service
systemctl --user stop bjj-timer.service
systemctl --user restart bjj-timer.service
systemctl --user status bjj-timer.service --no-pager
systemctl --user show bjj-timer.service -p MainPID -p NRestarts -p ActiveState
journalctl --user -u bjj-timer.service -n 80 --no-pager
journalctl --user -u bjj-timer.service -f
systemctl --user reset-failed bjj-timer.service
```

- Login autostart launches the service; it is not the same thing as crash
  recovery.
- `Restart=on-failure` restarts an exited/crashed process. A clean app exit
  with status 0 is intentional maintenance and should remain stopped.
- `Restart=on-failure` does not detect a frozen process and cannot restore an
  interrupted countdown.
- Explicitly stopping the service is the reliable maintenance action.
- No user lingering is required just to launch a graphical app after login.

## 8. Controlled crash-recovery test

Perform this only while idle, never during training.

```sh
systemctl --user is-active bjj-timer.service
systemctl --user show bjj-timer.service -p MainPID --value
systemctl --user show bjj-timer.service -p NRestarts --value
```

Simulate a main-process crash once:

```sh
systemctl --user kill --kill-whom=main --signal=SIGKILL bjj-timer.service
```

Watch the app and service:

```sh
systemctl --user status bjj-timer.service --no-pager
journalctl --user -u bjj-timer.service -n 80 --no-pager
systemctl --user show bjj-timer.service -p NRestarts --value
```

Confirm the app reopens, there is only one visible app instance, and the restart
count increased. Then verify a normal maintenance stop stays stopped:

```sh
systemctl --user stop bjj-timer.service
systemctl --user is-active bjj-timer.service
```

If the unit is not loaded, run `systemctl --user daemon-reload`, then check the
service file path. `Unit ... not loaded` does not mean systemd itself is broken.
The historical command above is appropriate for a user unit; verify it on the
actual systemd version before relying on it.

## 9. Updating the AppImage safely

The downloaded replacement may lack execute permission. Apply permission
again on the final installed path every time.

1. Download the new exact Linux x86-64 release.
2. Stop the monitored service.
3. Confirm the process is stopped.
4. Keep the current working AppImage outside the stable executable path.
5. Stage the replacement and rename it to `BJJ-Timer.AppImage`.
6. Apply `chmod +x` to the stable path.
7. Start the service and check status/logs.
8. Perform a short functional check.
9. Reboot and verify automatic login/startup when appropriate.

Example; replace the exact downloaded filename:

```sh
systemctl --user stop bjj-timer.service
systemctl --user is-active bjj-timer.service || true

mkdir -p "$HOME/Applications"
mv "$HOME/Applications/BJJ-Timer.AppImage" \
   "$HOME/Applications/BJJ-Timer.previous.AppImage"

NEW_APPIMAGE="$HOME/Downloads/BJJ-Timer-0.1.0-beta.6-x86_64.AppImage"
mv "$NEW_APPIMAGE" "$HOME/Applications/BJJ-Timer.AppImage"
chmod +x "$HOME/Applications/BJJ-Timer.AppImage"

test -x "$HOME/Applications/BJJ-Timer.AppImage"
ls -l "$HOME/Applications/BJJ-Timer.AppImage"
systemctl --user start bjj-timer.service
systemctl --user status bjj-timer.service --no-pager
journalctl --user -u bjj-timer.service -n 50 --no-pager
```

Do not recreate the startup entry or service for every release. Do not delete
`$HOME/.config/bjj-timer/` during a normal app update.

### Rollback

```sh
systemctl --user stop bjj-timer.service
mv "$HOME/Applications/BJJ-Timer.AppImage" \
   "$HOME/Applications/BJJ-Timer.failed.AppImage"
mv "$HOME/Applications/BJJ-Timer.previous.AppImage" \
   "$HOME/Applications/BJJ-Timer.AppImage"
chmod +x "$HOME/Applications/BJJ-Timer.AppImage"
systemctl --user start bjj-timer.service
systemctl --user status bjj-timer.service --no-pager
```

Reapply execute permission after restoring. Settings compatibility between
releases is not separately guaranteed; preserve the profile so data is not
discarded, but verify settings after a rollback.

## 10. Everyday operation

1. Press the physical power button briefly.
2. Wait for Ubuntu to log in automatically and the launcher/service to start.
3. Confirm the timer is visible and READY.
4. Operate the timer with the green and white arcade buttons.
5. When finished, use the configured short power-button shutdown rather than
   pulling power or forcing a long power-button hold.
6. For maintenance, exit kiosk with **Ctrl+Shift+Q**, or explicitly stop the
   user service. Keep a keyboard available until acceptance testing is done.

Normal operation must not require a terminal, development server, or internet
connection.

## 11. Troubleshooting

| Symptom                                     | Check                                                                          | Targeted remedy                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | --- | ------------------------------------------------------- |
| `Permission denied` after update            | `ls -l "$HOME/Applications/BJJ-Timer.AppImage"`                                | `chmod +x` the final stable path again                                                           |
| `libfuse.so.2` missing                      | Ubuntu release and `apt-cache policy libfuse2 libfuse2t64`                     | Install the matching FUSE package for that release                                               |
| AppImage missing / wrong path               | `test -f "$HOME/Applications/BJJ-Timer.AppImage"`                              | Rename/copy to the stable path; do not change service path casually                              |
| Wrong architecture                          | `uname -m` and `file` the AppImage                                             | Install the x86-64 Linux artifact on `x86_64`                                                    |
| `Unit bjj-timer.service could not be found` | `systemctl --user cat bjj-timer.service`; service path                         | Recreate the unit, run `systemctl --user daemon-reload`                                          |
| Unit not loaded during crash test           | `systemctl --user daemon-reload`; service path                                 | Reload the user manager; do not diagnose systemd as broken                                       |
| Static unit looks disabled                  | `systemctl --user status`                                                      | Expected for a launcher-started unit with no `[Install]`; do not blindly enable                  |
| Launcher aborts around `reset-failed`       | Run `bash -n` and launcher by hand; inspect unit load                          | Keep `reset-failed ...                                                                           |     | true`; ensure the unit file exists and manager reloaded |
| App does not start after login              | `status`, logs, launcher path, `$HOME` expansion                               | Check the startup entry, launcher permission, service, and AppImage execute bit                  |
| App starts twice                            | Old direct autostart plus new service launcher; `pgrep -af BJJ-Timer.AppImage` | Remove the obsolete direct autostart entry; keep one service path                                |
| Wayland/X11 display error                   | `XDG_SESSION_TYPE`, `DISPLAY`, `WAYLAND_DISPLAY`                               | Start through the graphical launcher that imports the session environment; do not hard-code `:0` |
| Restart limit reached                       | `systemctl --user show ... -p NRestarts`; journal                              | `systemctl --user reset-failed bjj-timer.service`, diagnose cause, then start                    |
| App closes normally and does not restart    | Service is `inactive` after exit 0                                             | Expected with `Restart=on-failure`; start it for operation                                       |
| VA-API warning                              | Observe whether the app remains usable                                         | Do not treat the warning alone as a failed installation                                          |
| No audio / wrong output                     | Host output device, volume, app audio settings, journal                        | Select the correct output, verify one round cue per transition                                   |
| Arcade input not detected                   | `gamepad-tester` on device, status label, USB connection                       | Reconnect/test the controller; check physical B0/B1 indexes                                      |
| Screen blanks, locks, or suspends           | GNOME/desktop settings; `gsettings get` values                                 | Reapply the intended idle/lock/power settings for the detected desktop                           |
| Power button suspends                       | Logind drop-in, desktop power interception                                     | Apply/verify the configured short-press behavior; reboot before testing                          |
| Offline operation fails                     | Network disabled; loaded app assets; logs                                      | Launch the installed AppImage; verify assets are bundled and no server is required               |
| `--no-sandbox` found in an old launcher     | Inspect the actual local file                                                  | Remove the bypass; if it is required to launch, record a separate security/runtime blocker       |

## 12. Reversal and recovery

To return to manual operation without deleting the app or settings:

```sh
systemctl --user stop bjj-timer.service
mv "$HOME/.config/autostart/bjj-timer.desktop" \
   "$HOME/.config/autostart/bjj-timer.desktop.disabled"
mv "$HOME/.config/systemd/user/bjj-timer.service" \
   "$HOME/.config/systemd/user/bjj-timer.service.disabled"
mv "$HOME/.local/bin/bjj-timer-launch" \
   "$HOME/.local/bin/bjj-timer-launch.disabled"
systemctl --user daemon-reload
```

Launch manually with:

```sh
"$HOME/Applications/BJJ-Timer.AppImage"
```

To reverse Ubuntu appliance changes:

- Restore the previous values from the GNOME settings commands.
- Remove or restore the logind drop-in
  `/etc/systemd/logind.conf.d/99-bjj-timer-power.conf` and reload/reboot.
- Restore the previous automatic-login setting through Ubuntu Settings.

Keep these categories separate:

- App files: `$HOME/Applications/BJJ-Timer.AppImage`.
- Startup/service files: autostart entry, launcher, user unit.
- App data/settings: `$HOME/.config/bjj-timer/`.
- System-wide Ubuntu settings: GDM/automatic login, desktop settings, logind.

Preserve a working previous AppImage for rollback. Do not delete the Electron
profile during normal rollback.

## 13. Final acceptance checklist

Perform on the intended Chromebox and record the result. Do not mark a check as
passed without observing it.

- [ ] Manual launch of the stable AppImage works.
- [ ] The installed filename is `BJJ-Timer.AppImage` and it has execute
      permission.
- [ ] Automatic login works after a reboot.
- [ ] Exactly one app instance opens automatically.
- [ ] The user service is active.
- [ ] A simulated main-process crash triggers recovery.
- [ ] An intentional service stop stays stopped.
- [ ] No blanking, locking, or suspend during a representative session.
- [ ] A short power-button press performs the intended normal shutdown.
- [ ] Power-on returns to the timer without an interactive login prompt.
- [ ] The actual TV resolution is suitable; the timer is readable from at least
      5 feet and arcade settings within 3 feet.
- [ ] Green/white mappings, short presses, and holds behave as documented.
- [ ] Only round-start and round-end cues play.
- [ ] Supported settings persist.
- [ ] Offline operation works with networking disabled.
- [ ] The update and rollback procedure has been tested.
- [ ] Any `--no-sandbox` or other unresolved security issue is recorded.

## Development and packaging reference

Development remains browser/Electron on the build machine:

```sh
npm install
npm run dev                  # browser development (Vite)
npm run desktop:dev          # Vite + windowed Electron
npm run desktop:preview      # build and run the bundled app
npm run desktop:build        # Linux x86-64 AppImage
npm run desktop:dir          # unpacked Electron directory
```

`npm run desktop:build` produces:

```text
release/BJJ-Timer-<version>-x86_64.AppImage
```

The Electron main process is `electron/main.cjs`. Production loads local
`dist/` assets through `app://bjj-timer`; no Vite server, Nginx, internet
connection, or separately installed browser is used at runtime. The renderer
uses `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`.

The current local build is `BJJ-Timer-0.1.0-beta.6-x86_64.AppImage`. The build
machine is macOS arm64; the Linux AppImage can be packaged there but cannot be
launched on that machine. No Ubuntu launch, hardware-button, audio, or TV test is
claimed by this guide.

The authoritative version is the `version` field in `package.json`. The Vite
build injects it as `__APP_VERSION__`; the non-public `#settings` panel shows
`BJJ Timer · v<version>`. Keep `package-lock.json` synchronized via the existing
npm commands. Release history is in `CHANGELOG.md`.
