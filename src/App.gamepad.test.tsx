import { act, render, screen, within } from "@testing-library/react";
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

import { playWorkStart } from "./audio";
import { resetGetReadySettings, setGetReadySecondsForMode } from "./settings";

/**
 * App-level checks for the Gamepad API path with the Rolls/GI session.
 *
 * These are simulated-input tests: they fake `navigator.getGamepads` and
 * `requestAnimationFrame` so the polling loop, the gesture recogniser and the
 * reducer are exercised together. They do NOT prove real USB hardware works.
 */

const START = Date.UTC(2026, 0, 1, 0, 0, 0);
const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const NOTICE_MS = 2_200;

interface FakeButton {
  pressed: boolean;
}

interface FakePad {
  id: string;
  index: number;
  connected: boolean;
  buttons: FakeButton[];
}

let pads: (FakePad | null)[] = [];
let scheduledFrame: FrameRequestCallback | null = null;

function makePad(main = false, mode = false): FakePad {
  return {
    id: "arcade-panel",
    index: 0,
    connected: true,
    buttons: [
      { pressed: main },
      { pressed: mode },
      { pressed: false },
      { pressed: false },
    ],
  };
}

function setMain(pad: FakePad, pressed: boolean): void {
  pad.buttons[0] = { pressed };
}

function setMode(pad: FakePad, pressed: boolean): void {
  pad.buttons[1] = { pressed };
}

function frameAt(time: number): void {
  const callback = scheduledFrame;

  if (callback === null) {
    throw new Error("no animation frame was scheduled");
  }

  scheduledFrame = null;

  act(() => {
    callback(time);
  });
}

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function mainButton(): HTMLElement {
  const button = document.querySelector<HTMLElement>(".control-button--primary");
  if (button === null) throw new Error("Main button not found");
  return button;
}

function modeButton(): HTMLElement {
  const button = document.querySelector<HTMLElement>(".control-button--mode");
  if (button === null) throw new Error("Mode button not found");
  return button;
}

function mainLabel(): string {
  const status = document.querySelector(".app")?.getAttribute("data-status");
  return status === "running" ? "Pause" : status === "paused" ? "Resume" : "Start";
}

function clockText(): string {
  return screen.getByRole("timer").textContent?.trim() ?? "";
}

function phaseText(): string {
  return document.querySelector(".app")?.getAttribute("data-phase") === "rest"
    ? "REST"
    : "WORK";
}

function modeContextText(): string {
  const mode = document.querySelector(".app")?.getAttribute("data-mode");
  return mode === "drills"
    ? "GI"
    : mode === "adv"
      ? "ADV"
      : mode === "nogi"
        ? "NOGI"
        : mode === "kids"
          ? "KIDS"
          : "ROLLS";
}

function roundText(): string {
  return (
    [...document.querySelectorAll(".meta-item")]
      .find((item) => item.textContent?.startsWith("ROUND "))
      ?.textContent?.trim() ?? ""
  );
}

function messageText(): string {
  return (
    document.querySelector(".timer-card__notice")?.textContent?.trim() ?? ""
  );
}

function presetRow(): HTMLElement {
  return screen.getByRole("group", { name: "Preset" });
}

function presetButtons(): HTMLElement[] {
  return within(presetRow()).getAllByRole("button");
}

function presetLabels(): string[] {
  return presetButtons().map((button) => button.textContent?.trim() ?? "");
}

function downMain(pad: FakePad, at: number): void {
  setMain(pad, true);
  frameAt(at);
}

function upMain(pad: FakePad, at: number): void {
  setMain(pad, false);
  frameAt(at);
}

function tapMain(pad: FakePad, at: number): void {
  downMain(pad, at);
  upMain(pad, at + 40);
}

function tapMode(pad: FakePad, at: number): void {
  setMode(pad, true);
  frameAt(at);
  setMode(pad, false);
  frameAt(at + 40);
}

function mountWithPad(main = false, mode = false): FakePad {
  const pad = makePad(main, mode);

  pads = [pad];
  render(<App />);
  frameAt(0);

  return pad;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  vi.clearAllMocks();

  pads = [];
  scheduledFrame = null;
  resetGetReadySettings();
  setGetReadySecondsForMode("rolls", 0);
  setGetReadySecondsForMode("drills", 0);
  setGetReadySecondsForMode("adv", 0);
  setGetReadySecondsForMode("nogi", 0);
  setGetReadySecondsForMode("kids", 0);

  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  vi.spyOn(document, "hasFocus").mockReturnValue(true);

  Object.defineProperty(window.navigator, "getGamepads", {
    configurable: true,
    value: () => pads,
  });

  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      scheduledFrame = callback;
      return 1;
    }),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window.navigator, "getGamepads");
  Reflect.deleteProperty(document, "visibilityState");
  vi.useRealTimers();
});

