import { StrictMode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { LONG_PRESS_MS } from "./press";

/**
 * Spec for the two-button operator interface in src/App.tsx.
 *
 * The contract these tests pin down:
 *   - exactly two interactive controls, Main and Mode
 *   - an element with role="timer" showing the remaining time as "M:SS"
 *   - a mode/selection indicator reading "Mode <label>"
 *   - Main's label always names the next short-press action
 *   - one press produces exactly one action, short or long, never both
 *
 * What is deliberately *not* asserted: CSS, class names, pixel sizes.
 */

const START = Date.UTC(2026, 0, 1, 0, 0, 0);
const SECOND = 1_000;
const MINUTE = 60 * SECOND;

const MAIN_LABELS = ["Start", "Pause", "Resume", "Reset"];

function clockText(): string {
  return screen.getByRole("timer").textContent ?? "";
}

/** Main by any of its labels, so the helper cannot be hidden by a label change. */
function mainButton(): HTMLElement {
  const button = screen
    .getAllByRole("button")
    .find((candidate) =>
      MAIN_LABELS.includes(candidate.textContent?.trim() ?? ""),
    );

  if (button === undefined) {
    throw new Error("Main button not found");
  }

  return button;
}

function mainLabelText(): string {
  return mainButton().textContent?.trim() ?? "";
}

function modeButton(): HTMLElement {
  return screen.getByRole("button", { name: "Mode" });
}

/** The visible selection indicator, e.g. "Mode 2b". */
function modeText(): string {
  return screen.getByText(/^Mode \S+$/).textContent ?? "";
}

function advance(ms: number): void {
  // With fake timers, advanceTimersByTime moves the faked clock as well as the
  // pending callbacks, so the timer's reading of "now" and its scheduled tick
  // stay in step — the same way real time passes in the browser.
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/** Released immediately: one short action, and no time gone by. */
function shortPress(button: HTMLElement): void {
  fireEvent.pointerDown(button);
  fireEvent.pointerUp(button);
}

/** Held to the threshold: the long action fires while the button is still down. */
function longPress(button: HTMLElement): void {
  fireEvent.pointerDown(button);
  advance(LONG_PRESS_MS);
  fireEvent.pointerUp(button);
}

function pressMainShort(): void {
  shortPress(mainButton());
}

function pressMainLong(): void {
  longPress(mainButton());
}

function pressModeShort(): void {
  shortPress(modeButton());
}

function pressModeLong(): void {
  longPress(modeButton());
}

function blurWindow(): void {
  act(() => {
    window.dispatchEvent(new Event("blur"));
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
    pressMainShort();

    advance(1 * SECOND);

    expect(clockText()).toBe("4:59");
  });

  it("is still correct after a long jump, as if the tab had been throttled", () => {
    render(<App />);
    pressMainShort();

    advance(2 * MINUTE + 34 * SECOND);

    expect(clockText()).toBe("2:26");
  });

  it("starts the round on release, not on press down", () => {
    render(<App />);
    const main = mainButton();

    // Held for 599 ms, then released: still a short press, so it starts.
    fireEvent.pointerDown(main);
    advance(LONG_PRESS_MS - 1);
    fireEvent.pointerUp(main);

    expect(mainLabelText()).toBe("Pause");
    // The short action fires on release, so the round begins at the release and
    // none of the 599 ms held is billed to the round.
    expect(clockText()).toBe("5:00");

    advance(1 * SECOND);

    expect(clockText()).toBe("4:59");
  });

  it("registers exactly one ticking loop under StrictMode", () => {
    // StrictMode double-invokes effects on mount, so a loop started during mount
    // (or during render) would be registered twice. The count assertion is what
    // makes that visible: the display cannot show the difference, because the
    // remaining time is recomputed from the clock rather than accumulated, so a
    // leaked second loop still reads the same.
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    pressMainShort();

    advance(2 * SECOND);

    expect(clockText()).toBe("4:58");
    expect(vi.getTimerCount()).toBe(1);
  });
});

describe("the end of the round", () => {
  it("clamps at 0:00 instead of counting into negative time", () => {
    render(<App />);
    pressMainShort();

    advance(5 * MINUTE + 10 * SECOND);

    expect(clockText()).toBe("0:00");
  });

  it("stops its loop once the round is over", () => {
    render(<App />);
    pressMainShort();

    advance(5 * MINUTE);

    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("resetting", () => {
  it("returns the display to a full five minutes", () => {
    render(<App />);
    pressMainShort();
    advance(1 * MINUTE);

    pressMainLong();

    expect(clockText()).toBe("5:00");
  });

  it("cancels the countdown that was already running", () => {
    render(<App />);
    pressMainShort();
    advance(1 * MINUTE);

    pressMainLong();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("resets from RUNNING, keeping the selected mode", () => {
    render(<App />);
    pressModeShort();
    pressMainShort();
    advance(2 * MINUTE);

    pressMainLong();

    expect(mainLabelText()).toBe("Start");
    expect(clockText()).toBe("5:00");
    expect(modeText()).toBe("Mode 2");
  });

  it("resets from PAUSED", () => {
    render(<App />);
    pressMainShort();
    advance(1 * MINUTE);
    pressMainShort();
    expect(mainLabelText()).toBe("Resume");

    pressMainLong();

    expect(mainLabelText()).toBe("Start");
    expect(clockText()).toBe("5:00");
  });

  it("resets from FINISHED", () => {
    render(<App />);
    pressMainShort();
    advance(5 * MINUTE);
    expect(mainLabelText()).toBe("Reset");

    pressMainLong();

    expect(mainLabelText()).toBe("Start");
    expect(clockText()).toBe("5:00");
  });
});

describe("unmounting mid-round", () => {
  it("leaves no ticking loop behind", () => {
    const { unmount } = render(<App />);
    pressMainShort();
    advance(1 * SECOND);

    // Proves a loop really was running, so the assertion below means something.
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("the Main button label", () => {
  it("names the next short-press action in every state", () => {
    render(<App />);

    expect(mainLabelText()).toBe("Start");

    pressMainShort();
    expect(mainLabelText()).toBe("Pause");

    pressMainShort();
    expect(mainLabelText()).toBe("Resume");

    pressMainShort();
    expect(mainLabelText()).toBe("Pause");
  });

  it("stays enabled while a round is running, so a long hold still works", () => {
    render(<App />);
    pressMainShort();

    // Not `disabled`, and not marked unavailable either: Main must keep working
    // for a long hold even though its short action has changed meaning.
    const main = mainButton() as HTMLButtonElement;
    expect(main.disabled).toBe(false);
    expect(main.getAttribute("aria-disabled")).toBeNull();

    pressMainLong();

    expect(mainLabelText()).toBe("Start");
  });
});

describe("pause and resume", () => {
  it("freezes the clock while paused", () => {
    render(<App />);
    pressMainShort();
    advance(1 * MINUTE);
    pressMainShort();

    advance(10 * MINUTE);

    expect(clockText()).toBe("4:00");
  });

  it("resumes from the frozen time instead of restarting the round", () => {
    render(<App />);
    pressMainShort();
    advance(1 * MINUTE);
    pressMainShort();
    advance(10 * MINUTE);

    pressMainShort();

    expect(clockText()).toBe("4:00");

    advance(1 * SECOND);

    expect(clockText()).toBe("3:59");
  });
});

describe("one press, one action", () => {
  it("does not also fire a short action when a long press is released", () => {
    render(<App />);

    pressMainLong();

    // A reset happened. If the release had also fired a short press, the app
    // would have started a round instead and read "Pause".
    expect(mainLabelText()).toBe("Start");
    expect(clockText()).toBe("5:00");
  });

  it("ignores the click a real mouse emits after a pointer press", () => {
    render(<App />);
    const main = mainButton();

    fireEvent.pointerDown(main);
    fireEvent.pointerUp(main);
    // Browsers fire click after pointerup, with a non-zero click count.
    fireEvent.click(main, { detail: 1 });

    // One short press: READY -> RUNNING. A duplicate would have paused it.
    expect(mainLabelText()).toBe("Pause");
  });

  it("fires exactly one short action from keyboard activation", () => {
    render(<App />);

    // Keyboard-activated clicks report detail === 0.
    fireEvent.click(mainButton(), { detail: 0 });
    expect(mainLabelText()).toBe("Pause");

    fireEvent.click(mainButton(), { detail: 0 });
    expect(mainLabelText()).toBe("Resume");
  });

  it("does not fire the long action for a keypress, however long it is held", () => {
    render(<App />);

    fireEvent.click(mainButton(), { detail: 0 });
    advance(10 * LONG_PRESS_MS);

    expect(mainLabelText()).toBe("Pause");
  });
});

describe("abandoning a press", () => {
  it("fires nothing when the pointer leaves the button mid-hold", () => {
    render(<App />);
    const main = mainButton();

    fireEvent.pointerDown(main);
    advance(LONG_PRESS_MS / 2);
    // React derives pointerleave from pointerout, so that is what a browser
    // moving the cursor off the button produces.
    fireEvent.pointerOut(main);
    advance(10 * LONG_PRESS_MS);
    fireEvent.pointerUp(main);

    expect(mainLabelText()).toBe("Start");
    expect(clockText()).toBe("5:00");
  });

  it("fires nothing when the pointer is cancelled mid-hold", () => {
    render(<App />);
    const main = mainButton();

    fireEvent.pointerDown(main);
    advance(LONG_PRESS_MS / 2);
    fireEvent.pointerCancel(main);
    advance(10 * LONG_PRESS_MS);
    fireEvent.pointerUp(main);

    expect(mainLabelText()).toBe("Start");
    expect(clockText()).toBe("5:00");
  });

  it("fires nothing when the window loses focus mid-hold", () => {
    render(<App />);
    const main = mainButton();

    fireEvent.pointerDown(main);
    advance(LONG_PRESS_MS / 2);
    blurWindow();
    advance(10 * LONG_PRESS_MS);
    fireEvent.pointerUp(main);

    expect(mainLabelText()).toBe("Start");
    expect(clockText()).toBe("5:00");
  });

  it("leaves no pending action when unmounted mid-hold", () => {
    const { unmount } = render(<App />);

    fireEvent.pointerDown(mainButton());
    advance(LONG_PRESS_MS / 2);

    unmount();

    // Without cancelling on unmount, the pending hold would still be scheduled.
    expect(vi.getTimerCount()).toBe(0);

    advance(10 * LONG_PRESS_MS);

    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("the Mode button", () => {
  it("starts on mode 1", () => {
    render(<App />);

    expect(modeText()).toBe("Mode 1");
  });

  it("cycles the top-level modes 1 -> 2 -> 3 -> 4 -> 5 -> 1", () => {
    render(<App />);

    const seen = [modeText()];

    for (let press = 0; press < 5; press += 1) {
      pressModeShort();
      seen.push(modeText());
    }

    expect(seen).toEqual([
      "Mode 1",
      "Mode 2",
      "Mode 3",
      "Mode 4",
      "Mode 5",
      "Mode 1",
    ]);
  });

  it("cycles the options within a mode on a long press", () => {
    render(<App />);
    pressModeShort();
    expect(modeText()).toBe("Mode 2");

    pressModeLong();
    expect(modeText()).toBe("Mode 2b");

    pressModeLong();
    expect(modeText()).toBe("Mode 2c");

    pressModeLong();
    expect(modeText()).toBe("Mode 2");
  });

  it("returns to the base selection when the top-level mode changes", () => {
    render(<App />);
    pressModeShort();
    pressModeLong();
    expect(modeText()).toBe("Mode 2b");

    pressModeShort();

    expect(modeText()).toBe("Mode 3");
  });

  it("marks modes 2-5 as placeholders and mode 1 as the real round", () => {
    render(<App />);

    expect(screen.queryByText(/placeholder/i)).toBeNull();

    pressModeShort();

    expect(screen.getByText(/placeholder/i)).toBeTruthy();
    expect(modeText()).toBe("Mode 2");
  });

  it("is ignored while a round is running", () => {
    render(<App />);
    pressMainShort();

    pressModeShort();
    pressModeShort();
    pressModeLong();

    expect(modeText()).toBe("Mode 1");
  });

  it("is ignored while a round is paused", () => {
    render(<App />);
    pressMainShort();
    pressMainShort();

    pressModeShort();
    pressModeLong();

    expect(modeText()).toBe("Mode 1");
  });

  it("is usable again once the round is over", () => {
    render(<App />);
    pressMainShort();
    advance(5 * MINUTE);

    pressModeShort();

    expect(modeText()).toBe("Mode 2");
  });
});
