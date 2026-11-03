import { useCallback, useEffect, useRef, useState } from "react";
import {
  createGamepadRecogniser,
  pickActiveGamepad,
  type GamepadFeedback,
  type GamepadRecogniser,
} from "./gamepad";

export type GamepadStatus =
  | "connected"
  | "waiting"
  | "disconnected"
  | "unsupported";

export interface GamepadInputOptions {
  /** Short green press, with the session state the press began in. */
  onMain: (fromState: string) => void;
  /** Green button held to the reset threshold. */
  onMainHold: () => void;
  onOption: () => void;
  onMode: () => void;
  /** Identifies the current session state, used to cancel a stale press. */
  stateKey: string;
}

export interface GamepadInput {
  status: GamepadStatus;
  /** True while the green button is physically down (for immediate feedback). */
  mainPressed: boolean;
  /** How far the green press has travelled towards reset, 0 to 1. */
  mainHoldProgress: number;
}

const IDLE_FEEDBACK: GamepadFeedback = {
  mainPressed: false,
  mainHoldProgress: 0,
};

/**
 * Polls the Gamepad API once per animation frame and turns the two arcade
 * buttons into the same actions the on-screen controls dispatch.
 *
 * One loop, one active controller, and every listener removed on cleanup. The
 * gesture rules themselves live in gamepad.ts so they can be tested without a
 * browser.
 */
export function useGamepadInput(options: GamepadInputOptions): GamepadInput {
  const [status, setStatus] = useState<GamepadStatus>(gamepadStatusNow);
  const [feedback, setFeedback] = useState<GamepadFeedback>(IDLE_FEEDBACK);

  // The polling loop is created once; this ref keeps it calling the newest
  // handlers without restarting the loop on every React render.
  const latestOptions = useRef(options);
  const recogniserRef = useRef<GamepadRecogniser | null>(null);

  useEffect(() => {
    latestOptions.current = options;
  });

  const publishFeedback = useCallback((next: GamepadFeedback) => {
    // Whole percentages are plenty for a progress bar and stop a 60 fps loop
    // from re-rendering for changes the eye cannot see.
    const mainHoldProgress = Math.round(next.mainHoldProgress * 100) / 100;

    setFeedback((previous) =>
      previous.mainPressed === next.mainPressed &&
      previous.mainHoldProgress === mainHoldProgress
        ? previous
        : { mainPressed: next.mainPressed, mainHoldProgress },
    );
  }, []);

  const cancelPending = useCallback(() => {
    recogniserRef.current?.cancel();
    setFeedback(IDLE_FEEDBACK);
  }, []);

  useEffect(() => {
    const recogniser = createGamepadRecogniser({
      onGesture: (gesture) => {
        const handlers = latestOptions.current;

        if (gesture.kind === "mainShort") {
          handlers.onMain(gesture.stateKey);
        } else if (gesture.kind === "mainHold") {
          handlers.onMainHold();
        } else if (gesture.kind === "option") {
          handlers.onOption();
        } else {
          handlers.onMode();
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
    let hasSeenController = gamepadStatusNow() === "connected";

    /*
     * Whether a controller that appears now may have its first observed press
     * adopted. True only for the initial discovery on a focused, visible page.
     * Blur, page hiding, a disconnect, or any later binding change turns it off
     * permanently, so those paths keep the release-to-arm protection.
     */
    let adoptDiscovery = pageIsActive();
    let pendingAdoption = false;

    const publishStatus = (next: GamepadStatus) => {
      setStatus((previous) => (previous === next ? previous : next));
    };

    const poll = (time: number) => {
      if (stopped) {
        return;
      }

      const pads = navigator.getGamepads();
      const nextIndex = pickActiveGamepad(pads, activeIndex);

      if (nextIndex !== activeIndex) {
        const firstController =
          activeIndex === null && nextIndex !== null && adoptDiscovery;

        if (firstController) {
          // Forget any stale gesture, but let this first snapshot's pressed
          // button be adopted instead of demanding a separate connect press.
          recogniser.cancel();
          pendingAdoption = true;
        } else {
          // A known reconnection or a switch between controllers: the operator
          // must release before input is accepted again.
          cancelPending();
          adoptDiscovery = false;
        }

        activeIndex = nextIndex;
      }

      const pad = activeIndex === null ? null : pads[activeIndex];
      const { stateKey } = latestOptions.current;

      if (pad === null || pad === undefined) {
        publishFeedback(recogniser.update(null, time, { stateKey }));
        publishStatus(hasSeenController ? "disconnected" : "waiting");
      } else {
        const adoptInitialPress = pendingAdoption;
        pendingAdoption = false;

        publishFeedback(
          recogniser.update(pad.buttons, time, {
            stateKey,
            adoptInitialPress,
          }),
        );

        // One first observation is enough: whichever buttons were down have
        // been adopted, and the rest are handled by the normal release-to-arm
        // path from here on.
        adoptDiscovery = false;
        hasSeenController = true;
        publishStatus("connected");
      }

      frameId = requestAnimationFrame(poll);
    };

    const onConnected = () => {
      // The animation frame below reads the buttons. This only keeps the label
      // truthful if the event lands before that frame; it never feeds input, so
      // it cannot duplicate a gesture.
      if (navigator.getGamepads().some((pad) => pad?.connected === true)) {
        hasSeenController = true;
        publishStatus("connected");
      }
    };

    const onDisconnected = () => {
      // Forget the binding immediately; the next frame may find another pad.
      activeIndex = null;
      adoptDiscovery = false;
      pendingAdoption = false;
      cancelPending();
      publishStatus("disconnected");
    };

    const onBlur = () => {
      adoptDiscovery = false;
      cancelPending();
    };

    const onVisibilityChange = () => {
      // Hidden or revealed: a button may still be held. Abandon anything in
      // flight and wait for a release before accepting input again. Discovery
      // after a page hide/show is never adopted.
      adoptDiscovery = false;
      cancelPending();
    };

    window.addEventListener("blur", onBlur);
    window.addEventListener("gamepadconnected", onConnected);
    window.addEventListener("gamepaddisconnected", onDisconnected);
    document.addEventListener("visibilitychange", onVisibilityChange);

    frameId = requestAnimationFrame(poll);

    return () => {
      stopped = true;

      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }

      window.removeEventListener("blur", onBlur);
      window.removeEventListener("gamepadconnected", onConnected);
      window.removeEventListener("gamepaddisconnected", onDisconnected);
      document.removeEventListener("visibilitychange", onVisibilityChange);

      // Unmount: drop any hold without firing it.
      recogniser.cancel();
    };
  }, [cancelPending, publishFeedback]);

  return {
    status,
    mainPressed: feedback.mainPressed,
    mainHoldProgress: feedback.mainHoldProgress,
  };
}

function supportsGamepads(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.getGamepads === "function"
  );
}

/**
 * A truthful status before the first animation frame: a controller the browser
 * already exposes is connected, otherwise we are still waiting for input (the
 * browser may not expose it until its first button press).
 */
function gamepadStatusNow(): GamepadStatus {
  if (!supportsGamepads()) {
    return "unsupported";
  }

  return navigator.getGamepads().some((pad) => pad?.connected === true)
    ? "connected"
    : "waiting";
}

/**
 * Initial-discovery adoption is only safe while the page is the active, focused
 * thing the operator is looking at. Otherwise a button that was already held
 * could be mistaken for an intentional press.
 */
function pageIsActive(): boolean {
  return (
    typeof document !== "undefined" &&
    document.visibilityState === "visible" &&
    typeof document.hasFocus === "function" &&
    document.hasFocus()
  );
}
