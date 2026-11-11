import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface FakeSource {
  buffer: AudioBuffer | null;
  onended: (() => void) | null;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

interface FakeGain {
  gain: { value: number };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

class FakeAudioContext {
  static last: FakeAudioContext | null = null;

  state: AudioContextState = "running";
  currentTime = 0;
  destination = {};
  sources: FakeSource[] = [];
  gains: FakeGain[] = [];
  startThrows = false;
  decodeAudioData = vi.fn(async () => ({}) as AudioBuffer);
  resume = vi.fn(async () => {});

  constructor() {
    FakeAudioContext.last = this;
  }

  createBufferSource(): AudioBufferSourceNode {
    const source = {
      buffer: null,
      onended: null,
      start: vi.fn(() => {
        if (this.startThrows) {
          throw new Error("start failed");
        }
      }),
      stop: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
    } as FakeSource;
    source.stop.mockImplementation(() => source.onended?.());
    this.sources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }

  createGain(): GainNode {
    const gain = {
      gain: { value: 1 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    } as FakeGain;
    this.gains.push(gain);
    return gain as unknown as GainNode;
  }
}

const audioWindow = window as unknown as {
  AudioContext?: typeof AudioContext;
};

let originalAudioContext: typeof AudioContext | undefined;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  FakeAudioContext.last = null;
  originalAudioContext = audioWindow.AudioContext;

  Object.defineProperty(window, "AudioContext", {
    configurable: true,
    value: FakeAudioContext,
  });

  fetchMock = vi.fn(async () => ({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(1),
  }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();

  if (originalAudioContext === undefined) {
    Reflect.deleteProperty(window, "AudioContext");
  } else {
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: originalAudioContext,
    });
  }
});

describe("audio buffer and playback lifecycle", () => {
  it("loads all seven buffers once and disconnects a completed cue", async () => {
    const audio = await import("./audio");

    expect(await audio.initializeAudio()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(7);

    const context = FakeAudioContext.last;
    expect(context).not.toBeNull();

    audio.playWorkStart();

    const source = context?.sources.at(-1);
    const gain = context?.gains.at(-1);

    expect(source).toBeDefined();
    expect(gain).toBeDefined();
    expect(source?.start).toHaveBeenCalledTimes(1);

    source?.onended?.();

    expect(source?.disconnect).toHaveBeenCalledTimes(1);
    expect(gain?.disconnect).toHaveBeenCalledTimes(1);
  });

  it("loads buffers only once across repeated initialization", async () => {
    const audio = await import("./audio");

    expect(await audio.initializeAudio()).toBe(true);
    expect(await audio.initializeAudio()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });

  it("reports a load failure without breaking playback calls", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false });
    const audio = await import("./audio");

    expect(await audio.initializeAudio()).toBe(false);
    expect(audio.isAudioUnavailable()).toBe(true);
    expect(() => audio.playWorkStart()).not.toThrow();
  });

  it("disconnects source and gain if starting the cue fails", async () => {
    const audio = await import("./audio");
    await audio.initializeAudio();

    const context = FakeAudioContext.last;
    expect(context).not.toBeNull();
    context!.startThrows = true;

    expect(() => audio.playWorkStart()).not.toThrow();

    const source = context?.sources.at(-1);
    const gain = context?.gains.at(-1);

    expect(audio.isAudioUnavailable()).toBe(true);
    expect(source?.disconnect).toHaveBeenCalledTimes(1);
    expect(gain?.disconnect).toHaveBeenCalledTimes(1);
  });

  it("stops a playing bell through explicit cleanup and stays safe on a late end", async () => {
    const audio = await import("./audio");
    await audio.initializeAudio();

    const context = FakeAudioContext.last;
    audio.playWorkStart();

    const bell = context?.sources.at(-1);
    expect(bell).toBeDefined();

    audio.stopRoundCues();

    expect(bell?.stop).toHaveBeenCalledTimes(1);
    expect(bell?.disconnect).toHaveBeenCalledTimes(1);

    // A browser may deliver onended after explicit cleanup; it must be safe.
    expect(() => bell?.onended?.()).not.toThrow();
  });

  it("allows a new valid bell after explicit cleanup", async () => {
    const audio = await import("./audio");
    await audio.initializeAudio();

    const context = FakeAudioContext.last;
    audio.playWorkStart();
    const first = context?.sources.at(-1);

    audio.stopRoundCues();
    audio.playRestStart();

    const second = context?.sources.at(-1);
    expect(first?.stop).toHaveBeenCalledTimes(1);
    expect(second).not.toBe(first);
    expect(second?.start).toHaveBeenCalledTimes(1);
  });

  it("keeps reset playback cleanup explicit and safe", async () => {
    const audio = await import("./audio");
    await audio.initializeAudio();

    const context = FakeAudioContext.last;
    audio.playWorkStart();

    const bell = context?.sources.at(-1);
    audio.playReset();

    expect(bell?.stop).toHaveBeenCalledTimes(1);
    expect(bell?.disconnect).toHaveBeenCalledTimes(1);
    expect(() => bell?.onended?.()).not.toThrow();
  });

  it("handles missing AudioContext without throwing", async () => {
    Reflect.deleteProperty(window, "AudioContext");
    const audio = await import("./audio");

    expect(await audio.initializeAudio()).toBe(false);
    expect(audio.isAudioUnavailable()).toBe(true);
    expect(() => audio.playWorkStart()).not.toThrow();
  });
});
