/**
 * The two live transition cues.
 *
 * There is no audio settings surface: the cues are deliberately quiet, fixed,
 * and short. Work-start is a pair of high beeps; rest-start is one lower, longer
 * tone, so they are distinguishable without a settings screen.
 *
 * The AudioContext is created lazily and unlocked from a user gesture (Start or
 * a selection press). If the browser refuses, the timer simply runs silently.
 */

let context: AudioContext | null = null;

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

/** Call synchronously from a click/key/button handler to allow later cues. */
export function unlockAudio(): void {
  const audio = getContext();

  if (audio?.state === "suspended") {
    void audio.resume().catch(() => {});
  }
}

function scheduleTone(
  audio: AudioContext,
  frequency: number,
  startOffset: number,
  duration: number,
): OscillatorNode {
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const start = audio.currentTime + startOffset;

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, start);

  // A short attack/decay avoids clicks without making the cue loud.
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.12, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);

  return oscillator;
}

function play(cues: readonly (readonly [number, number, number])[]): void {
  const audio = getContext();

  if (audio === null) {
    return;
  }

  const schedule = () => {
    for (const [frequency, startOffset, duration] of cues) {
      scheduleTone(audio, frequency, startOffset, duration);
    }
  };

  if (audio.state === "suspended") {
    void audio
      .resume()
      .then(schedule)
      .catch(() => {});
  } else {
    schedule();
  }
}

/** Two high beeps: a work round has begun. */
export function playWorkStart(): void {
  play([
    [880, 0, 0.09],
    [880, 0.14, 0.09],
  ]);
}

/** One lower, longer tone: work has ended and rest has begun. */
export function playRestStart(): void {
  play([[440, 0, 0.28]]);
}

/** One short confirmation beep: the main mode has changed. */
export function playModeChange(): void {
  play([[660, 0, 0.11]]);
}

/**
 * Get Ready ticks on each of the final three seconds and the existing start
 * cue at zero, all scheduled against the AudioContext clock. The returned
 * function cancels pending ticks/bell when the countdown is abandoned.
 */
export function scheduleGetReadyCues(seconds: number): () => void {
  const audio = getContext();

  if (audio === null || seconds <= 0) {
    return () => {};
  }

  let cancelled = false;
  const oscillators: OscillatorNode[] = [];

  const schedule = () => {
    if (cancelled) {
      return;
    }

    for (const offset of [seconds - 3, seconds - 2, seconds - 1]) {
      if (offset >= 0) {
        oscillators.push(scheduleTone(audio, 660, offset, 0.07));
      }
    }

    // Use the existing work-start cue as the bell at zero.
    oscillators.push(scheduleTone(audio, 880, seconds, 0.09));
    oscillators.push(scheduleTone(audio, 880, seconds + 0.14, 0.09));
  };

  if (audio.state === "suspended") {
    void audio
      .resume()
      .then(schedule)
      .catch(() => {});
  } else {
    schedule();
  }

  return () => {
    cancelled = true;

    for (const oscillator of oscillators) {
      try {
        oscillator.stop();
      } catch {
        // Already stopped.
      }
    }

    oscillators.length = 0;
  };
}
