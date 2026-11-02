import { describe, expect, it } from "vitest";
import { ROUND_MS, formatRemaining } from "./timer";
import {
  MODE_SELECTIONS,
  displayMs,
  initialRoundState,
  isPlaceholderMode,
  mainLabel,
  modeIsActive,
  reduce,
  roundDurationMs,
  selectionLabel,
  type RoundAction,
  type RoundState,
} from "./round";

/**
 * Spec for src/round.ts — the agreed two-button behaviour, as pure transitions.
 *
 * No DOM here: every test calls the reducer directly, so the interaction rules
 * are pinned independently of React and of the press timing.
 */

const T0 = 1_700_000_000_000;
const SECOND = 1_000;
const MINUTE = 60 * SECOND;

function run(state: RoundState, actions: RoundAction[]): RoundState {
  return actions.reduce(reduce, state);
}

/** READY, then Main short press. */
function started(now = T0): RoundState {
  return run(initialRoundState, [{ type: "mainShort", now }]);
}

function selectMode(state: RoundState, presses: number): RoundState {
  return run(
    state,
    Array.from({ length: presses }, () => ({ type: "modeShort" }) as const),
  );
}

function selectOption(state: RoundState, presses: number): RoundState {
  return run(
    state,
    Array.from({ length: presses }, () => ({ type: "modeLong" }) as const),
  );
}

describe("the agreed selection lists", () => {
  it("are exactly the display lists that were agreed", () => {
    // Mode 1 is the real round; 2-5 are display placeholders. Base selections
    // display as a bare number, not "2a".
    expect(MODE_SELECTIONS).toEqual([
      ["1"],
      ["2", "2b", "2c"],
      ["3", "3b"],
      ["4", "4b", "4c"],
      ["5", "5a", "5b"],
    ]);
  });

  it("gives every mode the same five minutes, inventing no preset durations", () => {
    for (let mode = 0; mode < MODE_SELECTIONS.length; mode += 1) {
      expect(roundDurationMs(mode)).toBe(ROUND_MS);
    }
  });
});

describe("the initial state", () => {
  it("is READY on mode 1 with a full round showing", () => {
    expect(initialRoundState.phase).toBe("ready");
    expect(selectionLabel(initialRoundState)).toBe("1");
    expect(mainLabel(initialRoundState)).toBe("Start");
    expect(displayMs(initialRoundState, T0)).toBe(ROUND_MS);
    expect(isPlaceholderMode(initialRoundState)).toBe(false);
    expect(modeIsActive(initialRoundState)).toBe(true);
  });
});

describe("Main short press", () => {
  it("starts a round from READY", () => {
    const state = started();

    expect(state.phase).toBe("running");
    expect(state.deadline).toBe(T0 + ROUND_MS);
    expect(state.pausedAt).toBeNull();
  });

  it("pauses from RUNNING by remembering when, not how much is left", () => {
    const state = run(started(), [
      { type: "mainShort", now: T0 + 30 * SECOND },
    ]);

    expect(state.phase).toBe("paused");
    expect(state.pausedAt).toBe(T0 + 30 * SECOND);
    expect(state.deadline).toBe(T0 + ROUND_MS);
  });

  it("resets from PAUSED to READY, keeping the selection", () => {
    const paused = run(started(), [
      { type: "mainShort", now: T0 + 2 * MINUTE + 34 * SECOND },
    ]);

    const reset = run(paused, [{ type: "mainShort", now: T0 + 20 * MINUTE }]);

    expect(reset.phase).toBe("ready");
    expect(reset.deadline).toBeNull();
    expect(reset.pausedAt).toBeNull();
    expect(displayMs(reset, T0 + 20 * MINUTE)).toBe(ROUND_MS);
  });

  it("acknowledges from FINISHED back to READY", () => {
    const finished = run(started(), [{ type: "tick", now: T0 + ROUND_MS }]);
    const state = run(finished, [
      { type: "mainShort", now: T0 + ROUND_MS + 1 },
    ]);

    expect(finished.phase).toBe("finished");
    expect(state.phase).toBe("ready");
    expect(state.deadline).toBeNull();
  });
});

describe("the Main label", () => {
  it("describes the next short press in every state", () => {
    const paused = run(started(), [{ type: "mainShort", now: T0 }]);
    const finished = run(started(), [{ type: "tick", now: T0 + ROUND_MS }]);

    expect(mainLabel(initialRoundState)).toBe("Start");
    expect(mainLabel(started())).toBe("Pause");
    expect(mainLabel(paused)).toBe("Reset");
    expect(mainLabel(finished)).toBe("Reset");
  });
});

