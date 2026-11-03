import { describe, expect, it } from "vitest";
import { controlCopy } from "./controls";
import { MAIN_BUTTON_HOLD_MS } from "./gamepad";
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
      primaryHint: "Press to begin",
      secondaryLabel: "PRESET",
      secondaryHint: "Press: next preset · Hold: switch mode",
      secondaryActive: true,
    });
  });

  it("gives Running pause and locked instructions", () => {
    expect(controlCopy(started())).toEqual({
      primaryLabel: "PAUSE",
      primaryHint: "Press to pause",
      secondaryLabel: "LOCKED",
      secondaryHint: "Pause and reset to change",
      secondaryActive: false,
    });
  });

  it("gives Paused resume and reset instructions", () => {
    expect(controlCopy(paused())).toEqual({
      primaryLabel: "RESUME",
      primaryHint: `Hold ${MAIN_BUTTON_HOLD_MS / 1_000} s to reset`,
      secondaryLabel: "LOCKED",
      secondaryHint: "Hold left button to reset",
      secondaryActive: false,
    });
  });

  it("changes the primary hint while a reset is held", () => {
    expect(controlCopy(paused(), { holding: true }).primaryHint).toBe(
      "Keep holding...",
    );
  });

  it("flashes RESET after the reset completes", () => {
    const copy = controlCopy(initialRoundState, { resetFlash: true });

    expect(copy.primaryLabel).toBe("RESET");
    expect(copy.primaryHint).toBe("Session reset");
    expect(copy.secondaryLabel).toBe("PRESET");
  });
});
