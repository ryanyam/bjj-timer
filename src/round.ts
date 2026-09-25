/**
 * Round state machine: the agreed operator behaviour, as pure functions.
 *
 * No React, no DOM, no timers of its own. Every transition is a plain
 * `(state, action) => state`, so the whole interaction can be tested by calling
 * it, and a future GPIO layer only has to produce the same actions.
 *
 * All time is wall-clock milliseconds taken from the caller, so the countdown
 * stays timestamp-derived: nothing here accumulates a decreasing total.
 */

import { ROUND_MS, remainingMs } from "./timer";

export type Phase = "ready" | "running" | "paused" | "finished";

/**
 * Selection lists, indexed by top-level mode.
 *
 * The FIRST entry of each list is that mode's base selection and doubles as the
 * mode's top-level display label. Mode short press cycles between lists; mode
 * long press cycles within one. Base selections display as a bare number
 * ("2"), not "2a", so the two agreed lists stay as written.
 *
 * ONLY MODE 1 IS REAL — the implemented five minute single round.
 * Modes 2-5 are DISPLAY/INTERACTION PLACEHOLDERS. Their labels exist so the
 * two-button interaction can be built and tested. They carry no gym meaning and
 * no durations of their own; see roundDurationMs.
 */
export const MODE_SELECTIONS: readonly (readonly string[])[] = [
  ["1"],
  ["2", "2b", "2c"],
  ["3", "3b"],
  ["4", "4b", "4c"],
  ["5", "5a", "5b"],
];

const REAL_MODE_INDEX = 0;

export interface RoundState {
  phase: Phase;
  /** Which top-level mode is selected (index into MODE_SELECTIONS). */
  modeIndex: number;
  /** Which option within that mode is selected (index into its list). */
  optionIndex: number;
  /** Wall-clock time the round ends at; null when no round is in flight. */
  deadline: number | null;
  /** Wall-clock time the round was paused at; null unless paused. */
  pausedAt: number | null;
}

export type RoundAction =
  /** Main short press, at the clock reading `now`. */
  | { type: "mainShort"; now: number }
  /** Main long press, at the clock reading `now`. */
  | { type: "mainLong"; now: number }
  | { type: "modeShort" }
  | { type: "modeLong" }
  /** The display ticked, at the clock reading `now`. */
  | { type: "tick"; now: number };

export const initialRoundState: RoundState = {
  phase: "ready",
  modeIndex: REAL_MODE_INDEX,
  optionIndex: 0,
  deadline: null,
  pausedAt: null,
};

/**
 * Round length per mode.
 *
 * Modes 2-5 are placeholders and deliberately reuse the same five minutes, so
 * every entry currently holds ROUND_MS. Real preset durations are NOT invented
 * here — defining a real preset means giving its mode a duration in this list.
 */
const MODE_DURATIONS_MS: readonly number[] = MODE_SELECTIONS.map(
  () => ROUND_MS,
);

export function roundDurationMs(modeIndex: number): number {
  return MODE_DURATIONS_MS[modeIndex] ?? ROUND_MS;
}

/** The full placeholder label for the current selection, e.g. "2b" or "4". */
export function selectionLabel(state: RoundState): string {
  return MODE_SELECTIONS[state.modeIndex][state.optionIndex];
}

/** True for modes 2-5: selectable, shown, but not a real gym preset yet. */
export function isPlaceholderMode(state: RoundState): boolean {
  return state.modeIndex !== REAL_MODE_INDEX;
}

/** The visible Main label, which always names the next short-press action. */
export function mainLabel(state: RoundState): string {
  switch (state.phase) {
    case "ready":
      return "Start";
    case "running":
      return "Pause";
    case "paused":
      return "Resume";
    case "finished":
      return "Reset";
  }
}

/**
 * Whether Mode may change the selection. Only while no round is in flight, so a
 * preset cannot change mid-round. The button stays visible either way; it is the
 * reducer, not a disabled attribute, that guarantees this.
 */
export function modeIsActive(state: RoundState): boolean {
  return state.phase === "ready" || state.phase === "finished";
}

/**
 * What the clock shows, given the current wall-clock reading.
 *
 * - ready: a full round for the selected mode
 * - running: derived from the deadline
 * - paused: derived from the *timestamp the round was paused at*, so the value
 *   is frozen without ever storing a countdown total
 * - finished: clamps to 0:00
 */
export function displayMs(state: RoundState, now: number): number {
  if (state.deadline === null) {
    return roundDurationMs(state.modeIndex);
  }

  return remainingMs(state.deadline, state.pausedAt ?? now);
}

export function reduce(state: RoundState, action: RoundAction): RoundState {
  switch (action.type) {
    case "mainShort":
      return onMainShort(state, action.now);

    case "mainLong":
      // Reset from ANY state, including RUNNING and PAUSED. The selected mode
      // and option are deliberately preserved; only the round is restored.
      return { ...state, phase: "ready", deadline: null, pausedAt: null };

    case "modeShort":
      // Landing on a new top-level mode starts at that mode's base selection.
      return modeIsActive(state)
        ? {
            ...state,
            modeIndex: wrap(state.modeIndex + 1, MODE_SELECTIONS.length),
            optionIndex: 0,
          }
        : state;

    case "modeLong":
      return modeIsActive(state)
        ? {
            ...state,
            optionIndex: wrap(
              state.optionIndex + 1,
              MODE_SELECTIONS[state.modeIndex].length,
            ),
          }
        : state;

    case "tick":
      return onTick(state, action.now);
  }
}

function onMainShort(state: RoundState, now: number): RoundState {
  switch (state.phase) {
    case "ready":
      return {
        ...state,
        phase: "running",
        deadline: now + roundDurationMs(state.modeIndex),
        pausedAt: null,
      };

    case "running":
      // Freeze the remainder by remembering WHEN we paused, not how much is left.
      return { ...state, phase: "paused", pausedAt: now };

    case "paused":
      // Resume builds a NEW deadline from the frozen remainder, so the round
      // continues where it stopped instead of restarting a full round.
      return {
        ...state,
        phase: "running",
        deadline: now + frozenRemaining(state),
        pausedAt: null,
      };

    case "finished":
      return { ...state, phase: "ready", deadline: null, pausedAt: null };
  }
}

/** Only meaningful while paused. */
function frozenRemaining(state: RoundState): number {
  if (state.deadline === null || state.pausedAt === null) {
    return 0;
  }

  return remainingMs(state.deadline, state.pausedAt);
}

function onTick(state: RoundState, now: number): RoundState {
  if (state.phase !== "running" || state.deadline === null) {
    return state;
  }

  if (now < state.deadline) {
    return state;
  }

  return { ...state, phase: "finished", pausedAt: null };
}

function wrap(index: number, length: number): number {
  return ((index % length) + length) % length;
}
