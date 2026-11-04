import { describe, expect, it } from "vitest";
import {
  currentMode,
  currentPreset,
  currentPresetIndex,
  currentRestMs,
  currentWorkMs,
  displayMs,
  initialRoundState,
  mainLabel,
  nextPhase,
  phaseHeadline,
  phaseLabel,
  inFinalTen,
  reduce,
  selectionAllowed,
  stateKey,
  type RoundAction,
  type RoundState,
} from "./round";

/**
 * Spec for src/round.ts — the Rolls/Drills repeating work-rest session.
 *
 * No DOM here: every test calls the reducer directly, so the cycle rules are
 * pinned independently of React, the selector, and input timing.
 */

const T0 = 1_700_000_000_000;
const SECOND = 1_000;
const MINUTE = 60 * SECOND;

function run(state: RoundState, actions: RoundAction[]): RoundState {
  return actions.reduce(reduce, state);
}

/** READY, then a Main short press (Start). */
function started(now = T0): RoundState {
  return reduce(initialRoundState, { type: "mainShort", now });
}

function ticked(state: RoundState, now: number): RoundState {
  return reduce(state, { type: "tick", now });
}

function paused(state: RoundState, now: number): RoundState {
  return reduce(state, { type: "mainShort", now });
}

function reset(state: RoundState): RoundState {
  return reduce(state, { type: "mainLong", now: T0 + 999 * MINUTE });
}

const nextPreset: RoundAction = { type: "nextPreset" };
const nextMode: RoundAction = { type: "nextMode" };

describe("the initial session", () => {
  it("is READY on Rolls, preset 1, at round 1 and a full work duration", () => {
    expect(initialRoundState.status).toBe("ready");
    expect(initialRoundState.phase).toBe("work");
    expect(currentMode(initialRoundState).title).toBe("ROLLS");
    expect(currentPresetIndex(initialRoundState)).toBe(0);
    expect(initialRoundState.round).toBe(1);
    expect(initialRoundState.deadline).toBeNull();
    expect(displayMs(initialRoundState, T0)).toBe(5 * MINUTE);
    expect(selectionAllowed(initialRoundState)).toBe(true);
    expect(mainLabel(initialRoundState)).toBe("Start");
    expect(phaseLabel(initialRoundState)).toBe("WORK");
    expect(nextPhase(initialRoundState)).toEqual({
      label: "WORK",
      ms: 5 * MINUTE,
    });
  });

  it("remembers a default preset for every mode", () => {
    expect(initialRoundState.presetIndexByMode).toEqual([0, 0, 2, 0]);
  });
});

describe("starting", () => {
  it("begins work immediately at round 1, with a full work deadline", () => {
    const state = started(T0);

    expect(state.status).toBe("running");
    expect(state.phase).toBe("work");
    expect(state.round).toBe(1);
    expect(state.deadline).toBe(T0 + 5 * MINUTE);
    expect(state.transitionSeq).toBe(1);
    expect(state.lastTransition).toBe("work");
    expect(mainLabel(state)).toBe("Pause");
    expect(displayMs(state, T0)).toBe(5 * MINUTE);
  });

  it("uses the selected Drills preset's full work duration", () => {
    const chosen = run(initialRoundState, [
      { type: "selectMode", modeIndex: 1 },
      { type: "selectPreset", presetIndex: 1 },
    ]);

    expect(chosen.status).toBe("ready");

    const startedDrills = reduce(chosen, { type: "mainShort", now: T0 });

    expect(startedDrills.deadline).toBe(T0 + 3 * MINUTE);
    expect(displayMs(startedDrills, T0)).toBe(3 * MINUTE);
    expect(phaseLabel(startedDrills)).toBe("WORK");
    expect(startedDrills.transitionSeq).toBe(1);
  });
});

