import { describe, expect, it } from "vitest";
import {
  MAIN_BUTTON_HOLD_MS,
  MAIN_BUTTON_INDEX,
  MODE_BUTTON_HOLD_MS,
  MODE_BUTTON_INDEX,
  createGamepadRecogniser,
  pickActiveGamepad,
  type ButtonStateLike,
  type GamepadGesture,
  type GamepadLike,
  type GamepadUpdate,
} from "./gamepad";

/**
 * Spec for src/gamepad.ts — the physical arcade panel's gesture rules.
 *
 * Driven directly with button snapshots and clock readings, so this pins the
 * short/hold distinction and the "one press, one action" rule without a
 * browser, a real controller, or a DOM.
 */

const MAIN_HOLD = MAIN_BUTTON_HOLD_MS;
const MODE_HOLD = MODE_BUTTON_HOLD_MS;

function snapshot(
  mainPressed: boolean,
  modePressed: boolean,
): ButtonStateLike[] {
  const buttons = Array.from({ length: 4 }, () => ({ pressed: false }));

  buttons[MAIN_BUTTON_INDEX] = { pressed: mainPressed };
  buttons[MODE_BUTTON_INDEX] = { pressed: modePressed };

  return buttons;
}

function setup(options: { mainHoldMs?: number; modeHoldMs?: number } = {}) {
  const gestures: GamepadGesture[] = [];
  const recogniser = createGamepadRecogniser({
    onGesture: (gesture) => gestures.push(gesture),
    ...options,
  });

  const feed = (
    mainPressed: boolean,
    modePressed: boolean,
    now: number,
    update: GamepadUpdate = {},
  ) => recogniser.update(snapshot(mainPressed, modePressed), now, update);

  const kinds = () => gestures.map((gesture) => gesture.kind);

  return { gestures, kinds, recogniser, feed };
}

describe("the green MAIN button: short press", () => {
  it("does nothing on press-down and fires once on release", () => {
    const { gestures, feed } = setup();

    feed(false, false, 0);
    feed(true, false, 16);
    feed(true, false, 500);

    expect(gestures).toEqual([]);

    feed(false, false, 1_016);

    expect(gestures).toEqual([{ kind: "mainShort", stateKey: "" }]);
  });

  it("fires exactly one short action per completed press", () => {
    const { kinds, feed } = setup();

    feed(false, false, 0);
    feed(true, false, 16);
    feed(false, false, 100);
    feed(true, false, 200);
    feed(false, false, 300);

    expect(kinds()).toEqual(["mainShort", "mainShort"]);
  });

  it("carries the phase the press began in", () => {
    const { gestures, feed } = setup();

    feed(false, false, 0, { stateKey: "running" });
    feed(true, false, 16, { stateKey: "running" });
    feed(false, false, 200, { stateKey: "running" });

    expect(gestures).toEqual([{ kind: "mainShort", stateKey: "running" }]);
  });

  it("is not delayed until the hold threshold", () => {
    const { kinds, feed } = setup();

    feed(false, false, 0);
    feed(true, false, 16);
    feed(false, false, 100);

    // 84 ms is a short press, not a very long one.
    expect(kinds()).toEqual(["mainShort"]);
  });
});

