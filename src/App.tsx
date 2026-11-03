import {
  useEffect,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { formatRemaining } from "./timer";
import { createPressRecogniser, type PressRecogniser } from "./press";
import {
  currentMode,
  currentPresetIndex,
  displayMs,
  initialRoundState,
  mainLabel,
  nextPhase,
  phaseLabel,
  reduce,
  selectionAllowed,
  stateKey,
} from "./round";
import {
  TRAINING_MODES,
  compactPresetLabel,
  fullPresetLabel,
} from "./training";
import { playRestStart, playWorkStart, unlockAudio } from "./audio";
import { useGamepadInput, type GamepadStatus } from "./useGamepadInput";
import { MAIN_BUTTON_HOLD_MS, MODE_BUTTON_HOLD_MS } from "./gamepad";
import "./App.css";

/**
 * How often the display re-reads the clock. This is a refresh rate, not the
 * length of a phase: durations come from the selected preset, and this only
 * decides how quickly the screen notices that time has passed.
 */
const TICK_MS = 250;

/** How long the non-blocking selection notice stays on screen. */
const NOTICE_MS = 2_200;

const GAMEPAD_STATUS_TEXT: Record<GamepadStatus, string> = {
  connected: "Controller connected",
  waiting: "Waiting for controller input",
  disconnected: "Controller disconnected",
  unsupported: "Controller: not available in this browser",
};

function App() {
  const [state, dispatch] = useReducer(reduce, initialRoundState);
  const [now, setNow] = useState(() => Date.now());
  const [notice, setNotice] = useState<string | null>(null);

  const mode = currentMode(state);
  const presetIndex = currentPresetIndex(state);
  const preview = nextPhase(state);
  const canSelect = selectionAllowed(state);

  /*
   * Main short press. Shared by the green arcade button and the on-screen
   * Main control, so the hardware and the screen always run the same action.
   *
   * The display clock is refreshed with the same reading that drives the
   * action. `fromState` is supplied by the physical button, which can be held
   * across a phase transition; the reducer refuses a stale action.
   */
  const mainShort = (fromState?: string) => {
    unlockAudio();
    const reading = Date.now();
    setNow(reading);
    dispatch({ type: "mainShort", now: reading, fromState });
  };

  /** Full-session reset, shared by a hold on either input. */
  const mainLong = () => {
    unlockAudio();
    setNotice(null);
    const reading = Date.now();
    setNow(reading);
    dispatch({ type: "mainLong", now: reading });
  };

  const cyclePreset = () => {
    unlockAudio();
    dispatch({ type: "nextPreset" });
  };

  const cycleMode = () => {
    unlockAudio();
    dispatch({ type: "nextMode" });
  };

  const chooseMode = (modeIndex: number) => {
    unlockAudio();
    dispatch({ type: "selectMode", modeIndex });
  };

  const choosePreset = (presetIndexToSelect: number) => {
    unlockAudio();
    dispatch({ type: "selectPreset", presetIndex: presetIndexToSelect });
  };

  /*
   * One recogniser per operator input, created once and never replaced: a hold
   * must not be forgotten because React re-rendered. A future GPIO layer would
   * build the very same objects and call pressDown/pressUp on them.
   */
  const [mainPress] = useState(() =>
    createPressRecogniser({
      longPressMs: MAIN_BUTTON_HOLD_MS,
      onPress: (kind) => {
        if (kind === "long") {
          mainLong();
        } else {
          mainShort();
        }
      },
    }),
  );

  const [modePress] = useState(() =>
    createPressRecogniser({
      longPressMs: MODE_BUTTON_HOLD_MS,
      onPress: (kind) => {
        // Same mapping as the white arcade button: short cycles the preset,
        // hold cycles the main mode. The reducer enforces Ready-only selection.
        if (kind === "long") {
          cycleMode();
        } else {
          cyclePreset();
        }
      },
    }),
  );

  const gamepad = useGamepadInput({
    onMain: mainShort,
    onMainHold: mainLong,
    onOption: cyclePreset,
    onMode: cycleMode,
    stateKey: stateKey(state),
  });

  useEffect(() => {
    if (state.status !== "running" || state.deadline === null) {
      return;
    }

    // Every tick reads the clock again and re-derives what is left, instead of
    // subtracting from a stored total. That is what makes the countdown
    // self-correcting: a late, skipped or doubled tick cannot make a phase run
    // long, because the next tick starts from the truth again.
    const tick = () => {
      const reading = Date.now();
      setNow(reading);
      dispatch({ type: "tick", now: reading });
    };

    const intervalId = setInterval(tick, TICK_MS);

    return () => clearInterval(intervalId);
  }, [state.status, state.deadline]);

  /*
   * One cue per rendered transition. If a delayed tick crossed several phase
   * boundaries, the reducer reports the final live phase and this effect runs
   * once, so no burst of obsolete cues is played.
   */
  const previousTransitionSeq = useRef(state.transitionSeq);

  useEffect(() => {
    if (state.transitionSeq === previousTransitionSeq.current) {
      return;
    }

    previousTransitionSeq.current = state.transitionSeq;

    if (state.status !== "running") {
      return;
    }

    if (state.lastTransition === "rest") {
      playRestStart();
    } else if (state.lastTransition === "work") {
      playWorkStart();
    }
  }, [state.transitionSeq, state.status, state.lastTransition]);

  /*
   * A blocked selection attempt is recorded by the reducer, then acknowledged
   * once, asynchronously, so the effect does not set state during the render
   * commit. The message auto-dismisses and is re-armed only by a new gesture.
   */
  useEffect(() => {
    if (state.blockedSelectionSeq === 0) {
      return;
    }

    let hideId: ReturnType<typeof setTimeout> | null = null;
    const showId = setTimeout(() => {
      setNotice("Hold green to reset before changing.");
      hideId = setTimeout(() => {
        setNotice(null);
        hideId = null;
      }, NOTICE_MS);
    }, 0);

    return () => {
      clearTimeout(showId);

      if (hideId !== null) {
        clearTimeout(hideId);
      }
    };
  }, [state.blockedSelectionSeq]);

  useEffect(() => {
    const cancelPresses = () => {
      mainPress.cancel();
      modePress.cancel();
    };

    // Losing focus abandons a press in flight: the operator has looked away, and
    // a half-finished hold must not complete later.
    window.addEventListener("blur", cancelPresses);

    return () => {
      window.removeEventListener("blur", cancelPresses);
      // Unmount: drop any outstanding hold without firing anything.
      cancelPresses();
    };
  }, [mainPress, modePress]);

  return (
    <main
      className="timer"
      data-mode={mode.id}
      data-phase={state.phase}
      data-status={state.status}
    >
      <section className="timer__selection" aria-label="Training selection">
        <div
          className="timer__selector-row"
          role="group"
          aria-label="Main mode"
        >
          {TRAINING_MODES.map((option, index) => {
            const selected = index === state.modeIndex;

            return (
              <button
                key={option.id}
                type="button"
                className="timer__selector timer__selector--mode"
                data-selected={selected ? "true" : undefined}
                aria-pressed={selected}
                aria-disabled={canSelect ? undefined : true}
                onClick={() => chooseMode(index)}
              >
                {option.title}
              </button>
            );
          })}
        </div>

        <div className="timer__selector-row" role="group" aria-label="Preset">
          {mode.presets.map((option, index) => {
            const selected = index === presetIndex;

            return (
              <button
                key={option.id}
                type="button"
                className="timer__selector timer__selector--preset"
                data-selected={selected ? "true" : undefined}
                aria-pressed={selected}
                aria-disabled={canSelect ? undefined : true}
                onClick={() => choosePreset(index)}
              >
                {selected
                  ? fullPresetLabel(option)
                  : compactPresetLabel(option)}
              </button>
            );
          })}
        </div>

        <p
          className={`timer__message${
            notice === null ? "" : " timer__message--notice"
          }`}
          role="status"
          aria-live="polite"
        >
          {notice ??
            (canSelect
              ? "White: preset · Hold white: mode · Green: start"
              : "Selection locked — hold green to reset")}
        </p>
      </section>

      <div className="timer__readout">
        <div className="timer__context">
          <span className="timer__mode-context">{mode.title}</span>
          <span className="timer__context-separator" aria-hidden="true">
            ·
          </span>
          <span className="timer__phase">{phaseLabel(state)}</span>
          {state.status === "paused" && (
            <span className="timer__paused">PAUSED</span>
          )}
        </div>

        <div className="timer__clock" role="timer">
          {formatRemaining(displayMs(state, now))}
        </div>

        <div className="timer__meta">
          <span className="timer__round">{`ROUND ${state.round}`}</span>
          <span className="timer__next">
            {`NEXT: ${preview.label} ${formatRemaining(preview.ms)}`}
          </span>
        </div>
      </div>

      <div className="timer__controls">
        {/*
          Main is never disabled. A long hold must keep working while a session
          runs or is paused, even though the short action changes meaning there.
        */}
        <div className="timer__control">
          <button
            type="button"
            aria-describedby="main-hint"
            data-main-held={gamepad.mainPressed ? "true" : undefined}
            style={mainHoldStyle(gamepad.mainHoldProgress)}
            {...pressHandlers(mainPress)}
          >
            {mainLabel(state)}
          </button>
          <span className="timer__hint" id="main-hint">
            Hold to reset
          </span>
        </div>

        {/*
          Mode stays visible and focusable. While a session is in flight the
          reducer refuses its selections and records the attempt for the notice.
        */}
        <div className="timer__control">
          <button
            type="button"
            aria-disabled={canSelect ? undefined : true}
            aria-describedby="mode-hint"
            {...pressHandlers(modePress)}
          >
            Mode
          </button>
          <span className="timer__hint" id="mode-hint">
            {canSelect ? "Press: preset · Hold: mode" : "Locked until reset"}
          </span>
        </div>
      </div>

      {/*
        The physical panel's help. Quiet by design: the countdown stays the
        dominant element, and none of this is an interactive control.
      */}
      <footer className="timer__gamepad">
        <p
          className={`timer__gamepad-status timer__gamepad-status--${gamepad.status}`}
        >
          {GAMEPAD_STATUS_TEXT[gamepad.status]}
        </p>
        <p className="timer__gamepad-hint">
          Green: Start / Pause / Resume · Hold to reset
        </p>
        <p className="timer__gamepad-hint">
          White: Press for preset · Hold for mode
        </p>
      </footer>
    </main>
  );
}

/**
 * A CSS custom property drives the fill inside the Main button, so the hold
 * progress is visible without adding an element or shifting the layout.
 */
function mainHoldStyle(progress: number): CSSProperties {
  return { "--main-hold": `${Math.round(progress * 100)}%` } as CSSProperties;
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
