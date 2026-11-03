import { beforeEach, describe, expect, it } from "vitest";
import {
  GET_READY_OPTIONS,
  getReadyMsByMode,
  getReadySecondsForMode,
  resetGetReadySettings,
  setGetReadySecondsForMode,
} from "./settings";

beforeEach(() => {
  localStorage.clear();
});

describe("get-ready settings", () => {
  it("offers exactly 0, 3, 5 and 10 seconds", () => {
    expect(GET_READY_OPTIONS).toEqual([0, 3, 5, 10]);
  });

  it("defaults to 5 seconds for Rolls and 3 seconds for Drills", () => {
    expect(getReadySecondsForMode("rolls")).toBe(5);
    expect(getReadySecondsForMode("drills")).toBe(3);
    expect(getReadyMsByMode()).toEqual([5_000, 3_000]);
  });

  it("accepts every allowed override and derives milliseconds", () => {
    setGetReadySecondsForMode("rolls", 0);
    setGetReadySecondsForMode("drills", 10);

    expect(getReadySecondsForMode("rolls")).toBe(0);
    expect(getReadySecondsForMode("drills")).toBe(10);
    expect(getReadyMsByMode()).toEqual([0, 10_000]);
  });

  it("ignores invalid stored values", () => {
    localStorage.setItem(
      "bjj-timer.get-ready-seconds",
      JSON.stringify({ rolls: 7, drills: "5" }),
    );

    expect(getReadySecondsForMode("rolls")).toBe(5);
    expect(getReadySecondsForMode("drills")).toBe(3);
  });

  it("resets to the mode defaults", () => {
    setGetReadySecondsForMode("rolls", 0);
    resetGetReadySettings();

    expect(getReadySecondsForMode("rolls")).toBe(5);
  });
});