describe("the green MAIN button: hold", () => {
  it("resets exactly at 1,500 ms and only once", () => {
    const { gestures, feed } = setup();

    feed(false, false, 0);
    feed(true, false, 16);
    feed(true, false, 16 + MAIN_HOLD - 1);
    expect(gestures).toEqual([]);

    feed(true, false, 16 + MAIN_HOLD);
    expect(gestures).toEqual([{ kind: "mainHold" }]);

    // Still held for a long time: no repeat.
    feed(true, false, 16 + MAIN_HOLD * 3);
    expect(gestures).toEqual([{ kind: "mainHold" }]);
  });

  it("does not also fire a short action when the hold is released", () => {
    const { gestures, feed } = setup();

    feed(false, false, 0);
    feed(true, false, 0);
    feed(true, false, MAIN_HOLD);
    feed(false, false, MAIN_HOLD + 16);

    expect(gestures).toEqual([{ kind: "mainHold" }]);
  });

  it("consumes a hold while READY, so the release never starts the timer", () => {
    const { gestures, feed } = setup();

    // The recogniser does not know the timer phase beyond the state key; a hold
    // in READY fires the same reset and the release is silent. The reducer makes
    // the reset a no-op in READY.
    feed(false, false, 0, { stateKey: "ready" });
    feed(true, false, 16, { stateKey: "ready" });
    feed(true, false, 16 + MAIN_HOLD, { stateKey: "ready" });
    feed(false, false, 16 + MAIN_HOLD + 16, { stateKey: "ready" });

    expect(gestures).toEqual([{ kind: "mainHold" }]);
  });

  it("uses 1,500 ms by default and honours an override", () => {
    expect(MAIN_BUTTON_HOLD_MS).toBe(1_500);

    const byDefault = setup();
    byDefault.feed(false, false, 0);
    byDefault.feed(true, false, 0);
    byDefault.feed(true, false, 1_499);
    expect(byDefault.gestures).toEqual([]);
    byDefault.feed(true, false, 1_500);
    expect(byDefault.kinds()).toEqual(["mainHold"]);

    const overridden = setup({ mainHoldMs: 2_000 });
    overridden.feed(false, false, 0);
    overridden.feed(true, false, 0);
    overridden.feed(true, false, 1_999);
    expect(overridden.gestures).toEqual([]);
    overridden.feed(true, false, 2_000);
    expect(overridden.kinds()).toEqual(["mainHold"]);
  });
});

describe("the green MAIN button: hold progress", () => {
  it("reports the press immediately and grows towards the threshold", () => {
    const { feed } = setup();

    expect(feed(false, false, 0)).toEqual({
      mainPressed: false,
      mainHoldProgress: 0,
    });
    expect(feed(true, false, 16)).toEqual({
      mainPressed: true,
      mainHoldProgress: 0,
    });
    expect(feed(true, false, 766)).toEqual({
      mainPressed: true,
      mainHoldProgress: 0.5,
    });
    // The threshold consumes the hold; the progress clears immediately.
    expect(feed(true, false, 16 + MAIN_HOLD)).toEqual({
      mainPressed: true,
      mainHoldProgress: 0,
    });
    expect(feed(false, false, 16 + MAIN_HOLD + 16)).toEqual({
      mainPressed: false,
      mainHoldProgress: 0,
    });
  });

  it("shows no progress for a button already held at connection", () => {
    const { feed } = setup();

    expect(feed(true, false, 0)).toEqual({
      mainPressed: true,
      mainHoldProgress: 0,
    });
    expect(feed(true, false, MAIN_HOLD)).toEqual({
      mainPressed: true,
      mainHoldProgress: 0,
    });
  });

  it("clears the progress when the gesture is cancelled", () => {
    const { recogniser, feed } = setup();

    feed(false, false, 0);
    feed(true, false, 0);
    feed(true, false, 750);

    recogniser.cancel();

    expect(feed(true, false, 1_000)).toEqual({
      mainPressed: true,
      mainHoldProgress: 0,
    });
  });
});

describe("the green button across a timer state change", () => {
  it("cancels a press when the phase changes underneath it", () => {
    const { gestures, feed } = setup();

    feed(false, false, 0, { stateKey: "running" });
    feed(true, false, 16, { stateKey: "running" });
    // The round finished naturally while the button was held.
    feed(true, false, 500, { stateKey: "finished" });
    feed(true, false, 500 + MAIN_HOLD, { stateKey: "finished" });

    expect(gestures).toEqual([]);

    // The release must not be reinterpreted as "return to ready".
    feed(false, false, 500 + MAIN_HOLD + 16, { stateKey: "finished" });
    expect(gestures).toEqual([]);
  });

  it("cancels the press even if the change is first seen on release", () => {
    const { gestures, feed } = setup();

    feed(false, false, 0, { stateKey: "running" });
    feed(true, false, 16, { stateKey: "running" });
    feed(false, false, 500, { stateKey: "finished" });

    expect(gestures).toEqual([]);
  });

  it("accepts a fresh press in the new phase", () => {
    const { gestures, feed } = setup();

    feed(false, false, 0, { stateKey: "running" });
    feed(true, false, 16, { stateKey: "running" });
    feed(true, false, 500, { stateKey: "finished" });
    feed(false, false, 516, { stateKey: "finished" });

    feed(true, false, 1_000, { stateKey: "finished" });
    feed(false, false, 1_100, { stateKey: "finished" });

    expect(gestures).toEqual([{ kind: "mainShort", stateKey: "finished" }]);
  });
});

