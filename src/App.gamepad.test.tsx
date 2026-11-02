import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { MAIN_BUTTON_HOLD_MS, MODE_BUTTON_HOLD_MS } from "./gamepad";

/**
 * App-level checks for the Gamepad API path.
 *
 * These are simulated-input tests: they fake `navigator.getGamepads` and
 * `requestAnimationFrame` so the polling loop, the gesture recogniser and the
 * reducer are exercised together. They do NOT prove real USB hardware works.
 */

const START = Date.UTC(2026, 0, 1, 0, 0, 0);
const SECOND = 1_000;
const MINUTE = 60 * SECOND;

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

/** Drive one animation frame. The polling loop schedules the next one itself. */
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

/** Advance the timer's own 250 ms interval (and the faked wall clock). */
function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function mainButton(): HTMLElement {
  return screen.getByRole("button", {
    name: /^(Start|Pause|Resume|Reset)$/,
  });
}

function mainLabel(): string {
  return mainButton().textContent?.trim() ?? "";
}

function clockText(): string {
  return screen.getByRole("timer").textContent ?? "";
}

function modeText(): string {
  return screen.getByText(/^Mode \S+$/).textContent ?? "";
}

function downMain(pad: FakePad, at: number): void {
  setMain(pad, true);
  frameAt(at);
}

function upMain(pad: FakePad, at: number): void {
  setMain(pad, false);
  frameAt(at);
}

/** One short green press: down, then up quickly. */
function tapMain(pad: FakePad, at: number): void {
  downMain(pad, at);
  upMain(pad, at + 40);
}

/** Mount the app with one connected pad, then let the first poll arm it. */
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

  pads = [];
  scheduledFrame = null;

  // Initial-discovery adoption is only allowed on an active, focused page.
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
  it("shows the activation hint until a controller appears", () => {
    render(<App />);

    expect(screen.getByText("Waiting for controller input")).toBeTruthy();

    pads = [makePad()];
    frameAt(0);

    expect(screen.getByText("Controller connected")).toBeTruthy();
    expect(screen.queryByText("Waiting for controller input")).toBeNull();
  });

  it("distinguishes a known disconnection from a not-yet-detected controller", () => {
    pads = [makePad()];
    render(<App />);
    frameAt(0);
    expect(screen.getByText("Controller connected")).toBeTruthy();

    act(() => {
      window.dispatchEvent(new Event("gamepaddisconnected"));
    });
    pads = [];
    frameAt(16);

    expect(screen.getByText("Controller disconnected")).toBeTruthy();
    expect(screen.queryByText("Waiting for controller input")).toBeNull();

    // Reappearing is reported immediately and does not require a press.
    pads = [makePad()];
    frameAt(32);
    expect(screen.getByText("Controller connected")).toBeTruthy();
  });
});

