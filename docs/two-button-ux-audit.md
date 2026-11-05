# Two-Button UX Audit

Date: 2026-11-05

## Executive summary

The verified two-button feedback gaps from the previous audit have been
resolved in the current implementation. Green and white button presses now have
visible pressed feedback; physical white holds expose progress and the
`Keep holding for mode` state; locked white attempts remain visibly locked;
the green reset action is disclosed in every applicable state; controller
connection state is visible; and pointer green presses use the same stale-state
guard as the physical green button.

No Critical, High, or Medium verified defect remains in the inspected behavior.
One Low-priority behavior remains unspecified: simultaneous green and white
presses have no deliberate policy. Physical TV, controller, audio, and
Electron/Ubuntu checks remain manual.

## Scope and evidence

- **Reviewed:** `AGENTS.md`, `docs/two-button-ux-audit.md`,
  `src/gamepad.ts`, `src/useGamepadInput.ts`, `src/press.ts`,
  `src/round.ts`, `src/controls.ts`, `src/App.tsx`, `src/App.css`, and the
  existing tests.
- **Automated:** `npm test` passed **227 tests**.
- **Browser:** live Vite/Chromium inspection at 1920×1080 with synthetic pointer
  events and a simulated Gamepad object. The simulated gamepad showed
  `Controller connected`, a white hold at about 48% progress with
  `Keep holding for mode`, and a locked white press with zero hold progress and
  the locked message.
- **Not tested:** physical USB arcade buttons/controller, actual TV viewing
  distance, audio output, and Electron/Ubuntu runtime. Browser simulation is not
  physical-controller evidence.
- **Supporting criteria:** Nielsen's usability heuristics and relevant Vercel
  Web Interface Guidelines principles were used as review lenses. No skill,
  package, or external tooling was installed.

## Current interaction matrix

Green thresholds: **1500 ms**. White thresholds: **800 ms**. Selection is
allowed only in Ready. There is no Finished state; Work and Rest repeat until
reset.

| State          | Green short                                        | Green hold     | Green label / hint                                | White short | White hold | White label / hint                                |
| -------------- | -------------------------------------------------- | -------------- | ------------------------------------------------- | ----------- | ---------- | ------------------------------------------------- |
| Ready          | Start; enters Get Ready or starts Work immediately | Reset to Ready | `START` / `Hold to reset`                         | Next preset | Next mode  | `PRESET` / `Press: next preset · Hold: next mode` |
| Get Ready      | Cancel countdown, return to Ready                  | Reset to Ready | `STARTING...` / `Press to cancel · Hold to reset` | Blocked     | Blocked    | `LOCKED` / `Hold green to reset before changing`  |
| Running — WORK | Pause, freeze remaining work                       | Reset to Ready | `PAUSE` / `Hold to reset`                         | Blocked     | Blocked    | `LOCKED` / `Hold green to reset before changing`  |
| Running — REST | Pause, freeze remaining rest                       | Reset to Ready | `PAUSE` / `Hold to reset`                         | Blocked     | Blocked    | `LOCKED` / `Hold green to reset before changing`  |
| Paused — WORK  | Resume from remainder                              | Reset to Ready | `RESUME` / `Hold to reset`                        | Blocked     | Blocked    | `LOCKED` / `Hold green to reset before changing`  |
| Paused — REST  | Resume from remainder                              | Reset to Ready | `RESUME` / `Hold to reset`                        | Blocked     | Blocked    | `LOCKED` / `Hold green to reset before changing`  |

While an available white hold is in progress, the white hint becomes
`Keep holding for mode`. While a green reset hold is in progress, the green hint
becomes `Keep holding...`; completion briefly shows `RESET` / `Session reset`.

## Input lifecycle

| Event                                      | Implemented behavior                                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Button down                                | No timer action. Both buttons expose pressed feedback; green and available white holds begin progress.             |
| Early release                              | One short action: green start/pause/resume/cancel; white preset change or blocked attempt.                         |
| Threshold                                  | One long action while held: green reset; white mode change or blocked attempt.                                     |
| Continued hold                             | No repeat; the gesture is consumed until release.                                                                  |
| Release after hold                         | No short action; a fresh press is required.                                                                        |
| Focus loss, page hide, disconnect, unmount | Pending gesture and pressed/hold feedback clear; release-to-arm protection applies.                                |
| Green phase change during a press          | Physical and pointer paths carry the start state key and reject a stale short press at release.                    |
| Initial discovery                          | A first observed held button may be adopted once with a controlled exception; later reconnection requires release. |
| Simultaneous green + white                 | Independent recognizers can emit independent actions; no combined policy is defined.                               |

## Findings

### Resolved — physical white press and hold feedback

**Was:** High usability defect; physical B1 had no pressed state or progress.
**Resolved evidence:** `GamepadFeedback` now exposes `modePressed` and
`modeHoldProgress`; the app combines them with the pointer ring and shows
`Keep holding for mode`. A simulated browser gamepad showed the ring at ~48% and
a release cleared it. Gamepad feedback tests cover progress and cancellation.
**Verification:** unit tests and simulated browser input; physical controller
verification still required.

