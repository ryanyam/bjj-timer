import { useEffect, useRef } from "react";
import {
  currentRestMs,
  currentWorkMs,
  displayMs,
  phaseProgress,
  type RoundState,
} from "./round";

/**
 * Smooth phase-progress bar.
 *
 * The fill is a full-width element transformed with scaleX, driven by
 * requestAnimationFrame + performance.now(). The effect restarts only when the
 * round state changes, so a new phase resets the fill, pause freezes it, and a
 * running phase animates without re-rendering React on every frame.
 */
export function PhaseProgressBar({
  state,
  warning = null,
}: {
  state: RoundState;
  warning?: "work" | "rest" | null;
}) {
  const fillRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const fill = fillRef.current;

    if (fill === null) {
      return;
    }

    const apply = (progress: number) => {
      fill.style.transform = `scaleX(${Math.min(1, Math.max(0, progress))})`;
    };

    apply(phaseProgress(state, Date.now()));

    if (
      state.status !== "running" ||
      state.deadline === null ||
      import.meta.env.MODE === "test" ||
      typeof window === "undefined" ||
      typeof window.requestAnimationFrame !== "function"
    ) {
      return;
    }

    const duration =
      state.phase === "rest" ? currentRestMs(state) : currentWorkMs(state);

    if (duration <= 0) {
      return;
    }

    const initialRemaining = displayMs(state, Date.now());
    const startedAt = performance.now();
    let frame = 0;
    let cancelled = false;

    const tick = (frameTime: number) => {
      if (cancelled) {
        return;
      }

      const elapsed = frameTime - startedAt;
      const remaining = Math.max(0, initialRemaining - elapsed);
      apply(1 - remaining / duration);

      if (remaining > 0) {
        frame = window.requestAnimationFrame(tick);
      }
    };

    frame = window.requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [state]);

  return (
    <div
      className={`progress-bar${warning ? ` progress-bar--warning-${warning}` : ""}`}
      aria-hidden="true"
    >
      <span ref={fillRef} className="progress-bar__fill" />
    </div>
  );
}
