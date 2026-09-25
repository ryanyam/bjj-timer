import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LONG_PRESS_MS, createPressRecogniser, type PressKind } from "./press";

/**
 * Spec for src/press.ts.
 *
 * The contract these tests pin down: one press in, at most one action out, and
 * never both. The long action fires at the threshold while still held; the short
 * action fires on release; a cancelled press fires nothing and does not undo a
 * long action that already fired.
 */

function setup(options: { longPressMs?: number } = {}) {
  const presses: PressKind[] = [];
  const recogniser = createPressRecogniser({
    onPress: (kind) => presses.push(kind),
    ...options,
  });

  return { presses, recogniser };
}

function elapse(ms: number): void {
  vi.advanceTimersByTime(ms);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a short press", () => {
  it("fires one short action when released before the threshold", () => {
    const { presses, recogniser } = setup();

    recogniser.pressDown();
    elapse(LONG_PRESS_MS - 1);
    recogniser.pressUp();

    expect(presses).toEqual(["short"]);
  });

  it("fires exactly one short action per completed press", () => {
    const { presses, recogniser } = setup();

    recogniser.pressDown();
    recogniser.pressUp();
    recogniser.pressDown();
    recogniser.pressUp();

    expect(presses).toEqual(["short", "short"]);
  });

  it("fires nothing for a release with no matching press down", () => {
    const { presses, recogniser } = setup();

    recogniser.pressUp();

    expect(presses).toEqual([]);
  });

  it("does not fire late once the press is over", () => {
    const { presses, recogniser } = setup();

    recogniser.pressDown();
    elapse(100);
    recogniser.pressUp();
    elapse(10 * LONG_PRESS_MS);

    expect(presses).toEqual(["short"]);
  });
});

describe("a long press", () => {
  it("fires at the threshold, while the button is still held", () => {
    const { presses, recogniser } = setup();

    recogniser.pressDown();
    elapse(LONG_PRESS_MS);

    expect(presses).toEqual(["long"]);
  });

  it("does not also fire a short action on the release that follows", () => {
    const { presses, recogniser } = setup();

    recogniser.pressDown();
    elapse(LONG_PRESS_MS);
    recogniser.pressUp();

    expect(presses).toEqual(["long"]);
  });

  it("fires only once no matter how long it is held", () => {
    const { presses, recogniser } = setup();

    recogniser.pressDown();
    elapse(20 * LONG_PRESS_MS);
    recogniser.pressUp();

    expect(presses).toEqual(["long"]);
  });

  it("counts a repeated press down while held as a single press", () => {
    const { presses, recogniser } = setup();

    // A multi-touch second finger, a duplicated pointerdown, or key repeat.
    // The second press down happens part-way through the hold: if it restarted
    // the hold, the long action would be pushed back past the threshold.
    recogniser.pressDown();
    elapse(LONG_PRESS_MS / 2);
    recogniser.pressDown();
    elapse(LONG_PRESS_MS / 2);

    expect(presses).toEqual(["long"]);

    recogniser.pressUp();

    expect(presses).toEqual(["long"]);
  });

  it("uses 600 ms by default and honours an override", () => {
    expect(LONG_PRESS_MS).toBe(600);

    const byDefault = setup();
    byDefault.recogniser.pressDown();
    elapse(599);
    byDefault.recogniser.pressUp();

    const overridden = setup({ longPressMs: 1_000 });
    overridden.recogniser.pressDown();
    elapse(600);
    overridden.recogniser.pressUp();

    expect(byDefault.presses).toEqual(["short"]);
    expect(overridden.presses).toEqual(["short"]);
  });
});

describe("a cancelled press", () => {
  it("fires nothing when cancelled before the threshold", () => {
    const { presses, recogniser } = setup();

    recogniser.pressDown();
    elapse(300);
    recogniser.cancel();
    elapse(10 * LONG_PRESS_MS);

    expect(presses).toEqual([]);
  });

  it("does not fire the short action on a later release", () => {
    const { presses, recogniser } = setup();

    recogniser.pressDown();
    elapse(300);
    recogniser.cancel();
    recogniser.pressUp();

    expect(presses).toEqual([]);
  });

  it("does not undo a long action that already fired", () => {
    const { presses, recogniser } = setup();

    recogniser.pressDown();
    elapse(LONG_PRESS_MS);
    recogniser.cancel();
    recogniser.pressUp();

    expect(presses).toEqual(["long"]);
  });

  it("leaves the recogniser ready for a fresh press", () => {
    const { presses, recogniser } = setup();

    recogniser.pressDown();
    recogniser.cancel();
    recogniser.pressDown();
    elapse(LONG_PRESS_MS);

    expect(presses).toEqual(["long"]);
  });
});
