import { describe, expect, it } from "vitest";
import {
  MAIN_BUTTON_INDEX,
  MODE_BUTTON_HOLD_MS,
  MODE_BUTTON_INDEX,
  createGamepadRecogniser,
  pickActiveGamepad,
  type ButtonStateLike,
  type GamepadGesture,
  type GamepadLike,
} from "./gamepad";

/**
 * Spec for src/gamepad.ts — the physical arcade panel's gesture rules.
 *
 * Driven directly with button snapshots and clock readings, so this pins the
 * short/long distinction and the "one press, one action" rule without a
 * browser, a real controller, or a DOM.
 */

const HOLD = MODE_BUTTON_HOLD_MS;

function snapshot(
  mainPressed: boolean,
  modePressed: boolean,
): ButtonStateLike[] {
  const buttons = Array.from({ length: 4 }, () => ({ pressed: false }));

  buttons[MAIN_BUTTON_INDEX] = { pressed: mainPressed };
  buttons[MODE_BUTTON_INDEX] = { pressed: modePressed };

  return buttons;
}

function setup(holdMs = HOLD) {
  const gestures: GamepadGesture[] = [];
  const recogniser = createGamepadRecogniser({
    onGesture: (gesture) => gestures.push(gesture),
    holdMs,
  });

  const feed = (
    mainPressed: boolean,
    modePressed: boolean,
    now: number,
    selectionEnabled = true,
  ): void => {
    recogniser.update(
      snapshot(mainPressed, modePressed),
      now,
      selectionEnabled,
    );
  };

  return { gestures, recogniser, feed };
}

describe("the green MAIN button", () => {
  it("fires once on the press, not while the button is held", () => {
    const { gestures, feed } = setup();

    feed(false, false, 0);
    feed(true, false, 16);
    feed(true, false, 500);
    feed(true, false, 5_000);

    expect(gestures).toEqual(["main"]);
  });

  it("fires again only after a release and a fresh press", () => {
    const { gestures, feed } = setup();

    feed(false, false, 0);
    feed(true, false, 16);
    feed(true, false, 32);
    feed(false, false, 48);
    feed(true, false, 64);

    expect(gestures).toEqual(["main", "main"]);
  });

  it("ignores a button that is already held on first detection", () => {
    const { gestures, feed } = setup();

    // Plugged in (or tab regained) with the button down: browsers expose a
    // gamepad only after its first press, so this is the normal first frame.
    feed(true, false, 0);
    feed(true, false, 1_000);
    expect(gestures).toEqual([]);

    feed(false, false, 1_016);
    feed(true, false, 1_032);

    expect(gestures).toEqual(["main"]);
  });
});

describe("the white button: short press", () => {
  it("cycles the option on release, below the threshold", () => {
    const { gestures, feed } = setup();

    feed(false, false, 0);
    feed(false, true, 100);
    feed(false, false, 100 + HOLD - 1);

    expect(gestures).toEqual(["option"]);
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
    feed(false, true, 100 + HOLD);
    feed(false, false, 100 + HOLD + 50);

    expect(gestures).toEqual(["mode"]);
  });
});

describe("the white button: hold", () => {
  it("fires the mode action exactly at the threshold", () => {
    const { gestures, feed } = setup();

    feed(false, false, 0);
    feed(false, true, 100);
    feed(false, true, 100 + HOLD - 1);
    expect(gestures).toEqual([]);

    feed(false, true, 100 + HOLD);
    expect(gestures).toEqual(["mode"]);
  });

  it("fires only once however long the button is held", () => {
    const { gestures, feed } = setup();

    feed(false, false, 0);
    feed(false, true, 100);
    feed(false, true, 100 + HOLD);
    feed(false, true, 100 + HOLD * 2);
    feed(false, true, 60_000);
    feed(false, false, 60_016);

    expect(gestures).toEqual(["mode"]);
  });

  it("requires a release before another gesture can begin", () => {
    const { gestures, feed } = setup();

    feed(false, false, 0);
    feed(false, true, 100);
    feed(false, true, 100 + HOLD);
    // Still held far past the threshold: no repeat.
    feed(false, true, 100 + HOLD * 3);

    feed(false, false, 100 + HOLD * 3 + 16);
    feed(false, true, 100 + HOLD * 3 + 32);
    feed(false, false, 100 + HOLD * 3 + 48);

    expect(gestures).toEqual(["mode", "option"]);
  });

  it("uses 800 ms by default and honours an override", () => {
    expect(MODE_BUTTON_HOLD_MS).toBe(800);

    const byDefault = setup();
    byDefault.feed(false, false, 0);
    byDefault.feed(false, true, 0);
    byDefault.feed(false, true, 799);
    expect(byDefault.gestures).toEqual([]);

    const overridden = setup(1_000);
    overridden.feed(false, false, 0);
    overridden.feed(false, true, 0);
    overridden.feed(false, true, 999);
    expect(overridden.gestures).toEqual([]);
    overridden.feed(false, true, 1_000);
    expect(overridden.gestures).toEqual(["mode"]);
  });
});

