import { useEffect, useRef, useState } from "react";
import {
  createGamepadRecogniser,
  pickActiveGamepad,
  type GamepadRecogniser,
} from "./gamepad";

export type GamepadStatus = "connected" | "waiting" | "unsupported";

export interface GamepadInputOptions {
  onMain: () => void;
  onOption: () => void;
  onMode: () => void;
  /** False while a mode or option change is not allowed (round in flight). */
  selectionEnabled: boolean;
}

/**
 * Polls the Gamepad API once per animation frame and turns the two arcade
 * buttons into the same actions the on-screen controls dispatch.
 *
 * One loop, one active controller, and every listener removed on cleanup. The
 * gesture rules themselves live in gamepad.ts so they can be tested without a
 * browser.
 */
export function useGamepadInput(options: GamepadInputOptions): GamepadStatus {
  const [status, setStatus] = useState<GamepadStatus>(() =>
    supportsGamepads() ? "waiting" : "unsupported",
  );

  // The polling loop is created once; this ref keeps it calling the newest
  // handlers without restarting the loop on every React render.
  const latestOptions = useRef(options);
  const recogniserRef = useRef<GamepadRecogniser | null>(null);

  useEffect(() => {
    latestOptions.current = options;
  });

  useEffect(() => {
    const recogniser = createGamepadRecogniser({
      onGesture: (gesture) => {
        if (gesture === "main") {
          latestOptions.current.onMain();
        } else if (gesture === "option") {
          latestOptions.current.onOption();
        } else {
          latestOptions.current.onMode();
        }
      },
    });

    recogniserRef.current = recogniser;

    return () => {
      // Unmount: drop any hold without firing it.
      recogniser.cancel();

      if (recogniserRef.current === recogniser) {
        recogniserRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const recogniser = recogniserRef.current;

    if (!supportsGamepads() || recogniser === null) {
      return;
    }

    let frameId: number | null = null;
    let activeIndex: number | null = null;
    let stopped = false;

    const publishStatus = (next: GamepadStatus) => {
      setStatus((previous) => (previous === next ? previous : next));
    };

    const poll = (time: number) => {
      if (stopped) {
        return;
      }

      const pads = navigator.getGamepads();
      const nextIndex = pickActiveGamepad(pads, activeIndex);

      // Binding a different controller requires a fresh release-to-press
      // cycle, exactly like the first detection at page load.
      if (nextIndex !== activeIndex) {
        recogniser.cancel();
        activeIndex = nextIndex;
      }

      const pad = activeIndex === null ? null : pads[activeIndex];
      const selectionEnabled = latestOptions.current.selectionEnabled;

      if (pad === null || pad === undefined) {
        recogniser.update(null, time, selectionEnabled);
        publishStatus("waiting");
      } else {
        recogniser.update(pad.buttons, time, selectionEnabled);
        publishStatus("connected");
      }

      frameId = requestAnimationFrame(poll);
    };

    const cancelPending = () => {
      recogniser.cancel();
    };

    const onDisconnected = () => {
      // Forget the binding immediately; the next frame may find another pad.
      activeIndex = null;
      recogniser.cancel();
      publishStatus("waiting");
    };

    const onVisibilityChange = () => {
      // Hidden or revealed: a button may still be held. Abandon anything in
      // flight and wait for a release before accepting input again.
      recogniser.cancel();
    };

    window.addEventListener("blur", cancelPending);
    window.addEventListener("gamepaddisconnected", onDisconnected);
    document.addEventListener("visibilitychange", onVisibilityChange);

    frameId = requestAnimationFrame(poll);

    return () => {
      stopped = true;

      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }

      window.removeEventListener("blur", cancelPending);
      window.removeEventListener("gamepaddisconnected", onDisconnected);
      document.removeEventListener("visibilitychange", onVisibilityChange);

      // Unmount: drop any hold without firing it.
      recogniser.cancel();
    };
  }, []);

  return status;
}

function supportsGamepads(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.getGamepads === "function"
  );
}
