/**
 * Session state machine: the two real training modes, their work/rest cycles,
 * and the two-button selection rules, as pure functions.
 *
 * No React, no DOM, no timers of its own. Every transition is a plain
 * `(state, action) => state`, so the whole interaction can be tested by calling
 * it, and a future GPIO layer only has to produce the same actions.
 *
 * All time is wall-clock milliseconds taken from the caller, so the countdown
 * stays timestamp-derived: nothing here accumulates a decreasing total.
 */

import { remainingMs } from "./timer";
import {
  DEFAULT_PRESET_INDEX,
  TRAINING_MODES,
  modeAt,
  presetAt,
  type Preset,
  type TrainingMode,
} from "./training";

export type TimerStatus = "ready" | "running" | "paused";
export type CyclePhase = "work" | "rest";

export interface RoundState {
  /** Timer status, separate from the work/rest cycle phase. */
  status: TimerStatus;
  /** Which half of the repeating cycle is running. */
  phase: CyclePhase;
  /** Which main mode is selected (index into TRAINING_MODES). */
  modeIndex: number;
  /**
   * The last preset selected in each mode. This is what makes mode changes
   * restore a mode's remembered preset during the current app session.
   */
  presetIndexByMode: readonly number[];
  /** Work-round number. Starts at 1, increments only when a work phase begins. */
  round: number;
  /** Wall-clock time the current phase ends at; null while ready. */
  deadline: number | null;
  /** Wall-clock time the session was paused at; null unless paused. */
  pausedAt: number | null;
  /**
   * Increments whenever a live phase transition begins. The interface uses it
   * to play one cue per render, even if a delayed tick crossed several phases.
   */
  transitionSeq: number;
  /** The phase that just began, or null after reset/selection. */
  lastTransition: CyclePhase | null;
  /** Increments on each selection attempt that was refused while not ready. */
  blockedSelectionSeq: number;
}

export type RoundAction =
  /**
   * Main short press, at the clock reading `now`.
   *
   * `fromState` is set by the physical green button, which tracks a press across
   * time. If the session has moved on by the time the action is reduced, the
   * action is ignored rather than reinterpreted.
   */
  | { type: "mainShort"; now: number; fromState?: string }
  /** Main long press: full-session reset, retaining mode and preset. */
  | { type: "mainLong"; now: number }
  /** White short press: next preset within the current mode. */
  | { type: "nextPreset" }
  /** White hold: next main mode. */
  | { type: "nextMode" }
  /** Direct selector choice of a main mode. */
  | { type: "selectMode"; modeIndex: number }
  /** Direct selector choice of a preset in the current mode. */
  | { type: "selectPreset"; presetIndex: number }
  /** The display ticked, at the clock reading `now`. */
  | { type: "tick"; now: number };

export const initialRoundState: RoundState = {
  status: "ready",
  phase: "work",
  modeIndex: 0,
  presetIndexByMode: TRAINING_MODES.map(() => DEFAULT_PRESET_INDEX),
  round: 1,
  deadline: null,
  pausedAt: null,
  transitionSeq: 0,
  lastTransition: null,
  blockedSelectionSeq: 0,
};

export function currentMode(state: RoundState): TrainingMode {
  return modeAt(state.modeIndex);
}

export function currentPresetIndex(state: RoundState): number {
  return state.presetIndexByMode[state.modeIndex] ?? DEFAULT_PRESET_INDEX;
}

export function currentPreset(state: RoundState): Preset {
  return presetAt(state.modeIndex, currentPresetIndex(state));
}

export function currentWorkMs(state: RoundState): number {
  return currentPreset(state).workMs;
}

export function currentRestMs(state: RoundState): number {
  return currentPreset(state).restMs;
}

/** Selection changes are allowed only before a session starts. */
export function selectionAllowed(state: RoundState): boolean {
  return state.status === "ready";
}

/**
 * A token for the part of the session a tracked button press depends on. If it
 * changes while the green button is held, the press is abandoned.
 */
export function stateKey(state: RoundState): string {
  return `${state.status}:${state.phase}:${state.round}`;
}

/** The visible Main label, which always names the next short-press action. */
export function mainLabel(state: RoundState): string {
  switch (state.status) {
    case "ready":
      return "Start";
    case "running":
      return "Pause";
    case "paused":
      return "Resume";
  }
}

/** WORK during work, REST for either mode's rest phase. */
export function phaseLabel(state: RoundState): string {
  return state.phase === "rest" ? "REST" : "WORK";
}

/** What follows the current (or, while ready, the first) phase. */
export interface PhasePreview {
  readonly label: string;
  readonly ms: number;
}

export function nextPhase(state: RoundState): PhasePreview {
  if (state.status === "ready" || state.phase === "rest") {
    return { label: "WORK", ms: currentWorkMs(state) };
  }

  return { label: "REST", ms: currentRestMs(state) };
}

/**
 * What the clock shows, given the current wall-clock reading.
 *
 * - ready: the selected preset's full work duration
 * - running: derived from the current phase deadline
 * - paused: derived from the timestamp the session was paused at
 */
export function displayMs(state: RoundState, now: number): number {
  if (state.deadline === null) {
    return currentWorkMs(state);
  }

  return remainingMs(state.deadline, state.pausedAt ?? now);
}

