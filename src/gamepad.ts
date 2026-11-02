/**
 * Physical arcade button input, via the browser Gamepad API.
 *
 * This module is deliberately free of React, timers and the DOM: it is fed a
 * button snapshot and a clock reading, and emits at most one gesture per
 * physical press. The polling layer (see useGamepadInput) and the tests both
 * drive it the same way.
 *
 * Mapping, as agreed for the two-button arcade panel:
 * - button 0 (green, MAIN): short press on release starts, pauses or resumes;
 *   holding to MAIN_BUTTON_HOLD_MS resets the session once, while held.
 * - button 1 (white, MODE/OPTION): short press on release cycles the option;
 *   holding to MODE_BUTTON_HOLD_MS cycles the main mode once, while held.
 */

/**
 * How long the green MAIN/START button must be held to reset the session.
 * Change this one number to retune it; the on-screen Main control uses it too.
 */
export const MAIN_BUTTON_HOLD_MS = 1_500;

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

export type GamepadGesture =
  | {
      kind: "mainShort";
      /**
       * The timer state the press began in. The reducer can refuse the action
       * if the timer moved on before the button came up.
       */
      stateKey: string;
    }
  | { kind: "mainHold" }
  | { kind: "option" }
  | { kind: "mode" };

export interface GamepadUpdate {
  /** False while a mode or option change is not allowed (round in flight). */
  selectionEnabled?: boolean;
  /** Identifies the current timer state, used to cancel stale presses. */
  stateKey?: string;
  /**
   * Initial controller discovery only: adopt buttons that are already down as
   * presses that began with this first observation.
   *
   * Browsers commonly reveal a gamepad only in response to its first button
   * press, so that press is otherwise lost to the application. The Gamepad API
   * cannot say whether the button was down before the page saw the controller,
   * or for how long; this adopts it at `now`, so the hold threshold counts from
   * the first observed frame and a release is a normal short press.
   */
  adoptInitialPress?: boolean;
}

/**
 * What the interface should show for the green button right now.
 * `mainHoldProgress` runs from 0 to 1 towards the reset threshold.
 */
export interface GamepadFeedback {
  mainPressed: boolean;
  mainHoldProgress: number;
}

export interface GamepadRecogniserOptions {
  onGesture: (gesture: GamepadGesture) => void;
  /** Defaults to MAIN_BUTTON_HOLD_MS. */
  mainHoldMs?: number;
  /** Defaults to MODE_BUTTON_HOLD_MS. */
  modeHoldMs?: number;
}

export interface GamepadRecogniser {
  /**
   * Feed the current button snapshot at clock reading `now`.
   *
   * `null` means no controller is active: any gesture in flight is abandoned
   * and the next press must begin from a released button.
   *
   * The returned feedback is the pressed state and hold progress for the green
   * button, so the interface can show the same gesture the operator is making.
   */
  update: (
    buttons: readonly ButtonStateLike[] | null,
    now: number,
    update?: GamepadUpdate,
  ) => GamepadFeedback;
  /**
   * Abandon a press in flight without firing anything. A button that is still
   * held afterwards is ignored until it is released, so a disconnected,
   * blurred, or hidden controller cannot complete a gesture later.
   */
  cancel: () => void;
}

const IDLE_FEEDBACK: GamepadFeedback = {
  mainPressed: false,
  mainHoldProgress: 0,
};

