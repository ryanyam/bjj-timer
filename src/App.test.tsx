import { StrictMode } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { MAIN_BUTTON_HOLD_MS, MODE_BUTTON_HOLD_MS } from "./gamepad";

vi.mock("./audio", () => ({
  unlockAudio: vi.fn(),
  playWorkStart: vi.fn(),
  playRestStart: vi.fn(),
}));

import { playRestStart, playWorkStart } from "./audio";

/**
 * Spec for the Rolls/Drills interface in src/App.tsx.
 *
 * The contract these tests pin down:
 *   - two mode options and the selected mode's two presets, each appearing once
 *   - a dominant active option and readable inactive alternatives
 *   - selector clicks and the physical-equivalent Mode button share actions
 *   - Ready-only selection, with a non-blocking locked message
 *   - work/rest display, round numbering, pause/resume/reset, and one cue per
 *     live transition
 *
 * CSS, pixel sizes, and device behaviour are deliberately not asserted.
 */

const START = Date.UTC(2026, 0, 1, 0, 0, 0);
const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const NOTICE_MS = 2_200;

const workCue = vi.mocked(playWorkStart);
const restCue = vi.mocked(playRestStart);

function clockText(): string {
  return screen.getByRole("timer").textContent?.trim() ?? "";
}

function mainButton(): HTMLElement {
  return screen.getByRole("button", { name: /^(Start|Pause|Resume)$/ });
}

function mainLabelText(): string {
  return mainButton().textContent?.trim() ?? "";
}

function modeRow(): HTMLElement {
  return screen.getByRole("group", { name: "Main mode" });
}

function presetRow(): HTMLElement {
  return screen.getByRole("group", { name: "Preset" });
}

function modeOption(name: "ROLLS" | "DRILLS"): HTMLElement {
  return within(modeRow()).getByRole("button", { name });
}

function presetOptions(): HTMLElement[] {
  return within(presetRow()).getAllByRole("button");
}

function presetLabels(): string[] {
  return presetOptions().map((button) => button.textContent?.trim() ?? "");
}

function activePreset(): HTMLElement {
  const active = presetOptions().find(
    (button) => button.getAttribute("aria-pressed") === "true",
  );

  if (active === undefined) {
    throw new Error("No active preset button");
  }

  return active;
}

function phaseText(): string {
  return document.querySelector(".timer__phase")?.textContent?.trim() ?? "";
}

function modeContextText(): string {
  return (
    document.querySelector(".timer__mode-context")?.textContent?.trim() ?? ""
  );
}

function roundText(): string {
  return document.querySelector(".timer__round")?.textContent?.trim() ?? "";
}

function nextText(): string {
  return document.querySelector(".timer__next")?.textContent?.trim() ?? "";
}

function messageText(): string {
  return screen.getByRole("status").textContent?.trim() ?? "";
}

function mainElement(): HTMLElement {
  const element = document.querySelector(".timer");

  if (!(element instanceof HTMLElement)) {
    throw new Error("Timer root not found");
  }

  return element;
}

function pausedBadge(): HTMLElement | null {
  return screen.queryByText("PAUSED");
}

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function shortPress(button: HTMLElement): void {
  fireEvent.pointerDown(button);
  fireEvent.pointerUp(button);
}

function longPress(button: HTMLElement, holdMs: number): void {
  fireEvent.pointerDown(button);
  advance(holdMs);
  fireEvent.pointerUp(button);
}

function pressMainShort(): void {
  shortPress(mainButton());
}

function pressMainLong(): void {
  longPress(mainButton(), MAIN_BUTTON_HOLD_MS);
}

function modeButton(): HTMLElement {
  return screen.getByRole("button", { name: "Mode" });
}

function pressModeShort(): void {
  shortPress(modeButton());
}

function pressModeLong(): void {
  longPress(modeButton(), MODE_BUTTON_HOLD_MS);
}

function selectMode(name: "ROLLS" | "DRILLS"): void {
  fireEvent.click(modeOption(name));
}

function selectPreset(index: number): void {
  const option = presetOptions()[index];

  if (option === undefined) {
    throw new Error(`No preset at index ${index}`);
  }

  fireEvent.click(option);
}

