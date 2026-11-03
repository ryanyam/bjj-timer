import { beforeEach, describe, expect, it } from "vitest";
import {
  CUE_FILES,
  CUE_GAIN,
  effectiveGain,
  getAudioSettings,
  resetAudioSettings,
  setAudioSettings,
} from "./audioConfig";

beforeEach(() => {
  resetAudioSettings();
});

describe("audio cue configuration", () => {
  it("maps all seven files and uses loud bells / quiet button cues", () => {
    expect(Object.keys(CUE_FILES)).toEqual([
      "round_start",
      "round_end",
      "pause",
      "resume",
      "preset_change",
      "mode_change",
      "reset",
    ]);
    expect(CUE_GAIN.round_start).toBe(1);
    expect(CUE_GAIN.round_end).toBe(1);
    expect(CUE_GAIN.pause).toBe(0.5);
    expect(CUE_GAIN.resume).toBe(0.5);
    expect(CUE_GAIN.preset_change).toBe(0.5);
    expect(CUE_GAIN.mode_change).toBe(0.5);
    expect(CUE_GAIN.reset).toBe(0.5);
  });

  it("defaults to full master volume and unmuted", () => {
    expect(getAudioSettings()).toEqual({
      masterVolume: 1,
      muted: false,
    });
    expect(effectiveGain("round_start")).toBe(1);
    expect(effectiveGain("pause")).toBe(0.5);
  });

  it("multiplies every gain by the master volume", () => {
    setAudioSettings({ masterVolume: 0.5, muted: false });

    expect(effectiveGain("round_start")).toBe(0.5);
    expect(effectiveGain("round_end")).toBe(0.5);
    expect(effectiveGain("pause")).toBeCloseTo(0.25);
    expect(effectiveGain("reset")).toBeCloseTo(0.25);
  });

  it("silences every cue when muted", () => {
    setAudioSettings({ masterVolume: 1, muted: true });

    expect(effectiveGain("round_start")).toBe(0);
    expect(effectiveGain("round_end")).toBe(0);
    expect(effectiveGain("pause")).toBe(0);
    expect(effectiveGain("mode_change")).toBe(0);
  });

  it("clamps invalid master volumes and restores defaults", () => {
    setAudioSettings({ masterVolume: 4, muted: false });
    expect(getAudioSettings().masterVolume).toBe(1);

    setAudioSettings({ masterVolume: -1, muted: true });
    expect(getAudioSettings()).toEqual({ masterVolume: 0, muted: true });

    resetAudioSettings();
    expect(getAudioSettings()).toEqual({
      masterVolume: 1,
      muted: false,
    });
  });
});
