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

  it("rounds a partial second up, so a round opens on its full duration", () => {
    // Rounding up is the countdown convention: the display reports the seconds
    // still to come, so it never claims less time is left than there really is.
    // 7.6 s therefore reads "0:08" rather than "0:07".
    expect(formatRemaining(7_600)).toBe("0:08");
  });

  it("rolls over at the minute boundary", () => {
    expect(formatRemaining(60 * SECOND)).toBe("1:00");
    expect(formatRemaining(59 * SECOND)).toBe("0:59");
    // 0:59.999 still has a whole second to come, so it rounds up too — the same
    // rule that makes 4:59.999 read "5:00".
    expect(formatRemaining(59 * SECOND + 999)).toBe("1:00");
  });

  it("shows a full five minutes for the whole first second of a round", () => {
    expect(formatRemaining(300_000)).toBe("5:00");
    expect(formatRemaining(299_999)).toBe("5:00");
    expect(formatRemaining(299_001)).toBe("5:00");
    // The first value that really is a whole 4:59.
    expect(formatRemaining(299_000)).toBe("4:59");
  });

  it("shows 0:00 only once no time is left at all", () => {
    expect(formatRemaining(1_000)).toBe("0:01");
    expect(formatRemaining(999)).toBe("0:01");
    expect(formatRemaining(1)).toBe("0:01");
    expect(formatRemaining(0)).toBe("0:00");
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