describe("initial discovery adoption", () => {
  it("turns a held green discovery press into a normal short press on release", () => {
    const { gestures, feed } = setup();

    // The first frame shows the button already down: that is the press which
    // made the browser expose the controller.
    feed(true, false, 0, { adoptInitialPress: true });
    expect(gestures).toEqual([]);

    feed(false, false, 40);

    expect(gestures).toEqual([{ kind: "mainShort", stateKey: "" }]);
  });

  it("counts a held discovery press from the first observation", () => {
    const { gestures, feed } = setup();

    feed(true, false, 0, { adoptInitialPress: true });
    feed(true, false, MAIN_HOLD - 1);
    expect(gestures).toEqual([]);

    feed(true, false, MAIN_HOLD);
    expect(gestures).toEqual([{ kind: "mainHold" }]);

    feed(false, false, MAIN_HOLD + 16);
    expect(gestures).toEqual([{ kind: "mainHold" }]);
  });

  it("adopts a white discovery press as a short press on release", () => {
    const { kinds, feed } = setup();

    feed(false, true, 0, { adoptInitialPress: true });
    feed(false, false, 40);

    expect(kinds()).toEqual(["option"]);
  });

  it("counts a held white discovery press from the first observation", () => {
    const { gestures, feed } = setup();

    feed(false, true, 0, { adoptInitialPress: true });
    feed(false, true, MODE_HOLD - 1);
    expect(gestures).toEqual([]);

    feed(false, true, MODE_HOLD);
    expect(gestures).toEqual([{ kind: "mode" }]);

    feed(false, false, MODE_HOLD + 16);
    expect(gestures).toEqual([{ kind: "mode" }]);
  });

  it("consumes the adoption once, even if the flag is repeated", () => {
    const { kinds, feed } = setup();

    feed(true, false, 0, { adoptInitialPress: true });
    feed(true, false, 16, { adoptInitialPress: true });
    feed(true, false, 32, { adoptInitialPress: true });
    feed(false, false, 48);

    expect(kinds()).toEqual(["mainShort"]);
  });

  it("does not fire for buttons observed released", () => {
    const { kinds, feed } = setup();

    feed(false, false, 0, { adoptInitialPress: true });
    expect(kinds()).toEqual([]);

    feed(true, false, 16);
    feed(false, false, 56);

    expect(kinds()).toEqual(["mainShort"]);
  });

  it("still ignores an unadopted press until release", () => {
    const { kinds, feed } = setup();

    // The guarded path used after a reconnect or page hide.
    feed(true, false, 0);
    feed(true, false, MAIN_HOLD * 2);
    feed(false, false, MAIN_HOLD * 2 + 16);
    expect(kinds()).toEqual([]);

    feed(true, false, MAIN_HOLD * 3);
    feed(false, false, MAIN_HOLD * 3 + 16);

    expect(kinds()).toEqual(["mainShort"]);
  });
});

