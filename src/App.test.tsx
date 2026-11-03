import { StrictMode } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { MAIN_BUTTON_HOLD_MS, MODE_BUTTON_HOLD_MS } from "./gamepad";

vi.mock("./audio", () => ({
  unlockAudio: vi.fn(),
  initializeAudio: vi.fn(() => Promise.resolve(true)),
  onAudioUnavailable: vi.fn(() => vi.fn()),
  playWorkStart: vi.fn(),
  playRestStart: vi.fn(),
  playModeChange: vi.fn(),
  playPause: vi.fn(),
  playResume: vi.fn(),
  playPresetChange: vi.fn(),
  playReset: vi.fn(),
}));

import {
  initializeAudio,
  playModeChange,
  playPause,
  playPresetChange,
  playReset,
  playRestStart,
  playResume,
  playWorkStart,
} from "./audio";
import { resetGetReadySettings, setGetReadySecondsForMode } from "./settings";

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

const workCue = vi.mocked(playWorkStart);
const restCue = vi.mocked(playRestStart);
const modeCue = vi.mocked(playModeChange);
const pauseCue = vi.mocked(playPause);
const resumeCue = vi.mocked(playResume);
const presetCue = vi.mocked(playPresetChange);
const resetCue = vi.mocked(playReset);
const initAudio = vi.mocked(initializeAudio);

function clockText(): string {
  return screen.getByRole("timer").textContent?.trim() ?? "";
}

function mainButton(): HTMLElement {
  const button = document.querySelector<HTMLElement>(
    ".control-button--primary",
  );
  if (button === null) throw new Error("Main button not found");
  return button;
}

function mainLabelText(): string {
  const status = document.querySelector(".app")?.getAttribute("data-status");
  return status === "running"
    ? "Pause"
    : status === "paused"
      ? "Resume"
      : "Start";
}

function phaseText(): string {
  return document.querySelector(".app")?.getAttribute("data-phase") === "rest"
    ? "REST"
    : "WORK";
}

function phaseHeadlineText(): string {
  return (
    document.querySelector(".phase-band__label")?.textContent?.trim() ?? ""
  );
}

function modeContextText(): string {
  const mode = document.querySelector(".app")?.getAttribute("data-mode");
  return mode === "drills" ? "DRILLS" : mode === "kids" ? "KIDS" : "ROLLS";
}

function roundText(): string {
  return (
    [...document.querySelectorAll(".meta-item")]
      .find((item) => item.textContent?.startsWith("ROUND "))
      ?.textContent?.trim() ?? ""
  );
}

function nextText(): string {
  return (
    [...document.querySelectorAll(".meta-item")]
      .find((item) => item.textContent?.startsWith("NEXT:"))
      ?.textContent?.trim() ?? ""
  );
}

function mainElement(): HTMLElement {
  const element = document.querySelector(".app");

  if (!(element instanceof HTMLElement)) {
    throw new Error("App root not found");
  }

  return element;
}

function pausedBadge(): HTMLElement | null {
  return document.querySelector(".status-badge--paused");
}

function progressTone(): "work" | "rest" | null {
  const bar = document.querySelector(".progress-bar");

  if (bar?.classList.contains("progress-bar--warning-rest")) {
    return "rest";
  }

  if (bar?.classList.contains("progress-bar--warning-work")) {
    return "work";
  }

  return null;
}

function nextLabelText(): string {
  return (
    document
      .querySelector(".status-strip__side--right")
      ?.textContent?.trim() ?? ""
  );
}

function statusBandClass(): string {
  return document.querySelector(".status-strip")?.className ?? "";
}

function modeRow(): HTMLElement {
  return screen.getByRole("group", { name: "Main mode" });
}

function presetRow(): HTMLElement {
  return screen.getByRole("group", { name: "Preset" });
}

function modeOption(name: "ROLLS" | "DRILLS" | "KIDS"): HTMLElement {
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
  const button = document.querySelector<HTMLElement>(".control-button--mode");
  if (button === null) throw new Error("Mode button not found");
  return button;
}

function pressModeShort(): void {
  shortPress(modeButton());
}

function pressModeLong(): void {
  longPress(modeButton(), MODE_BUTTON_HOLD_MS);
}

