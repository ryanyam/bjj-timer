import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { formatRemaining } from "./timer";
import { createPressRecogniser } from "./press";
import {
  currentMode,
  currentPreset,
  currentPresetIndex,
  displayMs,
  inFinalTen,
  initialRoundState,
  mainLabel,
  nextPhase,
  phaseHeadline,
  phaseLabel,
  phaseProgress,
  reduce,
  selectionAllowed,
  stateKey,
  statusTone,
} from "./round";
import {
  TRAINING_MODES,
  compactPresetLabel,
  fullPresetLabel,
} from "./training";
import { LiveClock } from "./LiveClock";
import logoUrl from "./assets/alliance-jiu-jitsu-manila.jpg";
import {
  playModeChange,
  playRestStart,
  playWorkStart,
  unlockAudio,
} from "./audio";
import { useGamepadInput } from "./useGamepadInput";
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

/** Refresh rate for the pointer/touch hold-progress fill. */
const POINTER_HOLD_PROGRESS_MS = 50;

function App() {
  const [state, dispatch] = useReducer(reduce, initialRoundState);
  const [now, setNow] = useState(() => Date.now());
  const [notice, setNotice] = useState<string | null>(null);
  const [modeFlash, setModeFlash] = useState<string | null>(null);

  const mode = currentMode(state);
  const preset = currentPreset(state);
  const presetIndex = currentPresetIndex(state);
  const preview = nextPhase(state);
  const canSelect = selectionAllowed(state);
  const tone = statusTone(state);
  const phasePercent = phaseProgress(state, now);
  const headline = phaseHeadline(state);
  const urgent = inFinalTen(state, now);

  /*
   * Pointer/touch hold progress uses the same threshold and clock-based timing
   * as the reset recogniser. The controller reports its own progress from the
   * gamepad hook; the button displays the larger of the two so either input
   * shows the same fill.
   */
  const [pointerHoldProgress, setPointerHoldProgress] = useState(0);
  const pointerHoldStartedAt = useRef<number | null>(null);
  const pointerHoldTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearPointerHoldTimer = useCallback(() => {
    if (pointerHoldTimer.current !== null) {
      clearInterval(pointerHoldTimer.current);
      pointerHoldTimer.current = null;
    }

    pointerHoldStartedAt.current = null;
  }, []);

  const stopPointerHold = useCallback(() => {
    clearPointerHoldTimer();
    setPointerHoldProgress(0);
  }, [clearPointerHoldTimer]);

  const startPointerHold = useCallback(() => {
    if (pointerHoldStartedAt.current !== null) {
      return;
    }

    pointerHoldStartedAt.current = Date.now();
    setPointerHoldProgress(0);

    pointerHoldTimer.current = setInterval(() => {
      const startedAt = pointerHoldStartedAt.current;

      if (startedAt === null) {
        return;
      }

      const progress = Math.min(
        1,
        (Date.now() - startedAt) / MAIN_BUTTON_HOLD_MS,
      );

      // Stop sampling and clear at the threshold, when the reset recogniser
      // fires. Keep the start time until release/reset so a repeated
      // pointerdown while held cannot restart the visual fill.
      if (progress >= 1) {
        if (pointerHoldTimer.current !== null) {
          clearInterval(pointerHoldTimer.current);
          pointerHoldTimer.current = null;
        }

        setPointerHoldProgress(0);
        return;
      }

      setPointerHoldProgress(progress);
    }, POINTER_HOLD_PROGRESS_MS);
  }, []);

  /*
   * The white Mode control has a shorter hold. It gets the same visible
   * feedback treatment: a gold ring that becomes more visible as the 800 ms
   * mode-hold threshold approaches.
   */
  const [modeHoldProgress, setModeHoldProgress] = useState(0);
  const modeHoldStartedAt = useRef<number | null>(null);
  const modeHoldTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearModeHoldTimer = useCallback(() => {
    if (modeHoldTimer.current !== null) {
      clearInterval(modeHoldTimer.current);
      modeHoldTimer.current = null;
    }

    modeHoldStartedAt.current = null;
  }, []);

  const stopModeHold = useCallback(() => {
    clearModeHoldTimer();
    setModeHoldProgress(0);
  }, [clearModeHoldTimer]);

  const startModeHold = useCallback(() => {
    if (modeHoldStartedAt.current !== null) {
      return;
    }

    modeHoldStartedAt.current = Date.now();
    setModeHoldProgress(0);

    modeHoldTimer.current = setInterval(() => {
      const startedAt = modeHoldStartedAt.current;

      if (startedAt === null) {
        return;
      }

      const progress = Math.min(
        1,
        (Date.now() - startedAt) / MODE_BUTTON_HOLD_MS,
      );

      if (progress >= 1) {
        if (modeHoldTimer.current !== null) {
          clearInterval(modeHoldTimer.current);
          modeHoldTimer.current = null;
        }

        setModeHoldProgress(0);
        return;
      }

      setModeHoldProgress(progress);
    }, POINTER_HOLD_PROGRESS_MS);
  }, []);

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

  const mainHoldProgress = Math.max(
    pointerHoldProgress,
    gamepad.mainHoldProgress,
  );

  const controllerError =
    gamepad.status === "disconnected"
      ? "Controller disconnected"
      : gamepad.status === "unsupported"
        ? "Controller unavailable"
        : null;

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
   * A mode change gets a single short confirmation: one beep and a one-second
   * flash of the new mode name. The mode object is stable per index, so this
   * runs once per change, not once per timer tick.
   */
  const previousMode = useRef(mode.id);

  useEffect(() => {
    if (mode.id === previousMode.current) {
      return;
    }

    previousMode.current = mode.id;
    playModeChange();

    const showId = setTimeout(() => setModeFlash(mode.title), 0);
    const hideId = setTimeout(() => setModeFlash(null), 1_000);

    return () => {
      clearTimeout(showId);
      clearTimeout(hideId);
    };
  }, [mode]);

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
      stopPointerHold();
      stopModeHold();
    };

    // Losing focus abandons a press in flight: the operator has looked away, and
    // a half-finished hold must not complete later.
    window.addEventListener("blur", cancelPresses);

    return () => {
      window.removeEventListener("blur", cancelPresses);
      // Unmount: drop any outstanding hold without firing anything, and clear
      // the progress samplers without scheduling another render.
      mainPress.cancel();
      modePress.cancel();
      clearPointerHoldTimer();
      clearModeHoldTimer();
    };
  }, [
    mainPress,
    modePress,
    stopPointerHold,
    clearPointerHoldTimer,
    stopModeHold,
    clearModeHoldTimer,
  ]);

  return (
    <div
      className="app"
      data-mode={mode.id}
      data-phase={state.phase}
      data-status={state.status}
    >
      <header className="app-header">
        <img
          className="app-header__logo"
          src={logoUrl}
          alt="Alliance Jiu Jitsu Manila"
        />
        <LiveClock />
      </header>

      <main className="app-main">
        <div className="app-main__stage">
          <div
            className={`phase-band status-badge status-badge--${tone} phase-band--${tone}${urgent ? " phase-band--urgent" : ""}`}
            data-phase={state.phase}
            role="status"
            aria-live="polite"
          >
            <span className="phase-band__label">{headline}</span>{" "}
            <span className="phase-band__detail">
              {headline === phaseLabel(state)
                ? mode.title
                : `${phaseLabel(state)} · ${mode.title}`}
            </span>
          </div>

          <div className="app-countdown" role="timer">
            {formatRemaining(displayMs(state, now))}
          </div>

          <div
            className={`progress-bar progress-bar--${tone}`}
            data-phase={state.phase}
            aria-hidden="true"
          >
            <span
              className="progress-bar__fill"
              style={{ width: `${phasePercent * 100}%` }}
            />
          </div>

          <section
            className="timer-card"
            aria-label="Mode, preset and round details"
          >
            <div className="timer-card__selectors">
              <div className="selector-group">
                <span className="selector-label">MODE</span>
                <div
                  className="selector-row"
                  role="group"
                  aria-label="Main mode"
                >
                  {TRAINING_MODES.map((option, index) => {
                    const selected = index === state.modeIndex;

                    return (
                      <button
                        key={option.id}
                        type="button"
                        className="selector-chip selector-chip--mode"
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
              </div>

              <div className="selector-group">
                <span className="selector-label">PRESET</span>
                <div className="selector-row" role="group" aria-label="Preset">
                  {mode.presets.map((option, index) => {
                    const selected = index === presetIndex;

                    return (
                      <button
                        key={option.id}
                        type="button"
                        className="selector-chip selector-chip--preset"
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
              </div>
            </div>

            <div className="timer-card__meta">
              {notice !== null ? (
                <span
                  className="timer-card__notice"
                  role="status"
                  aria-live="polite"
                >
                  {notice}
                </span>
              ) : (
                <>
                  <span className="meta-item meta-item--round">
                    {`ROUND ${state.round}`}
                  </span>
                  <span className="meta-total" aria-hidden="true">
                    / ∞
                  </span>
                  <span className="meta-separator" aria-hidden="true">
                    ·
                  </span>
                  <span className="meta-item">
                    {`NEXT: ${preview.label} ${formatRemaining(preview.ms)}`}
                  </span>
                  <span className="meta-separator" aria-hidden="true">
                    ·
                  </span>
                  <span className="meta-item">{fullPresetLabel(preset)}</span>
                </>
              )}
            </div>
          </section>

          {modeFlash !== null && (
            <div className="mode-flash" role="status" aria-live="assertive">
              {modeFlash}
            </div>
          )}
        </div>
      </main>

      <footer className="app-footer">
        <div className="app-footer__controls">
          <button
            type="button"
            className="control-button control-button--primary"
            aria-label={mainLabel(state)}
            aria-describedby="primary-hint"
            data-main-held={gamepad.mainPressed ? "true" : undefined}
            data-holding={mainHoldProgress > 0 ? "true" : undefined}
            style={mainHoldStyle(mainHoldProgress)}
            onPointerDown={() => {
              startPointerHold();
              mainPress.pressDown();
            }}
            onPointerUp={() => {
              mainPress.pressUp();
              stopPointerHold();
            }}
            onPointerLeave={() => {
              mainPress.cancel();
              stopPointerHold();
            }}
            onPointerCancel={() => {
              mainPress.cancel();
              stopPointerHold();
            }}
            onClick={(event) => {
              if (event.detail !== 0) {
                return;
              }

              mainPress.pressDown();
              mainPress.pressUp();
            }}
          >
            <span className="control-button__content">
              <span className="control-button__icon" aria-hidden="true">
                {mainLabel(state) === "Pause" ? <PauseIcon /> : <PlayIcon />}
              </span>
              <span className="control-button__text">
                <span className="control-button__label">
                  {mainLabel(state).toUpperCase()}
                </span>
                <span className="control-button__hint" id="primary-hint">
                  {state.status === "paused" ? "Hold to reset" : "\u00A0"}
                </span>
                <span className="control-button__hint" aria-hidden="true">
                  &nbsp;
                </span>
              </span>
            </span>
          </button>

          <button
            type="button"
            className="control-button control-button--mode"
            aria-label="Mode"
            aria-describedby="mode-hint"
            disabled={!canSelect}
            data-mode-holding={modeHoldProgress > 0 ? "true" : undefined}
            style={{ "--mode-hold": modeHoldProgress } as CSSProperties}
            {...(canSelect
              ? {
                  onPointerDown: () => {
                    startModeHold();
                    modePress.pressDown();
                  },
                  onPointerUp: () => {
                    modePress.pressUp();
                    stopModeHold();
                  },
                  onPointerLeave: () => {
                    modePress.cancel();
                    stopModeHold();
                  },
                  onPointerCancel: () => {
                    modePress.cancel();
                    stopModeHold();
                  },
                  onClick: (event: MouseEvent<HTMLButtonElement>) => {
                    if (event.detail !== 0) {
                      return;
                    }

                    modePress.pressDown();
                    modePress.pressUp();
                  },
                }
              : {})}
          >
            <span className="control-button__hold-ring" aria-hidden="true" />
            <span className="control-button__content">
              <span className="control-button__icon" aria-hidden="true">
                <ModeIcon />
              </span>
              <span className="control-button__text">
                <span className="control-button__label">MODE</span>
                <span className="control-button__hint">
                  {canSelect ? "PRESS → PRESET" : "RESET TO CHANGE"}
                </span>
                <span
                  className="control-button__hint"
                  aria-hidden={canSelect ? undefined : true}
                >
                  {canSelect ? "HOLD → MODE" : "\u00A0"}
                </span>
              </span>
            </span>
            <span id="mode-hint" className="visually-hidden">
              {canSelect
                ? "Press to cycle preset. Hold to change mode."
                : "Reset to change mode or preset."}
            </span>
          </button>
        </div>

        <div className="app-footer__status">
          {controllerError !== null ? (
            <p className="controller-status controller-status--error">
              {controllerError}
            </p>
          ) : canSelect ? (
            <p
              key={`${state.modeIndex}-${presetIndex}`}
              className="idle-hint"
              aria-hidden="true"
            >
              Hold for mode
            </p>
          ) : null}
        </div>
      </footer>
    </div>
  );
}

/**
 * A CSS custom property drives the fill inside the Main button, so the hold
 * progress is visible without adding an element or shifting the layout.
 */
function mainHoldStyle(progress: number): CSSProperties {
  return { "--main-hold": `${Math.round(progress * 100)}%` } as CSSProperties;
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M8 5v14l11-7z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" fill="currentColor" />
    </svg>
  );
}

function ModeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 11a8 8 0 0 0-14.9-4M4 5v5h5" />
      <path d="M4 13a8 8 0 0 0 14.9 4M20 19v-5h-5" />
    </svg>
  );
}

export default App;