describe("the repeating work-rest cycle", () => {
  it("moves from work to the full rest at the work deadline", () => {
    const state = ticked(started(T0), T0 + 5 * MINUTE);

    expect(state.status).toBe("running");
    expect(state.phase).toBe("rest");
    expect(state.round).toBe(1);
    expect(state.deadline).toBe(T0 + 6 * MINUTE);
    expect(displayMs(state, T0 + 5 * MINUTE)).toBe(1 * MINUTE);
    expect(phaseLabel(state)).toBe("REST");
    expect(nextPhase(state)).toEqual({ label: "WORK", ms: 5 * MINUTE });
    expect(state.transitionSeq).toBe(2);
    expect(state.lastTransition).toBe("rest");
  });

  it("starts the next full work and increments the round after rest", () => {
    const state = run(started(T0), [
      { type: "tick", now: T0 + 5 * MINUTE },
      { type: "tick", now: T0 + 6 * MINUTE },
    ]);

    expect(state.phase).toBe("work");
    expect(state.round).toBe(2);
    expect(state.deadline).toBe(T0 + 11 * MINUTE);
    expect(displayMs(state, T0 + 6 * MINUTE)).toBe(5 * MINUTE);
    expect(nextPhase(state)).toEqual({ label: "REST", ms: 1 * MINUTE });
    expect(state.transitionSeq).toBe(3);
    expect(state.lastTransition).toBe("work");
  });

  it("keeps the round number through rest and increments only on the next work", () => {
    const afterThreePhases = run(started(T0), [
      { type: "tick", now: T0 + 5 * MINUTE },
      { type: "tick", now: T0 + 6 * MINUTE },
      { type: "tick", now: T0 + 11 * MINUTE },
      { type: "tick", now: T0 + 12 * MINUTE },
    ]);

    expect(afterThreePhases.round).toBe(3);
    expect(afterThreePhases.phase).toBe("work");
    expect(afterThreePhases.deadline).toBe(T0 + 17 * MINUTE);
  });

  it("does not transition before the phase deadline", () => {
    const state = started(T0);
    const justBefore = ticked(state, T0 + 5 * MINUTE - 1);

    expect(justBefore.phase).toBe("work");
    expect(justBefore.round).toBe(1);
    expect(justBefore.transitionSeq).toBe(1);
  });

  it("advances several phases in one late tick without drift", () => {
    const state = ticked(started(T0), T0 + 20 * MINUTE);

    // 5 work, 1 rest, 5 work, 1 rest, 5 work, 1 rest, then work round 4.
    expect(state.phase).toBe("work");
    expect(state.round).toBe(4);
    expect(state.deadline).toBe(T0 + 23 * MINUTE);
    expect(state.transitionSeq).toBe(7);
    expect(state.lastTransition).toBe("work");
    expect(displayMs(state, T0 + 20 * MINUTE)).toBe(3 * MINUTE);
  });

  it("lands exactly on a boundary as the phase that starts there", () => {
    const rest = ticked(started(T0), T0 + 5 * MINUTE);
    const work = ticked(rest, T0 + 6 * MINUTE);

    expect(rest.phase).toBe("rest");
    expect(rest.deadline).toBe(T0 + 6 * MINUTE);
    expect(work.phase).toBe("work");
    expect(work.round).toBe(2);
    expect(work.deadline).toBe(T0 + 11 * MINUTE);
  });

  it("is idempotent when the same late tick is delivered twice", () => {
    const late = ticked(started(T0), T0 + 20 * MINUTE);
    const repeated = ticked(late, T0 + 20 * MINUTE);

    expect(repeated).toEqual(late);
    expect(repeated.transitionSeq).toBe(late.transitionSeq);
  });
});