describe("pause, then reset", () => {
  it("freezes the exact remainder while paused", () => {
    const paused = run(started(), [
      { type: "mainShort", now: T0 + 2 * MINUTE + 34 * SECOND },
    ]);

    // Hours later, the frozen reading is unchanged: it is derived from the
    // timestamp the round was paused at, never from a stored countdown.
    expect(displayMs(paused, T0 + 2 * MINUTE + 34 * SECOND)).toBe(
      ROUND_MS - (2 * MINUTE + 34 * SECOND),
    );
    expect(displayMs(paused, T0 + 6 * 60 * MINUTE)).toBe(
      ROUND_MS - (2 * MINUTE + 34 * SECOND),
    );
  });

  it("restores the whole session from PAUSED, preserving mode and option", () => {
    const chosen = selectOption(selectMode(initialRoundState, 3), 2);

    expect(selectionLabel(chosen)).toBe("4c");

    const running = run(chosen, [{ type: "mainShort", now: T0 + MINUTE }]);
    const paused = run(running, [{ type: "mainShort", now: T0 + 2 * MINUTE }]);
    const reset = run(paused, [{ type: "mainShort", now: T0 + 10 * MINUTE }]);

    expect(reset.phase).toBe("ready");
    expect(selectionLabel(reset)).toBe("4c");
    expect(displayMs(reset, T0 + 10 * MINUTE)).toBe(roundDurationMs(3));
  });
});

describe("Main long press resets from every state", () => {
  const paused = run(started(), [{ type: "mainShort", now: T0 + MINUTE }]);
  const finished = run(started(), [{ type: "tick", now: T0 + ROUND_MS }]);

  const states: [string, RoundState][] = [
    ["READY", initialRoundState],
    ["RUNNING", started()],
    ["PAUSED", paused],
    ["FINISHED", finished],
  ];

  it.each(states)("resets from %s to READY", (_name, state) => {
    const reset = run(state, [{ type: "mainLong", now: T0 + MINUTE }]);

    expect(reset.phase).toBe("ready");
    expect(reset.deadline).toBeNull();
    expect(reset.pausedAt).toBeNull();
  });

  it("preserves the selected mode and option", () => {
    const chosen = selectOption(selectMode(initialRoundState, 3), 2);

    expect(selectionLabel(chosen)).toBe("4c");

    const reset = run(started(), [{ type: "mainLong", now: T0 + MINUTE }]);

    expect(selectionLabel(run(chosen, [{ type: "mainLong", now: T0 }]))).toBe(
      "4c",
    );
    expect(selectionLabel(reset)).toBe("1");
  });

  it("restores the full round time", () => {
    const reset = run(started(), [{ type: "mainLong", now: T0 + 4 * MINUTE }]);

    expect(displayMs(reset, T0 + 4 * MINUTE)).toBe(ROUND_MS);
  });

  it("is a no-op in READY", () => {
    expect(run(initialRoundState, [{ type: "mainLong", now: T0 }])).toEqual(
      initialRoundState,
    );
  });
});

describe("Mode short press", () => {
  it("cycles the top-level modes 1 -> 2 -> 3 -> 4 -> 5 -> 1", () => {
    const labels = [0, 1, 2, 3, 4, 5].map((presses) =>
      selectionLabel(selectMode(initialRoundState, presses)),
    );

    expect(labels).toEqual(["1", "2", "3", "4", "5", "1"]);
  });

  it("starts at the new mode's base selection", () => {
    const onOption = selectOption(selectMode(initialRoundState, 1), 2);

    expect(selectionLabel(onOption)).toBe("2c");

    const next = selectMode(onOption, 1);

    expect(selectionLabel(next)).toBe("3");
  });
});

describe("Mode long press", () => {
  it("cycles within mode 2: 2 -> 2b -> 2c -> 2", () => {
    const mode2 = selectMode(initialRoundState, 1);

    expect(
      [0, 1, 2, 3].map((n) => selectionLabel(selectOption(mode2, n))),
    ).toEqual(["2", "2b", "2c", "2"]);
  });

  it("cycles within mode 3: 3 -> 3b -> 3", () => {
    const mode3 = selectMode(initialRoundState, 2);

    expect([0, 1].map((n) => selectionLabel(selectOption(mode3, n)))).toEqual([
      "3",
      "3b",
    ]);
    expect(selectionLabel(selectOption(mode3, 2))).toBe("3");
  });

  it("cycles within mode 4: 4 -> 4b -> 4c -> 4", () => {
    const mode4 = selectMode(initialRoundState, 3);

    expect(
      [0, 1, 2, 3].map((n) => selectionLabel(selectOption(mode4, n))),
    ).toEqual(["4", "4b", "4c", "4"]);
  });

  it("cycles within mode 5: 5 -> 5a -> 5b -> 5", () => {
    const mode5 = selectMode(initialRoundState, 4);

    expect(
      [0, 1, 2, 3].map((n) => selectionLabel(selectOption(mode5, n))),
    ).toEqual(["5", "5a", "5b", "5"]);
  });

  it("does nothing on mode 1, which has no options", () => {
    expect(selectionLabel(selectOption(initialRoundState, 3))).toBe("1");
  });

  it("marks modes 2-5 as placeholders and mode 1 as real", () => {
    const placeholders = [1, 2, 3, 4].map((presses) =>
      isPlaceholderMode(selectMode(initialRoundState, presses)),
    );

    expect(placeholders).toEqual([true, true, true, true]);
    expect(isPlaceholderMode(initialRoundState)).toBe(false);
  });
});

