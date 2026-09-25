/**
 * Press recognition: one button press in, at most one semantic action out.
 *
 * This module knows nothing about timers, rounds, React, or the DOM. It only
 * decides whether a press was short or long. That split is deliberate: physical
 * GPIO later calls pressDown/pressUp/cancel on the same recogniser, and the
 * round logic does not change.
 *
 * Timing model, stated explicitly because it is observable:
 * - The LONG action fires at the threshold, while the button is still held.
 * - The SHORT action fires on release, so it is delayed by however long the
 *   press lasted (at most one threshold). A short press therefore feels
 *   "committed on release", not "fired on touch-down".
 * - A press produces exactly one action. Once the long action has fired, the
 *   release that follows never also fires a short action.
 */

/** How long a press must be held to count as long. */
export const LONG_PRESS_MS = 600;

export type PressKind = "short" | "long";

export interface PressRecogniser {
  /** A button was pressed down and is still held. */
  pressDown: () => void;
  /** The held button was released. Fires the short action if none has fired. */
  pressUp: () => void;
  /** The press was abandoned: pointer left, pointer cancelled, blur, unmount. */
  cancel: () => void;
}

export interface PressRecogniserOptions {
  onPress: (kind: PressKind) => void;
  longPressMs?: number;
}

export function createPressRecogniser({
  onPress,
  longPressMs = LONG_PRESS_MS,
}: PressRecogniserOptions): PressRecogniser {
  let timerId: ReturnType<typeof setTimeout> | null = null;
  /** A press is in flight: pressed down, no action fired yet. */
  let held = false;
  /** The long action already fired for the current press. */
  let longFired = false;

  const clearPending = () => {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  };

  return {
    pressDown() {
      // Ignore a repeat while still held: multi-touch, a duplicated pointerdown,
      // or key repeat must all count as a single press.
      if (held) {
        return;
      }

      held = true;
      longFired = false;
      clearPending();

      timerId = setTimeout(() => {
        timerId = null;
        longFired = true;
        onPress("long");
      }, longPressMs);
    },

    pressUp() {
      // Release without a matching pressDown: the press was already cancelled,
      // so there is nothing to fire.
      if (!held) {
        return;
      }

      held = false;
      clearPending();

      const alreadyFired = longFired;
      longFired = false;

      if (!alreadyFired) {
        onPress("short");
      }
    },

    cancel() {
      // Cancelling never fires an action, and never reverses one that already
      // fired: a long press that completed at the threshold stands.
      held = false;
      longFired = false;
      clearPending();
    },
  };
}