function selectMode(name: "ROLLS" | "DRILLS" | "KIDS"): void {
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
  resetGetReadySettings();
  setGetReadySecondsForMode("rolls", 0);
  setGetReadySecondsForMode("drills", 0);
  setGetReadySecondsForMode("kids", 0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Get Ready countdown", () => {
  it("runs 5 seconds for Rolls and starts work at zero", () => {
    setGetReadySecondsForMode("rolls", 5);
    render(<App />);

    pressMainShort();

    expect(document.querySelector(".app")?.getAttribute("data-status")).toBe(
      "getReady",
    );
    expect(phaseHeadlineText()).toBe("GET READY");
    expect(clockText()).toBe("0:05");
    expect(mainButton().textContent).toContain("STARTING...");
    expect(mainButton().textContent).toContain("Press to stop the countdown");
    expect(modeButton().textContent).toContain("LOCKED");
    expect(modeButton().textContent).toContain("Wait for the round to start");
    expect(modeButton().hasAttribute("disabled")).toBe(true);
    expect(roundText()).toBe("ROUND 1");
    expect(workCue).not.toHaveBeenCalled();

    advance(5 * SECOND);

    expect(document.querySelector(".app")?.getAttribute("data-status")).toBe(
      "running",
    );
    expect(phaseText()).toBe("WORK");
    expect(mainLabelText()).toBe("Pause");
    expect(clockText()).toBe("5:00");
    expect(workCue).toHaveBeenCalledTimes(1);
  });

  it("runs 3 seconds for Drills", () => {
    setGetReadySecondsForMode("drills", 3);
    render(<App />);
    selectMode("DRILLS");

    pressMainShort();

    expect(clockText()).toBe("0:03");
    expect(modeButton().textContent).toContain("Wait for the round to start");

    advance(3 * SECOND);

    expect(phaseText()).toBe("WORK");
    expect(clockText()).toBe("2:00");
  });

  it("cancels back to Ready without starting work", () => {
    setGetReadySecondsForMode("rolls", 5);
    render(<App />);

    pressMainShort();
    pressMainShort();

    expect(document.querySelector(".app")?.getAttribute("data-status")).toBe(
      "ready",
    );
    expect(phaseHeadlineText()).toBe("READY");
    expect(clockText()).toBe("5:00");
    expect(workCue).not.toHaveBeenCalled();
    expect(resetCue).not.toHaveBeenCalled();
  });

  it("returns to Ready on a full reset and plays reset", () => {
    setGetReadySecondsForMode("rolls", 5);
    render(<App />);

    pressMainShort();
    pressMainLong();

    expect(document.querySelector(".app")?.getAttribute("data-status")).toBe(
      "ready",
    );
    expect(clockText()).toBe("5:00");
    expect(resetCue).toHaveBeenCalledTimes(1);
  });

  it("starts immediately when the configured duration is zero", () => {
    setGetReadySecondsForMode("drills", 0);
  setGetReadySecondsForMode("kids", 0);
    render(<App />);
    selectMode("DRILLS");

    pressMainShort();

    expect(document.querySelector(".app")?.getAttribute("data-status")).toBe(
      "running",
    );
    expect(clockText()).toBe("2:00");
    expect(workCue).toHaveBeenCalledTimes(1);
  });
});