describe("controller status", () => {
  it("shows waiting before detection and connected once a pad is exposed", () => {
    render(<App />);

    expect(screen.getByText("Waiting for controller input")).toBeTruthy();
    expect(screen.queryByText("Controller connected")).toBeNull();

    pads = [makePad()];
    frameAt(0);

    expect(screen.getByText("Controller connected")).toBeTruthy();
    expect(screen.queryByText("Waiting for controller input")).toBeNull();
  });

  it("shows a disconnect and a reconnect status", () => {
    pads = [makePad()];
    render(<App />);
    frameAt(0);
    expect(screen.queryByText("Controller disconnected")).toBeNull();

    act(() => {
      window.dispatchEvent(new Event("gamepaddisconnected"));
    });
    pads = [];
    frameAt(16);

    expect(screen.getByText("Controller disconnected")).toBeTruthy();
    expect(screen.queryByText("Waiting for controller input")).toBeNull();

    pads = [makePad()];
    frameAt(32);
    expect(screen.getByText("Controller connected")).toBeTruthy();
    expect(screen.queryByText("Controller disconnected")).toBeNull();
  });
});

describe("the green MAIN button", () => {
  it("starts, pauses and resumes on release, one action per press", () => {
    const pad = mountWithPad();

    downMain(pad, 16);
    expect(mainLabel()).toBe("Start");

    upMain(pad, 56);
    expect(mainLabel()).toBe("Pause");
    expect(playWorkStart).toHaveBeenCalledTimes(1);

    advance(1 * MINUTE);
    expect(clockText()).toBe("4:00");

    tapMain(pad, 200);
    expect(mainLabel()).toBe("Resume");
    expect(clockText()).toBe("4:00");

    advance(10 * MINUTE);
    expect(clockText()).toBe("4:00");

    tapMain(pad, 400);
    expect(mainLabel()).toBe("Pause");
    expect(clockText()).toBe("4:00");

    advance(1 * SECOND);
    expect(clockText()).toBe("3:59");
  });

  it("resets from running work at 1,500 ms without pausing first", () => {
    const pad = mountWithPad();

    tapMain(pad, 16);
    advance(2 * MINUTE);
    expect(clockText()).toBe("3:00");

    downMain(pad, 100);
    frameAt(100 + MAIN_BUTTON_HOLD_MS - 1);
    expect(mainLabel()).toBe("Pause");
    expect(clockText()).toBe("3:00");

    advance(30 * SECOND);
    expect(clockText()).toBe("2:30");

    frameAt(100 + MAIN_BUTTON_HOLD_MS);
    expect(mainLabel()).toBe("Start");
    expect(clockText()).toBe("5:00");
    // The wall-clock interval remains; the countdown loop has stopped.
    expect(vi.getTimerCount()).toBe(2);

    // Continuing to hold and releasing do not reset or start again.
    frameAt(100 + MAIN_BUTTON_HOLD_MS * 3);
    upMain(pad, 100 + MAIN_BUTTON_HOLD_MS * 3 + 16);

    expect(mainLabel()).toBe("Start");
    expect(clockText()).toBe("5:00");
  });

  it("consumes a Ready-state hold, so release does not start", () => {
    const pad = mountWithPad();

    downMain(pad, 16);
    frameAt(16 + MAIN_BUTTON_HOLD_MS);
    upMain(pad, 16 + MAIN_BUTTON_HOLD_MS + 16);

    expect(mainLabel()).toBe("Start");
    expect(clockText()).toBe("5:00");
    // Clock interval remains; the countdown loop is stopped.
    expect(vi.getTimerCount()).toBe(2);
  });

  it("shows press feedback and hold progress", () => {
    const pad = mountWithPad();

    downMain(pad, 16);
    expect(mainButton().getAttribute("data-main-held")).toBe("true");
    expect(mainButton().getAttribute("style")).toContain("--main-hold: 0%");

    frameAt(16 + MAIN_BUTTON_HOLD_MS / 2);
    expect(mainButton().getAttribute("style")).toContain("--main-hold: 50%");

    frameAt(16 + MAIN_BUTTON_HOLD_MS);
    expect(mainButton().getAttribute("style")).toContain("--main-hold: 0%");

    upMain(pad, 16 + MAIN_BUTTON_HOLD_MS + 16);
    expect(mainButton().getAttribute("data-main-held")).toBeNull();
  });

  it("does not reinterpret a held press after work becomes rest", () => {
    const pad = mountWithPad();

    tapMain(pad, 16);
    downMain(pad, 100);

    advance(5 * MINUTE);
    expect(phaseText()).toBe("REST");
    expect(roundText()).toBe("ROUND 1");

    upMain(pad, 200);

    expect(mainLabel()).toBe("Pause");
    expect(phaseText()).toBe("REST");
    expect(clockText()).toBe("1:00");
  });

  it("ignores a button already held when the session starts", () => {
    const pad = mountWithPad(true);

    expect(mainLabel()).toBe("Start");

    // Initial discovery adopts the press, so releasing starts.
    upMain(pad, 40);
    expect(mainLabel()).toBe("Pause");
  });
});