describe("the white button: short press", () => {
  it("cycles the option on release, below the threshold", () => {
    const { kinds, feed } = setup();

    feed(false, false, 0);
    feed(false, true, 100);
    feed(false, false, 100 + MODE_HOLD - 1);

    expect(kinds()).toEqual(["option"]);
  });

  it("does nothing while the button is merely held", () => {
    const { gestures, feed } = setup();

    feed(false, false, 0);
    feed(false, true, 100);
    feed(false, true, 500);

    expect(gestures).toEqual([]);
  });

  it("ignores a press that began as a hold and was then released", () => {
    const { gestures, feed } = setup();

    feed(false, false, 0);
    feed(false, true, 100);
    feed(false, true, 100 + MODE_HOLD);
    feed(false, false, 100 + MODE_HOLD + 50);

    expect(gestures).toEqual([{ kind: "mode" }]);
  });
});

describe("the white button: hold", () => {
  it("fires the mode action exactly at the threshold", () => {
    const { gestures, feed } = setup();

    feed(false, false, 0);
    feed(false, true, 100);
    feed(false, true, 100 + MODE_HOLD - 1);
    expect(gestures).toEqual([]);

    feed(false, true, 100 + MODE_HOLD);
    expect(gestures).toEqual([{ kind: "mode" }]);
  });

  it("fires only once however long the button is held", () => {
    const { gestures, feed } = setup();

    feed(false, false, 0);
    feed(false, true, 100);
    feed(false, true, 100 + MODE_HOLD);
    feed(false, true, 100 + MODE_HOLD * 2);
    feed(false, true, 60_000);
    feed(false, false, 60_016);

    expect(gestures).toEqual([{ kind: "mode" }]);
  });

  it("requires a release before another gesture can begin", () => {
    const { kinds, feed } = setup();

    feed(false, false, 0);
    feed(false, true, 100);
    feed(false, true, 100 + MODE_HOLD);
    feed(false, true, 100 + MODE_HOLD * 3);

    feed(false, false, 100 + MODE_HOLD * 3 + 16);
    feed(false, true, 100 + MODE_HOLD * 3 + 32);
    feed(false, false, 100 + MODE_HOLD * 3 + 48);

    expect(kinds()).toEqual(["mode", "option"]);
  });

  it("uses 800 ms by default and honours an override", () => {
    expect(MODE_BUTTON_HOLD_MS).toBe(800);

    const byDefault = setup();
    byDefault.feed(false, false, 0);
    byDefault.feed(false, true, 0);
    byDefault.feed(false, true, 799);
    expect(byDefault.gestures).toEqual([]);

    const overridden = setup({ modeHoldMs: 1_000 });
    overridden.feed(false, false, 0);
    overridden.feed(false, true, 0);
    overridden.feed(false, true, 999);
    expect(overridden.gestures).toEqual([]);
    overridden.feed(false, true, 1_000);
    expect(overridden.kinds()).toEqual(["mode"]);
  });
});

describe("selection unavailable", () => {
  it("keeps the green button working", () => {
    const { kinds, feed } = setup();

    feed(false, false, 0, { selectionEnabled: false });
    feed(true, false, 16, { selectionEnabled: false });
    feed(false, false, 32, { selectionEnabled: false });

    expect(kinds()).toEqual(["mainShort"]);
  });

  it("ignores the white button entirely", () => {
    const { gestures, feed } = setup();

    feed(false, false, 0, { selectionEnabled: false });
    feed(false, true, 100, { selectionEnabled: false });
    feed(false, true, 100 + MODE_HOLD, { selectionEnabled: false });
    feed(false, false, 100 + MODE_HOLD + 16, { selectionEnabled: false });

    expect(gestures).toEqual([]);
  });

  it("drops a white press that began while selection was allowed", () => {
    const { gestures, feed } = setup();

    feed(false, false, 0);
    feed(false, true, 100);
    // The round starts: selection becomes unavailable mid-press.
    feed(false, true, 400, { selectionEnabled: false });
    feed(false, true, 100 + MODE_HOLD, { selectionEnabled: false });
    // Selection returns, and the button is released: still nothing fires.
    feed(false, false, 100 + MODE_HOLD + 16);

    expect(gestures).toEqual([]);

    feed(false, true, 2_000);
    feed(false, false, 2_050);

    expect(gestures).toEqual([{ kind: "option" }]);
  });

  it("requires a release before accepting input when selection returns", () => {
    const { gestures, feed } = setup();

    feed(false, false, 0, { selectionEnabled: false });
    feed(false, true, 100, { selectionEnabled: false });
    feed(false, true, 500);
    feed(false, true, 500 + MODE_HOLD);
    feed(false, false, 500 + MODE_HOLD + 16);

    expect(gestures).toEqual([]);

    feed(false, true, 2_000);
    feed(false, false, 2_050);

    expect(gestures).toEqual([{ kind: "option" }]);
  });
});