describe("audio cue mapping", () => {
  it("plays pause and resume exactly once each", () => {
    render(<App />);
    pressMainShort();
    advance(1 * SECOND);
    vi.clearAllMocks();

    pressMainShort();
    expect(pauseCue).toHaveBeenCalledTimes(1);

    pressMainShort();
    expect(resumeCue).toHaveBeenCalledTimes(1);
    expect(pauseCue).toHaveBeenCalledTimes(1);
    expect(workCue).not.toHaveBeenCalled();
  });

  it("plays preset_change only for preset changes, not mode changes", () => {
    render(<App />);

    pressModeShort();
    expect(presetCue).toHaveBeenCalledTimes(1);
    expect(modeCue).not.toHaveBeenCalled();

    pressModeLong();
    expect(modeCue).toHaveBeenCalledTimes(1);
    expect(presetCue).toHaveBeenCalledTimes(1);
  });

  it("plays reset on a reset hold and no round cue", () => {
    render(<App />);
    pressMainShort();
    advance(1 * SECOND);
    vi.clearAllMocks();

    pressMainLong();

    expect(resetCue).toHaveBeenCalledTimes(1);
    expect(workCue).not.toHaveBeenCalled();
    expect(restCue).not.toHaveBeenCalled();
  });

  it("plays one start and one end per Work/Rest cycle", () => {
    render(<App />);
    pressMainShort();

    advance(5 * MINUTE + SECOND);
    advance(1 * MINUTE + SECOND);
    advance(5 * MINUTE + SECOND);
    advance(1 * MINUTE + SECOND);

    expect(workCue).toHaveBeenCalledTimes(3);
    expect(restCue).toHaveBeenCalledTimes(2);
    expect(pauseCue).not.toHaveBeenCalled();
    expect(resumeCue).not.toHaveBeenCalled();
  });

  it("shows a warning and keeps the timer working when audio load fails", async () => {
    initAudio.mockResolvedValueOnce(false);

    await act(async () => {
      render(<App />);
      await Promise.resolve();
    });

    expect(screen.getByText("Sound unavailable")).toBeTruthy();

    pressMainShort();

    expect(clockText()).toBe("5:00");
    expect(document.querySelector(".app")?.getAttribute("data-status")).toBe(
      "running",
    );
  });
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
      "KIDS",
    ]);
    expect(modeOption("ROLLS").getAttribute("aria-pressed")).toBe("true");
    expect(modeOption("DRILLS").getAttribute("aria-pressed")).toBe("false");
    expect(modeOption("KIDS").getAttribute("aria-pressed")).toBe("false");
    expect(modeOption("ROLLS").getAttribute("data-selected")).toBe("true");
    expect(modeOption("DRILLS").getAttribute("data-selected")).toBeNull();
    expect(modeOption("KIDS").getAttribute("data-selected")).toBeNull();
  });

  it("shows only the selected mode's presets, once each, with the active one explicit", () => {
    render(<App />);

    expect(presetLabels()).toEqual(["5:00 / 1:00", "3:00 / 1:00"]);
    expect(activePreset().textContent?.trim()).toBe("5:00 / 1:00");
    expect(activePreset().getAttribute("aria-pressed")).toBe("true");
    expect(presetOptions()[1].getAttribute("aria-pressed")).toBe("false");
  });

  it("does not render a permanent helper line under the selectors", () => {
    render(<App />);

    expect(document.querySelector(".timer-card__notice")).toBeNull();
    expect(
      screen.queryByText("White: preset · Hold white: mode · Green: start"),
    ).toBeNull();
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
    expect(presetLabels()).toEqual([
      "2:00 / 0:30",
      "3:00 / 0:30",
      "5:00 / 0:30",
      "1:00 / 0:30",
    ]);
    expect(modeOption("DRILLS").getAttribute("aria-pressed")).toBe("true");
    expect(modeOption("ROLLS").getAttribute("aria-pressed")).toBe("false");
    expect(mainElement().getAttribute("data-mode")).toBe("drills");
  });

  it("loads a chosen preset's full work duration without starting", () => {
    render(<App />);

    selectPreset(1);

    expect(clockText()).toBe("3:00");
    expect(activePreset().textContent?.trim()).toBe("3:00 / 1:00");
    expect(presetLabels()[0]).toBe("5:00 / 1:00");
    expect(mainLabelText()).toBe("Start");
    expect(roundText()).toBe("ROUND 1");
    expect(mainElement().getAttribute("data-status")).toBe("ready");
  });

  it("starts a newly selected mode on its first preset", () => {
    render(<App />);

    selectPreset(1);
    expect(clockText()).toBe("3:00");

    selectMode("DRILLS");
    expect(clockText()).toBe("2:00");
    expect(activePreset().textContent?.trim()).toBe("2:00 / 0:30");

    selectPreset(1);
    expect(clockText()).toBe("3:00");

    selectMode("ROLLS");
    expect(clockText()).toBe("5:00");
    expect(activePreset().textContent?.trim()).toBe("5:00 / 1:00");

    selectMode("DRILLS");
    expect(clockText()).toBe("2:00");
    expect(activePreset().textContent?.trim()).toBe("2:00 / 0:30");
  });

  it("uses the selector's mode and preset actions through the same reducer", () => {
    render(<App />);

    selectMode("DRILLS");
    selectPreset(0);

    // The Mode button then cycles from exactly the same selected state.
    pressModeShort();

    expect(activePreset().textContent?.trim()).toBe("3:00 / 0:30");
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
    expect(activePreset().textContent?.trim()).toBe("2:00 / 0:30");

    pressModeLong();

    expect(modeContextText()).toBe("KIDS");
    expect(clockText()).toBe("0:30");

    pressModeLong();

    expect(modeContextText()).toBe("ROLLS");
    expect(clockText()).toBe("5:00");
  });

  it("cycles the full Drills preset sequence and wraps", () => {
    render(<App />);
    selectMode("DRILLS");

    const seen: string[] = [clockText()];
    for (let press = 0; press < 4; press += 1) {
      pressModeShort();
      seen.push(clockText());
    }

    expect(seen).toEqual(["2:00", "3:00", "5:00", "1:00", "2:00"]);
  });

  it("loads Kids at 30 seconds work / 5 seconds rest", () => {
    render(<App />);
    selectMode("KIDS");

    expect(clockText()).toBe("0:30");
    expect(nextText()).toBe("NEXT: WORK 0:30");
    expect(presetLabels()).toEqual(["0:30 / 0:05"]);

    pressMainShort();
    advance(30 * SECOND);
    expect(phaseText()).toBe("REST");
    expect(clockText()).toBe("0:05");
    expect(nextLabelText()).toBe("GET READY: WORK 0:30");
    expect(progressTone()).toBe("rest");
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
    expect(activePreset().textContent?.trim()).toBe("2:00 / 0:30");
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

  it("flashes the new mode name and beeps once on a mode change", () => {
    render(<App />);

    selectMode("DRILLS");
    advance(0);

    expect(playModeChange).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".mode-flash")?.textContent).toBe(
      "MODE: DRILLS",
    );

    advance(1_000);
    expect(document.querySelector(".mode-flash")).toBeNull();
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

    expect(clockText()).toBe("3:00");
    expect(nextText()).toBe("NEXT: REST 0:30");

    advance(3 * MINUTE);

    expect(phaseText()).toBe("REST");
    expect(clockText()).toBe("0:30");
    expect(nextText()).toBe("NEXT: WORK 3:00");
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
    // Clock interval remains; the countdown loop has stopped.
    expect(vi.getTimerCount()).toBe(2);

    advance(10 * MINUTE);

    expect(workCue).not.toHaveBeenCalled();
    expect(restCue).not.toHaveBeenCalled();
    expect(clockText()).toBe("5:00");
  });
});