function blurWindow(): void {
  act(() => {
    window.dispatchEvent(new Event("blur"));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the initial selection", () => {
  it("shows Rolls, 5:00 work / 1:00 rest, ready at round 1", () => {
    render(<App />);

    expect(clockText()).toBe("5:00");
    expect(phaseText()).toBe("WORK");
    expect(modeContextText()).toBe("ROLLS");
    expect(roundText()).toBe("ROUND 1");
    expect(nextText()).toBe("NEXT: WORK 5:00");
    expect(mainLabelText()).toBe("Start");
    expect(pausedBadge()).toBeNull();
    expect(mainElement().getAttribute("data-mode")).toBe("rolls");
    expect(mainElement().getAttribute("data-phase")).toBe("work");
    expect(mainElement().getAttribute("data-status")).toBe("ready");
  });

  it("shows each main mode exactly once, with Rolls selected", () => {
    render(<App />);

    const options = within(modeRow()).getAllByRole("button");

    expect(options.map((button) => button.textContent?.trim())).toEqual([
      "ROLLS",
      "DRILLS",
    ]);
    expect(modeOption("ROLLS").getAttribute("aria-pressed")).toBe("true");
    expect(modeOption("DRILLS").getAttribute("aria-pressed")).toBe("false");
    expect(modeOption("ROLLS").getAttribute("data-selected")).toBe("true");
    expect(modeOption("DRILLS").getAttribute("data-selected")).toBeNull();
  });

  it("shows only the selected mode's presets, once each, with the active one explicit", () => {
    render(<App />);

    expect(presetLabels()).toEqual(["WORK 5:00 / REST 1:00", "3:00 / 1:00"]);
    expect(activePreset().textContent?.trim()).toBe("WORK 5:00 / REST 1:00");
    expect(activePreset().getAttribute("aria-pressed")).toBe("true");
    expect(presetOptions()[1].getAttribute("aria-pressed")).toBe("false");
  });

  it("shows the compact Ready-state control hint", () => {
    render(<App />);

    expect(messageText()).toBe(
      "White: preset · Hold white: mode · Green: start",
    );
  });

  it("marks selectors as available while ready", () => {
    render(<App />);

    for (const button of [
      ...within(modeRow()).getAllByRole("button"),
      ...presetOptions(),
    ]) {
      expect(button.getAttribute("aria-disabled")).toBeNull();
    }
  });
});

describe("choosing a mode or preset while ready", () => {
  it("switches to Drills and shows only its presets", () => {
    render(<App />);

    selectMode("DRILLS");

    expect(clockText()).toBe("2:00");
    expect(phaseText()).toBe("WORK");
    expect(modeContextText()).toBe("DRILLS");
    expect(nextText()).toBe("NEXT: WORK 2:00");
    expect(presetLabels()).toEqual(["WORK 2:00 / REST 0:30", "1:00 / 0:30"]);
    expect(modeOption("DRILLS").getAttribute("aria-pressed")).toBe("true");
    expect(modeOption("ROLLS").getAttribute("aria-pressed")).toBe("false");
    expect(mainElement().getAttribute("data-mode")).toBe("drills");
  });

  it("loads a chosen preset's full work duration without starting", () => {
    render(<App />);

    selectPreset(1);

    expect(clockText()).toBe("3:00");
    expect(activePreset().textContent?.trim()).toBe("WORK 3:00 / REST 1:00");
    expect(presetLabels()[0]).toBe("5:00 / 1:00");
    expect(mainLabelText()).toBe("Start");
    expect(roundText()).toBe("ROUND 1");
    expect(mainElement().getAttribute("data-status")).toBe("ready");
  });

  it("remembers each mode's last selected preset", () => {
    render(<App />);

    selectPreset(1);
    expect(clockText()).toBe("3:00");

    selectMode("DRILLS");
    selectPreset(1);
    expect(clockText()).toBe("1:00");

    selectMode("ROLLS");
    expect(clockText()).toBe("3:00");
    expect(activePreset().textContent?.trim()).toBe("WORK 3:00 / REST 1:00");

    selectMode("DRILLS");
    expect(clockText()).toBe("1:00");
    expect(activePreset().textContent?.trim()).toBe("WORK 1:00 / REST 0:30");
  });

  it("uses the selector's mode and preset actions through the same reducer", () => {
    render(<App />);

    selectMode("DRILLS");
    selectPreset(0);

    // The Mode button then cycles from exactly the same selected state.
    pressModeShort();

    expect(activePreset().textContent?.trim()).toBe("WORK 1:00 / REST 0:30");
  });
});

describe("the Mode button and keyboard selection", () => {
  it("cycles presets on a short press, wrapping", () => {
    render(<App />);

    pressModeShort();
    expect(clockText()).toBe("3:00");

    pressModeShort();
    expect(clockText()).toBe("5:00");

    pressModeShort();
    expect(clockText()).toBe("3:00");
  });

  it("cycles main modes on a hold, without also cycling the preset", () => {
    render(<App />);

    pressModeLong();

    expect(modeContextText()).toBe("DRILLS");
    expect(clockText()).toBe("2:00");
    expect(activePreset().textContent?.trim()).toBe("WORK 2:00 / REST 0:30");

    pressModeLong();

    expect(modeContextText()).toBe("ROLLS");
    expect(clockText()).toBe("5:00");
  });

  it("switches mode at 800 ms, not earlier, and release does nothing extra", () => {
    render(<App />);

    fireEvent.pointerDown(modeButton());
    advance(MODE_BUTTON_HOLD_MS - 1);
    expect(modeContextText()).toBe("ROLLS");

    advance(1);
    expect(modeContextText()).toBe("DRILLS");

    fireEvent.pointerUp(modeButton());

    expect(modeContextText()).toBe("DRILLS");
    expect(activePreset().textContent?.trim()).toBe("WORK 2:00 / REST 0:30");
  });

  it("selects the next preset from keyboard activation of the Mode button", () => {
    render(<App />);

    fireEvent.click(modeButton(), { detail: 0 });

    expect(clockText()).toBe("3:00");
  });

  it("allows keyboard activation of a visible selector option", () => {
    render(<App />);

    fireEvent.click(modeOption("DRILLS"));

    expect(modeContextText()).toBe("DRILLS");
    expect(clockText()).toBe("2:00");
  });
});

describe("running a work/rest session", () => {
  it("starts work immediately and shows the next rest preview", () => {
    render(<App />);

    pressMainShort();

    expect(mainLabelText()).toBe("Pause");
    expect(clockText()).toBe("5:00");
    expect(phaseText()).toBe("WORK");
    expect(roundText()).toBe("ROUND 1");
    expect(nextText()).toBe("NEXT: REST 1:00");
    expect(mainElement().getAttribute("data-status")).toBe("running");
    expect(workCue).toHaveBeenCalledTimes(1);
    expect(restCue).not.toHaveBeenCalled();
  });

  it("moves work to the full rest at the deadline, keeping the round", () => {
    render(<App />);
    pressMainShort();
    vi.clearAllMocks();

    advance(5 * MINUTE);

    expect(phaseText()).toBe("REST");
    expect(clockText()).toBe("1:00");
    expect(roundText()).toBe("ROUND 1");
    expect(nextText()).toBe("NEXT: WORK 5:00");
    expect(mainElement().getAttribute("data-phase")).toBe("rest");
    expect(restCue).toHaveBeenCalledTimes(1);
    expect(workCue).not.toHaveBeenCalled();
  });

  it("starts the next full work and increments the round after rest", () => {
    render(<App />);
    pressMainShort();
    advance(5 * MINUTE);
    vi.clearAllMocks();

    advance(1 * MINUTE);

    expect(phaseText()).toBe("WORK");
    expect(clockText()).toBe("5:00");
    expect(roundText()).toBe("ROUND 2");
    expect(nextText()).toBe("NEXT: REST 1:00");
    expect(workCue).toHaveBeenCalledTimes(1);
    expect(restCue).not.toHaveBeenCalled();
  });

  it("uses Drills work and rest durations", () => {
    render(<App />);
    selectMode("DRILLS");
    selectPreset(1);
    pressMainShort();

    expect(clockText()).toBe("1:00");
    expect(nextText()).toBe("NEXT: REST 0:30");

    advance(1 * MINUTE);

    expect(phaseText()).toBe("REST");
    expect(clockText()).toBe("0:30");
    expect(nextText()).toBe("NEXT: WORK 1:00");
  });

  it("does not fire a second cue from a delayed, repeated render", () => {
    render(<App />);
    pressMainShort();
    advance(5 * MINUTE);
    vi.clearAllMocks();

    // No additional clock movement: the effect must not replay the cue.
    advance(0);
    expect(restCue).not.toHaveBeenCalled();
  });

  it("plays one live cue after a late tick crosses several phases", () => {
    render(<App />);
    pressMainShort();
    vi.clearAllMocks();

    // One callback sees a clock seven minutes ahead: work -> rest -> next work.
    act(() => {
      vi.setSystemTime(START + 7 * MINUTE);
      vi.advanceTimersToNextTimer();
    });

    expect(phaseText()).toBe("WORK");
    expect(roundText()).toBe("ROUND 2");
    expect(workCue).toHaveBeenCalledTimes(1);
    expect(restCue).not.toHaveBeenCalled();
  });

  it("does not fire a cue on reset and removes the ticking loop", () => {
    render(<App />);
    pressMainShort();
    advance(2 * MINUTE);
    vi.clearAllMocks();

    pressMainLong();

    expect(workCue).not.toHaveBeenCalled();
    expect(restCue).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);

    advance(10 * MINUTE);

    expect(workCue).not.toHaveBeenCalled();
    expect(restCue).not.toHaveBeenCalled();
    expect(clockText()).toBe("5:00");
  });
});

