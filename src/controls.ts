import { mainLabel, type RoundState } from "./round";

export interface ControlCopy {
  readonly primaryLabel: string;
  readonly primaryHint: string;
  readonly secondaryLabel: string;
  readonly secondaryHint: string;
  readonly secondaryActive: boolean;
}

export interface ControlCopyOptions {
  /** A reset gesture is currently being held. */
  readonly holding?: boolean;
  /** The reset just completed and the button is briefly flashing RESET. */
  readonly resetFlash?: boolean;
}

/**
 * The two-line copy for the Main and Mode controls. The timer currently has
 * Ready, Running and Paused states; get-ready and finished are not states in
 * this reducer, so no copy is invented for them here.
 */
export function controlCopy(
  state: RoundState,
  options: ControlCopyOptions = {},
): ControlCopy {
  const ready = state.status === "ready";
  const getReady = state.status === "getReady";
  const holding = options.holding === true;
  const resetFlash = options.resetFlash === true;

  const primaryLabel = resetFlash
    ? "RESET"
    : getReady
      ? "STARTING..."
      : mainLabel(state).toUpperCase();

  const primaryHint = resetFlash
    ? "Session reset"
    : holding
      ? "Keep holding..."
      : getReady
        ? "Press to cancel · Hold to reset"
        : ready
          ? "Hold to reset"
          : "Hold to reset";

  const secondaryLabel = ready ? "PRESET" : "LOCKED";

  const secondaryHint = ready
    ? "Press: preset · Hold: mode"
    : "Hold green to reset before changing";

  return {
    primaryLabel,
    primaryHint,
    secondaryLabel,
    secondaryHint,
    secondaryActive: ready,
  };
}
