/**
 * Physical arcade button input, via the browser Gamepad API.
 *
 * This module is deliberately free of React, timers and the DOM: it is fed a
 * button snapshot and a clock reading, and emits at most one gesture per
 * physical press. The polling layer (see useGamepadInput) and the tests both
 * drive it the same way.
 *
 * Mapping, as agreed for the two-button arcade panel:
 * - button 0 (green, MAIN): one action per press, on the press itself.
 * - button 1 (white, MODE/OPTION): short press on release cycles the option;
 *   holding to MODE_BUTTON_HOLD_MS cycles the main mode once, while held.
 */

/**
 * How long the white button must be held to switch MAIN MODE instead of
 * cycling the current mode's option. Change this one number to retune it.
 */
export const MODE_BUTTON_HOLD_MS = 800;

/** Green MAIN button. */
export const MAIN_BUTTON_INDEX = 0;

/** White MODE/OPTION button. */
export const MODE_BUTTON_INDEX = 1;

export interface ButtonStateLike {
  readonly pressed: boolean;
}

/**
 * The subset of a `Gamepad` this module needs. Narrow on purpose: tests can
 * pass plain objects, and nothing here depends on a device name or index.
 */
export interface GamepadLike {
  readonly connected: boolean;
  readonly buttons: readonly ButtonStateLike[];
}

export type GamepadGesture = "main" | "option" | "mode";

export interface GamepadRecogniserOptions {
  onGesture: (gesture: GamepadGesture) => void;
  /** Defaults to MODE_BUTTON_HOLD_MS. */
  holdMs?: number;
}

export interface GamepadRecogniser {
  /**
   * Feed the current button snapshot at clock reading `now`.
   *
   * `null` means no controller is active: any gesture in flight is abandoned
   * and the next press must begin from a released button.
   *
   * `selectionEnabled` is false while a round is in flight. The white button's
   * gestures are then dropped entirely — including one that began while
   * selection was allowed — so a press cannot land after the state changes.
   */
  update: (
    buttons: readonly ButtonStateLike[] | null,
    now: number,
    selectionEnabled?: boolean,
  ) => void;
  /**
   * Abandon a press in flight without firing anything. A button that is still
   * held afterwards is ignored until it is released, so a disconnected,
   * blurred, or hidden controller cannot complete a gesture later.
   */
  cancel: () => void;
}

export function createGamepadRecogniser({
  onGesture,
  holdMs = MODE_BUTTON_HOLD_MS,
}: GamepadRecogniserOptions): GamepadRecogniser {
  /**
   * "Armed" means the button has been seen released since the last gesture,
   * the last cancel, or a fresh controller binding. It is what makes the first
   * press after plugging in (which browsers use just to reveal the controller)
   * harmless, and what stops a held button from repeating while the tab is
   * hidden or the window is unfocused.
   */
  let mainArmed = false;
  let mainDown = false;

  let modeArmed = false;
  /** When the current white-button press began; null when it is not held. */
  let modeDownSince: number | null = null;
  /** The hold action already fired for this press, so it cannot fire again. */
  let modeHoldFired = false;

  const cancel = () => {
    mainArmed = false;
    mainDown = false;
    modeArmed = false;
    modeDownSince = null;
    modeHoldFired = false;
  };

  return {
    update(buttons, now, selectionEnabled = true) {
      if (buttons === null) {
        cancel();
        return;
      }

      // Green: fire on the released-to-pressed edge, then latch until release.
      // Holding therefore produces exactly one action, never a repeat.
      if (isPressed(buttons, MAIN_BUTTON_INDEX)) {
        if (mainArmed && !mainDown) {
          mainDown = true;
          onGesture("main");
        }
      } else {
        mainDown = false;
        mainArmed = true;
      }

      if (!selectionEnabled) {
        // Selection is unavailable right now. Drop the white button's state
        // rather than merely ignoring the action: a gesture begun during a
        // round must not complete after the round ends, and a button still
        // held when selection returns must be released first.
        modeArmed = false;
        modeDownSince = null;
        modeHoldFired = false;
        return;
      }

      // White: short press fires on release; the threshold fires once while
      // still held. A release after the hold fires nothing, and continuing to
      // hold fires nothing more, because modeDownSince stays set until release.
      if (isPressed(buttons, MODE_BUTTON_INDEX)) {
        if (modeArmed) {
          if (modeDownSince === null) {
            modeDownSince = now;
            modeHoldFired = false;
          } else if (!modeHoldFired && now - modeDownSince >= holdMs) {
            modeHoldFired = true;
            onGesture("mode");
          }
        }
      } else {
        if (modeDownSince !== null && !modeHoldFired) {
          onGesture("option");
        }

        modeDownSince = null;
        modeHoldFired = false;
        modeArmed = true;
      }
    },

    cancel,
  };
}

function isPressed(
  buttons: readonly ButtonStateLike[],
  index: number,
): boolean {
  return buttons[index]?.pressed === true;
}

/**
 * Choose the one controller whose input is read.
 *
 * A currently active controller keeps control while it stays connected, even
 * if other pads appear, so two devices can never combine into one gesture. When
 * it disconnects, the first connected controller becomes active. No device name
 * or fixed index is assumed.
 */
export function pickActiveGamepad<T extends GamepadLike>(
  pads: readonly (T | null | undefined)[],
  current: number | null,
): number | null {
  if (current !== null && pads[current]?.connected === true) {
    return current;
  }

  const next = pads.findIndex((pad) => pad?.connected === true);

  return next === -1 ? null : next;
}