describe("pause, resume and reset", () => {
  it("freezes work, shows PAUSED, and resumes from the same remainder", () => {
    render(<App />);
    pressMainShort();
    advance(2 * MINUTE);
    pressMainShort();

    expect(mainLabelText()).toBe("Resume");
    expect(pausedBadge()).not.toBeNull();
    expect(clockText()).toBe("3:00");
    expect(phaseText()).toBe("WORK");
    expect(mainElement().getAttribute("data-status")).toBe("paused");

    advance(10 * MINUTE);
    expect(clockText()).toBe("3:00");
    expect(roundText()).toBe("ROUND 1");

    pressMainShort();
    expect(pausedBadge()).toBeNull();
    expect(mainLabelText()).toBe("Pause");
    expect(clockText()).toBe("3:00");

    advance(1 * SECOND);
    expect(clockText()).toBe("2:59");
  });

  it("freezes and resumes a rest phase", () => {
    render(<App />);
    pressMainShort();
    advance(5 * MINUTE);
    advance(30 * SECOND);

    pressMainShort();

    expect(pausedBadge()).not.toBeNull();
    expect(phaseText()).toBe("REST");
    expect(clockText()).toBe("0:30");

    advance(10 * MINUTE);
    expect(clockText()).toBe("0:30");

    pressMainShort();
    expect(clockText()).toBe("0:30");

    advance(30 * SECOND);
    expect(phaseText()).toBe("WORK");
    expect(roundText()).toBe("ROUND 2");
    expect(clockText()).toBe("5:00");
  });

  it("resets from running work to Ready, round 1, preserving selection", () => {
    render(<App />);
    selectMode("DRILLS");
    selectPreset(1);
    pressMainShort();
    advance(30 * SECOND);
    vi.clearAllMocks();

    pressMainLong();

    expect(mainLabelText()).toBe("Start");
    expect(clockText()).toBe("1:00");
    expect(phaseText()).toBe("WORK");
    expect(modeContextText()).toBe("DRILLS");
    expect(roundText()).toBe("ROUND 1");
    expect(nextText()).toBe("NEXT: WORK 1:00");
    expect(pausedBadge()).toBeNull();
    expect(mainElement().getAttribute("data-status")).toBe("ready");
    expect(workCue).not.toHaveBeenCalled();
    expect(restCue).not.toHaveBeenCalled();
  });

  it("resets from running rest", () => {
    render(<App />);
    pressMainShort();
    advance(5 * MINUTE);

    pressMainLong();

    expect(phaseText()).toBe("WORK");
    expect(clockText()).toBe("5:00");
    expect(roundText()).toBe("ROUND 1");
  });

  it("resets from Paused and clears the paused state", () => {
    render(<App />);
    pressMainShort();
    advance(2 * MINUTE);
    pressMainShort();
    expect(pausedBadge()).not.toBeNull();

    pressMainLong();

    expect(pausedBadge()).toBeNull();
    expect(mainLabelText()).toBe("Start");
    expect(clockText()).toBe("5:00");
  });

  it("does not start from Ready when a Main hold is released", () => {
    render(<App />);

    fireEvent.pointerDown(mainButton());
    advance(MAIN_BUTTON_HOLD_MS);
    fireEvent.pointerUp(mainButton());

    expect(mainLabelText()).toBe("Start");
    expect(clockText()).toBe("5:00");
    expect(mainElement().getAttribute("data-status")).toBe("ready");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not start before 1,500 ms", () => {
    render(<App />);

    fireEvent.pointerDown(mainButton());
    advance(MAIN_BUTTON_HOLD_MS - 1);
    fireEvent.pointerUp(mainButton());

    expect(mainLabelText()).toBe("Pause");
    expect(clockText()).toBe("5:00");
  });
});