describe("cancelling a gesture", () => {
  it("drops an unfinished white press and waits for a release", () => {
    const { gestures, recogniser, feed } = setup();

    feed(false, false, 0);
    feed(false, true, 100);
    recogniser.cancel();

    // Still held after the cancel: no option on release, no hold later.
    feed(false, true, 200);
    feed(false, true, 200 + MODE_HOLD * 2);
    feed(false, false, 200 + MODE_HOLD * 2 + 16);

    expect(gestures).toEqual([]);

    feed(false, true, 200 + MODE_HOLD * 3);
    feed(false, false, 200 + MODE_HOLD * 3 + 16);

    expect(gestures).toEqual([{ kind: "option" }]);
  });

  it("does not undo a white hold action that already fired", () => {
    const { gestures, recogniser, feed } = setup();

    feed(false, false, 0);
    feed(false, true, 0);
    feed(false, true, MODE_HOLD);
    recogniser.cancel();
    feed(false, false, MODE_HOLD + 16);

    expect(gestures).toEqual([{ kind: "mode" }]);
  });

  it("drops a green press in flight and waits for a release", () => {
    const { kinds, recogniser, feed } = setup();

    feed(false, false, 0);
    feed(true, false, 16);
    recogniser.cancel();

    // Still down after the cancel: neither the release nor a later hold fires.
    feed(true, false, 32);
    feed(true, false, 16 + MAIN_HOLD * 2);
    feed(false, false, 16 + MAIN_HOLD * 2 + 16);
    expect(kinds()).toEqual([]);

    feed(true, false, 5_000);
    feed(false, false, 5_100);

    expect(kinds()).toEqual(["mainShort"]);
  });
});

describe("losing the controller", () => {
  it("cancels a held white press and requires a fresh press", () => {
    const { gestures, recogniser, feed } = setup();

    feed(false, false, 0);
    feed(false, true, 100);
    recogniser.update(null, 200);

    // Reconnected with the button still down: the release must come first.
    feed(false, true, 300);
    feed(false, true, 300 + MODE_HOLD * 2);
    feed(false, false, 300 + MODE_HOLD * 2 + 16);

    expect(gestures).toEqual([]);
  });

  it("cancels a green press that was down at disconnection", () => {
    const { kinds, recogniser, feed } = setup();

    feed(false, false, 0);
    feed(true, false, 16);
    recogniser.update(null, 32);
    feed(true, false, 48);
    feed(false, false, 64);
    expect(kinds()).toEqual([]);

    feed(true, false, 80);
    feed(false, false, 96);

    expect(kinds()).toEqual(["mainShort"]);
  });
});

describe("choosing one active controller", () => {
  function pad(connected: boolean): GamepadLike {
    return { connected, buttons: [] };
  }

  it("uses the first connected controller, whatever its index", () => {
    expect(pickActiveGamepad([null, pad(true), pad(true)], null)).toBe(1);
  });

  it("keeps the current controller while it stays connected", () => {
    expect(pickActiveGamepad([pad(true), pad(true)], 1)).toBe(1);
  });

  it("moves to another controller when the current one disconnects", () => {
    expect(pickActiveGamepad([pad(false), pad(true)], 0)).toBe(1);
  });

  it("reports no controller when none is connected", () => {
    expect(pickActiveGamepad([null, pad(false)], 1)).toBeNull();
    expect(pickActiveGamepad([], null)).toBeNull();
  });
});