export function createGamepadRecogniser({
  onGesture,
  mainHoldMs = MAIN_BUTTON_HOLD_MS,
  modeHoldMs = MODE_BUTTON_HOLD_MS,
}: GamepadRecogniserOptions): GamepadRecogniser {
  /**
   * "Armed" means the button has been seen released since the last gesture,
   * the last cancel, or a fresh controller binding. It is what makes the first
   * press after plugging in (which browsers use just to reveal the controller)
   * harmless, and what stops a held button from repeating while the tab is
   * hidden or the window is unfocused.
   */
  let mainArmed = false;
  /** When the current green-button press began; null when it is not held. */
  let mainDownSince: number | null = null;
  /** The reset already fired for this press, so it cannot fire again. */
  let mainHoldFired = false;
  /** Timer state when this green press began, to detect an independent change. */
  let mainStateKey: string | null = null;

  let modeArmed = false;
  /** When the current white-button press began; null when it is not held. */
  let modeDownSince: number | null = null;
  /** The hold action already fired for this press, so it cannot fire again. */
  let modeHoldFired = false;

  const cancel = () => {
    mainArmed = false;
    mainDownSince = null;
    mainHoldFired = false;
    mainStateKey = null;

    modeArmed = false;
    modeDownSince = null;
    modeHoldFired = false;
  };

  return {
    update(buttons, now, update = {}) {
      if (buttons === null) {
        cancel();
        return IDLE_FEEDBACK;
      }

      const { selectionEnabled = true, stateKey = "" } = update;
      const mainPressed = isPressed(buttons, MAIN_BUTTON_INDEX);
      const modePressed = isPressed(buttons, MODE_BUTTON_INDEX);

      /*
       * Initial discovery: a browser often exposes the controller only when its
       * first button is pressed. Adopt whatever is down on this first frame as a
       * press that began now, instead of discarding it and demanding a second
       * press. This runs once, only while both buttons are still disarmed, so a
       * later reconnection or cancel cannot replay it.
       *
       * Limitation: the API gives no history. If a browser never exposes the
       * activating press at all, it cannot be recovered; and the unknown part of
       * the hold before this frame is not counted.
       */
      if (update.adoptInitialPress === true && !mainArmed && !modeArmed) {
        mainArmed = true;
        modeArmed = true;

        if (mainPressed) {
          mainDownSince = now;
          mainHoldFired = false;
          mainStateKey = stateKey;
        }

        if (modePressed) {
          modeDownSince = now;
          modeHoldFired = false;
        }
      }

      // Green: short action on release, reset once at the threshold. Nothing
      // happens on press-down, so a press can be abandoned without starting,
      // pausing or resuming anything.
      if (mainPressed) {
        if (mainArmed) {
          if (mainDownSince === null) {
            mainDownSince = now;
            mainHoldFired = false;
            mainStateKey = stateKey;
          } else if (mainStateKey !== stateKey) {
            // The timer changed state underneath the press (for example the
            // round finished). Consume the gesture and wait for a release:
            // never reinterpret this press as an action for the new state.
            mainDownSince = null;
            mainHoldFired = false;
            mainStateKey = null;
            mainArmed = false;
          } else if (!mainHoldFired && now - mainDownSince >= mainHoldMs) {
            mainHoldFired = true;
            onGesture({ kind: "mainHold" });
          }
        }
      } else {
        if (
          mainDownSince !== null &&
          !mainHoldFired &&
          mainStateKey === stateKey
        ) {
          onGesture({
            kind: "mainShort",
            stateKey: mainStateKey ?? stateKey,
          });
        }

        mainDownSince = null;
        mainHoldFired = false;
        mainStateKey = null;
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
      } else if (modePressed) {
        if (modeArmed) {
          if (modeDownSince === null) {
            modeDownSince = now;
            modeHoldFired = false;
          } else if (!modeHoldFired && now - modeDownSince >= modeHoldMs) {
            modeHoldFired = true;
            onGesture({ kind: "mode" });
          }
        }
      } else {
        if (modeDownSince !== null && !modeHoldFired) {
          onGesture({ kind: "option" });
        }

        modeDownSince = null;
        modeHoldFired = false;
        modeArmed = true;
      }

      let mainHoldProgress = 0;

      if (mainPressed && mainDownSince !== null && !mainHoldFired) {
        mainHoldProgress = clamp01((now - mainDownSince) / mainHoldMs);
      }

      return { mainPressed, mainHoldProgress };
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

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
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
