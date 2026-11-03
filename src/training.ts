/**
 * The two training modes and their presets.
 *
 * This is the single source of truth for mode names, work/rest durations,
 * selector labels, and timer durations. `round.ts` and the interface derive
 * everything from these entries; no duration is duplicated elsewhere.
 */

import { formatRemaining } from "./timer";

export type ModeId = "rolls" | "drills" | "kids";

export interface Preset {
  readonly id: string;
  readonly workMs: number;
  readonly restMs: number;
}

export interface TrainingMode {
  readonly id: ModeId;
  readonly title: "ROLLS" | "DRILLS" | "KIDS";
  readonly presets: readonly Preset[];
}

const SECOND = 1_000;
const MINUTE = 60 * SECOND;

export const TRAINING_MODES: readonly TrainingMode[] = [
  {
    id: "rolls",
    title: "ROLLS",
    presets: [
      { id: "rolls-5-1", workMs: 5 * MINUTE, restMs: 1 * MINUTE },
      { id: "rolls-3-1", workMs: 3 * MINUTE, restMs: 1 * MINUTE },
    ],
  },
  {
    id: "drills",
    title: "DRILLS",
    presets: [
      { id: "drills-2-30", workMs: 2 * MINUTE, restMs: 30 * SECOND },
      { id: "drills-3-30", workMs: 3 * MINUTE, restMs: 30 * SECOND },
      { id: "drills-5-30", workMs: 5 * MINUTE, restMs: 30 * SECOND },
      { id: "drills-1-30", workMs: 1 * MINUTE, restMs: 30 * SECOND },
    ],
  },
  {
    id: "kids",
    title: "KIDS",
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

  return mode.presets[presetIndex] ?? mode.presets[DEFAULT_PRESET_INDEX];
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
