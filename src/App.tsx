import { useEffect, useState } from "react";
import { ROUND_MS, formatRemaining, remainingMs } from "./timer";
import "./App.css";

/**
 * How often the display re-reads the clock. This is a refresh rate, not the
 * length of the round: the round's length is ROUND_MS, and this only decides how
 * quickly the screen notices that time has passed.
 */
const TICK_MS = 250;

type Phase = "idle" | "running" | "finished";

function App() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (phase !== "running" || deadline === null) {
      return;
    }

    // Every tick reads the clock again and re-derives what is left, instead of
    // subtracting from a stored total. That is what makes the countdown
    // self-correcting: a late, skipped or doubled tick cannot make the round run
    // long, because the next tick starts from the truth again.
    const tick = () => {
      const currentTime = Date.now();
      setNow(currentTime);

      if (currentTime >= deadline) {
        setPhase("finished");
      }
    };

    const intervalId = setInterval(tick, TICK_MS);

    // Clearing the loop here is what stops StrictMode's development double-mount
    // (and unmounting mid-round, and Reset) from leaving a ticking loop behind.
    return () => clearInterval(intervalId);
  }, [phase, deadline]);

  const startRound = () => {
    const startedAt = Date.now();
    setNow(startedAt);
    setDeadline(startedAt + ROUND_MS);
    setPhase("running");
  };

  const resetRound = () => {
    setPhase("idle");
    setDeadline(null);
    setNow(Date.now());
  };

  // Before a round starts there is no deadline yet, so a full round is left.
  const remaining = deadline === null ? ROUND_MS : remainingMs(deadline, now);

  return (
    <main className="timer">
      <div className="timer__clock" role="timer">
        {formatRemaining(remaining)}
      </div>

      <div className="timer__controls">
        <button
          type="button"
          onClick={startRound}
          disabled={phase === "running"}
        >
          Start
        </button>
        <button type="button" onClick={resetRound}>
          Reset
        </button>
      </div>
    </main>
  );
}

export default App;