describe("pause and resume", () => {
  it("freezes and resumes work from its remaining time", () => {
    const work = started(T0);
    const pausedWork = paused(work, T0 + 2 * MINUTE);

    expect(pausedWork.status).toBe("paused");
    expect(pausedWork.phase).toBe("work");
    expect(pausedWork.round).toBe(1);
    expect(pausedWork.pausedAt).toBe(T0 + 2 * MINUTE);
    expect(displayMs(pausedWork, T0 + 2 * MINUTE)).toBe(3 * MINUTE);
    expect(displayMs(pausedWork, T0 + 50 * MINUTE)).toBe(3 * MINUTE);
    expect(mainLabel(pausedWork)).toBe("Resume");

    const stillPaused = ticked(pausedWork, T0 + 50 * MINUTE);
    expect(stillPaused).toEqual(pausedWork);

    const resumed = paused(pausedWork, T0 + 50 * MINUTE);

    expect(resumed.status).toBe("running");
    expect(resumed.phase).toBe("work");
    expect(resumed.round).toBe(1);
    expect(resumed.deadline).toBe(T0 + 53 * MINUTE);
    expect(displayMs(resumed, T0 + 50 * MINUTE)).toBe(3 * MINUTE);
    expect(resumed.transitionSeq).toBe(1);

    const late = ticked(resumed, T0 + 52 * MINUTE + 59 * SECOND);
    expect(late.phase).toBe("work");

    const rest = ticked(resumed, T0 + 53 * MINUTE);
    expect(rest.phase).toBe("rest");
    expect(rest.round).toBe(1);
  });

  it("freezes and resumes a rest phase without changing phase or round", () => {
    const rest = ticked(started(T0), T0 + 5 * MINUTE);
    const pausedRest = paused(rest, T0 + 5 * MINUTE + 30 * SECOND);

    expect(pausedRest.status).toBe("paused");
    expect(pausedRest.phase).toBe("rest");
    expect(pausedRest.round).toBe(1);
    expect(displayMs(pausedRest, T0 + 20 * MINUTE)).toBe(30 * SECOND);

    const resumed = paused(pausedRest, T0 + 20 * MINUTE);

    expect(resumed.deadline).toBe(T0 + 20 * MINUTE + 30 * SECOND);
    expect(displayMs(resumed, T0 + 20 * MINUTE)).toBe(30 * SECOND);

    const nextWork = ticked(resumed, T0 + 20 * MINUTE + 30 * SECOND);

    expect(nextWork.phase).toBe("work");
    expect(nextWork.round).toBe(2);
    expect(nextWork.deadline).toBe(T0 + 25 * MINUTE + 30 * SECOND);
    expect(nextWork.transitionSeq).toBe(3);
  });

  it("does not fire a cue on pause or resume", () => {
    const work = started(T0);
    const pausedWork = paused(work, T0 + MINUTE);
    const resumed = paused(pausedWork, T0 + 10 * MINUTE);

    expect(pausedWork.transitionSeq).toBe(work.transitionSeq);
    expect(resumed.transitionSeq).toBe(work.transitionSeq);
  });
});

describe("reset", () => {
  it("returns READY, round 1, at the full work duration", () => {
    const resetState = reset(started(T0));

    expect(resetState.status).toBe("ready");
    expect(resetState.phase).toBe("work");
    expect(resetState.round).toBe(1);
    expect(resetState.deadline).toBeNull();
    expect(resetState.pausedAt).toBeNull();
    expect(displayMs(resetState, T0 + 999 * MINUTE)).toBe(5 * MINUTE);
    expect(mainLabel(resetState)).toBe("Start");
    expect(selectionAllowed(resetState)).toBe(true);
  });

  it("works from Running work, Running rest, and Paused", () => {
    const runningWork = started(T0);
    const runningRest = ticked(runningWork, T0 + 5 * MINUTE);
    const pausedWork = paused(runningWork, T0 + 2 * MINUTE);
    const pausedRest = paused(runningRest, T0 + 5 * MINUTE + 30 * SECOND);

    for (const before of [runningWork, runningRest, pausedWork, pausedRest]) {
      const after = reset(before);

      expect(after.status).toBe("ready");
      expect(after.phase).toBe("work");
      expect(after.round).toBe(1);
      expect(after.deadline).toBeNull();
      expect(after.lastTransition).toBeNull();
    }
  });

  it("preserves the selected mode and preset", () => {
    const chosen = run(initialRoundState, [
      { type: "selectMode", modeIndex: 1 },
      { type: "selectPreset", presetIndex: 1 },
    ]);
    const running = reduce(chosen, { type: "mainShort", now: T0 });
    const resetState = reset(running);

    expect(currentMode(resetState).title).toBe("DRILLS");
    expect(currentPresetIndex(resetState)).toBe(1);
    expect(displayMs(resetState, T0)).toBe(3 * MINUTE);
  });

  it("does not fire a cue", () => {
    const running = started(T0);
    const resetState = reset(running);

    expect(resetState.transitionSeq).toBe(running.transitionSeq);
  });
});