### Resolved — reset-hold discoverability and concise copy

**Was:** High copy/usability defect; reset-by-hold was not disclosed while
Running or during Get Ready.
**Resolved evidence:** `controlCopy()` now provides the matrix wording above,
including `Hold to reset`, `Press to cancel · Hold to reset`, and
`Hold green to reset before changing`. Tests assert the copy across states.
**Verification:** copy tests; no new permanent instruction paragraph.

### Resolved — locked white-button behavior

**Was:** Medium inconsistency; physical B1 remained accepted while the UI said
`LOCKED`.
**Resolved evidence:** physical B1 still receives prompt blocked feedback, but
the ring is forced to zero when selection is unavailable and the successful
`Keep holding for mode` guidance is suppressed. The white button shows pressed
state and the locked hint; the reducer still changes no mode or preset.
**Verification:** locked B1 tests; simulated browser gamepad showed zero hold
progress and the locked message.

### Resolved — pointer/physical state-change consistency

**Was:** Medium cross-input inconsistency; pointer green releases could act on a
new phase.
**Resolved evidence:** the pointer path captures `stateKey` at press-down and
passes it to the same `mainShort(fromState)` path as the physical button. A
pointer test holds across the work-to-rest boundary and confirms no pause/resume
action is applied to the new phase.
**Verification:** pointer boundary test and existing physical tests.

### Resolved — controller connection feedback

**Was:** Medium usability gap; only errors were displayed.
**Resolved evidence:** the footer now shows real input statuses:
`Waiting for controller input`, `Controller connected`,
`Controller disconnected`, and `Controller unavailable` as applicable.
Connection state changes without requiring a timer action.
**Verification:** controller startup/disconnect/reconnect tests and simulated
browser Gamepad status. Physical reconnection remains manual.

### Low — simultaneous green/white presses remain unspecified

**Type:** usability hypothesis / unspecified behavior.  
**Evidence:** green and white recognizers are independent and can emit separate
actions; no test or product rule defines a combined result.  
**Consequence:** an accidental overlap could, for example, start the timer and
change a preset at once. The project does not request a combined-button action.  
**Smallest correction:** define and test whether the first gesture wins or both
independent actions are acceptable. Do not add a new combination or shutdown
behavior. This is not a material defect in the verified states.

## Exact current copy

- Green: `START`, `PAUSE`, `RESUME`, `STARTING...`; hint `Hold to reset`, or
  `Press to cancel · Hold to reset` in Get Ready; holding shows `Keep holding...`;
  completion shows `RESET` / `Session reset`.
- White: `PRESET` / `Press: next preset · Hold: next mode`; available hold shows
  `Keep holding for mode`; locked state shows `LOCKED` /
  `Hold green to reset before changing`.
- Controller: `Waiting for controller input`, `Controller connected`,
  `Controller disconnected`, `Controller unavailable`.

## Existing behavior that works well

- One action per press; no action on press-down; no short action after a
  completed hold; no repeated hold while held.
- Physical and pointer green presses are protected against stale phase changes.
- Green full-button hold fill, cancellation, completion, and reset feedback.
- White pointer and physical hold feedback, locked-state suppression, and
  completion feedback.
- Ready-only mode/preset restrictions and non-blocking blocked feedback.
- Clear state text, warning colors, round/mode context, and stable TV hierarchy.
- Controller errors and positive connection status are visually secondary and
  do not rely on color alone.

## Prioritized follow-up

1. Manually test the updated white feedback, locked behavior, copy, connection
   status, and pointer guard on the real TV/controller.
2. If the owner wants a defined overlap policy, decide and test it separately;
   do not infer one from this audit.
3. No further implementation batch is recommended from the current evidence.

## Physical TV/controller checklist

- At the actual TV, record resolution and OS scaling; verify timer readability
  from at least 5 feet and controls from under 3 feet.
- In Ready, Get Ready, Running WORK/REST, and Paused WORK/REST, exercise B0 and
  B1 short and hold gestures.
- Watch white pressed/ring progress, cancellation, completion, and locked
  attempts; verify the ring is absent on locked attempts.
- Verify one action per gesture, no repeat during continued holding, and no
  short action after a completed hold.
- Hold B0 through completion; verify fill progress, reset flash, and no repeat.
- Disconnect, reconnect, blur, and hide/restore the page; verify feedback and
  status clear and release-to-arm behavior remains.
- Verify the controller status text and no layout shift at the gym display.
- Check simultaneous-button behavior only if a policy is intentionally chosen.

## Coverage and limitations

- **Code and tests:** feedback, copy, restrictions, lifecycle, and pointer guard
  are covered by 227 passing tests.
- **Browser:** 1920×1080 simulated pointer and simulated Gamepad inspection;
  no screenshots were captured or treated as evidence.
- **Physical:** actual controller, TV distance, audio, and Electron/Ubuntu
  behavior remain unverified.
- **Optional preference:** simultaneous-button policy remains open; no policy
  was invented in this pass.