describe("selection while running or paused", () => {
  it("refuses selector changes and shows a non-blocking notice", () => {
    render(<App />);
    pressMainShort();
    advance(1 * MINUTE);

    selectMode("DRILLS");

    expect(modeContextText()).toBe("ROLLS");
    expect(clockText()).toBe("4:00");
    advance(0);
    expect(messageText()).toBe("Hold green to reset before changing.");

    selectPreset(1);
    pressModeShort();

    expect(modeContextText()).toBe("ROLLS");
    expect(clockText()).toBe("4:00");
    expect(phaseText()).toBe("WORK");
  });

  it("refuses changes while paused", () => {
    render(<App />);
    pressMainShort();
    advance(1 * MINUTE);
    pressMainShort();

    selectMode("DRILLS");

    expect(modeContextText()).toBe("ROLLS");
    expect(clockText()).toBe("4:00");
    expect(pausedBadge()).not.toBeNull();
    advance(0);
    expect(messageText()).toBe("Hold green to reset before changing.");
  });

  it("marks all selector options as disabled while a session is in flight", () => {
    render(<App />);
    pressMainShort();

    for (const button of [
      ...within(modeRow()).getAllByRole("button"),
      ...presetOptions(),
    ]) {
      expect(button.getAttribute("aria-disabled")).toBe("true");
    }
  });

  it("clears the notice and restores the lock hint", () => {
    render(<App />);
    pressMainShort();

    selectMode("DRILLS");
    advance(0);
    expect(messageText()).toBe("Hold green to reset before changing.");

    advance(NOTICE_MS);

    expect(messageText()).toBe("Selection locked — hold green to reset");
  });

  it("does not repeat the notice while a white hold remains down", () => {
    render(<App />);
    pressMainShort();

    fireEvent.pointerDown(modeButton());
    advance(MODE_BUTTON_HOLD_MS);
    advance(0);
    expect(messageText()).toBe("Hold green to reset before changing.");

    advance(NOTICE_MS);
    expect(messageText()).toBe("Selection locked — hold green to reset");

    // Still holding: no new blocked attempt should be generated.
    advance(5 * MODE_BUTTON_HOLD_MS);
    expect(messageText()).toBe("Selection locked — hold green to reset");

    fireEvent.pointerUp(modeButton());
    expect(modeContextText()).toBe("ROLLS");
  });

  it("does not queue a refused change for after reset", () => {
    render(<App />);
    pressMainShort();
    selectMode("DRILLS");
    selectPreset(1);

    pressMainLong();

    expect(modeContextText()).toBe("ROLLS");
    expect(clockText()).toBe("5:00");
    expect(activePreset().textContent?.trim()).toBe("WORK 5:00 / REST 1:00");
  });
});