describe("mode and preset selection while ready", () => {
  it("switches to Drills and loads its first preset", () => {
    const state = reduce(initialRoundState, {
      type: "selectMode",
      modeIndex: 1,
    });

    expect(state.modeIndex).toBe(1);
    expect(currentMode(state).title).toBe("DRILLS");
    expect(currentPresetIndex(state)).toBe(0);
    expect(state.status).toBe("ready");
    expect(state.phase).toBe("work");
    expect(state.round).toBe(1);
    expect(displayMs(state, T0)).toBe(2 * MINUTE);
    expect(nextPhase(state)).toEqual({ label: "WORK", ms: 2 * MINUTE });
  });

  it("selects a preset and loads its full work duration", () => {
    const state = run(initialRoundState, [
      { type: "selectPreset", presetIndex: 1 },
    ]);

    expect(currentPresetIndex(state)).toBe(1);
    expect(displayMs(state, T0)).toBe(3 * MINUTE);
    expect(currentPreset(state).id).toBe("rolls-3-1");
    expect(state.status).toBe("ready");
    expect(state.transitionSeq).toBe(0);
  });

  it("loads each mode's declared default when switching", () => {
    const drills = run(initialRoundState, [
      { type: "selectPreset", presetIndex: 1 },
      nextMode,
      { type: "selectPreset", presetIndex: 1 },
    ]);

    expect(currentMode(drills).title).toBe("DRILLS");
    expect(currentPresetIndex(drills)).toBe(1);
    expect(displayMs(drills, T0)).toBe(3 * MINUTE);

    const nogi = reduce(drills, nextMode);
    expect(currentMode(nogi).title).toBe("NOGI");
    expect(currentPresetIndex(nogi)).toBe(2);
    expect(displayMs(nogi, T0)).toBe(3 * MINUTE);
    expect(currentRestMs(nogi)).toBe(10 * SECOND);

    const kids = reduce(nogi, nextMode);
    expect(currentMode(kids).title).toBe("KIDS");
    expect(currentPresetIndex(kids)).toBe(0);
    expect(displayMs(kids, T0)).toBe(30 * SECOND);

    const backToRolls = reduce(kids, nextMode);
    expect(currentMode(backToRolls).title).toBe("ROLLS");
    expect(currentPresetIndex(backToRolls)).toBe(0);
    expect(displayMs(backToRolls, T0)).toBe(5 * MINUTE);
  });

  it("loads NOGI at 3:00 / 0:10 on entry and re-entry", () => {
    const firstEntry = reduce(initialRoundState, {
      type: "selectMode",
      modeIndex: 2,
    });
    expect(currentPresetIndex(firstEntry)).toBe(2);
    expect(currentWorkMs(firstEntry)).toBe(3 * MINUTE);
    expect(currentRestMs(firstEntry)).toBe(10 * SECOND);

    const changed = reduce(firstEntry, {
      type: "selectPreset",
      presetIndex: 3,
    });
    expect(currentWorkMs(changed)).toBe(5 * MINUTE);

    const away = reduce(changed, { type: "selectMode", modeIndex: 0 });
    const reentry = reduce(away, { type: "selectMode", modeIndex: 2 });
    expect(currentPresetIndex(reentry)).toBe(2);
    expect(currentWorkMs(reentry)).toBe(3 * MINUTE);
  });

  it("cycles the full NOGI preset sequence and wraps", () => {
    const states = [0, 1, 2, 3, 4].map((presses) =>
      run(initialRoundState, [
        { type: "selectMode", modeIndex: 2 },
        ...Array.from({ length: presses }, () => nextPreset),
      ]),
    );

    expect(states.map(currentPresetIndex)).toEqual([2, 3, 0, 1, 2]);
    expect(states.map(currentWorkMs)).toEqual([
      3 * MINUTE,
      5 * MINUTE,
      1 * MINUTE,
      2 * MINUTE,
      3 * MINUTE,
    ]);
    expect(states.map(currentRestMs)).toEqual([
      10 * SECOND,
      10 * SECOND,
      10 * SECOND,
      10 * SECOND,
      10 * SECOND,
    ]);
  });

  it("cycles Rolls and all four Drills presets in order and wraps", () => {
    const rolls = [0, 1, 2].map((presses) =>
      run(
        initialRoundState,
        Array.from({ length: presses }, () => nextPreset),
      ),
    );

    expect(rolls.map(currentPresetIndex)).toEqual([0, 1, 0]);

    const drills = [0, 1, 2, 3, 4].map((presses) =>
      run(
        initialRoundState,
        [
          { type: "selectMode", modeIndex: 1 },
          ...Array.from({ length: presses }, () => nextPreset),
        ],
      ),
    );

    expect(drills.map(currentPresetIndex)).toEqual([0, 1, 2, 3, 0]);
    expect(drills.map(currentWorkMs)).toEqual([
      2 * MINUTE,
      3 * MINUTE,
      5 * MINUTE,
      1 * MINUTE,
      2 * MINUTE,
    ]);
    expect(drills.map(currentRestMs)).toEqual([
      30 * SECOND,
      30 * SECOND,
      30 * SECOND,
      30 * SECOND,
      30 * SECOND,
    ]);
  });

  it("loads the Kids 30-second work / 5-second rest default", () => {
    const kids = reduce(initialRoundState, {
      type: "selectMode",
      modeIndex: 3,
    });

    expect(currentMode(kids).title).toBe("KIDS");
    expect(currentPresetIndex(kids)).toBe(0);
    expect(currentWorkMs(kids)).toBe(30 * SECOND);
    expect(currentRestMs(kids)).toBe(5 * SECOND);
  });

  it("cycles main modes Rolls -> Drills -> NOGI -> Kids -> Rolls", () => {
    const labels = [0, 1, 2, 3, 4].map(
      (presses) =>
        currentMode(
          run(
            initialRoundState,
            Array.from({ length: presses }, () => nextMode),
          ),
        ).title,
    );

    expect(labels).toEqual(["ROLLS", "DRILLS", "NOGI", "KIDS", "ROLLS"]);
  });

  it("does not restart a cue or a blocked-attempt message", () => {
    const state = run(initialRoundState, [
      { type: "selectMode", modeIndex: 1 },
      nextPreset,
    ]);

    expect(state.transitionSeq).toBe(0);
    expect(state.blockedSelectionSeq).toBe(0);
    expect(state.lastTransition).toBeNull();
  });

  it("ignores the same selection and invalid indices", () => {
    const sameMode = reduce(initialRoundState, {
      type: "selectMode",
      modeIndex: 0,
    });
    const samePreset = reduce(initialRoundState, {
      type: "selectPreset",
      presetIndex: 0,
    });
    const invalidMode = reduce(initialRoundState, {
      type: "selectMode",
      modeIndex: 99,
    });
    const invalidPreset = reduce(initialRoundState, {
      type: "selectPreset",
      presetIndex: 99,
    });

    expect(sameMode).toEqual(initialRoundState);
    expect(samePreset).toEqual(initialRoundState);
    expect(invalidMode).toEqual(initialRoundState);
    expect(invalidPreset).toEqual(initialRoundState);
  });
});