describe("selection unavailable", () => {
  it("keeps the green button working", () => {
    const { gestures, feed } = setup();

    feed(false, false, 0, false);
    feed(true, false, 16, false);

    expect(gestures).toEqual(["main"]);
  });

  it("ignores the white button entirely", () => {
    const { gestures, feed } = setup();

    feed(false, false, 0, false);
    feed(false, true, 100, false);
    feed(false, true, 100 + HOLD, false);
    feed(false, false, 100 + HOLD + 16, false);

    expect(gestures).toEqual([]);
  });

  it("drops a press that began while selection was allowed", () => {
    const { gestures, feed } = setup();

    feed(false, false, 0);
    feed(false, true, 100);
    // The round starts: selection becomes unavailable mid-press.
    feed(false, true, 400, false);
    feed(false, true, 100 + HOLD, false);
    // Selection returns, and the button is released: still nothing fires.
    feed(false, false, 100 + HOLD + 16);

    expect(gestures).toEqual([]);

    feed(false, true, 2_000);
    feed(false, false, 2_050);

    expect(gestures).toEqual(["option"]);
  });

  it("requires a release before accepting input when selection returns", () => {
    const { gestures, feed } = setup();

    feed(false, false, 0, false);
    feed(false, true, 100, false);
    feed(false, true, 500);
    feed(false, true, 500 + HOLD);
    feed(false, false, 500 + HOLD + 16);

    expect(gestures).toEqual([]);

    feed(false, true, 2_000);
    feed(false, false, 2_050);

    expect(gestures).toEqual(["option"]);
  });
});

describe("cancelling a gesture", () => {
  it("drops an unfinished press and waits for a release", () => {
    const { gestures, recogniser, feed } = setup();

    feed(false, false, 0);
    feed(false, true, 100);
    recogniser.cancel();

    // Still held after the cancel: no option on release, no hold later.
    feed(false, true, 200);
    feed(false, true, 200 + HOLD * 2);
    feed(false, false, 200 + HOLD * 2 + 16);

    expect(gestures).toEqual([]);

    feed(false, true, 200 + HOLD * 3);
    feed(false, false, 200 + HOLD * 3 + 16);

    expect(gestures).toEqual(["option"]);
  });

  it("does not undo a hold action that already fired", () => {
    const { gestures, recogniser, feed } = setup();

    feed(false, false, 0);
    feed(false, true, 0);
    feed(false, true, HOLD);
    recogniser.cancel();
    feed(false, false, HOLD + 16);

    expect(gestures).toEqual(["mode"]);
  });

  it("also drops a green press in flight", () => {
    const { gestures, recogniser, feed } = setup();

    feed(true, false, 0);
    recogniser.cancel();
    feed(true, false, 16);
    feed(false, false, 32);
    feed(true, false, 48);

    expect(gestures).toEqual(["main"]);
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
    feed(false, true, 300 + HOLD * 2);
    feed(false, false, 300 + HOLD * 2 + 16);

    expect(gestures).toEqual([]);
  });

  it("cancels a green press that was down at disconnection", () => {
    const { gestures, recogniser, feed } = setup();

    feed(false, false, 0);
    feed(true, false, 16);
    recogniser.update(null, 32);
    feed(true, false, 48);
    feed(false, false, 64);
    feed(true, false, 80);

    expect(gestures).toEqual(["main", "main"]);
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