describe("final-seconds warning", () => {
  it("uses red for WORK ending and amber for REST ending without stale colors", () => {
    render(<App />);
    selectMode("KIDS");
    pressMainShort();

    advance(19 * SECOND);
    expect(clockText()).toBe("0:11");
    expect(progressTone()).toBeNull();
    expect(nextText()).toBe("NEXT: REST 0:05");
    expect(statusBandClass()).toContain("status-strip--work");

    advance(SECOND);
    expect(clockText()).toBe("0:10");
    expect(progressTone()).toBe("work");
    expect(statusBandClass()).not.toContain("status-strip--urgent");

    pressMainShort();
    expect(pausedBadge()).not.toBeNull();
    expect(progressTone()).toBe("work");
    expect(nextText()).toBe("NEXT: REST 0:05");

    advance(5 * SECOND);
    expect(clockText()).toBe("0:10");
    expect(progressTone()).toBe("work");

    pressMainShort();
    advance(10 * SECOND);
    expect(phaseText()).toBe("REST");
    expect(clockText()).toBe("0:05");
    expect(progressTone()).toBe("rest");
    expect(nextLabelText()).toBe("GET READY: WORK 0:30");

    advance(5 * SECOND);
    expect(phaseText()).toBe("WORK");
    expect(clockText()).toBe("0:30");
    expect(progressTone()).toBeNull();
    expect(nextText()).toBe("NEXT: REST 0:05");
  });

  it("keeps amber and freezes it when paused during REST ending", () => {
    render(<App />);
    selectMode("KIDS");
    pressMainShort();
    advance(30 * SECOND);

    expect(phaseText()).toBe("REST");
    expect(clockText()).toBe("0:05");
    expect(progressTone()).toBe("rest");
    expect(nextLabelText()).toBe("GET READY: WORK 0:30");

    pressMainShort();
    advance(2 * SECOND);
    expect(clockText()).toBe("0:05");
    expect(progressTone()).toBe("rest");
    expect(nextText()).toBe("NEXT: WORK 0:30");
    expect(statusBandClass()).toContain("status-strip--paused");

    pressMainShort();
    expect(progressTone()).toBe("rest");
    expect(nextLabelText()).toBe("GET READY: WORK 0:30");
  });

  it("keeps normal REST neutral until its final ten seconds", () => {
    render(<App />);
    pressMainShort();
    advance(5 * MINUTE);

    expect(phaseText()).toBe("REST");
    expect(progressTone()).toBeNull();
    expect(nextText()).toBe("NEXT: WORK 5:00");

    advance(50 * SECOND);
    expect(clockText()).toBe("0:10");
    expect(progressTone()).toBe("rest");
    expect(nextLabelText()).toBe("GET READY: WORK 5:00");

    advance(10 * SECOND);
    expect(phaseText()).toBe("WORK");
    expect(progressTone()).toBeNull();
    expect(nextText()).toBe("NEXT: REST 1:00");
  });

  it("clears the warning on reset", () => {
    render(<App />);
    selectMode("KIDS");
    pressMainShort();
    advance(20 * SECOND);
    expect(progressTone()).toBe("work");

    pressMainLong();

    expect(clockText()).toBe("0:30");
    expect(progressTone()).toBeNull();
    expect(statusBandClass()).toContain("status-strip--ready");
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
    expect(clockText()).toBe("3:00");
    expect(phaseText()).toBe("WORK");
    expect(modeContextText()).toBe("DRILLS");
    expect(roundText()).toBe("ROUND 1");
    expect(nextText()).toBe("NEXT: WORK 3:00");
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
    // Clock interval remains; no countdown loop is running.
    expect(vi.getTimerCount()).toBe(2);
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

describe("Main hold progress", () => {
  function holdStyle(): string {
    return mainButton().getAttribute("style") ?? "";
  }

  it("fills halfway and clears on an early release without resetting", () => {
    render(<App />);

    fireEvent.pointerDown(mainButton());
    expect(holdStyle()).toContain("--main-hold: 0%");

    advance(MAIN_BUTTON_HOLD_MS / 2);
    expect(holdStyle()).toContain("--main-hold: 50%");

    fireEvent.pointerUp(mainButton());

    expect(holdStyle()).toContain("--main-hold: 0%");
    expect(mainLabelText()).toBe("Pause");
    expect(clockText()).toBe("5:00");
  });

  it("reaches full and resets exactly once at the threshold", () => {
    render(<App />);

    fireEvent.pointerDown(mainButton());
    advance(MAIN_BUTTON_HOLD_MS - 50);
    expect(holdStyle()).toContain("--main-hold: 97%");

    advance(50);

    expect(mainLabelText()).toBe("Start");
    expect(clockText()).toBe("5:00");
    expect(holdStyle()).toContain("--main-hold: 0%");

    fireEvent.pointerUp(mainButton());

    expect(mainLabelText()).toBe("Start");
    expect(clockText()).toBe("5:00");
    // Clock interval remains; the countdown loop has stopped.
    expect(vi.getTimerCount()).toBe(2);
  });

  it("clears on pointer cancellation without resetting", () => {
    render(<App />);

    fireEvent.pointerDown(mainButton());
    advance(MAIN_BUTTON_HOLD_MS / 2);
    expect(holdStyle()).toContain("--main-hold: 50%");

    fireEvent.pointerOut(mainButton());

    expect(holdStyle()).toContain("--main-hold: 0%");

    advance(2 * MAIN_BUTTON_HOLD_MS);
    expect(mainLabelText()).toBe("Start");
    expect(clockText()).toBe("5:00");

    fireEvent.pointerUp(mainButton());
    expect(mainLabelText()).toBe("Start");
  });

  it("clears on window blur without resetting", () => {
    render(<App />);

    fireEvent.pointerDown(mainButton());
    advance(MAIN_BUTTON_HOLD_MS / 2);
    expect(holdStyle()).toContain("--main-hold: 50%");

    blurWindow();

    expect(holdStyle()).toContain("--main-hold: 0%");

    advance(2 * MAIN_BUTTON_HOLD_MS);
    expect(mainLabelText()).toBe("Start");
    expect(clockText()).toBe("5:00");
    // Clock interval remains; the countdown loop has stopped.
    expect(vi.getTimerCount()).toBe(1);
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
    // One wall-clock interval plus one countdown loop.
    expect(vi.getTimerCount()).toBe(2);
  });

  it("leaves no ticking loop behind after reset or unmount", () => {
    const { unmount } = render(<App />);
    pressMainShort();
    advance(1 * SECOND);
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    pressMainLong();
    // Clock interval remains; the countdown loop has stopped.
    expect(vi.getTimerCount()).toBe(2);

    pressMainShort();
    advance(1 * SECOND);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
