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
  initialRoundState,
  mainLabel,
  nextPhase,
  phaseHeadline,
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
import { controlCopy } from "./controls";
import { PhaseProgressBar } from "./PhaseProgressBar";
import { LiveClock } from "./LiveClock";
import logoUrl from "./assets/alliance-jiu-jitsu-manila.jpg";
import {
  initializeAudio,
  onAudioUnavailable,
  playModeChange,
  playPause,
  playPresetChange,
  playReset,
  playRestStart,
  playResume,
  playWorkStart,
  unlockAudio,
} from "./audio";
import { useGamepadInput } from "./useGamepadInput";
import { MAIN_BUTTON_HOLD_MS, MODE_BUTTON_HOLD_MS } from "./gamepad";
import { getReadyMsByMode } from "./settings";
import { SettingsPanel } from "./SettingsPanel";
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
  const [resetFlash, setResetFlash] = useState(false);
  const [soundUnavailable, setSoundUnavailable] = useState(false);

  const mode = currentMode(state);
  const preset = currentPreset(state);
  const presetIndex = currentPresetIndex(state);
  const preview = nextPhase(state);
  const canSelect = selectionAllowed(state);
  const headline = phaseHeadline(state);
  const warningPhase =
    (state.status === "running" || state.status === "paused") &&
    displayMs(state, now) <= 10_000
      ? state.phase
      : null;
  const showGetReady =
    warningPhase === "rest" && state.status === "running";
  const tone = statusTone(state);

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
  const [pointerModePressed, setPointerModePressed] = useState(false);
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
    dispatch({
      type: "mainShort",
      now: reading,
      fromState,
      getReadyMsByMode: getReadyMsByMode(),
    });
  };

  /** Full-session reset, shared by a hold on either input. */
  const mainLong = () => {
    unlockAudio();
    setNotice(null);
    const reading = Date.now();
    setNow(reading);
    dispatch({ type: "mainLong", now: reading });
    setResetFlash(true);
    playReset();
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
  const [mainPress] = useState(() => {
    let stateKeyAtDown: string | null = null;
    const recogniser = createPressRecogniser({
      longPressMs: MAIN_BUTTON_HOLD_MS,
      onPress: (kind) => {
        if (kind === "long") {
          mainLong();
        } else {
          mainShort(stateKeyAtDown ?? undefined);
        }
      },
    });

    return {
      ...recogniser,
      pressDown(stateKey?: string) {
        stateKeyAtDown = stateKey ?? null;
        recogniser.pressDown();
      },
      releaseState() {
        stateKeyAtDown = null;
      },
    };
  });

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
  const effectiveModeHoldProgress = Math.max(
    modeHoldProgress,
    canSelect ? gamepad.modeHoldProgress : 0,
  );
  const modePressed =
    (canSelect && pointerModePressed) || gamepad.modePressed;

  const copy = controlCopy(state, {
    holding: mainHoldProgress > 0 && !resetFlash,
    resetFlash,
    modeHolding: canSelect && effectiveModeHoldProgress > 0,
  });

  const controllerStatus =
    gamepad.status === "connected"
      ? { text: "Controller connected", error: false }
      : gamepad.status === "waiting"
        ? { text: "Waiting for controller input", error: false }
        : gamepad.status === "disconnected"
          ? { text: "Controller disconnected", error: true }
          : { text: "Controller unavailable", error: true };

  useEffect(() => {
    if (
      (state.status !== "running" && state.status !== "getReady") ||
      state.deadline === null
    ) {
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

  const previousPlaybackStatus = useRef(state.status);

  useEffect(() => {
    const previous = previousPlaybackStatus.current;
    previousPlaybackStatus.current = state.status;

    if (previous === "running" && state.status === "paused") {
      playPause();
    } else if (previous === "paused" && state.status === "running") {
      playResume();
    }
  }, [state.status]);

  const previousPreset = useRef(presetIndex);
  const previousPresetMode = useRef(mode.id);

  useEffect(() => {
    const modeChanged = mode.id !== previousPresetMode.current;
    const presetChanged = presetIndex !== previousPreset.current;
    previousPresetMode.current = mode.id;
    previousPreset.current = presetIndex;

    if (presetChanged && !modeChanged) {
      playPresetChange();
    }
  }, [presetIndex, mode.id]);

  useEffect(() => {
    let active = true;
    const unsubscribe = onAudioUnavailable(() => {
      if (active) {
        setSoundUnavailable(true);
      }
    });

    void initializeAudio().then((ok) => {
      if (active && !ok) {
        setSoundUnavailable(true);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

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

    const showId = setTimeout(() => setModeFlash(`MODE: ${mode.title}`), 0);
    const hideId = setTimeout(() => setModeFlash(null), 1_000);

    return () => {
      clearTimeout(showId);
      clearTimeout(hideId);
    };
  }, [mode]);

  useEffect(() => {
    if (!resetFlash) {
      return;
    }

    const hideId = setTimeout(() => setResetFlash(false), 1_000);

    return () => clearTimeout(hideId);
  }, [resetFlash]);

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
    const clearPointerMode = () => {
      setPointerModePressed(false);
      modePress.cancel();
      stopModeHold();
    };

    window.addEventListener("pointerup", clearPointerMode);
    window.addEventListener("pointercancel", clearPointerMode);

    return () => {
      window.removeEventListener("pointerup", clearPointerMode);
      window.removeEventListener("pointercancel", clearPointerMode);
    };
  }, [modePress, stopModeHold]);

  useEffect(() => {
    const cancelPresses = () => {
      mainPress.cancel();
      modePress.cancel();
      setPointerModePressed(false);
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
            key={formatRemaining(displayMs(state, now))}
            className={`status-strip status-strip--${tone}${state.status === "paused" ? " status-badge--paused" : ""}`}
            role="status"
            aria-live="polite"
          >
            <span className="status-strip__side meta-item meta-item--round">{`ROUND ${state.round}`}</span>
            <span className="status-strip__main phase-band__label">
              {state.status === "paused"
                ? `${state.phase === "rest" ? "REST" : "WORK"} · PAUSED`
                : headline}
            </span>
            <span className="status-strip__side status-strip__side--right meta-item">
              {`${showGetReady ? "GET READY" : "NEXT"}: ${preview.label} ${formatRemaining(preview.ms)}`}
            </span>
          </div>

          <div className="app-countdown" role="timer">
            {formatRemaining(displayMs(state, now))}
          </div>

          <PhaseProgressBar state={state} warning={warningPhase} />

          <section
            className="timer-card"
            aria-label="Mode, preset and round details"
          >
            <div className="mode-preset-line">
              {canSelect ? (
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
                    <div
                      className="selector-row"
                      role="group"
                      aria-label="Preset"
                    >
                      {mode.presets.map((option, index) => {
                        const selected = index === presetIndex;

                        return (
                          <button
                            key={option.id}
                            type="button"
                            className="selector-chip selector-chip--preset"
                            data-selected={selected ? "true" : undefined}
                            aria-pressed={selected}
                            onClick={() => choosePreset(index)}
                          >
                            {compactPresetLabel(option)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mode-preset-summary">
                  <span className="mode-preset-summary__mode">
                    {mode.title}
                  </span>
                  <span aria-hidden="true"> · </span>
                  <span>{fullPresetLabel(preset)}</span>
                </p>
              )}
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
              ) : null}
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
              mainPress.pressDown(stateKey(state));
            }}
            onPointerUp={() => {
              mainPress.pressUp();
              mainPress.releaseState();
              stopPointerHold();
            }}
            onPointerLeave={() => {
              mainPress.cancel();
              mainPress.releaseState();
              stopPointerHold();
            }}
            onPointerCancel={() => {
              mainPress.cancel();
              mainPress.releaseState();
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
                {copy.primaryLabel === "PAUSE" ? <PauseIcon /> : <PlayIcon />}
              </span>
              <span className="control-button__text">
                <span className="control-button__label">
                  {copy.primaryLabel}
                </span>
                <span className="control-button__hint" id="primary-hint">
                  {copy.primaryHint}
                </span>
              </span>
            </span>
          </button>

          <button
            type="button"
            className="control-button control-button--mode"
            aria-label={copy.secondaryLabel}
            aria-describedby="mode-hint"
            disabled={!canSelect}
            data-active={copy.secondaryActive ? "true" : undefined}
            data-mode-held={modePressed ? "true" : undefined}
            data-mode-holding={effectiveModeHoldProgress > 0 ? "true" : undefined}
            style={{ "--mode-hold": effectiveModeHoldProgress } as CSSProperties}
            {...(canSelect
              ? {
                  onPointerDown: () => {
                    setPointerModePressed(true);
                    startModeHold();
                    modePress.pressDown();
                  },
                  onPointerUp: () => {
                    modePress.pressUp();
                    setPointerModePressed(false);
                    stopModeHold();
                  },
                  onPointerLeave: () => {
                    modePress.cancel();
                    setPointerModePressed(false);
                    stopModeHold();
                  },
                  onPointerCancel: () => {
                    modePress.cancel();
                    setPointerModePressed(false);
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
                <span className="control-button__label">
                  {copy.secondaryLabel}
                </span>
                <span className="control-button__hint" id="mode-hint">
                  {copy.secondaryHint}
                </span>
              </span>
            </span>
          </button>
        </div>

        <SettingsPanel />

        <div className="app-footer__status">
          <p
            className={`controller-status${controllerStatus.error ? " controller-status--error" : ""}`}
            role="status"
          >
            {controllerStatus.text}
          </p>
          {soundUnavailable && (
            <p className="sound-warning" role="status">
              Sound unavailable
            </p>
          )}
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