describe("the green MAIN button", () => {
  it("starts, pauses and resumes on release, one action per press", () => {
    const pad = mountWithPad();

    // Press-down alone does nothing.
    downMain(pad, 16);
    expect(mainLabel()).toBe("Start");

    upMain(pad, 56);
    expect(mainLabel()).toBe("Pause");

    advance(1 * MINUTE);
    expect(clockText()).toBe("4:00");

    tapMain(pad, 200);
    expect(mainLabel()).toBe("Resume");
    expect(clockText()).toBe("4:00");

    // A paused short press must never reset the session.
    advance(10 * MINUTE);
    expect(clockText()).toBe("4:00");

    tapMain(pad, 400);
    expect(mainLabel()).toBe("Pause");
    expect(clockText()).toBe("4:00");

    advance(1 * SECOND);
    expect(clockText()).toBe("3:59");
  });

  it("returns to READY from FINISHED without starting", () => {
    const pad = mountWithPad();

    tapMain(pad, 16);
    expect(mainLabel()).toBe("Pause");

    advance(5 * MINUTE);
    expect(mainLabel()).toBe("Reset");
    expect(clockText()).toBe("0:00");

    tapMain(pad, 200);

    expect(mainLabel()).toBe("Start");
    expect(clockText()).toBe("5:00");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("adopts the press that makes the controller visible", () => {
    const pad = makePad(true);

    pads = [pad];
    render(<App />);

    // The first frame is the discovery press itself: nothing fires while down.
    frameAt(0);
    expect(mainLabel()).toBe("Start");
    expect(mainButton().getAttribute("data-main-held")).toBe("true");

    setMain(pad, false);
    frameAt(40);

    expect(mainLabel()).toBe("Pause");
    expect(vi.getTimerCount()).toBe(1);
  });
});

describe("first controller discovery", () => {
  it("counts a held discovery press from the first observation", () => {
    const pad = makePad(true);

    pads = [pad];
    render(<App />);

    frameAt(0);
    frameAt(MAIN_BUTTON_HOLD_MS - 1);
    expect(mainLabel()).toBe("Start");

    frameAt(MAIN_BUTTON_HOLD_MS);

    // The hold is consumed in READY; releasing must not start the session.
    setMain(pad, false);
    frameAt(MAIN_BUTTON_HOLD_MS + 16);

    expect(mainLabel()).toBe("Start");
    expect(clockText()).toBe("5:00");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("adopts a held white press with its normal hold semantics", () => {
    const pad = makePad(false, true);

    pads = [pad];
    render(<App />);

    frameAt(0);
    frameAt(MODE_BUTTON_HOLD_MS);
    expect(modeText()).toBe("Mode 2");

    setMode(pad, false);
    frameAt(MODE_BUTTON_HOLD_MS + 16);

    // The release after the hold must not also change the option.
    expect(modeText()).toBe("Mode 2");
  });

  it("shows connected before any press when the pad is already exposed", () => {
    pads = [makePad()];
    render(<App />);

    // No animation frame has run yet: the initial read already sees the pad.
    expect(screen.getByText("Controller connected")).toBeTruthy();
    expect(screen.queryByText("Waiting for controller input")).toBeNull();

    frameAt(0);

    expect(screen.getByText("Controller connected")).toBeTruthy();
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

    setMain(pad, false);
    frameAt(140);
    expect(mainLabel()).toBe("Start");

    // A fresh press after the required release works normally.
    setMain(pad, true);
    frameAt(200);
    setMain(pad, false);
    frameAt(240);

    expect(mainLabel()).toBe("Pause");
  });

  it("does not adopt a discovery press after the window lost focus", () => {
    render(<App />);
    frameAt(0);

    act(() => {
      window.dispatchEvent(new Event("blur"));
    });

    const pad = makePad(true);
    pads = [pad];
    frameAt(100);

    setMain(pad, false);
    frameAt(140);
    expect(mainLabel()).toBe("Start");

    setMain(pad, true);
    frameAt(200);
    setMain(pad, false);
    frameAt(240);

    expect(mainLabel()).toBe("Pause");
  });

  it("treats a connection event and polling as one input path", () => {
    const pad = makePad(true);

    pads = [pad];
    render(<App />);

    act(() => {
      window.dispatchEvent(new Event("gamepadconnected"));
    });
    frameAt(0);

    setMain(pad, false);
    frameAt(40);

    expect(mainLabel()).toBe("Pause");
    expect(vi.getTimerCount()).toBe(1);
  });
});

describe("holding the green button to reset", () => {
  it("resets exactly at 1,500 ms and keeps running until then", () => {
    const pad = mountWithPad();

    tapMain(pad, 16);
    advance(2 * MINUTE);
    expect(clockText()).toBe("3:00");

    downMain(pad, 100);
    frameAt(100 + MAIN_BUTTON_HOLD_MS - 1);
    expect(mainLabel()).toBe("Pause");
    expect(clockText()).toBe("3:00");

    advance(30 * SECOND);
    // The session was never paused by the press: the clock kept running.
    expect(clockText()).toBe("2:30");

    frameAt(100 + MAIN_BUTTON_HOLD_MS);
    expect(mainLabel()).toBe("Start");
    expect(clockText()).toBe("5:00");
    expect(vi.getTimerCount()).toBe(0);

    // Continuing to hold must not reset or start again.
    frameAt(100 + MAIN_BUTTON_HOLD_MS * 3);
    expect(mainLabel()).toBe("Start");
    expect(clockText()).toBe("5:00");

    upMain(pad, 100 + MAIN_BUTTON_HOLD_MS * 3 + 16);
    expect(mainLabel()).toBe("Start");
    expect(clockText()).toBe("5:00");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("resets a paused session instead of resuming it", () => {
    const pad = mountWithPad();

    tapMain(pad, 16);
    advance(1 * MINUTE);
    tapMain(pad, 100);
    expect(mainLabel()).toBe("Resume");

    downMain(pad, 200);
    frameAt(200 + MAIN_BUTTON_HOLD_MS);
    expect(mainLabel()).toBe("Start");
    expect(clockText()).toBe("5:00");

    upMain(pad, 200 + MAIN_BUTTON_HOLD_MS + 16);
    expect(mainLabel()).toBe("Start");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("consumes a hold in READY, so the release does not start", () => {
    const pad = mountWithPad();

    downMain(pad, 16);
    frameAt(16 + MAIN_BUTTON_HOLD_MS);
    expect(mainLabel()).toBe("Start");

    upMain(pad, 16 + MAIN_BUTTON_HOLD_MS + 16);

    expect(mainLabel()).toBe("Start");
    expect(clockText()).toBe("5:00");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shows immediate press feedback and hold progress", () => {
    const pad = mountWithPad();

    downMain(pad, 16);
    expect(mainButton().getAttribute("data-main-held")).toBe("true");
    expect(mainButton().getAttribute("style")).toContain("--main-hold: 0%");

    frameAt(16 + MAIN_BUTTON_HOLD_MS / 2);
    expect(mainButton().getAttribute("style")).toContain("--main-hold: 50%");

    frameAt(16 + MAIN_BUTTON_HOLD_MS);
    // Reset completed: the progress is cleared even before the button is up.
    expect(mainButton().getAttribute("style")).toContain("--main-hold: 0%");

    upMain(pad, 16 + MAIN_BUTTON_HOLD_MS + 16);
    expect(mainButton().getAttribute("data-main-held")).toBeNull();
  });
});

describe("the green button across an independent state change", () => {
  it("does not reinterpret a press after the round finishes", () => {
    const pad = mountWithPad();

    tapMain(pad, 16);
    expect(mainLabel()).toBe("Pause");

    // Hold the button down while the round runs out naturally.
    downMain(pad, 100);
    advance(5 * MINUTE);
    expect(mainLabel()).toBe("Reset");
    expect(clockText()).toBe("0:00");

    // The held press must not be read as "return to ready" on release.
    upMain(pad, 200);
    expect(mainLabel()).toBe("Reset");
    expect(clockText()).toBe("0:00");

    // A fresh press in FINISHED is allowed and returns to ready.
    tapMain(pad, 300);
    expect(mainLabel()).toBe("Start");
    expect(clockText()).toBe("5:00");
  });

  it("cancels a hold when the window loses focus", () => {
    const pad = mountWithPad();

    tapMain(pad, 16);
    downMain(pad, 100);

    act(() => {
      window.dispatchEvent(new Event("blur"));
    });

    frameAt(100 + MAIN_BUTTON_HOLD_MS);
    expect(mainLabel()).toBe("Pause");

    upMain(pad, 100 + MAIN_BUTTON_HOLD_MS + 16);
    expect(mainLabel()).toBe("Pause");
  });

  it("cancels a hold when the page is hidden and shown again", () => {
    const pad = mountWithPad();

    tapMain(pad, 16);
    downMain(pad, 100);

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    frameAt(100 + MAIN_BUTTON_HOLD_MS);
    expect(mainLabel()).toBe("Pause");

    upMain(pad, 100 + MAIN_BUTTON_HOLD_MS + 16);
    expect(mainLabel()).toBe("Pause");
  });
});

describe("the white MODE/OPTION button", () => {
  it("cycles options on a short press, wrapping within the mode", () => {
    const pad = mountWithPad();

    // One hold moves to mode 2, whose options are 2, 2b, 2c.
    setMode(pad, true);
    frameAt(100);
    frameAt(100 + MODE_BUTTON_HOLD_MS);
    setMode(pad, false);
    frameAt(100 + MODE_BUTTON_HOLD_MS + 16);
    expect(modeText()).toBe("Mode 2");

    const seen: string[] = [];

    for (let press = 0; press < 3; press += 1) {
      const at = 2_000 + press * 100;
      setMode(pad, true);
      frameAt(at);
      setMode(pad, false);
      frameAt(at + 40);
      seen.push(modeText());
    }

    expect(seen).toEqual(["Mode 2b", "Mode 2c", "Mode 2"]);
  });

  it("cycles main modes on a hold, wrapping, and fires only once", () => {
    const pad = mountWithPad();
    const seen: string[] = [];

    for (let press = 0; press < 5; press += 1) {
      const at = 1_000 + press * 2_000;
      setMode(pad, true);
      frameAt(at);
      frameAt(at + MODE_BUTTON_HOLD_MS);
      seen.push(modeText());

      // Still held: no second mode change.
      frameAt(at + MODE_BUTTON_HOLD_MS * 2);
      seen.push(modeText());

      setMode(pad, false);
      frameAt(at + MODE_BUTTON_HOLD_MS * 2 + 16);
    }

    expect(seen).toEqual([
      "Mode 2",
      "Mode 2",
      "Mode 3",
      "Mode 3",
      "Mode 4",
      "Mode 4",
      "Mode 5",
      "Mode 5",
      "Mode 1",
      "Mode 1",
    ]);
  });

  it("does not also cycle the option when a hold is released", () => {
    const pad = mountWithPad();

    // Reach mode 2, whose base option is "2".
    setMode(pad, true);
    frameAt(0);
    frameAt(MODE_BUTTON_HOLD_MS);
    setMode(pad, false);
    frameAt(MODE_BUTTON_HOLD_MS + 16);
    expect(modeText()).toBe("Mode 2");

    // A second hold, then release: mode 3, never "2b".
    setMode(pad, true);
    frameAt(1_000);
    frameAt(1_000 + MODE_BUTTON_HOLD_MS);
    setMode(pad, false);
    frameAt(1_000 + MODE_BUTTON_HOLD_MS + 16);

    expect(modeText()).toBe("Mode 3");
  });

  it("ignores option changes while a round is paused", () => {
    const pad = mountWithPad();

    // Ready -> mode 2.
    setMode(pad, true);
    frameAt(0);
    frameAt(MODE_BUTTON_HOLD_MS);
    setMode(pad, false);
    frameAt(MODE_BUTTON_HOLD_MS + 16);

    // Start, then pause.
    tapMain(pad, 1_000);
    tapMain(pad, 1_100);
    expect(mainLabel()).toBe("Resume");

    setMode(pad, true);
    frameAt(1_200);
    setMode(pad, false);
    frameAt(1_240);

    expect(modeText()).toBe("Mode 2");
  });

  it("cancels a pending white hold when a round starts", () => {
    const pad = mountWithPad();

    setMode(pad, true);
    frameAt(100);
    frameAt(500);

    // The green press and release starts the round.
    tapMain(pad, 516);
    expect(mainLabel()).toBe("Pause");

    // The white threshold passes while the round runs: no mode change.
    frameAt(900);
    frameAt(2_000);
    expect(modeText()).toBe("Mode 1");

    setMode(pad, false);
    frameAt(2_016);
    expect(modeText()).toBe("Mode 1");
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

    // A fresh press works normally.
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