describe("selection is locked while running or paused", () => {
  const attempts: RoundAction[] = [
    nextPreset,
    nextMode,
    { type: "selectMode", modeIndex: 1 },
    { type: "selectPreset", presetIndex: 1 },
  ];

  function expectOnlyBlocked(before: RoundState, after: RoundState): void {
    expect(after.blockedSelectionSeq).toBe(before.blockedSelectionSeq + 1);
    expect({
      ...after,
      blockedSelectionSeq: before.blockedSelectionSeq,
    }).toEqual(before);
  }

  it("refuses every selection action while running", () => {
    const running = started(T0);

    for (const action of attempts) {
      expectOnlyBlocked(running, reduce(running, action));
    }
  });

  it("refuses every selection action while paused", () => {
    const pausedWork = paused(started(T0), T0 + MINUTE);

    for (const action of attempts) {
      expectOnlyBlocked(pausedWork, reduce(pausedWork, action));
    }
  });

  it("does not queue the refused change for later", () => {
    const running = started(T0);
    const blocked = run(running, attempts);
    const resetState = reset(blocked);

    expect(currentMode(resetState).title).toBe("ROLLS");
    expect(currentPresetIndex(resetState)).toBe(0);
    expect(resetState.round).toBe(1);
    expect(displayMs(resetState, T0)).toBe(5 * MINUTE);
  });
});

