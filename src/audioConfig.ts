export type CueName =
  | "round_start"
  | "round_end"
  | "pause"
  | "resume"
  | "preset_change"
  | "mode_change"
  | "reset";

/** Per-cue gains: bells are loud, button feedback is quiet. */
export const CUE_GAIN: Record<CueName, number> = {
  round_start: 1,
  round_end: 1,
  pause: 0.5,
  resume: 0.5,
  preset_change: 0.5,
  mode_change: 0.5,
  reset: 0.5,
};

export const CUE_FILES: Record<CueName, string> = {
  round_start: "/sounds/round_start.wav",
  round_end: "/sounds/round_end.wav",
  pause: "/sounds/pause.wav",
  resume: "/sounds/resume.wav",
  preset_change: "/sounds/preset_change.wav",
  mode_change: "/sounds/mode_change.wav",
  reset: "/sounds/reset.wav",
};

export interface AudioSettings {
  readonly masterVolume: number;
  readonly muted: boolean;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  masterVolume: 1,
  muted: false,
};

const STORAGE_KEY = "bjj-timer.audio-settings";

function clampVolume(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function getAudioSettings(): AudioSettings {
  if (typeof localStorage === "undefined") {
    return DEFAULT_AUDIO_SETTINGS;
  }

  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as
      | Record<string, unknown>
      | null;

    if (raw === null || typeof raw !== "object") {
      return DEFAULT_AUDIO_SETTINGS;
    }

    const volume =
      typeof raw.masterVolume === "number" &&
      Number.isFinite(raw.masterVolume)
        ? clampVolume(raw.masterVolume)
        : DEFAULT_AUDIO_SETTINGS.masterVolume;

    return {
      masterVolume: volume,
      muted:
        typeof raw.muted === "boolean"
          ? raw.muted
          : DEFAULT_AUDIO_SETTINGS.muted,
    };
  } catch {
    return DEFAULT_AUDIO_SETTINGS;
  }
}

/** Store master volume and mute without exposing a public settings surface. */
export function setAudioSettings(settings: AudioSettings): void {
  if (typeof localStorage === "undefined") {
    return;
  }

  const next: AudioSettings = {
    masterVolume: clampVolume(settings.masterVolume),
    muted: settings.muted,
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage may be unavailable; playback falls back to the defaults.
  }
}

export function effectiveGain(
  cue: CueName,
  settings: AudioSettings = getAudioSettings(),
): number {
  return settings.muted ? 0 : CUE_GAIN[cue] * settings.masterVolume;
}

export function resetAudioSettings(): void {
  if (typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore unavailable storage.
  }
}
