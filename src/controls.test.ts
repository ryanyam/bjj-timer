import { describe, expect, it } from "vitest";
import { controlCopy } from "./controls";
import { initialRoundState, reduce, type RoundState } from "./round";

const T0 = 1_700_000_000_000;

function started(): RoundState {
  return reduce(initialRoundState, { type: "mainShort", now: T0 });
}

function paused(): RoundState {
  return reduce(started(), { type: "mainShort", now: T0 + 1_000 });
}

describe("controlCopy", () => {
  it("gives Ready the start and preset instructions", () => {
    expect(controlCopy(initialRoundState)).toEqual({
      primaryLabel: "START",
      primaryHint: "Hold to reset",
      secondaryLabel: "PRESET",
      secondaryHint: "Press: next preset · Hold: next mode",
      secondaryActive: true,
    });
  });

  it("gives Running pause and locked instructions", () => {
    expect(controlCopy(started())).toEqual({
      primaryLabel: "PAUSE",
      primaryHint: "Hold to reset",
      secondaryLabel: "LOCKED",
      secondaryHint: "Hold green to reset before changing",
      secondaryActive: false,
    });
  });

  it("gives Paused resume and reset instructions", () => {
    expect(controlCopy(paused())).toEqual({
      primaryLabel: "RESUME",
      primaryHint: "Hold to reset",
      secondaryLabel: "LOCKED",
      secondaryHint: "Hold green to reset before changing",
      secondaryActive: false,
    });
  });

  it("changes the primary hint while a reset is held", () => {
    expect(controlCopy(paused(), { holding: true }).primaryHint).toBe(
      "Keep holding...",
    );
  });

  it("changes the white hint while an available mode hold is active", () => {
    expect(controlCopy(initialRoundState, { modeHolding: true })).toMatchObject({
      secondaryLabel: "PRESET",
      secondaryHint: "Keep holding for mode",
    });
  });

  it("does not show mode-hold guidance when the white action is locked", () => {
    expect(controlCopy(started(), { modeHolding: true })).toMatchObject({
      secondaryLabel: "LOCKED",
      secondaryHint: "Hold green to reset before changing",
    });
  });

  it("flashes RESET after the reset completes", () => {
    const copy = controlCopy(initialRoundState, { resetFlash: true });

    expect(copy.primaryLabel).toBe("RESET");
    expect(copy.primaryHint).toBe("Session reset");
    expect(copy.secondaryLabel).toBe("PRESET");
  });
});