describe("Mode while a round is in flight", () => {
  it("is ignored in RUNNING", () => {
    const running = started();
    const afterShort = selectMode(running, 3);
    const afterLong = selectOption(running, 3);

    expect(selectionLabel(afterShort)).toBe("1");
    expect(selectionLabel(afterLong)).toBe("1");
    expect(afterShort.phase).toBe("running");
    expect(afterLong.phase).toBe("running");
  });

  it("is ignored in PAUSED", () => {
    const paused = run(started(), [{ type: "mainShort", now: T0 + MINUTE }]);
    const afterShort = selectMode(paused, 2);

    expect(selectionLabel(afterShort)).toBe("1");
    expect(afterShort.phase).toBe("paused");
    expect(displayMs(afterShort, T0 + MINUTE)).toBe(ROUND_MS - MINUTE);
  });

  it("still works in FINISHED", () => {
    const finished = run(started(), [{ type: "tick", now: T0 + ROUND_MS }]);

    expect(selectionLabel(selectMode(finished, 1))).toBe("2");
    expect(modeIsActive(finished)).toBe(true);
  });

  it("reports itself inactive exactly while a round is in flight", () => {
    const paused = run(started(), [{ type: "mainShort", now: T0 }]);
    const finished = run(started(), [{ type: "tick", now: T0 + ROUND_MS }]);

    expect(modeIsActive(started())).toBe(false);
    expect(modeIsActive(paused)).toBe(false);
    expect(modeIsActive(initialRoundState)).toBe(true);
    expect(modeIsActive(finished)).toBe(true);
  });
});

describe("the tick action", () => {
  it("finishes the round exactly at the deadline, not before", () => {
    const running = started();

    expect(run(running, [{ type: "tick", now: T0 + ROUND_MS - 1 }]).phase).toBe(
      "running",
    );
    expect(run(running, [{ type: "tick", now: T0 + ROUND_MS }]).phase).toBe(
      "finished",
    );
  });

  it("finishes a round that is discovered to be long overdue", () => {
    // The machine slept through the end of the round.
    const running = started();

    expect(
      run(running, [{ type: "tick", now: T0 + ROUND_MS + 30 * MINUTE }]).phase,
    ).toBe("finished");
  });

  it("does nothing in READY, PAUSED or FINISHED", () => {
    const paused = run(started(), [{ type: "mainShort", now: T0 + MINUTE }]);
    const finished = run(started(), [{ type: "tick", now: T0 + ROUND_MS }]);
    const late = T0 + 60 * MINUTE;

    expect(run(initialRoundState, [{ type: "tick", now: late }])).toEqual(
      initialRoundState,
    );
    expect(run(paused, [{ type: "tick", now: late }])).toEqual(paused);
    expect(run(finished, [{ type: "tick", now: late }])).toEqual(finished);
  });

  it("leaves the clock at 0:00 once finished", () => {
    const finished = run(started(), [{ type: "tick", now: T0 + ROUND_MS }]);

    expect(displayMs(finished, T0 + ROUND_MS)).toBe(0);
    expect(displayMs(finished, T0 + 90 * MINUTE)).toBe(0);
  });
});

describe("timing boundaries", () => {
  it("sets the deadline to exactly the start plus the configured duration", () => {
    // A deliberately off-second start, so any rounding of the deadline shows up.
    const oddStart = T0 + 137;
    const state = run(initialRoundState, [
      { type: "mainShort", now: oddStart },
    ]);

    expect(state.deadline).toBe(oddStart + ROUND_MS);
    expect((state.deadline ?? 0) - oddStart).toBe(300_000);
  });

  it("says 0:01 with a second left and 0:00 only at the deadline", () => {
    const running = started();
    const deadline = running.deadline ?? 0;

    expect(formatRemaining(displayMs(running, deadline - 1_000))).toBe("0:01");
    expect(formatRemaining(displayMs(running, deadline - 1))).toBe("0:01");
    expect(formatRemaining(displayMs(running, deadline))).toBe("0:00");
  });

  it("finishes at the original deadline, neither a second early nor a second late", () => {
    const running = started();
    const deadline = running.deadline ?? 0;

    expect(run(running, [{ type: "tick", now: deadline - 1 }]).phase).toBe(
      "running",
    );
    expect(run(running, [{ type: "tick", now: deadline }]).phase).toBe(
      "finished",
    );
    expect(run(running, [{ type: "tick", now: deadline + 1 }]).phase).toBe(
      "finished",
    );
  });
});
