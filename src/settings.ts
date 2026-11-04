import { TRAINING_MODES, type ModeId } from "./training";

/** Allowed non-public Get Ready durations, in seconds. */
export const GET_READY_OPTIONS = [0, 3, 5, 10] as const;
export type GetReadySeconds = (typeof GET_READY_OPTIONS)[number];

const DEFAULTS: Record<ModeId, GetReadySeconds> = {
  rolls: 5,
  drills: 3,
  nogi: 3,
  kids: 3,
};

const STORAGE_KEY = "bjj-timer.get-ready-seconds";

function isOption(value: unknown): value is GetReadySeconds {
  return (
    typeof value === "number" &&
    (GET_READY_OPTIONS as readonly number[]).includes(value)
  );
}

function readStored(): Partial<Record<ModeId, GetReadySeconds>> {
  if (typeof localStorage === "undefined") {
    return {};
  }

  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as
      | Record<string, unknown>
      | null;

    if (raw === null || typeof raw !== "object") {
      return {};
    }

    const stored: Partial<Record<ModeId, GetReadySeconds>> = {};

    for (const mode of TRAINING_MODES) {
      const value = raw[mode.id];

      if (isOption(value)) {
        stored[mode.id] = value;
      }
    }

    return stored;
  } catch {
    return {};
  }
}

export function getReadySecondsForMode(modeId: ModeId): GetReadySeconds {
  return readStored()[modeId] ?? DEFAULTS[modeId];
}

/** Duration array indexed like TRAINING_MODES, ready for the reducer action. */
export function getReadyMsByMode(): readonly number[] {
  return TRAINING_MODES.map(
    (mode) => getReadySecondsForMode(mode.id) * 1_000,
  );
}

/** Non-public configuration entry point; only 0, 3, 5 and 10 are accepted. */
export function setGetReadySecondsForMode(
  modeId: ModeId,
  seconds: GetReadySeconds,
): void {
  if (typeof localStorage === "undefined") {
    return;
  }

  const next = { ...readStored(), [modeId]: seconds };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage may be unavailable in private/kiosk modes; use the defaults.
  }
}

/** Test/support helper: forget overrides and return to the mode defaults. */
export function resetGetReadySettings(): void {
  if (typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore unavailable storage.
  }
}