describe("abandoning and guarding presses", () => {
  it("fires no Main action when the pointer leaves mid-hold", () => {
    render(<App />);
    const main = mainButton();

    fireEvent.pointerDown(main);
    advance(MAIN_BUTTON_HOLD_MS / 2);
    fireEvent.pointerOut(main);
    advance(10 * MAIN_BUTTON_HOLD_MS);
    fireEvent.pointerUp(main);

    expect(mainLabelText()).toBe("Start");
    expect(clockText()).toBe("5:00");
  });

  it("fires no Mode action when the window loses focus mid-hold", () => {
    render(<App />);
    const mode = modeButton();

    fireEvent.pointerDown(mode);
    advance(MODE_BUTTON_HOLD_MS / 2);
    blurWindow();
    advance(10 * MODE_BUTTON_HOLD_MS);
    fireEvent.pointerUp(mode);

    expect(modeContextText()).toBe("ROLLS");
    expect(clockText()).toBe("5:00");
  });

  it("leaves no pending action when unmounted mid-hold", () => {
    const { unmount } = render(<App />);

    fireEvent.pointerDown(mainButton());
    advance(MAIN_BUTTON_HOLD_MS / 2);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
    advance(10 * MAIN_BUTTON_HOLD_MS);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("registers exactly one ticking loop under StrictMode", () => {
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

  it("leaves no ticking loop behind after reset or unmount", () => {
    const { unmount } = render(<App />);
    pressMainShort();
    advance(1 * SECOND);
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    pressMainLong();
    expect(vi.getTimerCount()).toBe(0);

    pressMainShort();
    advance(1 * SECOND);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
