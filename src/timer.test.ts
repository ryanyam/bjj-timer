import { describe, expect, it } from "vitest";
import { ROUND_MS, formatRemaining, remainingMs } from "./timer";

/**
 * Spec for src/timer.ts — the pure timestamp math behind the countdown.
 *
 * This module does not exist yet: these tests are written first and are expected
 * to fail (`Failed to resolve import "./timer"`) until it is implemented.
 *
 * The exported API these tests pin down:
 *   ROUND_MS                          length of one round, in milliseconds
 *   remainingMs(deadline, now)        milliseconds left, clamped at 0
 *   formatRemaining(ms)               milliseconds left -> "M:SS"
 */

const START = 1_700_000_000_000;
const SECOND = 1_000;
const MINUTE = 60 * SECOND;

describe("ROUND_MS", () => {
  it("is exactly five minutes", () => {
    expect(ROUND_MS).toBe(5 * MINUTE);
  });
});

describe("formatRemaining", () => {
  it("formats a full round as 5:00", () => {
    expect(formatRemaining(ROUND_MS)).toBe("5:00");
  });

  it("pads the seconds to two digits", () => {
    expect(formatRemaining(7 * SECOND)).toBe("0:07");
  });

  it("truncates a partial second instead of rounding it up", () => {
    // 7.6s left means "7 seconds left" to someone reading a countdown. Rounding
    // would show 0:08 — a second that has not actually elapsed yet. This uses
    // 7.6 rather than 7.4 because 7.4 rounds *down* to 7 as well, so it would
    // let a rounding implementation slip past unnoticed.
    //
    // Truncating also means a round reads 0:00 for its final 999 ms. That is a
    // deliberate, deferred trade-off — see formatRemaining in timer.ts.
    expect(formatRemaining(7_600)).toBe("0:07");
  });

  it("rolls over correctly at the minute boundary", () => {
    expect(formatRemaining(60 * SECOND)).toBe("1:00");
    expect(formatRemaining(59 * SECOND + 999)).toBe("0:59");
  });

  it("clamps zero and negative values to 0:00", () => {
    expect(formatRemaining(0)).toBe("0:00");
    expect(formatRemaining(-1_500)).toBe("0:00");
  });
});

describe("remainingMs", () => {
  it("returns the full round at the instant the round starts", () => {
    expect(remainingMs(START + ROUND_MS, START)).toBe(ROUND_MS);
  });

  it("counts down as the clock advances", () => {
    expect(remainingMs(START + ROUND_MS, START + 1 * SECOND)).toBe(
      ROUND_MS - 1 * SECOND,
    );
  });

  it("returns 0 exactly at the deadline", () => {
    expect(remainingMs(START + ROUND_MS, START + ROUND_MS)).toBe(0);
  });

  it("never goes negative once the deadline has passed", () => {
    // Matters when the machine sleeps mid-round and wakes up after the end.
    expect(remainingMs(START + ROUND_MS, START + ROUND_MS + 10 * SECOND)).toBe(
      0,
    );
  });
});
