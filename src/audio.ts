import { CUE_FILES, effectiveGain, type CueName } from "./audioConfig";

let context: AudioContext | null = null;
const buffers = new Map<CueName, AudioBuffer>();
const activeBells = new Set<{
  source: AudioBufferSourceNode;
  gain: GainNode;
}>();
const unavailableListeners = new Set<() => void>();
let unavailable = false;
let loadPromise: Promise<boolean> | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }

  if (context !== null) {
    return context;
  }

  const AudioContextCtor =
    window.AudioContext ??
    (
      window as unknown as {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;

  if (AudioContextCtor === undefined) {
    return null;
  }

  try {
    context = new AudioContextCtor();
    return context;
  } catch {
    return null;
  }
}

function markUnavailable(): void {
  if (unavailable) {
    return;
  }

  unavailable = true;

  for (const listener of unavailableListeners) {
    listener();
  }
}

/** Observe audio initialization/resume failures for a non-blocking warning. */
export function onAudioUnavailable(listener: () => void): () => void {
  unavailableListeners.add(listener);

  if (unavailable) {
    listener();
  }

  return () => unavailableListeners.delete(listener);
}

/**
 * Fetch and decode all seven cues once. Buffers stay in memory; playback never
 * fetches or decodes. Failure marks audio unavailable but never stops the timer.
 */
export function initializeAudio(): Promise<boolean> {
  if (loadPromise !== null) {
    return loadPromise;
  }

  const audio = getContext();

  if (audio === null) {
    markUnavailable();
    loadPromise = Promise.resolve(false);
    return loadPromise;
  }

  loadPromise = (async () => {
    try {
      await Promise.all(
        (Object.keys(CUE_FILES) as CueName[]).map(async (cue) => {
          const response = await fetch(CUE_FILES[cue]);

          if (!response.ok) {
            throw new Error(`Sound failed to load: ${CUE_FILES[cue]}`);
          }

          const data = await response.arrayBuffer();
          const buffer = await audio.decodeAudioData(data);
          buffers.set(cue, buffer);
        }),
      );

      return true;
    } catch {
      markUnavailable();
      return false;
    }
  })();

  return loadPromise;
}

export function isAudioUnavailable(): boolean {
  return unavailable;
}

/** Call synchronously from a press/click handler to allow playback. */
export function unlockAudio(): void {
  const audio = getContext();

  if (audio === null) {
    markUnavailable();
    return;
  }

  if (audio.state === "suspended") {
    void audio.resume().catch(() => markUnavailable());
  }
}

function startCue(cue: CueName, bell: boolean): void {
  const audio = getContext();
  const buffer = buffers.get(cue);

  if (audio === null || buffer === undefined) {
    return;
  }

  const gainValue = effectiveGain(cue);

  if (gainValue <= 0) {
    return;
  }

  let source: AudioBufferSourceNode | null = null;
  let gain: GainNode | null = null;
  let entry: { source: AudioBufferSourceNode; gain: GainNode } | null = null;

  try {
    source = audio.createBufferSource();
    gain = audio.createGain();
    source.buffer = buffer;
    gain.gain.value = gainValue;
    source.connect(gain);
    gain.connect(audio.destination);

    entry = { source, gain };

    if (bell) {
      activeBells.add(entry);
    }

    const cleanup = () => {
      if (entry !== null) {
        activeBells.delete(entry);
      }
      source?.disconnect();
      gain?.disconnect();
    };

    source.onended = cleanup;
    source.start(audio.currentTime);
  } catch {
    // A failed start must not leave a connected source/gain pair (or a bell
    // entry) retained after the failure.
    if (entry !== null) {
      activeBells.delete(entry);
    }
    source?.disconnect();
    gain?.disconnect();
    markUnavailable();
  }
}

function stopBells(): void {
  for (const bell of activeBells) {
    try {
      bell.source.stop();
    } catch {
      // Already stopped.
    }
  }

  activeBells.clear();
}

export function playWorkStart(): void {
  startCue("round_start", true);
}

export function playRestStart(): void {
  startCue("round_end", true);
}

export function playPause(): void {
  startCue("pause", false);
}

export function playResume(): void {
  startCue("resume", false);
}

export function playPresetChange(): void {
  startCue("preset_change", false);
}

export function playModeChange(): void {
  startCue("mode_change", false);
}

/** Stop any playing round bell without starting a button/reset cue. */
export function stopRoundCues(): void {
  stopBells();
}

/** Reset stops any playing round bell immediately, then plays reset.wav. */
export function playReset(): void {
  stopRoundCues();
  startCue("reset", false);
}
