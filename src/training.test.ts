import { describe, expect, it } from "vitest";
import {
  TRAINING_MODES,
  compactPresetLabel,
  fullPresetLabel,
  modeAt,
  presetAt,
  restMsFor,
  workMsFor,
} from "./training";

const SECOND = 1_000;
const MINUTE = 60 * SECOND;

describe("the training definitions", () => {
  it("contains the three real main modes", () => {
    expect(TRAINING_MODES.map((mode) => mode.id)).toEqual([
      "rolls",
      "drills",
      "kids",
    ]);
    expect(TRAINING_MODES.map((mode) => mode.title)).toEqual([
      "ROLLS",
      "DRILLS",
      "KIDS",
    ]);
  });

  it("contains the agreed presets in cycling order", () => {
    expect(
      TRAINING_MODES.map((mode) =>
        mode.presets.map((preset) => [preset.workMs, preset.restMs]),
      ),
    ).toEqual([
      [
        [5 * MINUTE, 1 * MINUTE],
        [3 * MINUTE, 1 * MINUTE],
      ],
      [
        [2 * MINUTE, 30 * SECOND],
        [3 * MINUTE, 30 * SECOND],
        [5 * MINUTE, 30 * SECOND],
        [1 * MINUTE, 30 * SECOND],
      ],
      [[30 * SECOND, 5 * SECOND]],
    ]);
  });

  it("has no extra presets or round-count configuration", () => {
    expect(TRAINING_MODES[0].presets).toHaveLength(2);
    expect(TRAINING_MODES[1].presets).toHaveLength(4);
    expect(TRAINING_MODES[2].presets).toHaveLength(1);
    expect(TRAINING_MODES).toHaveLength(3);
  });

  it("derives work and rest durations from the same definitions", () => {
    expect(workMsFor(0, 0)).toBe(5 * MINUTE);
    expect(restMsFor(0, 0)).toBe(1 * MINUTE);
    expect(workMsFor(0, 1)).toBe(3 * MINUTE);
    expect(restMsFor(0, 1)).toBe(1 * MINUTE);

    expect(workMsFor(1, 0)).toBe(2 * MINUTE);
    expect(workMsFor(1, 1)).toBe(3 * MINUTE);
    expect(workMsFor(1, 2)).toBe(5 * MINUTE);
    expect(workMsFor(1, 3)).toBe(1 * MINUTE);
    expect(restMsFor(1, 0)).toBe(30 * SECOND);
    expect(restMsFor(1, 3)).toBe(30 * SECOND);

    expect(workMsFor(2, 0)).toBe(30 * SECOND);
    expect(restMsFor(2, 0)).toBe(5 * SECOND);
  });

  it("labels the selected preset explicitly and inactive ones compactly", () => {
    expect(fullPresetLabel(presetAt(0, 0))).toBe("WORK 5:00 / REST 1:00");
    expect(fullPresetLabel(presetAt(0, 1))).toBe("WORK 3:00 / REST 1:00");
    expect(fullPresetLabel(presetAt(1, 0))).toBe("WORK 2:00 / REST 0:30");
    expect(fullPresetLabel(presetAt(1, 1))).toBe("WORK 3:00 / REST 0:30");
    expect(fullPresetLabel(presetAt(1, 2))).toBe("WORK 5:00 / REST 0:30");
    expect(fullPresetLabel(presetAt(1, 3))).toBe("WORK 1:00 / REST 0:30");
    expect(fullPresetLabel(presetAt(2, 0))).toBe("WORK 0:30 / REST 0:05");

    expect(compactPresetLabel(presetAt(0, 0))).toBe("5:00 / 1:00");
    expect(compactPresetLabel(presetAt(1, 0))).toBe("2:00 / 0:30");
    expect(compactPresetLabel(presetAt(1, 1))).toBe("3:00 / 0:30");
    expect(compactPresetLabel(presetAt(1, 2))).toBe("5:00 / 0:30");
    expect(compactPresetLabel(presetAt(1, 3))).toBe("1:00 / 0:30");
    expect(compactPresetLabel(presetAt(2, 0))).toBe("0:30 / 0:05");
  });

  it("falls back to the first mode and preset for an unknown index", () => {
    expect(modeAt(99).title).toBe("ROLLS");
    expect(presetAt(0, 99).id).toBe("rolls-5-1");
    expect(presetAt(99, 99).id).toBe("rolls-5-1");
  });
});
