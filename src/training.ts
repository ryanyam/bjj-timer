/**
 * The training modes and their presets.
 *
 * This is the single source of truth for mode names, work/rest durations,
 * selector labels, and timer durations. `round.ts` and the interface derive
 * everything from these entries; no duration is duplicated elsewhere.
 */

import { formatRemaining } from "./timer";

export type ModeId = "rolls" | "drills" | "nogi" | "kids";

export interface Preset {
  readonly id: string;
  readonly workMs: number;
  readonly restMs: number;
}

export interface TrainingMode {
  readonly id: ModeId;
  readonly title: "ROLLS" | "DRILLS" | "NOGI" | "KIDS";
  /** Preset loaded whenever this mode is selected from another mode. */
  readonly defaultPresetIndex: number;
  readonly presets: readonly Preset[];
}

const SECOND = 1_000;
const MINUTE = 60 * SECOND;

export const TRAINING_MODES: readonly TrainingMode[] = [
  {
    id: "rolls",
    title: "ROLLS",
    defaultPresetIndex: 0,
    presets: [
      { id: "rolls-5-1", workMs: 5 * MINUTE, restMs: 1 * MINUTE },
      { id: "rolls-3-1", workMs: 3 * MINUTE, restMs: 1 * MINUTE },
    ],
  },
  {
    id: "drills",
    title: "DRILLS",
    defaultPresetIndex: 0,
    presets: [
      { id: "drills-2-30", workMs: 2 * MINUTE, restMs: 30 * SECOND },
      { id: "drills-3-30", workMs: 3 * MINUTE, restMs: 30 * SECOND },
      { id: "drills-5-30", workMs: 5 * MINUTE, restMs: 30 * SECOND },
      { id: "drills-1-30", workMs: 1 * MINUTE, restMs: 30 * SECOND },
    ],
  },
  {
    id: "nogi",
    title: "NOGI",
    defaultPresetIndex: 2,
    presets: [
      { id: "nogi-1-10", workMs: 1 * MINUTE, restMs: 10 * SECOND },
      { id: "nogi-2-10", workMs: 2 * MINUTE, restMs: 10 * SECOND },
      { id: "nogi-3-10", workMs: 3 * MINUTE, restMs: 10 * SECOND },
      { id: "nogi-5-10", workMs: 5 * MINUTE, restMs: 10 * SECOND },
    ],
  },
  {
    id: "kids",
    title: "KIDS",
    defaultPresetIndex: 0,
    presets: [
      { id: "kids-30-5", workMs: 30 * SECOND, restMs: 5 * SECOND },
    ],
  },
];

export const DEFAULT_MODE_INDEX = 0;
export const DEFAULT_PRESET_INDEX = 0;

export function modeAt(modeIndex: number): TrainingMode {
  return TRAINING_MODES[modeIndex] ?? TRAINING_MODES[DEFAULT_MODE_INDEX];
}

export function presetAt(modeIndex: number, presetIndex: number): Preset {
  const mode = modeAt(modeIndex);

  return (
    mode.presets[presetIndex] ?? mode.presets[mode.defaultPresetIndex]
  );
}

export function workMsFor(modeIndex: number, presetIndex: number): number {
  return presetAt(modeIndex, presetIndex).workMs;
}

export function restMsFor(modeIndex: number, presetIndex: number): number {
  return presetAt(modeIndex, presetIndex).restMs;
}

/** Compact inactive preview, e.g. "5:00 / 1:00". */
export function compactPresetLabel(preset: Preset): string {
  return `${formatRemaining(preset.workMs)} / ${formatRemaining(preset.restMs)}`;
}

/** Explicit label for the selected preset, e.g. "WORK 5:00 / REST 1:00". */
export function fullPresetLabel(preset: Preset): string {
  return `WORK ${formatRemaining(preset.workMs)} / REST ${formatRemaining(
    preset.restMs,
  )}`;
}
