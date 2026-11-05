# BJJ Timer Design Audit

Date: 2026-11-05

## Scope and evidence

- **Scope:** TV-only landscape layout at 1920×1080, 2560×1440, and 3840×2160. No mobile or narrow-width review was performed or recommended.
- **Viewing-distance requirements:** training monitoring is viewed from at least 5 feet away; instructors operate settings from less than 3 feet away. Five feet is the minimum stated training-viewing distance, not a verified maximum.
  - Long-distance priorities: countdown readability, phase identification, paused/finished state, and current round information.
  - Close-range priorities: mode/preset readability, arcade-navigation focus, selected-value identification, and action feedback.
  - Focused and selected states must remain distinguishable when they represent different things. Secondary settings do not need equal prominence to the countdown.
- **Project rules reviewed:** `AGENTS.md`, including the TV-only display target, viewing-distance requirements, and existing timer/control constraints.
- **Implementation inspected:** `src/App.tsx`, `src/App.css`, `src/round.ts`, `src/training.ts`, `src/controls.ts`, `src/PhaseProgressBar.tsx`, and the existing tests.
- **Tools used:** Vite development server, the existing Chromium browser tool, browser screenshots, DOM/CSS evaluation, keyboard Tab/Shift+Tab simulation, and synthetic pointer events. No new tooling was installed.

### Rendered evidence

Every screenshot listed below was captured and then actually opened and inspected. A saved capture alone was not treated as verification.

- **1920×1080:** reused previously captured and inspected READY, WORK, WORK · PAUSED, and REST · PAUSED screenshots as the baseline.
- **2560×1440:** READY, REST (running), WORK · PAUSED, and REST · PAUSED were captured and inspected.
- **3840×2160:** READY, REST (running), WORK · PAUSED, and REST · PAUSED were captured and inspected.
- **Result:** no clipping, overlap, unexpected wrapping, displaced controls, or loss of countdown/status readability was observed in those states. Countdown, status band, progress bar, and controls retained their positions across the inspected resolutions.
- **Interaction:** started, paused, resumed, and transitioned through REST while checking state labels, progress bar, and primary/secondary controls.

### Hold-progress interaction at 1920×1080

Observed with synthetic pointer events and live DOM/CSS sampling. No frame-rate or animation-smoothness claim is made.

- Mid-hold sample at 650ms: `--main-hold: 40%`, timer still running.
- Releasing before the threshold cleared the fill (`--main-hold: 0%`) without resetting. Because this is also a short press while running, the existing short-press action paused the timer; this is the documented control behavior, not a reset defect.
- Completed-hold samples advanced through 17%, 40%, 60%, and 80%; at 1500ms the session reset to READY, the countdown returned to 5:00, and the fill cleared.
- Continuing to hold after reset did not trigger another reset; releasing after completion left the session READY. The existing RESET / “Session reset” feedback appeared.

### Focus versus selected state at 1920×1080

- Simulated keyboard navigation focused the unselected `3:00 / 1:00` preset: visible 3px ink outline on a neutral surface.
- The selected `ROLLS` option retained its dark selected background and light text without the keyboard outline.
- Focus and selected states are therefore distinguishable. This was keyboard/input simulation, not physical arcade-button testing.

## Keep unchanged

- The countdown remains the dominant element at all inspected sizes. Its width, weight, tabular numerals, colon, and centered position are stable.
- WORK, REST, and paused states are explicit in text; PAUSED retains the underlying phase.
- The header’s Alliance logo, single-line date/time, and regular-weight typography are clear and proportionate.
- The status band’s three-part hierarchy and subtle state tint remain restrained and readable.
- Mode/preset rows use one shared left-aligned grid, consistent option size, and a clear dark selected state.
- The yellow primary action remains visually distinct without overpowering the countdown.
- Phase-progress warning colors and the full-button hold-progress implementation remain intact.
- Kids/Drills/NOGI presets, timer behavior, controls, audio, and other existing functionality remain unchanged.

## Findings

No verified visual defects were found in the inspected states. All requested tool-based checks for READY, REST, WORK · PAUSED, and REST · PAUSED at 2560×1440 and 3840×2160 are complete.

No design changes are recommended. No implementation batch is warranted.

## Manual checks still outstanding

- Readability from at least 5 feet on the actual gym TV, and readability from the farthest routinely used mat position.
- Physical arcade-button operation, focus, selected-value identification, and action feedback from under 3 feet.
- When physical testing is performed, record the actual display resolution and scaling rather than assuming all three target resolutions are used.
- Actual animation smoothness on the target display. The hold-fill checks sampled the fill over time but did not measure frame timing.
