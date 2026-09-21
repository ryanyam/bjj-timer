import { StrictMode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

/**
 * Spec for the timer UI in src/App.tsx.
 *
 * App.tsx has deliberately NOT been touched yet, so every test below is expected
 * to fail: the starter demo has no countdown, no Start button and no element
 * with role="timer".
 *
 * The UI contract these tests pin down:
 *   - an element with role="timer" showing the remaining time as "M:SS"
 *   - a button accessible as "Start" and a button accessible as "Reset"
 *   - no pause/round-count features
 *
 * Note what is *not* asserted: no CSS, no class names, no pixel sizes. Those are
 * free to change; the timestamp math and the stopped-loop behaviour are not.
 */

const START = Date.UTC(2026, 0, 1, 0, 0, 0);
const SECOND = 1_000;
const MINUTE = 60 * SECOND;

function clockText(): string {
  return screen.getByRole("timer").textContent ?? "";
}

function pressStart(): void {
  fireEvent.click(screen.getByRole("button", { name: /start/i }));
}

function pressReset(): void {
  fireEvent.click(screen.getByRole("button", { name: /reset/i }));
}

function advance(ms: number): void {
  // With fake timers, advanceTimersByTime moves the faked clock as well as the
  // pending callbacks, so the timer's reading of "now" and its scheduled tick
  // stay in step — the same way real time passes in the browser.
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the countdown display", () => {
  it("shows a full five minutes before the round starts", () => {
    render(<App />);

    expect(clockText()).toBe("5:00");
  });
});

describe("a running round", () => {
  it("counts down as real time passes", () => {
    // Note: this one cannot tell a timestamp-driven countdown from a naive
    // decrementing counter — both show 4:59 after one second. That distinction
    // is made by the two tests below, which is why they exist.
    render(<App />);
    pressStart();

    advance(1 * SECOND);

    expect(clockText()).toBe("4:59");
  });

  it("is still correct after a long jump, as if the tab had been throttled", () => {
    // A naive "subtract 1 every second" timer drifts here; one that recomputes
    // from the deadline does not.
    render(<App />);
    pressStart();

    advance(2 * MINUTE + 34 * SECOND);

    expect(clockText()).toBe("2:26");
  });

  it("registers exactly one ticking loop under StrictMode", () => {
    // StrictMode double-invokes effects on mount, so a loop started during mount
    // (or during render) would be registered twice. The count assertion is what
    // makes that visible: the display cannot show the difference, because the
    // remaining time is recomputed from the clock rather than accumulated, so a
    // leaked second loop still reads 4:58.
    //
    // One caveat, measured rather than assumed: the loop here starts on a phase
    // change, which happens *after* StrictMode's remount, so this does not catch
    // a missing cleanup (verified by removing the cleanup and watching this test
    // stay green). It guards against a future change that starts ticking during
    // mount. Loops genuinely left behind are caught by the getTimerCount
    // assertions on completion, reset and unmount.
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    pressStart();

    advance(2 * SECOND);

    expect(clockText()).toBe("4:58");
    expect(vi.getTimerCount()).toBe(1);
  });
});

describe("the end of the round", () => {
  it("clamps at 0:00 instead of counting into negative time", () => {
    render(<App />);
    pressStart();

    advance(5 * MINUTE + 10 * SECOND);

    expect(clockText()).toBe("0:00");
  });

  it("stops its loop once the round is over", () => {
    render(<App />);
    pressStart();

    advance(5 * MINUTE);

    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("resetting", () => {
  it("returns the display to a full five minutes", () => {
    render(<App />);
    pressStart();
    advance(1 * MINUTE);

    pressReset();

    expect(clockText()).toBe("5:00");
  });

  it("cancels the countdown that was already running", () => {
    render(<App />);
    pressStart();
    advance(1 * MINUTE);

    pressReset();

    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("unmounting mid-round", () => {
  it("leaves no ticking loop behind", () => {
    const { unmount } = render(<App />);
    pressStart();
    advance(1 * SECOND);

    // Proves a loop really was running, so the assertion below means something.
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