export function reduce(state: RoundState, action: RoundAction): RoundState {
  switch (action.type) {
    case "mainShort":
      return onMainShort(state, action.now, action.fromState);

    case "mainLong":
      return resetSession(state);

    case "nextPreset":
      return selectionAllowed(state)
        ? selectPresetAt(
            state,
            wrap(
              currentPresetIndex(state) + 1,
              currentMode(state).presets.length,
            ),
          )
        : blockedSelection(state);

    case "nextMode":
      return selectionAllowed(state)
        ? selectModeAt(state, wrap(state.modeIndex + 1, TRAINING_MODES.length))
        : blockedSelection(state);

    case "selectMode":
      return selectionAllowed(state)
        ? selectModeAt(state, action.modeIndex)
        : blockedSelection(state);

    case "selectPreset":
      return selectionAllowed(state)
        ? selectPresetAt(state, action.presetIndex)
        : blockedSelection(state);

    case "tick":
      return onTick(state, action.now);
  }
}

function onMainShort(
  state: RoundState,
  now: number,
  fromState?: string,
): RoundState {
  // A tracked press that began in another session state is stale: the timer
  // changed underneath it, so it must not be reinterpreted for the new state.
  if (fromState !== undefined && fromState !== stateKey(state)) {
    return state;
  }

  switch (state.status) {
    case "ready":
      return {
        ...state,
        status: "running",
        phase: "work",
        round: 1,
        deadline: now + currentWorkMs(state),
        pausedAt: null,
        transitionSeq: state.transitionSeq + 1,
        lastTransition: "work",
      };

    case "running":
      // Freeze the current phase by remembering WHEN we paused.
      return { ...state, status: "paused", pausedAt: now };

    case "paused":
      // Resume from the frozen remainder, keeping the phase and round.
      return {
        ...state,
        status: "running",
        deadline: now + frozenRemaining(state),
        pausedAt: null,
      };
  }
}

/** Only meaningful while paused. */
function frozenRemaining(state: RoundState): number {
  if (state.deadline === null || state.pausedAt === null) {
    return 0;
  }

  return remainingMs(state.deadline, state.pausedAt);
}

/**
 * Restore the session to READY at round 1 and the selected preset's full work
 * duration. Mode and per-mode preset memory are deliberately preserved.
 */
function resetSession(state: RoundState): RoundState {
  return {
    ...state,
    status: "ready",
    phase: "work",
    round: 1,
    deadline: null,
    pausedAt: null,
    lastTransition: null,
  };
}

/**
 * Load a ready-state selection. The work phase begins at round 1 with the full
 * selected work duration; nothing is started automatically.
 */
function readySelection(
  state: RoundState,
  modeIndex: number,
  presetIndexByMode: readonly number[],
): RoundState {
  return {
    ...state,
    status: "ready",
    phase: "work",
    modeIndex,
    presetIndexByMode,
    round: 1,
    deadline: null,
    pausedAt: null,
    lastTransition: null,
  };
}

function selectModeAt(state: RoundState, modeIndex: number): RoundState {
  if (
    !Number.isInteger(modeIndex) ||
    modeIndex < 0 ||
    modeIndex >= TRAINING_MODES.length ||
    modeIndex === state.modeIndex
  ) {
    return state;
  }

  return readySelection(state, modeIndex, state.presetIndexByMode);
}

function selectPresetAt(state: RoundState, presetIndex: number): RoundState {
  const mode = currentMode(state);

  if (
    !Number.isInteger(presetIndex) ||
    presetIndex < 0 ||
    presetIndex >= mode.presets.length ||
    presetIndex === currentPresetIndex(state)
  ) {
    return state;
  }

  const presetIndexByMode = state.presetIndexByMode.map((value, index) =>
    index === state.modeIndex ? presetIndex : value,
  );

  return readySelection(state, state.modeIndex, presetIndexByMode);
}

function blockedSelection(state: RoundState): RoundState {
  // The attempt is acknowledged by the interface, but nothing is queued and the
  // session is untouched.
  return {
    ...state,
    blockedSelectionSeq: state.blockedSelectionSeq + 1,
  };
}

function onTick(state: RoundState, now: number): RoundState {
  if (state.status !== "running" || state.deadline === null) {
    return state;
  }

  if (now < state.deadline) {
    return state;
  }

  /*
   * Consume every phase boundary up to `now`, not just one. Deadlines advance by
   * the configured duration from the previous deadline, so a late callback
   * cannot make the cycle drift; a callback that skipped several phases lands
   * on the correct current phase and round.
   */
  let phase = state.phase;
  let round = state.round;
  let deadline = state.deadline;
  let transitionSeq = state.transitionSeq;
  let lastTransition = state.lastTransition;

  while (now >= deadline) {
    if (phase === "work") {
      phase = "rest";
      deadline += currentRestMs(state);
      lastTransition = "rest";
    } else {
      phase = "work";
      round += 1;
      deadline += currentWorkMs(state);
      lastTransition = "work";
    }

    transitionSeq += 1;
  }

  return {
    ...state,
    phase,
    round,
    deadline,
    transitionSeq,
    lastTransition,
  };
}

function wrap(index: number, length: number): number {
  return ((index % length) + length) % length;
}