describe("labels and previews", () => {
  it("uses WORK and REST as phase labels", () => {
    const drills = run(initialRoundState, [
      { type: "selectMode", modeIndex: 1 },
    ]);

    expect(phaseLabel(initialRoundState)).toBe("WORK");
    expect(phaseLabel(drills)).toBe("WORK");
    expect(phaseLabel(ticked(started(T0), T0 + 5 * MINUTE))).toBe("REST");
  });

  it("uses READY, WORK, REST and PAUSED as the large phase words", () => {
    const work = started(T0);
    const rest = ticked(work, T0 + 5 * MINUTE);
    const pausedWork = paused(work, T0 + MINUTE);

    expect(phaseHeadline(initialRoundState)).toBe("READY");
    expect(phaseHeadline(work)).toBe("WORK");
    expect(phaseHeadline(rest)).toBe("REST");
    expect(phaseHeadline(pausedWork)).toBe("PAUSED");
  });

  it("flags only the final ten running seconds", () => {
    const work = started(T0);

    expect(inFinalTen(work, T0 + 5 * MINUTE - 10 * SECOND)).toBe(true);
    expect(inFinalTen(work, T0 + 5 * MINUTE - 10 * SECOND - 1)).toBe(false);
    expect(inFinalTen(initialRoundState, T0)).toBe(false);
    expect(inFinalTen(paused(work, T0 + MINUTE), T0 + MINUTE)).toBe(false);
  });

  it("previews the first work while ready, rest during work, and work during rest", () => {
    const rest = ticked(started(T0), T0 + 5 * MINUTE);

    expect(nextPhase(initialRoundState)).toEqual({
      label: "WORK",
      ms: 5 * MINUTE,
    });
    expect(nextPhase(started(T0))).toEqual({
      label: "REST",
      ms: 1 * MINUTE,
    });
    expect(nextPhase(rest)).toEqual({ label: "WORK", ms: 5 * MINUTE });
  });

  it("names Start, Pause and Resume for the primary action", () => {
    const work = started(T0);
    const pausedWork = paused(work, T0 + MINUTE);

    expect(mainLabel(initialRoundState)).toBe("Start");
    expect(mainLabel(work)).toBe("Pause");
    expect(mainLabel(pausedWork)).toBe("Resume");
  });

  it("derives the current durations from the selected preset", () => {
    const drillsSecond = run(initialRoundState, [
      { type: "selectMode", modeIndex: 1 },
      { type: "selectPreset", presetIndex: 1 },
    ]);

    expect(currentWorkMs(drillsSecond)).toBe(3 * MINUTE);
    expect(currentRestMs(drillsSecond)).toBe(30 * SECOND);
  });
});

describe("a tracked green press across a state change", () => {
  const readyKey = stateKey(initialRoundState);
  const runningKey = stateKey(started(T0));

  it("starts when the recorded state still matches", () => {
    const state = reduce(initialRoundState, {
      type: "mainShort",
      now: T0,
      fromState: readyKey,
    });

    expect(state.status).toBe("running");
  });

  it("is ignored when the session moved to another phase", () => {
    const running = started(T0);
    const staleRelease = reduce(running, {
      type: "mainShort",
      now: T0 + MINUTE,
      fromState: readyKey,
    });

    expect(staleRelease).toEqual(running);
    expect(staleRelease.status).toBe("running");
    expect(staleRelease.phase).toBe("work");
  });

  it("does not pause after work has become rest", () => {
    const rest = ticked(started(T0), T0 + 5 * MINUTE);
    const stale = reduce(rest, {
      type: "mainShort",
      now: T0 + 5 * MINUTE + SECOND,
      fromState: runningKey,
    });

    expect(stale).toEqual(rest);
    expect(stale.phase).toBe("rest");
    expect(stale.status).toBe("running");
  });

  it("still accepts an untracked on-screen press", () => {
    const pausedWork = paused(started(T0), T0 + MINUTE);
    const resumed = reduce(pausedWork, {
      type: "mainShort",
      now: T0 + 2 * MINUTE,
    });

    expect(resumed.status).toBe("running");
  });
});

describe("state keys", () => {
  it("change with status, phase and round", () => {
    const work = started(T0);
    const rest = ticked(work, T0 + 5 * MINUTE);
    const nextWork = ticked(rest, T0 + 6 * MINUTE);

    expect(stateKey(initialRoundState)).toBe("ready:work:1");
    expect(stateKey(work)).toBe("running:work:1");
    expect(stateKey(rest)).toBe("running:rest:1");
    expect(stateKey(nextWork)).toBe("running:work:2");
    expect(
      new Set([stateKey(work), stateKey(rest), stateKey(nextWork)]).size,
    ).toBe(3);
  });
});