describe("the white MODE/OPTION button", () => {
  it("cycles presets on a short press, wrapping", () => {
    const pad = mountWithPad();

    tapMode(pad, 100);
    expect(clockText()).toBe("3:00");
    expect(presetLabels()[0]).toBe("5:00 / 1:00");

    tapMode(pad, 200);
    expect(clockText()).toBe("5:00");

    tapMode(pad, 300);
    expect(clockText()).toBe("3:00");
  });

  it("cycles main modes on a hold and does not also change the preset", () => {
    const pad = mountWithPad();

    setMode(pad, true);
    frameAt(100);
    frameAt(100 + MODE_BUTTON_HOLD_MS);
    setMode(pad, false);
    frameAt(100 + MODE_BUTTON_HOLD_MS + 16);

    expect(modeContextText()).toBe("GI");
    expect(clockText()).toBe("2:00");

    setMode(pad, true);
    frameAt(400);
    frameAt(400 + MODE_BUTTON_HOLD_MS);
    setMode(pad, false);
    frameAt(400 + MODE_BUTTON_HOLD_MS + 16);

    expect(modeContextText()).toBe("ADV");
    expect(clockText()).toBe("5:00");

    setMode(pad, true);
    frameAt(550);
    frameAt(550 + MODE_BUTTON_HOLD_MS);
    setMode(pad, false);
    frameAt(550 + MODE_BUTTON_HOLD_MS + 16);

    expect(modeContextText()).toBe("NOGI");
    expect(clockText()).toBe("3:00");

    setMode(pad, true);
    frameAt(700);
    frameAt(700 + MODE_BUTTON_HOLD_MS);
    setMode(pad, false);
    frameAt(700 + MODE_BUTTON_HOLD_MS + 16);

    expect(modeContextText()).toBe("KIDS");
    expect(clockText()).toBe("0:30");

    setMode(pad, true);
    frameAt(850);
    frameAt(850 + MODE_BUTTON_HOLD_MS);
    setMode(pad, false);
    frameAt(850 + MODE_BUTTON_HOLD_MS + 16);

    expect(modeContextText()).toBe("ROLLS");
    expect(clockText()).toBe("5:00");
  });

  it("starts each newly selected mode on its first preset", () => {
    const pad = mountWithPad();

    // Rolls -> preset 2.
    tapMode(pad, 100);
    expect(clockText()).toBe("3:00");

    // Hold to Drills: its first preset, not the previously used preset.
    setMode(pad, true);
    frameAt(200);
    frameAt(200 + MODE_BUTTON_HOLD_MS);
    setMode(pad, false);
    frameAt(200 + MODE_BUTTON_HOLD_MS + 16);
    expect(clockText()).toBe("2:00");

    // Drills -> second preset.
    tapMode(pad, 400);
    expect(clockText()).toBe("3:00");

    // GI -> ADV: its declared 5:00 default.
    setMode(pad, true);
    frameAt(500);
    frameAt(500 + MODE_BUTTON_HOLD_MS);
    setMode(pad, false);
    frameAt(500 + MODE_BUTTON_HOLD_MS + 16);
    expect(modeContextText()).toBe("ADV");
    expect(clockText()).toBe("5:00");

    // ADV -> NOGI: its declared 3:00 default.
    setMode(pad, true);
    frameAt(600);
    frameAt(600 + MODE_BUTTON_HOLD_MS);
    setMode(pad, false);
    frameAt(600 + MODE_BUTTON_HOLD_MS + 16);
    expect(modeContextText()).toBe("NOGI");
    expect(clockText()).toBe("3:00");

    // NOGI -> Kids: its first preset.
    setMode(pad, true);
    frameAt(700);
    frameAt(700 + MODE_BUTTON_HOLD_MS);
    setMode(pad, false);
    frameAt(700 + MODE_BUTTON_HOLD_MS + 16);
    expect(modeContextText()).toBe("KIDS");
    expect(clockText()).toBe("0:30");

    // Kids -> Rolls: its first preset again.
    setMode(pad, true);
    frameAt(800);
    frameAt(800 + MODE_BUTTON_HOLD_MS);
    setMode(pad, false);
    frameAt(800 + MODE_BUTTON_HOLD_MS + 16);

    expect(modeContextText()).toBe("ROLLS");
    expect(clockText()).toBe("5:00");
  });

  it("shows physical white pressed and hold feedback in Ready", () => {
    const pad = mountWithPad();

    setMode(pad, true);
    frameAt(100);

    expect(modeButton().getAttribute("data-mode-held")).toBe("true");
    expect(modeButton().textContent).not.toContain("Keep holding for mode");

    frameAt(100 + 50);
    expect(modeButton().textContent).toContain("Keep holding for mode");

    frameAt(100 + MODE_BUTTON_HOLD_MS / 2);
    expect(modeButton().getAttribute("style")).toContain("--mode-hold: 0.5");

    setMode(pad, false);
    frameAt(100 + MODE_BUTTON_HOLD_MS / 2 + 16);

    expect(modeButton().getAttribute("data-mode-held")).toBeNull();
    expect(modeButton().getAttribute("style")).toContain("--mode-hold: 0");
    expect(modeButton().textContent).toContain(
      "Press: next preset · Hold: next mode",
    );
    expect(modeContextText()).toBe("ROLLS");
  });

  it("does not show mode-hold guidance when the white action is locked", () => {
    const pad = mountWithPad();
    tapMain(pad, 16);

    setMode(pad, true);
    frameAt(100);
    frameAt(100 + MODE_BUTTON_HOLD_MS / 2);

    expect(modeButton().getAttribute("data-mode-held")).toBe("true");
    expect(modeButton().getAttribute("style")).toContain("--mode-hold: 0");
    expect(modeButton().textContent).toContain("LOCKED");
    expect(modeButton().textContent).toContain(
      "Hold green to reset before changing",
    );
    expect(modeButton().textContent).not.toContain("Keep holding for mode");

    frameAt(100 + MODE_BUTTON_HOLD_MS);
    advance(0);
    expect(messageText()).toBe("Hold green to reset before changing.");
    expect(modeContextText()).toBe("ROLLS");
    expect(clockText()).toBe("5:00");
  });

  it("clears physical white feedback on disconnect and page hiding", () => {
    const pad = mountWithPad();
    setMode(pad, true);
    frameAt(100);
    expect(modeButton().getAttribute("data-mode-held")).toBe("true");

    act(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    frameAt(116);
    expect(modeButton().getAttribute("data-mode-held")).toBeNull();
    expect(modeButton().getAttribute("style")).toContain("--mode-hold: 0");
    expect(modeContextText()).toBe("ROLLS");

    setMode(pad, false);
    frameAt(132);
    setMode(pad, true);
    frameAt(148);
    expect(modeButton().getAttribute("data-mode-held")).toBe("true");

    act(() => {
      window.dispatchEvent(new Event("gamepaddisconnected"));
    });
    pads = [];
    frameAt(164);
    expect(modeButton().getAttribute("data-mode-held")).toBeNull();
    expect(modeButton().getAttribute("style")).toContain("--mode-hold: 0");
    expect(screen.getByText("Controller disconnected")).toBeTruthy();
  });

  it("clears physical white feedback on blur without changing mode", () => {
    const pad = mountWithPad();

    setMode(pad, true);
    frameAt(100);
    frameAt(100 + MODE_BUTTON_HOLD_MS / 2);
    expect(modeButton().getAttribute("data-mode-held")).toBe("true");

    act(() => {
      window.dispatchEvent(new Event("blur"));
    });
    frameAt(100 + MODE_BUTTON_HOLD_MS * 3);

    expect(modeButton().getAttribute("data-mode-held")).toBeNull();
    expect(modeButton().getAttribute("style")).toContain("--mode-hold: 0");
    setMode(pad, false);
    frameAt(100 + MODE_BUTTON_HOLD_MS * 3 + 16);
    expect(modeContextText()).toBe("ROLLS");
  });

  it("blocks selection while running and shows the notice", () => {
    const pad = mountWithPad();

    tapMain(pad, 16);
    expect(mainLabel()).toBe("Pause");

    tapMode(pad, 100);
    expect(clockText()).toBe("5:00");
    advance(0);
    expect(messageText()).toBe("Hold green to reset before changing.");

    setMode(pad, true);
    frameAt(200);
    frameAt(200 + MODE_BUTTON_HOLD_MS);
    setMode(pad, false);
    frameAt(200 + MODE_BUTTON_HOLD_MS + 16);

    expect(modeContextText()).toBe("ROLLS");
    expect(clockText()).toBe("5:00");
  });

  it("does not repeat a blocked notice while the button remains held", () => {
    const pad = mountWithPad();

    tapMain(pad, 16);
    setMode(pad, true);
    frameAt(100);
    frameAt(100 + MODE_BUTTON_HOLD_MS);
    advance(0);
    expect(messageText()).toBe("Hold green to reset before changing.");

    advance(NOTICE_MS);
    expect(document.querySelector(".timer-card__notice")).toBeNull();

    // Still held: no new gesture, so the notice stays dismissed.
    frameAt(100 + MODE_BUTTON_HOLD_MS * 4);
    expect(document.querySelector(".timer-card__notice")).toBeNull();

    setMode(pad, false);
    frameAt(100 + MODE_BUTTON_HOLD_MS * 4 + 16);
    expect(modeContextText()).toBe("ROLLS");
  });
});

describe("first controller discovery", () => {
  it("adopts a green press that makes the controller visible", () => {
    const pad = makePad(true);

    pads = [pad];
    render(<App />);

    frameAt(0);
    expect(mainLabel()).toBe("Start");

    upMain(pad, 40);

    expect(mainLabel()).toBe("Pause");
    expect(playWorkStart).toHaveBeenCalledTimes(1);
  });

  it("adopts a short white press as a preset change", () => {
    const pad = makePad(false, true);

    pads = [pad];
    render(<App />);

    frameAt(0);
    setMode(pad, false);
    frameAt(40);

    expect(clockText()).toBe("3:00");
    expect(modeContextText()).toBe("ROLLS");
  });

  it("adopts a held white press with its hold semantics", () => {
    const pad = makePad(false, true);

    pads = [pad];
    render(<App />);

    frameAt(0);
    frameAt(MODE_BUTTON_HOLD_MS);
    expect(modeContextText()).toBe("GI");

    setMode(pad, false);
    frameAt(MODE_BUTTON_HOLD_MS + 16);

    expect(clockText()).toBe("2:00");
  });

  it("does not adopt a discovery press after the page was hidden", () => {
    render(<App />);
    frameAt(0);

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    const pad = makePad(true);
    pads = [pad];
    frameAt(100);
    expect(mainLabel()).toBe("Start");

    upMain(pad, 140);
    expect(mainLabel()).toBe("Start");

    setMain(pad, true);
    frameAt(200);
    setMain(pad, false);
    frameAt(240);
    expect(mainLabel()).toBe("Pause");
  });
});

describe("losing and regaining the controller", () => {
  it("takes no action from a button still held after reconnecting", () => {
    const pad = mountWithPad();

    tapMain(pad, 16);
    expect(mainLabel()).toBe("Pause");

    downMain(pad, 100);
    pads = [];
    frameAt(200);
    expect(screen.getByText("Controller disconnected")).toBeTruthy();

    pads = [pad];
    frameAt(300);
    frameAt(100 + MAIN_BUTTON_HOLD_MS * 2);
    expect(mainLabel()).toBe("Pause");

    upMain(pad, 100 + MAIN_BUTTON_HOLD_MS * 2 + 16);
    expect(mainLabel()).toBe("Pause");

    tapMain(pad, 4_000);
    expect(mainLabel()).toBe("Resume");
  });
});

describe("one controller at a time", () => {
  it("does not combine buttons from two connected pads", () => {
    const first = makePad();
    const second = { ...makePad(), id: "second-pad", index: 1 };

    pads = [first, second];
    render(<App />);
    frameAt(0);

    setMain(second, true);
    frameAt(16);
    setMain(second, false);
    frameAt(56);
    expect(mainLabel()).toBe("Start");

    setMain(first, true);
    frameAt(100);
    setMain(first, false);
    frameAt(140);
    expect(mainLabel()).toBe("Pause");
  });
});
