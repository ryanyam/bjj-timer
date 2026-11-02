import { useEffect, useReducer, useState, type MouseEvent } from "react";
import { formatRemaining } from "./timer";
import { createPressRecogniser, type PressRecogniser } from "./press";
import {
  displayMs,
  initialRoundState,
  isPlaceholderMode,
  mainLabel,
  modeIsActive,
  reduce,
  roundDurationMs,
  selectionLabel,
} from "./round";
import { useGamepadInput, type GamepadStatus } from "./useGamepadInput";
import "./App.css";

/**
 * How often the display re-reads the clock. This is a refresh rate, not the
 * length of the round: round length comes from the selected mode, and this only
 * decides how quickly the screen notices that time has passed.
 */
const TICK_MS = 250;

const GAMEPAD_STATUS_TEXT: Record<GamepadStatus, string> = {
  connected: "Controller connected",
  waiting: "Controller: press a button to connect",
  unsupported: "Controller: not available in this browser",
};

function App() {
  const [state, dispatch] = useReducer(reduce, initialRoundState);
  const [now, setNow] = useState(() => Date.now());

  const modeActive = modeIsActive(state);

  /*
   * Main short press. Shared by the green arcade button and the on-screen
   * Main control, so the hardware and the screen always run the same action.
   *
   * The display clock is refreshed with the same reading that drives the
   * action, so a new deadline is always rendered against the instant it was
   * built from. Without this, the first frame after Start would show the time
   * left as measured from an older clock reading.
   */
  const mainShort = () => {
    const reading = Date.now();
    setNow(reading);
    dispatch({ type: "mainShort", now: reading });
  };

  /*
   * One recogniser per operator input, created once and never replaced: a hold
   * must not be forgotten because React re-rendered. A future GPIO layer would
   * build the very same objects and call pressDown/pressUp on them.
   *
   * `useState` with an initialiser is how a long-lived object is created once
   * without reading a ref during render.
   */
  const [mainPress] = useState(() =>
    createPressRecogniser({
      onPress: (kind) => {
        if (kind === "long") {
          const reading = Date.now();
          setNow(reading);
          dispatch({ type: "mainLong", now: reading });
        } else {
          mainShort();
        }
      },
    }),
  );

  const [modePress] = useState(() =>
    createPressRecogniser({
      onPress: (kind) => {
        // The on-screen Mode control keeps its original mapping: short cycles
        // the main mode, long cycles the option within it.
        dispatch({ type: kind === "long" ? "modeLong" : "modeShort" });
      },
    }),
  );

  /*
   * The arcade panel's white button inverts that mapping, as agreed: short
   * press cycles the option, an 800 ms hold cycles the main mode. Both reuse
   * the reducer actions above rather than duplicating timer or selection logic.
   */
  const gamepadStatus = useGamepadInput({
    onMain: mainShort,
    onOption: () => dispatch({ type: "modeLong" }),
    onMode: () => dispatch({ type: "modeShort" }),
    selectionEnabled: modeActive,
  });

  useEffect(() => {
    if (state.phase !== "running" || state.deadline === null) {
      return;
    }

    // Every tick reads the clock again and re-derives what is left, instead of
    // subtracting from a stored total. That is what makes the countdown
    // self-correcting: a late, skipped or doubled tick cannot make the round run
    // long, because the next tick starts from the truth again.
    const tick = () => {
      const reading = Date.now();
      setNow(reading);
      dispatch({ type: "tick", now: reading });
    };

    const intervalId = setInterval(tick, TICK_MS);

    // Clearing the loop here is what stops StrictMode's development double-mount
    // (and unmounting mid-round) from leaving a ticking loop behind.
    return () => clearInterval(intervalId);
  }, [state.phase, state.deadline]);

  useEffect(() => {
    const cancelPresses = () => {
      mainPress.cancel();
      modePress.cancel();
    };

    // Losing focus abandons a press in flight: the operator has looked away, and a
    // half-finished hold must not complete later.
    window.addEventListener("blur", cancelPresses);

    return () => {
      window.removeEventListener("blur", cancelPresses);
      // Unmount: drop any outstanding hold without firing anything.
      cancelPresses();
    };
  }, [mainPress, modePress]);

  return (
    <main className="timer">
      <div className="timer__mode">
        <span className="timer__mode-value">
          {`Mode ${selectionLabel(state)}`}
        </span>
        {isPlaceholderMode(state) && (
          <span className="timer__mode-note">
            Placeholder — not a real preset yet
          </span>
        )}
      </div>

      <div className="timer__readout">
        <div className="timer__clock" role="timer">
          {formatRemaining(displayMs(state, now))}
        </div>

        {/*
          The round's CONFIGURED length, from the selected mode. Never derived
          from what is left, so it stays put while the clock counts down. It sits
          outside the role="timer" element so that element still speaks only the
          remaining time.
        */}
        <p className="timer__duration">
          {`Round: ${formatRemaining(roundDurationMs(state.modeIndex))}`}
        </p>
      </div>

      <div className="timer__controls">
        {/*
          Main is never disabled. A long hold must keep working while a round runs
          or is paused, even though the short action changes meaning there.
        */}
        <div className="timer__control">
          <button
            type="button"
            aria-describedby="main-hint"
            {...pressHandlers(mainPress)}
          >
            {mainLabel(state)}
          </button>
          <span className="timer__hint" id="main-hint">
            Hold to reset
          </span>
        </div>

        {/*
          Mode stays visible and focusable. While a round is in flight the reducer
          ignores its presses, so the hint must not promise that holding works
          right now.
        */}
        <div className="timer__control">
          <button
            type="button"
            aria-disabled={modeActive ? undefined : true}
            aria-describedby="mode-hint"
            {...pressHandlers(modePress)}
          >
            Mode
          </button>
          <span className="timer__hint" id="mode-hint">
            {modeActive
              ? "Hold for options"
              : "Unavailable until the round ends"}
          </span>
        </div>
      </div>

      {/*
        The physical panel's help. Quiet by design: the countdown stays the
        dominant element, and none of this is an interactive control.
      */}
      <footer className="timer__gamepad">
        <p
          className={`timer__gamepad-status timer__gamepad-status--${gamepadStatus}`}
        >
          {GAMEPAD_STATUS_TEXT[gamepadStatus]}
        </p>
        <p className="timer__gamepad-hint">Green: Start / Pause / Reset</p>
        <p className="timer__gamepad-hint">
          White: Press for option · Hold for mode
        </p>
      </footer>
    </main>
  );
}

/**
 * Bridges a pointer to one recogniser.
 *
 * Only pointer events drive the timing. A real mouse press also emits `click`
 * after pointerup, so `click` is used *only* for keyboard activation, which
 * arrives with `detail === 0` and never follows a pointer press. That is what
 * keeps one press from firing two actions.
 */
function pressHandlers(recogniser: PressRecogniser) {
  return {
    onPointerDown: () => recogniser.pressDown(),
    onPointerUp: () => recogniser.pressUp(),
    onPointerLeave: () => recogniser.cancel(),
    onPointerCancel: () => recogniser.cancel(),
    onClick: (event: MouseEvent<HTMLButtonElement>) => {
      if (event.detail !== 0) {
        return;
      }

      // Keyboard: one complete short press, with no hold to time.
      recogniser.pressDown();
      recogniser.pressUp();
    },
  };
}

export default App;
