import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { MODE_BUTTON_HOLD_MS } from "./gamepad";

/**
 * App-level checks for the Gamepad API path.
 *
 * These are simulated-input tests: they fake `navigator.getGamepads` and
 * `requestAnimationFrame` so the polling loop, the gesture recogniser and the
 * reducer are exercised together. They do NOT prove real USB hardware works.
 */

const START = Date.UTC(2026, 0, 1, 0, 0, 0);

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

function mainLabel(): string {
  return (
    screen
      .getByRole("button", { name: /^(Start|Pause|Reset)$/ })
      .textContent?.trim() ?? ""
  );
}

function clockText(): string {
  return screen.getByRole("timer").textContent ?? "";
}

function modeText(): string {
  return screen.getByText(/^Mode \S+$/).textContent ?? "";
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
  Reflect.deleteProperty(window.navigator, "getGamepads");
  vi.useRealTimers();
});

describe("controller status", () => {
  it("shows the activation hint until a controller appears", () => {
    render(<App />);

    expect(
      screen.getByText("Controller: press a button to connect"),
    ).toBeTruthy();

    pads = [makePad()];
    frameAt(0);

    expect(screen.getByText("Controller connected")).toBeTruthy();
    expect(
      screen.queryByText("Controller: press a button to connect"),
    ).toBeNull();
  });
});

describe("the green MAIN button", () => {
  it("runs Start -> Pause -> Reset -> Start with one action per press", () => {
    const pad = mountWithPad();

    setMain(pad, true);
    frameAt(16);
    expect(mainLabel()).toBe("Pause");

    // Holding produces no repeat: the label must not move on to Reset.
    frameAt(1_000);
    frameAt(5_000);
    expect(mainLabel()).toBe("Pause");

    setMain(pad, false);
    frameAt(5_016);
    setMain(pad, true);
    frameAt(5_032);
    expect(mainLabel()).toBe("Reset");
    expect(clockText()).toBe("5:00");

    setMain(pad, false);
    frameAt(5_048);
    setMain(pad, true);
    frameAt(5_064);
    expect(mainLabel()).toBe("Start");
  });

  it("ignores a button that was already held when the page loaded", () => {
    mountWithPad(true);

    expect(mainLabel()).toBe("Start");

    frameAt(1_000);
    expect(mainLabel()).toBe("Start");
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
});

describe("gestures that must not survive a state change", () => {
  it("cancels a pending hold when a round starts", () => {
    const pad = mountWithPad();

    setMode(pad, true);
    frameAt(100);
    frameAt(500);

    setMain(pad, true);
    frameAt(516);
    setMain(pad, false);
    frameAt(532);
    expect(mainLabel()).toBe("Pause");

    // The white button's threshold passes while the round runs: no mode change.
    frameAt(900);
    frameAt(2_000);
    expect(modeText()).toBe("Mode 1");

    setMode(pad, false);
    frameAt(2_016);
    expect(modeText()).toBe("Mode 1");
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
    setMain(pad, true);
    frameAt(1_000);
    setMain(pad, false);
    frameAt(1_016);
    setMain(pad, true);
    frameAt(1_032);
    setMain(pad, false);
    frameAt(1_048);
    expect(mainLabel()).toBe("Reset");

    setMode(pad, true);
    frameAt(1_100);
    setMode(pad, false);
    frameAt(1_140);

    expect(modeText()).toBe("Mode 2");
  });

  it("cancels a pending hold when the window loses focus", () => {
    const pad = mountWithPad();

    setMode(pad, true);
    frameAt(100);
    frameAt(400);

    act(() => {
      window.dispatchEvent(new Event("blur"));
    });

    frameAt(800);
    expect(modeText()).toBe("Mode 1");

    setMode(pad, false);
    frameAt(816);
  });

  it("cancels a pending hold when the page is hidden and shown again", () => {
    const pad = mountWithPad();

    setMode(pad, true);
    frameAt(100);
    frameAt(400);

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    frameAt(800);
    frameAt(5_000);
    expect(modeText()).toBe("Mode 1");

    setMode(pad, false);
    frameAt(5_016);
  });
});

describe("losing and regaining the controller", () => {
  it("takes no action from a button still held after reconnecting", () => {
    const pad = mountWithPad();

    setMain(pad, true);
    frameAt(16);
    expect(mainLabel()).toBe("Pause");

    pads = [];
    frameAt(32);
    expect(
      screen.getByText("Controller: press a button to connect"),
    ).toBeTruthy();

    pads = [pad];
    frameAt(48);
    frameAt(5_000);
    expect(mainLabel()).toBe("Pause");

    setMain(pad, false);
    frameAt(5_016);
    setMain(pad, true);
    frameAt(5_032);
    expect(mainLabel()).toBe("Reset");
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
    expect(mainLabel()).toBe("Start");

    setMain(first, true);
    frameAt(32);
    expect(mainLabel()).toBe("Pause");
  });
});
